import { Entity, Column, Index } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';

export enum PayoutStatus {
  PENDING = 'pending', // created, transfer in flight
  PAID = 'paid',
  FAILED = 'failed',
}

export enum PayoutReason {
  JOB_COMPLETED = 'job_completed', // worker finished the job
  CANCELLATION_FEE = 'cancellation_fee', // customer cancelled mid-work, worker keeps a share
}

// money the platform pays out TO a worker — the mirror of a Payment (money in
// from a customer). Only ever created for online-paid jobs; cash jobs settle
// hand-to-hand so no payout is needed.
@Entity('payouts')
export class Payout extends BaseEntity {
  @Index()
  @Column('uuid')
  jobId: string;

  @Index()
  @Column('uuid')
  workerId: string; // the worker's userId (paid TO)

  @Column('uuid')
  paymentId: string; // the source customer payment this is derived from

  @Column({ type: 'numeric', precision: 10, scale: 2 })
  grossAmount: number; // the worker's share before commission

  @Column({ type: 'numeric', precision: 10, scale: 2 })
  commissionAmount: number; // platform's cut

  @Column({ type: 'numeric', precision: 10, scale: 2 })
  netAmount: number; // grossAmount - commissionAmount, actually transferred

  @Column({ default: 'LKR' })
  currency: string;

  @Index()
  @Column({ type: 'enum', enum: PayoutStatus, default: PayoutStatus.PENDING })
  status: PayoutStatus;

  @Column({ type: 'enum', enum: PayoutReason })
  reason: PayoutReason;

  @Column({ type: 'varchar', nullable: true })
  gatewayProvider: string | null;

  @Column({ type: 'varchar', nullable: true })
  gatewayReference: string | null; // the gateway's own transfer id

  @Column({ type: 'text', nullable: true })
  failureReason: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  paidAt: Date | null;
}
