import { Entity, Column, Index, DeleteDateColumn } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';

// which side of the job wrote it — a job produces at most two reviews, one
// per direction, so this is derivable from (job, reviewer) but stored anyway
// to keep the aggregate queries a plain indexed filter.

export enum ReviewDirection {
  CUSTOMER_TO_WORKER = 'customer_to_worker',
  WORKER_TO_CUSTOMER = 'worker_to_customer',
}

// one review of one participant by the other, on one job. Eligibility is the
// *pairing*, not the outcome: a job that was cancelled after a worker accepted
// it still earns both sides a review (that's often exactly when feedback
// matters). Uniqueness is enforced on (jobId, reviewerId) by a DB index, so
// concurrent double-submits fail on the index rather than on a read-then-write
// check.
//
// The unique index is *partial* (`WHERE "deletedAt" IS NULL`, see the
// migration): withdrawing a review frees the slot so the author can post a
// fresh one, while the withdrawn row stays behind as history.
@Entity('reviews')
@Index('UQ_reviews_job_reviewer', ['jobId', 'reviewerId'], {
  unique: true,
  where: '"deletedAt" IS NULL',
})
export class Review extends BaseEntity {
  @Index()
  @Column('uuid')
  jobId: string;

  @Index()
  @Column('uuid')
  reviewerId: string; // userId of the author

  @Index()
  @Column('uuid')
  revieweeId: string; // userId being reviewed

  @Column({ type: 'enum', enum: ReviewDirection })
  direction: ReviewDirection;

  @Column({ type: 'int' })
  rating: number; // 1–5, whole stars

  @Column({ type: 'text', nullable: true })
  comment: string | null;

  // admin moderation. Hidden reviews stay in the table (audit trail) but drop
  // out of every public listing and out of the rating aggregates.
  @Column({ default: false })
  isHidden: boolean;

  @Column({ type: 'text', nullable: true })
  hiddenReason: string | null;

  // author withdrew it. TypeORM filters these out of every find/query-builder
  // read automatically, so deleted reviews leave the listings and the
  // averages without a single call site having to remember.
  @DeleteDateColumn({ type: 'timestamptz', nullable: true })
  deletedAt: Date | null;
}
