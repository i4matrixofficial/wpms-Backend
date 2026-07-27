import { Entity, Column, Index } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';

export enum NegotiationStatus {
  OPEN = 'open', // back-and-forth still possible
  ACCEPTED = 'accepted', // one side accepted the other's current price — job assigned
  DECLINED = 'declined', // either side walked away without accepting
  WITHDRAWN = 'withdrawn', // the worker pulled their own thread
  SUPERSEDED = 'superseded', // a different worker's thread on the same job got accepted first
  EXPIRED = 'expired', // the job itself expired while this was still open
}

export enum OfferProposedBy {
  CUSTOMER = 'customer',
  WORKER = 'worker',
}

// One negotiation thread per (job, worker) pair. Multiple workers can each
// open their own thread on the same REQUESTED job — the customer compares
// across threads and accepts one, which assigns that worker at that price
// and supersedes every other open thread on the job.
@Entity('job_negotiations')
export class JobNegotiation extends BaseEntity {
  @Index()
  @Column('uuid')
  jobId: string;

  @Index()
  @Column('uuid')
  workerId: string;

  @Index()
  @Column({
    type: 'enum',
    enum: NegotiationStatus,
    default: NegotiationStatus.OPEN,
  })
  status: NegotiationStatus;

  // the price currently on the table and who put it there — kept denormalized
  // here (mirroring the latest JobOffer row) so reads don't need to join
  @Column({ type: 'numeric', precision: 10, scale: 2 })
  currentPrice: number;

  @Column({ type: 'enum', enum: OfferProposedBy })
  lastProposedBy: OfferProposedBy;

  @Column({ type: 'timestamptz', nullable: true })
  closedAt: Date | null;
}
