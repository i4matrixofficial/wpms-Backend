import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Worker, WorkerStatus } from './entities/worker.entity';
import { WorkerDocument } from './entities/worker-document.entity';
import { ServiceType } from '../service-types/entities/service-type.entity';
import { UsersService } from '../users/users.service';
import { Role } from '../../common/enums/role.enum';
import { User } from '../users/entities/user.entity';

@Injectable()
export class WorkersService {
  constructor(
    @InjectRepository(Worker) private repo: Repository<Worker>,
    @InjectRepository(WorkerDocument)
    private docRepo: Repository<WorkerDocument>,
    @InjectRepository(ServiceType)
    private serviceTypeRepo: Repository<ServiceType>,
    private users: UsersService,
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

  private async resolveWorker(userId: string): Promise<Worker> {
    let worker = await this.repo.findOne({
      where: { user: { id: userId } },
      relations: { skills: true },
    });
    if (!worker) {
      worker = await this.repo.save(
        this.repo.create({ user: { id: userId } as User, skills: [] }),
      );
    }
    return worker;
  }

  async setSkills(userId: string, serviceTypeIds: string[]) {
    // validate all ids exist and are active
    const services = await this.serviceTypeRepo.find({
      where: { id: In(serviceTypeIds), isActive: true },
    });
    if (services.length !== serviceTypeIds.length) {
      throw new BadRequestException(
        'One or more service types are invalid or inactive',
      );
    }

    const worker = await this.resolveWorker(userId);
    worker.skills = services; // replace-all
    await this.repo.save(worker); // updates the worker_skills join rows

    return {
      workerId: worker.id,
      skills: services.map((s) => ({
        id: s.id,
        name: s.name,
        displayName: s.displayName,
      })),
    };
  }

  async getMySkills(userId: string) {
    const worker = await this.repo.findOne({
      where: { user: { id: userId } },
      relations: { skills: true },
    });
    return (worker?.skills ?? []).map((s) => ({
      id: s.id,
      name: s.name,
      displayName: s.displayName,
    }));
  }

  // find this user's worker row, or create a stub one on first use
  async ensureWorkerRow(userId: string): Promise<string> {
    let worker = await this.repo.findOne({ where: { user: { id: userId } } });
    if (!worker) {
      worker = await this.repo.save(
        this.repo.create({ user: { id: userId } as User }),
      );
    }
    return worker.id;
  }

  // a customer applies to also become a worker — grants the role and
  // starts them off unverified; they still upload docs to get verified
  async applyAsWorker(userId: string) {
    const user = await this.users.findById(userId);
    if (!user) throw new NotFoundException('User not found');
    if (user.roles.includes(Role.WORKER)) {
      throw new ConflictException('Already a worker');
    }
    await this.users.addRole(userId, Role.WORKER);
    await this.ensureWorkerRow(userId);
    return {
      message:
        'Worker application started — upload your documents to get verified.',
    };
  }
}
