import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Job, JobStatus, JobType } from './entities/job.entity';
import { assertTransition } from './job-state.machine';
import { WorkersService } from '../workers/workers.service';
import { WorkerStatus } from '../workers/entities/worker.entity';
import { ServiceTypesService } from '../service-types/service-types.service';
import { Role } from '../../common/enums/role.enum';
import { CreateJobDto } from './dto/create-job.dto';

const IMMEDIATE_EXPIRY_MIN = 15;

@Injectable()
export class JobsService {
  constructor(
    @InjectRepository(Job) private repo: Repository<Job>,
    private workers: WorkersService,
    private serviceTypes: ServiceTypesService,
  ) {}

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
      status: JobStatus.REQUESTED,
      type: dto.type as JobType,
      location: { type: 'Point', coordinates: [dto.lng, dto.lat] } as any,
      description: dto.description ?? null,
      quantity: dto.quantity ?? null,
      estimatedPrice,
      scheduledAt: isScheduled ? (dto.scheduledAt ?? null) : null,
      expiresAt: isScheduled ? null : new Date(Date.now() + 15 * 60 * 1000),
    });
    const saved = await this.repo.save(job);
    return {
      id: saved.id,
      status: saved.status,
      serviceTypeId: saved.serviceTypeId,
      estimatedPrice,
    };
  }

  // the race-safe broadcast claim — first worker wins
  async accept(workerUserId: string, jobId: string) {
    const job = await this.repo.findOne({ where: { id: jobId } });
    if (!job) throw new NotFoundException('Job not found');
    if (job.status !== JobStatus.REQUESTED)
      throw new ConflictException('Job is no longer available');

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
      .where('id = :jobId AND status = :requested', {
        jobId,
        requested: JobStatus.REQUESTED,
      })
      .execute();

    if (res.affected === 0)
      throw new ConflictException('Job was just taken by another worker');
    return { id: jobId, status: JobStatus.ACCEPTED };
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
    return { id: job.id, status: job.status };
  }

  async cancel(userId: string, jobId: string, reason?: string) {
    const job = await this.repo.findOne({ where: { id: jobId } });
    if (!job) throw new NotFoundException('Job not found');
    if (job.customerId !== userId && job.workerId !== userId) {
      throw new ForbiddenException('Not your job');
    }
    assertTransition(job.status, JobStatus.CANCELLED);
    job.status = JobStatus.CANCELLED;
    job.cancelledAt = new Date();
    job.cancellationReason = reason ?? null;
    await this.repo.save(job);
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

  async mine(userId: string, role: Role) {
    if (role === Role.CUSTOMER) {
      return this.repo.find({
        where: { customerId: userId },
        order: { createdAt: 'DESC' },
      });
    }
    if (role === Role.WORKER) {
      return this.repo.find({
        where: { workerId: userId },
        order: { createdAt: 'DESC' },
      });
    }
    return [];
  }

  private async ownedByWorker(workerUserId: string, jobId: string) {
    const job = await this.repo.findOne({ where: { id: jobId } });
    if (!job) throw new NotFoundException('Job not found');
    if (job.workerId !== workerUserId)
      throw new ForbiddenException('Not your job');
    return job;
  }
}
