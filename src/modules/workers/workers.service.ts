import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Worker, WorkerStatus } from './entities/worker.entity';

@Injectable()
export class WorkersService {
  constructor(@InjectRepository(Worker) private repo: Repository<Worker>) {}

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
}
