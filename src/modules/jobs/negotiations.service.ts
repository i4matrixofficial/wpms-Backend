import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Job, JobStatus } from './entities/job.entity';
import {
  JobNegotiation,
  NegotiationStatus,
  OfferProposedBy,
} from './entities/job-negotiation.entity';
import { JobOffer } from './entities/job-offer.entity';
import { JobsService } from './jobs.service';
import { WorkersService } from '../workers/workers.service';
import { WorkerStatus } from '../workers/entities/worker.entity';
import { ServiceTypesService } from '../service-types/service-types.service';
import { PriceTiming } from '../service-types/entities/service-type.entity';
import { StartNegotiationDto } from './dto/start-negotiation.dto';
import { CounterOfferDto } from './dto/counter-offer.dto';

@Injectable()
export class NegotiationsService {
  constructor(
    @InjectRepository(Job) private jobRepo: Repository<Job>,
    @InjectRepository(JobNegotiation)
    private negotiationRepo: Repository<JobNegotiation>,
    @InjectRepository(JobOffer) private offerRepo: Repository<JobOffer>,
    private jobs: JobsService,
    private workers: WorkersService,
    private serviceTypes: ServiceTypesService,
  ) {}

  // worker opens a negotiation thread with their opening price
  async start(workerUserId: string, jobId: string, dto: StartNegotiationDto) {
    const job = await this.jobRepo.findOne({ where: { id: jobId } });
    if (!job) throw new NotFoundException('Job not found');
    if (job.status !== JobStatus.REQUESTED)
      throw new ConflictException('Job is no longer available');
    if (job.customerId === workerUserId) {
      throw new ConflictException('You cannot negotiate on your own job');
    }
    // reject if expired, even if the sweep hasn't flipped it yet
    if (job.expiresAt && job.expiresAt < new Date()) {
      throw new ConflictException('Job has expired');
    }

    const st = await this.serviceTypes.findByIdActive(job.serviceTypeId);
    if (st.priceTiming !== PriceTiming.ON_COMPLETION) {
      throw new ConflictException(
        'This job has a fixed price — accept it directly instead of negotiating',
      );
    }

    const worker = await this.workers.getForJobAccept(workerUserId);
    if (!worker) throw new ForbiddenException('No worker profile');
    if (worker.status !== WorkerStatus.VERIFIED)
      throw new ForbiddenException('Worker not verified');
    if (!worker.skillIds.includes(job.serviceTypeId)) {
      throw new ForbiddenException('Your skills do not match this job');
    }

    const existing = await this.negotiationRepo.findOne({
      where: { jobId, workerId: workerUserId, status: NegotiationStatus.OPEN },
    });
    if (existing) {
      throw new ConflictException(
        'You already have an open negotiation on this job',
      );
    }

    let negotiation: JobNegotiation;
    try {
      negotiation = await this.negotiationRepo.save(
        this.negotiationRepo.create({
          jobId,
          workerId: workerUserId,
          status: NegotiationStatus.OPEN,
          currentPrice: dto.price,
          lastProposedBy: OfferProposedBy.WORKER,
        }),
      );
    } catch (err) {
      // race with a concurrent start() for the same (job, worker) — the
      // partial unique index on (jobId, workerId) WHERE status = 'open'
      // catches what the check above can't (TOCTOU)
      if (this.isUniqueViolation(err)) {
        throw new ConflictException(
          'You already have an open negotiation on this job',
        );
      }
      throw err;
    }
    await this.offerRepo.save(
      this.offerRepo.create({
        negotiationId: negotiation.id,
        price: dto.price,
        proposedBy: OfferProposedBy.WORKER,
        message: dto.message ?? null,
      }),
    );

    return this.toDetail(negotiation);
  }

