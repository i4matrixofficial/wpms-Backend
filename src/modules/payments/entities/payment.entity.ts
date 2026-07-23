import { Entity, Column, Index } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';

export enum PaymentStatus {
  PENDING = 'pending', // created, gateway call in flight
  SUCCEEDED = 'succeeded',
  FAILED = 'failed',
  REFUNDED = 'refunded',
}

@Entity('payments')
export class Payment extends BaseEntity {
  @Index()
  @Column('uuid')
  jobId: string;

  @Index()
  @Column('uuid')
  customerId: string;

  @Column({ type: 'numeric', precision: 10, scale: 2 })
  amount: number;

  @Column({ default: 'LKR' })
  currency: string;

  @Index()
  @Column({ type: 'enum', enum: PaymentStatus, default: PaymentStatus.PENDING })
  status: PaymentStatus;

  @Column()
  gatewayProvider: string; // 'mock' | 'payhere' | ... — whichever gateway handled this charge

  @Column({ type: 'varchar', nullable: true })
  gatewayReference: string | null; // the gateway's own transaction id

  @Column({ type: 'text', nullable: true })
  failureReason: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  paidAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  refundedAt: Date | null;

  @Column({ type: 'text', nullable: true })
  refundReason: string | null;
}
