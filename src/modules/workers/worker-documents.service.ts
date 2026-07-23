import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import { extname } from 'path';
import { StorageService } from '../storage/storage.service';
import { WorkersService } from './workers.service';
import {
  WorkerDocument,
  DocumentType,
  VerificationStatus,
} from './entities/worker-document.entity';
import { Worker, WorkerStatus } from './entities/worker.entity';

const REQUIRED_DOCS = [
  DocumentType.NIC_FRONT,
  DocumentType.NIC_BACK,
  DocumentType.POLICE_LETTER,
];

const ALLOWED_MIME = ['image/jpeg', 'image/png', 'application/pdf'];
const MAX_BYTES = 5 * 1024 * 1024;

@Injectable()
export class WorkerDocumentsService {
  constructor(
    @InjectRepository(WorkerDocument) private repo: Repository<WorkerDocument>,
    @InjectRepository(Worker) private workerRepo: Repository<Worker>,
    private storage: StorageService,
    private workers: WorkersService,
  ) {}

  async upload(
    userId: string,
    type: DocumentType,
    file: Express.Multer.File,
    issuedAt?: string,
  ) {
    if (!file) throw new BadRequestException('No file provided');
    if (!ALLOWED_MIME.includes(file.mimetype)) {
      throw new BadRequestException('Only JPEG, PNG, or PDF allowed');
    }
    if (file.size > MAX_BYTES)
      throw new BadRequestException('File exceeds 5MB');

    const workerId = await this.workers.ensureWorkerRow(userId);

    const key = `workers/${workerId}/${type}/${randomUUID()}${extname(file.originalname)}`;
    await this.storage.upload(key, file.buffer, file.mimetype);

    // demote any existing current doc of this type, then insert the new current one
    await this.repo.manager.transaction(async (tx) => {
      await tx.update(
        WorkerDocument,
        { workerId, type, isCurrent: true },
        { isCurrent: false },
      );
      await tx.save(
        tx.create(WorkerDocument, {
          workerId,
          type,
          storageKey: key,
          mimeType: file.mimetype,
          fileSize: file.size,
          status: VerificationStatus.PENDING,
          issuedAt: issuedAt ? new Date(issuedAt) : null,
          isCurrent: true,
        }),
      );
    });

    return { type, status: VerificationStatus.PENDING };
  }
  async listPending() {
    const docs = await this.repo.find({
      where: { status: VerificationStatus.PENDING, isCurrent: true }, // ← only current
      order: { createdAt: 'ASC' },
    });
    return Promise.all(
      docs.map(async (d) => ({
        id: d.id,
        workerId: d.workerId,
        type: d.type,
        issuedAt: d.issuedAt,
        viewUrl: await this.storage.getPresignedUrl(d.storageKey, 300),
      })),
    );
  }

  async getHistory(workerId: string, type: DocumentType) {
    const docs = await this.repo.find({
      where: { workerId, type },
      order: { createdAt: 'DESC' }, // newest first
    });
    return Promise.all(
      docs.map(async (d) => ({
        id: d.id,
        status: d.status,
        isCurrent: d.isCurrent,
        rejectionReason: d.rejectionReason,
        reviewedAt: d.reviewedAt,
        createdAt: d.createdAt,
        viewUrl: await this.storage.getPresignedUrl(d.storageKey, 300),
      })),
    );
  }

  async review(
    docId: string,
    adminId: string,
    status: VerificationStatus.APPROVED | VerificationStatus.REJECTED,
    rejectionReason?: string,
  ) {
    const doc = await this.repo.findOne({ where: { id: docId } });
    if (!doc) throw new NotFoundException('Document not found');
    doc.status = status;
    doc.reviewedBy = adminId;
    doc.reviewedAt = new Date();
    doc.rejectionReason =
      status === VerificationStatus.REJECTED ? (rejectionReason ?? null) : null;
    await this.repo.save(doc);
    await this.refreshWorkerStatus(doc.workerId);
    return { id: doc.id, status: doc.status };
  }

  private async refreshWorkerStatus(workerId: string) {
    const docs = await this.repo.find({ where: { workerId, isCurrent: true } });
    const statusByType = new Map(docs.map((d) => [d.type, d.status]));
    const required = REQUIRED_DOCS.map((t) => statusByType.get(t));

    let status: WorkerStatus;
    if (required.some((s) => s === VerificationStatus.REJECTED)) {
      status = WorkerStatus.REJECTED; // a required doc was rejected
    } else if (required.every((s) => s === VerificationStatus.APPROVED)) {
      status = WorkerStatus.VERIFIED; // ← auto-activate: all required approved
    } else if (required.some((s) => s !== undefined)) {
      status = WorkerStatus.PENDING; // some submitted, awaiting
    } else {
      status = WorkerStatus.UNVERIFIED; // nothing required submitted yet
    }
    await this.workerRepo.update({ id: workerId }, { status });
  }

  // service — a worker views their own current documents
  async myDocuments(userId: string) {
    const workerId = await this.workers.ensureWorkerRow(userId);
    const docs = await this.repo.find({
      where: { workerId, isCurrent: true },
      order: { type: 'ASC' },
    });
    return Promise.all(
      docs.map(async (d) => ({
        type: d.type,
        status: d.status,
        rejectionReason: d.rejectionReason,
        issuedAt: d.issuedAt,
        viewUrl: await this.storage.getPresignedUrl(d.storageKey, 300), // 5-min view link
      })),
    );
  }
}
