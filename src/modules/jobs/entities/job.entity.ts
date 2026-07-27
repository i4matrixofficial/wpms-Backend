import { Entity, Column, Index, ManyToOne, JoinColumn } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { ServiceType } from '../../service-types/entities/service-type.entity';

export enum JobStatus {
  REQUESTED = 'requested',
  ACCEPTED = 'accepted',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
  EXPIRED = 'expired',
}

export enum JobType {
  IMMEDIATE = 'immediate',
  SCHEDULED = 'scheduled',
}

@Entity('jobs')
export class Job extends BaseEntity {
  @Index()
  @Column('uuid')
  customerId: string;

  @Index()
  @Column({ type: 'uuid', nullable: true })
  workerId: string | null;

  // FK to service_types instead of an enum
  @ManyToOne(() => ServiceType)
  @JoinColumn({ name: 'service_type_id' })
  serviceType: ServiceType;

  @Index()
  @Column('uuid')
  serviceTypeId: string;

  @Index()
  @Column({ type: 'enum', enum: JobStatus, default: JobStatus.REQUESTED })
  status: JobStatus;

  @Column({ type: 'enum', enum: JobType })
  type: JobType;

  @Column({ type: 'geography', spatialFeatureType: 'Point', srid: 4326 })
  location: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  // pricing (populated in stage 2 logic)
  @Column({ type: 'numeric', precision: 10, scale: 2, nullable: true })
  quantity: number | null;

  @Column({ type: 'numeric', precision: 10, scale: 2, nullable: true })
  estimatedPrice: number | null;

  @Column({ type: 'numeric', precision: 10, scale: 2, nullable: true })
  finalPrice: number | null;

  // customer's non-binding budget hint on negotiable (on_completion) jobs —
  // shown to workers browsing nearby jobs, not enforced anywhere. Never set
  // for upfront-priced service types.
  @Column({ type: 'numeric', precision: 10, scale: 2, nullable: true })
  customerBudget: number | null;

  @Column({ type: 'timestamptz', nullable: true })
  scheduledAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  expiresAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  acceptedAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  startedAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  completedAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  cancelledAt: Date | null;

  @Column({ type: 'text', nullable: true })
  cancellationReason: string | null;
}
