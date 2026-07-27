import {
  Inject,
  Injectable,
  ConflictException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, QueryFailedError, Repository } from 'typeorm';
import { OnEvent } from '@nestjs/event-emitter';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type Redis from 'ioredis';
import { randomUUID } from 'crypto';
import { extname } from 'path';
import { ChatMessage, MessageType } from './entities/chat-message.entity';
import { ChatBlock } from './entities/chat-block.entity';
import { JobsService } from '../jobs/jobs.service';
import { Job, JobStatus } from '../jobs/entities/job.entity';
import { StorageService } from '../storage/storage.service';
import { REDIS_CLIENT } from '../redis/redis.constants';
import { SendMessageDto } from './dto/send-message.dto';
import { ListMessagesDto } from './dto/list-messages.dto';
import { JOB_CANCELLED } from '../jobs/jobs.events';
import type { JobCancelledEvent } from '../jobs/jobs.events';
import { CHAT_MESSAGE_CREATED, CHAT_MESSAGE_SEEN } from './chat.events';

const ALLOWED_IMAGE_MIME = ['image/jpeg', 'image/png'];
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

// jobs still open to chatting on — closed-out jobs (cancelled/expired/completed)
// can still be READ but not sent to
const CLOSED_STATUSES = [
  JobStatus.CANCELLED,
  JobStatus.EXPIRED,
  JobStatus.COMPLETED,
];

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(
    @InjectRepository(ChatMessage) private repo: Repository<ChatMessage>,
    @InjectRepository(ChatBlock) private blockRepo: Repository<ChatBlock>,
    @Inject(REDIS_CLIENT) private redis: Redis,
    private jobs: JobsService,
    private storage: StorageService,
    private events: EventEmitter2,
  ) {}

  // throws NotFound/Forbidden if the caller isn't the customer or worker on
  // this job — reused by the REST controller and the gateway alike
  async assertParticipant(userId: string, jobId: string) {
    const job = await this.jobs.getById(userId, jobId);
    if (!job.workerId) {
      throw new ConflictException('This job has no assigned worker yet');
    }
    return job;
  }

  private otherParticipant(job: Job, userId: string): string {
    return job.customerId === userId
      ? (job.workerId as string)
      : job.customerId;
  }

  private async assertNotBlocked(userId: string, otherId: string) {
    const blocked = await this.blockRepo.findOne({
      where: [
        { blockerId: userId, blockedId: otherId },
        { blockerId: otherId, blockedId: userId },
      ],
    });
    if (blocked) {
      throw new ForbiddenException('You cannot message this user right now');
    }
  }

  private async assertCanSend(userId: string, jobId: string) {
    const job = await this.assertParticipant(userId, jobId);
    if (CLOSED_STATUSES.includes(job.status)) {
      throw new ConflictException(
        'This job is closed — you can no longer send messages',
      );
    }
    const other = this.otherParticipant(job, userId);
    await this.assertNotBlocked(userId, other);
    return { job, recipientId: other };
  }

  async send(userId: string, jobId: string, dto: SendMessageDto) {
    const { recipientId } = await this.assertCanSend(userId, jobId);
    const message = await this.repo.save(
      this.repo.create({
        jobId,
        senderId: userId,
        type: MessageType.TEXT,
        body: dto.body,
      }),
    );
    await this.afterCreate(jobId, recipientId, message);
    return this.toDto(message);
  }

  async sendImage(userId: string, jobId: string, file: Express.Multer.File) {
    if (!file) throw new BadRequestException('No file provided');
    if (!ALLOWED_IMAGE_MIME.includes(file.mimetype)) {
      throw new BadRequestException('Only JPEG or PNG images allowed');
    }
    if (file.size > MAX_IMAGE_BYTES) {
      throw new BadRequestException('Image exceeds 5MB');
    }

    const { recipientId } = await this.assertCanSend(userId, jobId);

    const key = `chat/${jobId}/${randomUUID()}${extname(file.originalname)}`;
    await this.storage.upload(key, file.buffer, file.mimetype);

    const message = await this.repo.save(
      this.repo.create({
        jobId,
        senderId: userId,
        type: MessageType.IMAGE,
        attachmentKey: key,
        attachmentMimeType: file.mimetype,
        attachmentSize: file.size,
      }),
    );
    await this.afterCreate(jobId, recipientId, message);
    return this.toDto(message);
  }

  async history(userId: string, jobId: string, opts: ListMessagesDto) {
    await this.jobs.getById(userId, jobId); // participant check only

    const [rows, total] = await this.repo.findAndCount({
      where: { jobId },
      order: { createdAt: 'ASC' },
      skip: (opts.page - 1) * opts.limit,
      take: opts.limit,
    });

    return {
      data: await Promise.all(rows.map((m) => this.toDtoWithUrl(m))),
      meta: {
        total,
        page: opts.page,
        limit: opts.limit,
        pages: Math.ceil(total / opts.limit),
      },
    };
  }

  // marks every message the OTHER participant sent on this job as read, and
  // clears this user's unread counter for it
  async markSeen(userId: string, jobId: string) {
    const job = await this.jobs.getById(userId, jobId);
    // IS DISTINCT FROM (not !=) so this also catches SYSTEM messages, whose
    // senderId is NULL — a plain "senderId != userId" comparison against NULL
    // is unknown/false in SQL and would silently skip them
    await this.repo
      .createQueryBuilder()
      .update(ChatMessage)
      .set({ readAt: new Date() })
      .where('"jobId" = :jobId', { jobId })
      .andWhere('"senderId" IS DISTINCT FROM :userId', { userId })
      .andWhere('"readAt" IS NULL')
      .execute();
    await this.clearUnread(jobId, userId);
    this.events.emit(CHAT_MESSAGE_SEEN, {
      jobId,
      seenBy: userId,
      otherUserId: this.otherParticipant(job, userId),
    });
    return { ok: true };
  }

  async markDelivered(messageId: string) {
    await this.repo.update(
      { id: messageId, deliveredAt: IsNull() },
      { deliveredAt: new Date() },
    );
  }

  // --- presence (read-only from the service's perspective; ChatGateway owns writes) ---
  async isOnline(userId: string): Promise<boolean> {
    const online = await this.redis.sismember('presence:online', userId);
    return online === 1;
  }

  // --- unread counts ---
  private unreadKey(jobId: string, userId: string) {
    return `chat:unread:${userId}:${jobId}`;
  }
  private unreadJobsKey(userId: string) {
    return `chat:unread:jobs:${userId}`;
  }

  private async bumpUnread(jobId: string, recipientId: string) {
    await this.redis.incr(this.unreadKey(jobId, recipientId));
    await this.redis.sadd(this.unreadJobsKey(recipientId), jobId);
  }

  private async clearUnread(jobId: string, userId: string) {
    await this.redis.del(this.unreadKey(jobId, userId));
    await this.redis.srem(this.unreadJobsKey(userId), jobId);
  }

  async unreadForJob(userId: string, jobId: string): Promise<number> {
    const val = await this.redis.get(this.unreadKey(jobId, userId));
    return val ? parseInt(val, 10) : 0;
  }

  async unreadSummary(userId: string) {
    const jobIds = await this.redis.smembers(this.unreadJobsKey(userId));
    if (jobIds.length === 0) return { total: 0, byJob: [] };
    const counts = await Promise.all(
      jobIds.map((jobId) => this.redis.get(this.unreadKey(jobId, userId))),
    );
    const byJob = jobIds
      .map((jobId, i) => ({ jobId, count: parseInt(counts[i] ?? '0', 10) }))
      .filter((entry) => entry.count > 0);
    return {
      total: byJob.reduce((sum, entry) => sum + entry.count, 0),
      byJob,
    };
  }

  // --- blocking ---
  async block(userId: string, targetUserId: string) {
    if (userId === targetUserId) {
      throw new BadRequestException('You cannot block yourself');
    }
    const existing = await this.blockRepo.findOne({
      where: { blockerId: userId, blockedId: targetUserId },
    });
    if (!existing) {
      try {
        await this.blockRepo.save(
          this.blockRepo.create({
            blockerId: userId,
            blockedId: targetUserId,
          }),
        );
      } catch (e) {
        // unique violation — a concurrent request already created the same
        // block row; the end state is what the caller wanted either way
        if (
          !(e instanceof QueryFailedError) ||
          (e as unknown as { code?: string }).code !== '23505'
        ) {
          throw e;
        }
      }
    }
    return { ok: true };
  }

  async unblock(userId: string, targetUserId: string) {
    await this.blockRepo.delete({
      blockerId: userId,
      blockedId: targetUserId,
    });
    return { ok: true };
  }

  async listBlocks(userId: string) {
    const rows = await this.blockRepo.find({ where: { blockerId: userId } });
    return rows.map((r) => ({ userId: r.blockedId, blockedAt: r.createdAt }));
  }

  // --- job lifecycle reactions ---
  // never throws — a failure here must not affect the job transition that
  // already committed, same rule PaymentsService follows for its listeners
  @OnEvent(JOB_CANCELLED)
  async onJobCancelled(event: JobCancelledEvent) {
    try {
      if (!event.workerId) return; // no chat thread exists without an assigned worker
      const message = await this.repo.save(
        this.repo.create({
          jobId: event.jobId,
          senderId: null,
          type: MessageType.SYSTEM,
          body: 'This job was cancelled.',
        }),
      );
      await this.bumpUnread(event.jobId, event.customerId);
      await this.bumpUnread(event.jobId, event.workerId);
      this.events.emit(CHAT_MESSAGE_CREATED, {
        jobId: event.jobId,
        recipientId: null, // system message — broadcast to whole room, no single recipient
        message: this.toDto(message),
      });
    } catch (e) {
      this.logger.error(
        `Failed to post cancellation system message for job ${event.jobId}`,
        e as Error,
      );
    }
  }

  private async afterCreate(
    jobId: string,
    recipientId: string,
    message: ChatMessage,
  ) {
    await this.bumpUnread(jobId, recipientId);
    this.events.emit(CHAT_MESSAGE_CREATED, {
      jobId,
      recipientId,
      message: await this.toDtoWithUrl(message),
    });
  }

  private toDto(m: ChatMessage) {
    return {
      id: m.id,
      jobId: m.jobId,
      senderId: m.senderId,
      type: m.type,
      body: m.body,
      deliveredAt: m.deliveredAt,
      readAt: m.readAt,
      createdAt: m.createdAt,
    };
  }

  private async toDtoWithUrl(m: ChatMessage) {
    const base = this.toDto(m);
    if (m.type !== MessageType.IMAGE || !m.attachmentKey) return base;
    return {
      ...base,
      attachmentUrl: await this.storage.getPresignedUrl(m.attachmentKey, 300),
      attachmentMimeType: m.attachmentMimeType,
      attachmentSize: m.attachmentSize,
    };
  }
}
