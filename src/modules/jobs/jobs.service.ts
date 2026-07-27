import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan, Not, IsNull } from 'typeorm';
import { Job, JobStatus, JobType } from './entities/job.entity';
import { assertTransition } from './job-state.machine';
import { WorkersService } from '../workers/workers.service';
import { WorkerStatus } from '../workers/entities/worker.entity';
import { ServiceTypesService } from '../service-types/service-types.service';
import { PriceTiming } from '../service-types/entities/service-type.entity';
import {
  JobNegotiation,
  NegotiationStatus,
} from './entities/job-negotiation.entity';
import { Role } from '../../common/enums/role.enum';
import { CreateJobDto } from './dto/create-job.dto';
import { NearbyJobsDto } from './dto/nearby-jobs.dto';
import { Cron, CronExpression } from '@nestjs/schedule';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  JOB_COMPLETED,
  JOB_CANCELLED,
  JobCompletedEvent,
  JobCancelledEvent,
} from './jobs.events';

const IMMEDIATE_EXPIRY_MIN = 15;

@Injectable()
export class JobsService {
  private readonly logger = new Logger(JobsService.name);
  constructor(
    @InjectRepository(Job) private repo: Repository<Job>,
    @InjectRepository(JobNegotiation)
    private negotiationRepo: Repository<JobNegotiation>,
    private workers: WorkersService,
    private serviceTypes: ServiceTypesService,
    private events: EventEmitter2,
  ) {}

  // runs every minute, flips stale requested jobs to expired
  @Cron(CronExpression.EVERY_MINUTE)
  async expireStaleJobs() {
    const result = await this.repo
      .createQueryBuilder()
      .update(Job)
      .set({ status: JobStatus.EXPIRED })
      .where('status = :requested', { requested: JobStatus.REQUESTED })
      .andWhere('"expiresAt" IS NOT NULL') // ← quoted camelCase
      .andWhere('"expiresAt" < now()')
      .returning('id')
      .execute();

    const raw = result.raw as Array<{ id: string }>;
    const expiredIds: string[] = raw.map((r) => r.id);
    if (expiredIds.length > 0) {
      this.logger.log(`Expired ${expiredIds.length} stale job(s)`);
      // any negotiation threads still open on those jobs die with the job
      await this.negotiationRepo
        .createQueryBuilder()
        .update(JobNegotiation)
        .set({ status: NegotiationStatus.EXPIRED, closedAt: () => 'now()' })
        .where('"jobId" IN (:...expiredIds)', { expiredIds })
        .andWhere('status = :open', { open: NegotiationStatus.OPEN })
        .execute();
    }
  }

  async create(customerId: string, dto: CreateJobDto) {
    // validate the service type exists + is active
    const st = await this.serviceTypes.findByIdActive(dto.serviceTypeId);

    const isScheduled = dto.type === 'scheduled';

    // upfront pricing → compute estimate now; on_completion → leave null
    let estimatedPrice: number | null = null;
    if (st.priceTiming === 'upfront') {
      estimatedPrice =
        st.pricingModel === 'flat'
          ? Number(st.baseRate)
          : Number(st.baseRate) * (dto.quantity ?? 1);
    }

    const job = this.repo.create({
      customerId,
      serviceTypeId: st.id,
      serviceType: st, // also populates the service_type_id FK column for the relation
      status: JobStatus.REQUESTED,
      type: dto.type as JobType,
      location: { type: 'Point', coordinates: [dto.lng, dto.lat] } as any,
      description: dto.description ?? null,
      quantity: dto.quantity ?? null,
      estimatedPrice,
      // budget hint only makes sense where price isn't fixed upfront
      customerBudget:
        st.priceTiming === PriceTiming.ON_COMPLETION
          ? (dto.budget ?? null)
          : null,
      scheduledAt: isScheduled ? (dto.scheduledAt ?? null) : null,
      expiresAt: isScheduled ? null : new Date(Date.now() + 15 * 60 * 1000),
    });
    const saved = await this.repo.save(job);
    return {
      id: saved.id,
      status: saved.status,
      serviceTypeId: saved.serviceTypeId,
      estimatedPrice,
      customerBudget: saved.customerBudget,
      negotiable: st.priceTiming === PriceTiming.ON_COMPLETION,
    };
  }

