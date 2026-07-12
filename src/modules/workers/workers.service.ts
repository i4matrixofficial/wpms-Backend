import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Worker, WorkerStatus } from './entities/worker.entity';
import { WorkerDocument } from './entities/worker-document.entity';

@Injectable()
export class WorkersService {
  constructor(
    @InjectRepository(Worker) private repo: Repository<Worker>,
    @InjectRepository(WorkerDocument)
    private docRepo: Repository<WorkerDocument>,
  ) {}

  async setStatus(workerId: string, status: WorkerStatus) {
    const worker = await this.repo.findOne({ where: { id: workerId } });
    if (!worker) throw new NotFoundException('Worker not found');
    worker.status = status;
    await this.repo.save(worker);
    return { id: worker.id, status: worker.status };
  }

  async getStatus(userId: string): Promise<WorkerStatus> {
    const worker = await this.repo.findOne({ where: { user: { id: userId } } });
    return worker?.status ?? WorkerStatus.UNVERIFIED; // no worker row yet = unverified
  }

  async getForJobAccept(
    userId: string,
  ): Promise<{ status: WorkerStatus; skillIds: string[] } | null> {
    const worker = await this.repo.findOne({
      where: { user: { id: userId } },
      relations: { skills: true }, // load the worker_skills relation
    });
    if (!worker) return null;
    return {
      status: worker.status,
      skillIds: worker.skills.map((s) => s.id),
    };
  }
  async list(opts: { status?: WorkerStatus; page: number; limit: number }) {
    const qb = this.repo
      .createQueryBuilder('worker')
      .leftJoinAndSelect('worker.user', 'user') // pull the user for name/email
      .leftJoinAndSelect('worker.skills', 'skills')
      .orderBy('worker.createdAt', 'DESC')
      .skip((opts.page - 1) * opts.limit)
      .take(opts.limit);

    if (opts.status) {
      qb.where('worker.status = :status', { status: opts.status });
    }

    const [rows, total] = await qb.getManyAndCount();

    return {
      data: rows.map((w) => ({
        id: w.id, // ← the worker.id admin needs for actions
        userId: w.user?.id,
        fullName: w.user?.fullName,
        email: w.user?.email,
        status: w.status,
        rating: w.rating,
        skills: w.skills?.map((s) => ({ id: s.id, name: s.name })) ?? [],
      })),
      meta: {
        total,
        page: opts.page,
        limit: opts.limit,
        pages: Math.ceil(total / opts.limit),
      },
    };
  }

  async getDetail(workerId: string) {
    const worker = await this.repo.findOne({
      where: { id: workerId },
      relations: { user: true, skills: true },
    });
    if (!worker) throw new NotFoundException('Worker not found');

    // their current documents
    const docs = await this.docRepo.find({
      where: { workerId, isCurrent: true },
      order: { type: 'ASC' },
    });

    return {
      id: worker.id,
      userId: worker.user?.id,
      fullName: worker.user?.fullName,
      email: worker.user?.email,
      status: worker.status,
      rating: worker.rating,
      isAvailable: worker.isAvailable,
      skills: worker.skills?.map((s) => ({ id: s.id, name: s.name })) ?? [],
      documents: docs.map((d) => ({
        id: d.id,
        type: d.type,
        status: d.status,
        rejectionReason: d.rejectionReason,
        issuedAt: d.issuedAt,
      })),
    };
  }
}
