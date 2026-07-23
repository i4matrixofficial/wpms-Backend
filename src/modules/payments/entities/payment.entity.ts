import { Entity, Column, Index } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';

export enum PaymentStatus {
  PENDING = 'pending', // created, gateway call in flight
  SUCCEEDED = 'succeeded',
  FAILED = 'failed',
  PARTIALLY_REFUNDED = 'partially_refunded', // some money returned, e.g. mid-work cancel split
  REFUNDED = 'refunded', // fully returned
}

export enum PaymentMethod {
  ONLINE = 'online', // went through a PaymentGateway
  CASH = 'cash', // paid off-app, worker attests it happened — no gateway involved
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

  @Column({ type: 'enum', enum: PaymentMethod, default: PaymentMethod.ONLINE })
  method: PaymentMethod;

  @Column({ type: 'varchar', nullable: true })
  gatewayProvider: string | null; // 'mock' | 'payhere' | ... — null for cash payments

  @Column({ type: 'varchar', nullable: true })
  gatewayReference: string | null; // the gateway's own transaction id

  @Column({ type: 'uuid', nullable: true })
  confirmedBy: string | null; // worker userId who recorded a cash payment (audit trail)

  @Column({ type: 'text', nullable: true })
  failureReason: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  paidAt: Date | null;

  @Column({ type: 'numeric', precision: 10, scale: 2, default: 0 })
  refundedAmount: number; // running total refunded (supports partial refunds)

  @Column({ type: 'timestamptz', nullable: true })
  refundedAt: Date | null;

  @Column({ type: 'text', nullable: true })
  refundReason: string | null;
}