  // the race-safe broadcast claim — first worker wins
  async accept(workerUserId: string, jobId: string) {
    const job = await this.repo.findOne({ where: { id: jobId } });
    if (!job) throw new NotFoundException('Job not found');
    if (job.status !== JobStatus.REQUESTED)
      throw new ConflictException('Job is no longer available');
    if (job.customerId === workerUserId) {
      throw new ConflictException('You cannot accept your own job');
    }
    // reject if expired, even if the sweep hasn't flipped it yet
    if (job.expiresAt && job.expiresAt < new Date()) {
      throw new ConflictException('Job has expired');
    }

    const st = await this.serviceTypes.findByIdActive(job.serviceTypeId);
    if (st.priceTiming === PriceTiming.ON_COMPLETION) {
      throw new ConflictException(
        'This job requires price negotiation — use the negotiate endpoint instead of accept',
      );
    }

    const worker = await this.workers.getForJobAccept(workerUserId);
    if (!worker) throw new ForbiddenException('No worker profile');
    if (worker.status !== WorkerStatus.VERIFIED)
      throw new ForbiddenException('Worker not verified');
    if (!worker.skillIds.includes(job.serviceTypeId)) {
      // ← check by id now
      throw new ForbiddenException('Your skills do not match this job');
    }

    const res = await this.repo
      .createQueryBuilder()
      .update(Job)
      .set({
        workerId: workerUserId,
        status: JobStatus.ACCEPTED,
        acceptedAt: () => 'now()',
      })
      .where(
        'id = :jobId AND status = :requested AND ("expiresAt" IS NULL OR "expiresAt" > now())',
        { jobId, requested: JobStatus.REQUESTED },
      )
      .execute();

    if (res.affected === 0)
      throw new ConflictException('Job was just taken by another worker');
    return { id: jobId, status: JobStatus.ACCEPTED };
  }

  // called by NegotiationsService once one side accepts the other's offer.
  // Same race-safe pattern as accept() — only the first negotiation to reach
  // here for a given job wins; NegotiationsService checks the returned flag
  // and supersedes every other open thread on the job when it's true.
  async assignFromNegotiation(
    jobId: string,
    workerId: string,
    price: number,
  ): Promise<boolean> {
    const res = await this.repo
      .createQueryBuilder()
      .update(Job)
      .set({
        workerId,
        status: JobStatus.ACCEPTED,
        acceptedAt: () => 'now()',
        finalPrice: price,
      })
      .where(
        'id = :jobId AND status = :requested AND ("expiresAt" IS NULL OR "expiresAt" > now())',
        { jobId, requested: JobStatus.REQUESTED },
      )
      .execute();
    return res.affected === 1;
  }

  async start(workerUserId: string, jobId: string) {
    const job = await this.ownedByWorker(workerUserId, jobId);
    assertTransition(job.status, JobStatus.IN_PROGRESS);
    job.status = JobStatus.IN_PROGRESS;
    job.startedAt = new Date();
    await this.repo.save(job);
    return { id: job.id, status: job.status };
  }

  async complete(workerUserId: string, jobId: string) {
    const job = await this.ownedByWorker(workerUserId, jobId);
    assertTransition(job.status, JobStatus.COMPLETED);
    job.status = JobStatus.COMPLETED;
    job.completedAt = new Date();
    await this.repo.save(job);

    // Payments listens for this to pay the worker out (online-paid jobs only).
    this.events.emit(JOB_COMPLETED, {
      jobId: job.id,
      customerId: job.customerId,
      workerId: job.workerId!,
    } satisfies JobCompletedEvent);

    return { id: job.id, status: job.status };
  }

  async cancel(userId: string, jobId: string, reason?: string) {
    const job = await this.repo.findOne({ where: { id: jobId } });
    if (!job) throw new NotFoundException('Job not found');
    if (job.customerId !== userId && job.workerId !== userId) {
      throw new ForbiddenException('Not your job');
    }
    const priorStatus = job.status; // capture before the transition — drives refund policy
    assertTransition(job.status, JobStatus.CANCELLED);
    job.status = JobStatus.CANCELLED;
    job.cancelledAt = new Date();
    job.cancellationReason = reason ?? null;
    await this.repo.save(job);

    // Payments listens for this to apply the refund/cancellation-fee split.
    this.events.emit(JOB_CANCELLED, {
      jobId: job.id,
      customerId: job.customerId,
      workerId: job.workerId,
      cancelledByUserId: userId,
      priorStatus,
    } satisfies JobCancelledEvent);

    return { id: job.id, status: job.status };
  }

  async getById(userId: string, jobId: string) {
    const job = await this.repo.findOne({ where: { id: jobId } });
    if (!job) throw new NotFoundException('Job not found');
    if (job.customerId !== userId && job.workerId !== userId) {
      throw new ForbiddenException('Not your job');
    }
    return job;
  }

