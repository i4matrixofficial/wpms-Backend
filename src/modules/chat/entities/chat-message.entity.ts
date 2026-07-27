import { Entity, Column, Index } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';

export enum MessageType {
  TEXT = 'text',
  IMAGE = 'image',
  SYSTEM = 'system', // e.g. "Job was cancelled" — posted by the server, not a participant
}

// one message on a job's chat thread. Sender is either the customer or the
// worker on that job (or null for a SYSTEM message) — no group chat, no
// cross-job threads.
@Entity('chat_messages')
export class ChatMessage extends BaseEntity {
  @Index()
  @Column('uuid')
  jobId: string;

  @Index()
  @Column({ type: 'uuid', nullable: true })
  senderId: string | null;

  @Column({ type: 'enum', enum: MessageType, default: MessageType.TEXT })
  type: MessageType;

  @Column({ type: 'text', nullable: true })
  body: string | null;

  @Column({ type: 'varchar', nullable: true })
  attachmentKey: string | null; // storage key for IMAGE messages

  @Column({ type: 'varchar', nullable: true })
  attachmentMimeType: string | null;

  @Column({ type: 'int', nullable: true })
  attachmentSize: number | null;

  @Column({ type: 'timestamptz', nullable: true })
  deliveredAt: Date | null; // best-effort: recipient's socket was in the room when sent

  @Column({ type: 'timestamptz', nullable: true })
  readAt: Date | null;
}
