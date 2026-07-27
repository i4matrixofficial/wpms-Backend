import { Entity, Column, Index } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { OfferProposedBy } from './job-negotiation.entity';

// Append-only audit trail of every price proposed within a JobNegotiation
// thread. JobNegotiation.currentPrice/lastProposedBy always mirrors the
// newest row here.
@Entity('job_offers')
export class JobOffer extends BaseEntity {
  @Index()
  @Column('uuid')
  negotiationId: string;

  @Column({ type: 'numeric', precision: 10, scale: 2 })
  price: number;

  @Column({ type: 'enum', enum: OfferProposedBy })
  proposedBy: OfferProposedBy;

  @Column({ type: 'text', nullable: true })
  message: string | null;
}