  // scoped to the caller's ACTIVE MODE, not their roles — a dual-role user in
  // customer mode sees only jobs they posted; switch to worker mode and they
  // see only jobs they accepted. The other side is hidden until they switch.
  async mine(userId: string, activeMode: Role) {
    if (activeMode === Role.WORKER) {
      return this.repo.find({
        where: { workerId: userId },
        order: { createdAt: 'DESC' },
      });
    }
    // customer mode (and any non-worker mode) → jobs they posted
    return this.repo.find({
      where: { customerId: userId },
      order: { createdAt: 'DESC' },
    });
  }

  // worker discovers REQUESTED jobs near them, matching their skills
  async findNearby(
    workerUserId: string,
    dto: NearbyJobsDto,
  ): Promise<{
    data: {
      id: string;
      serviceType: { id: string; name: string; displayName: string };
      type: JobType;
      description: string | null;
      quantity: number | null;
      estimatedPrice: number | null;
      customerBudget: number | null;
      scheduledAt: Date | null;
      expiresAt: Date | null;
      location: { lat: number; lng: number };
      distanceKm: number;
      createdAt: Date;
    }[];
    meta: { total: number; page: number; limit: number; pages: number };
  }> {
    const worker = await this.workers.getForJobAccept(workerUserId);
    if (!worker) throw new ForbiddenException('No worker profile');
    if (worker.status !== WorkerStatus.VERIFIED)
      throw new ForbiddenException('Worker not verified');
    if (worker.skillIds.length === 0) {
      return {
        data: [],
        meta: { total: 0, page: dto.page, limit: dto.limit, pages: 0 },
      };
    }

    const radiusMeters = dto.radiusKm * 1000;
    const point = 'ST_SetSRID(ST_MakePoint(:lng, :lat), 4326)::geography';

    const baseQb = () =>
      this.repo
        .createQueryBuilder('job')
        .where('job.status = :status', { status: JobStatus.REQUESTED })
        .andWhere('job."serviceTypeId" IN (:...skillIds)', {
          skillIds: worker.skillIds,
        })
        .andWhere('(job."expiresAt" IS NULL OR job."expiresAt" > now())')
        .andWhere(`ST_DWithin(job.location, ${point}, :radiusMeters)`)
        .setParameters({
          lat: dto.lat,
          lng: dto.lng,
          radiusMeters,
          skillIds: worker.skillIds,
          status: JobStatus.REQUESTED,
        });

    const total = await baseQb().getCount();

    // joined manually on the always-populated serviceTypeId column, rather than
    // via the ManyToOne relation — that relation's own FK column can be stale
    // on rows written before it started being set, so this stays correct either way
    const { entities, raw } = await baseQb()
      .leftJoin(
        'service_types',
        'serviceType',
        'serviceType.id = job."serviceTypeId"',
      )
      .addSelect('serviceType.id', 'serviceTypeId')
      .addSelect('serviceType.name', 'serviceTypeName')
      .addSelect('"serviceType"."displayName"', 'serviceTypeDisplayName')
      .addSelect(`ST_Distance(job.location, ${point})`, 'distance')
      .addSelect('ST_Y(job.location::geometry)', 'lat')
      .addSelect('ST_X(job.location::geometry)', 'lng')
      .orderBy('distance', 'ASC')
      .skip((dto.page - 1) * dto.limit)
      .take(dto.limit)
      .getRawAndEntities<{
        serviceTypeId: string;
        serviceTypeName: string;
        serviceTypeDisplayName: string;
        distance: string;
        lat: string;
        lng: string;
      }>();

    const data = entities.map((job, i) => ({
      id: job.id,
      serviceType: {
        id: raw[i].serviceTypeId,
        name: raw[i].serviceTypeName,
        displayName: raw[i].serviceTypeDisplayName,
      },
      type: job.type,
      description: job.description,
      quantity: job.quantity,
      estimatedPrice: job.estimatedPrice,
      customerBudget: job.customerBudget,
      scheduledAt: job.scheduledAt,
      expiresAt: job.expiresAt,
      location: { lat: Number(raw[i].lat), lng: Number(raw[i].lng) },
      distanceKm: Math.round((Number(raw[i].distance) / 1000) * 100) / 100,
      createdAt: job.createdAt,
    }));

    return {
      data,
      meta: {
        total,
        page: dto.page,
        limit: dto.limit,
        pages: Math.ceil(total / dto.limit),
      },
    };
  }

  private async ownedByWorker(workerUserId: string, jobId: string) {
    const job = await this.repo.findOne({ where: { id: jobId } });
    if (!job) throw new NotFoundException('Job not found');
    if (job.workerId !== workerUserId)
      throw new ForbiddenException('Not your job');
    return job;
  }
}
