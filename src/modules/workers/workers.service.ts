import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Worker, WorkerStatus } from './entities/worker.entity';
import { UsersService } from '../users/users.service';
import { Role } from '../../common/enums/role.enum';
import { User } from '../users/entities/user.entity';

@Injectable()
export class WorkersService {
  constructor(
    @InjectRepository(Worker) private repo: Repository<Worker>,
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