  // either side proposes a new price within an existing thread
  async counter(
    userId: string,
    jobId: string,
    negotiationId: string,
    dto: CounterOfferDto,
  ) {
    const { negotiation, proposedBy } = await this.loadForParticipant(
      userId,
      jobId,
      negotiationId,
    );
    if (negotiation.status !== NegotiationStatus.OPEN) {
      throw new ConflictException('This negotiation is no longer open');
    }
    if (negotiation.lastProposedBy === proposedBy) {
      throw new ConflictException(
        'You already proposed the current price — waiting on the other side',
      );
    }

    negotiation.currentPrice = dto.price;
    negotiation.lastProposedBy = proposedBy;
    await this.negotiationRepo.save(negotiation);
    await this.offerRepo.save(
      this.offerRepo.create({
        negotiationId: negotiation.id,
        price: dto.price,
        proposedBy,
        message: dto.message ?? null,
      }),
    );

    return this.toDetail(negotiation);
  }

  // accept the OTHER side's current price — assigns the job.
  // Runs under a row lock on the negotiation so two concurrent accept()
  // calls on the SAME thread (e.g. a double-submitted click) serialize
  // instead of racing to overwrite each other's status — the second call
  // only sees the lock released once the first has already committed
  // ACCEPTED, and bails out on the (no longer OPEN) status check.
  async accept(userId: string, jobId: string, negotiationId: string) {
    return this.negotiationRepo.manager.transaction(async (manager) => {
      const negotiation = await manager.findOne(JobNegotiation, {
        where: { id: negotiationId, jobId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!negotiation) throw new NotFoundException('Negotiation not found');

      const job = await manager.findOne(Job, { where: { id: jobId } });
      if (!job) throw new NotFoundException('Job not found');

      let proposedBy: OfferProposedBy;
      if (job.customerId === userId) {
        proposedBy = OfferProposedBy.CUSTOMER;
      } else if (negotiation.workerId === userId) {
        proposedBy = OfferProposedBy.WORKER;
      } else {
        throw new ForbiddenException('Not a participant in this negotiation');
      }

      if (negotiation.status !== NegotiationStatus.OPEN) {
        throw new ConflictException('This negotiation is no longer open');
      }
      if (negotiation.lastProposedBy === proposedBy) {
        throw new ConflictException(
          'You proposed the current price — waiting for the other side to accept',
        );
      }

      const assigned = await this.jobs.assignFromNegotiation(
        jobId,
        negotiation.workerId,
        Number(negotiation.currentPrice),
      );
      if (!assigned) {
        negotiation.status = NegotiationStatus.SUPERSEDED;
        negotiation.closedAt = new Date();
        await manager.save(negotiation);
        throw new ConflictException(
          'Job was already assigned via another negotiation',
        );
      }

      negotiation.status = NegotiationStatus.ACCEPTED;
      negotiation.closedAt = new Date();
      await manager.save(negotiation);

      // every other open thread on this job loses — the job is taken
      await manager
        .createQueryBuilder()
        .update(JobNegotiation)
        .set({ status: NegotiationStatus.SUPERSEDED, closedAt: () => 'now()' })
        .where('"jobId" = :jobId AND id != :negotiationId AND status = :open', {
          jobId,
          negotiationId,
          open: NegotiationStatus.OPEN,
        })
        .execute();

      return {
        jobId,
        workerId: negotiation.workerId,
        price: negotiation.currentPrice,
        status: JobStatus.ACCEPTED,
      };
    });
  }

  // either side walks away without accepting
  async decline(userId: string, jobId: string, negotiationId: string) {
    const { negotiation } = await this.loadForParticipant(
      userId,
      jobId,
      negotiationId,
    );
    if (negotiation.status !== NegotiationStatus.OPEN) {
      throw new ConflictException('This negotiation is no longer open');
    }
    negotiation.status = NegotiationStatus.DECLINED;
    negotiation.closedAt = new Date();
    await this.negotiationRepo.save(negotiation);
    return this.toDetail(negotiation);
  }

  // worker pulls their own thread
  async withdraw(workerUserId: string, jobId: string, negotiationId: string) {
    const negotiation = await this.negotiationRepo.findOne({
      where: { id: negotiationId, jobId },
    });
    if (!negotiation) throw new NotFoundException('Negotiation not found');
    if (negotiation.workerId !== workerUserId) {
      throw new ForbiddenException('Not your negotiation');
    }
    if (negotiation.status !== NegotiationStatus.OPEN) {
      throw new ConflictException('This negotiation is no longer open');
    }
    negotiation.status = NegotiationStatus.WITHDRAWN;
    negotiation.closedAt = new Date();
    await this.negotiationRepo.save(negotiation);
    return this.toDetail(negotiation);
  }

  // customer's view: every thread on their job, across all competing workers
  async listForJob(customerId: string, jobId: string) {
    const job = await this.jobRepo.findOne({ where: { id: jobId } });
    if (!job) throw new NotFoundException('Job not found');
    if (job.customerId !== customerId) {
      throw new ForbiddenException('Not your job');
    }
    const negotiations = await this.negotiationRepo.find({
      where: { jobId },
      order: { createdAt: 'DESC' },
    });
    if (negotiations.length === 0) return [];

    const offers = await this.offerRepo.find({
      where: { negotiationId: In(negotiations.map((n) => n.id)) },
      order: { createdAt: 'ASC' },
    });
    const offersByNegotiation = new Map<string, JobOffer[]>();
    for (const offer of offers) {
      const list = offersByNegotiation.get(offer.negotiationId) ?? [];
      list.push(offer);
      offersByNegotiation.set(offer.negotiationId, list);
    }

    return negotiations.map((n) =>
      this.toDetailWithOffers(n, offersByNegotiation.get(n.id) ?? []),
    );
  }

  // worker's view: their own thread on this job, if any
  async myThread(workerUserId: string, jobId: string) {
    const negotiation = await this.negotiationRepo.findOne({
      where: { jobId, workerId: workerUserId },
      order: { createdAt: 'DESC' },
    });
    if (!negotiation) {
      throw new NotFoundException('You have no negotiation on this job');
    }
    return this.toDetail(negotiation);
  }

  private async loadForParticipant(
    userId: string,
    jobId: string,
    negotiationId: string,
  ): Promise<{
    negotiation: JobNegotiation;
    job: Job;
    proposedBy: OfferProposedBy;
  }> {
    const negotiation = await this.negotiationRepo.findOne({
      where: { id: negotiationId, jobId },
    });
    if (!negotiation) throw new NotFoundException('Negotiation not found');

    const job = await this.jobRepo.findOne({ where: { id: jobId } });
    if (!job) throw new NotFoundException('Job not found');

    if (job.customerId === userId) {
      return { negotiation, job, proposedBy: OfferProposedBy.CUSTOMER };
    }
    if (negotiation.workerId === userId) {
      return { negotiation, job, proposedBy: OfferProposedBy.WORKER };
    }
    throw new ForbiddenException('Not a participant in this negotiation');
  }

  private async toDetail(negotiation: JobNegotiation) {
    const offers = await this.offerRepo.find({
      where: { negotiationId: negotiation.id },
      order: { createdAt: 'ASC' },
    });
    return this.toDetailWithOffers(negotiation, offers);
  }

  private toDetailWithOffers(negotiation: JobNegotiation, offers: JobOffer[]) {
    return {
      id: negotiation.id,
      jobId: negotiation.jobId,
      workerId: negotiation.workerId,
      status: negotiation.status,
      currentPrice: negotiation.currentPrice,
      lastProposedBy: negotiation.lastProposedBy,
      closedAt: negotiation.closedAt,
      offers: offers.map((o) => ({
        id: o.id,
        price: o.price,
        proposedBy: o.proposedBy,
        message: o.message,
        createdAt: o.createdAt,
      })),
    };
  }

  // postgres unique_violation
  private isUniqueViolation(err: unknown): boolean {
    return (
      typeof err === 'object' &&
      err !== null &&
      (err as { code?: string }).code === '23505'
    );
  }
}
