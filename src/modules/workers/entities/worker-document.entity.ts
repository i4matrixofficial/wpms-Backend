import { Entity, Column, Index, ManyToOne, JoinColumn } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { Worker } from './worker.entity';

export enum DocumentType {
  NIC_FRONT = 'nic_front',
  NIC_BACK = 'nic_back',
  POLICE_LETTER = 'police_letter',
  PROOF_OF_ADDRESS = 'proof_of_address',
}

export enum VerificationStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
}

@Entity('worker_documents')
@Index(['workerId', 'type'])
export class WorkerDocument extends BaseEntity {
  @ManyToOne(() => Worker)
  @JoinColumn({ name: 'worker_id' })
  worker: Worker;

  @Column('uuid')
  workerId: string;

  @Column({ type: 'enum', enum: DocumentType })
  type: DocumentType;

  @Column()
  storageKey: string; // MinIO object key — never a URL

  @Column()
  mimeType: string;

  @Column({ type: 'int' })
  fileSize: number;

  @Column({
    type: 'enum',
    enum: VerificationStatus,
    default: VerificationStatus.PENDING,
  })
  status: VerificationStatus;

  @Column({ default: true })
  isCurrent: boolean; // false once a newer attempt for same worker+type replaces it

  @Column({ type: 'date', nullable: true })
  issuedAt: Date | null;

  @Column({ type: 'uuid', nullable: true })
  reviewedBy: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  reviewedAt: Date | null;

  @Column({ type: 'text', nullable: true })
  rejectionReason: string | null;
}
