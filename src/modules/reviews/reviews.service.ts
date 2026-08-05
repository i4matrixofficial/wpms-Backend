import {
  Injectable,
  Logger,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';
import { Review, ReviewDirection } from './entities/review.entity';
import { JobsService } from '../jobs/jobs.service';
import { WorkersService } from '../workers/workers.service';
import { Job, JobStatus } from '../jobs/entities/job.entity';
import { CreateReviewDto } from './dto/create-review.dto';
import { UpdateReviewDto } from './dto/update-review.dto';
import { ListReviewsDto } from './dto/list-reviews.dto';

// a job only becomes reviewable once it has stopped moving. Cancelled counts
// on purpose — the pairing happened, so both sides have something to say.
// REQUESTED/EXPIRED never had a worker, and ACCEPTED/IN_PROGRESS jobs are
// still live, so reviewing them would rate an unfinished experience.
const REVIEWABLE_STATUSES = [JobStatus.COMPLETED, JobStatus.CANCELLED];

// authors can correct their own review for a while after posting, then it
// freezes — otherwise a rating can be quietly rewritten long after the fact.
const EDIT_WINDOW_MS = 24 * 60 * 60 * 1000;

export interface RatingSummary {
  average: number;
  count: number;
  breakdown: Record<1 | 2 | 3 | 4 | 5, number>;
}

@Injectable()
export class ReviewsService {
  private readonly logger = new Logger(ReviewsService.name);

  constructor(
    @InjectRepository(Review) private repo: Repository<Review>,
    private jobs: JobsService,
    private workers: WorkersService,
  ) {}

  // ---- write path -------------------------------------------------------

  async create(userId: string, jobId: string, dto: CreateReviewDto) {
    const job = await this.jobs.getById(userId, jobId); // 404/403 for non-participants
    const { revieweeId, direction } = this.resolveSides(job, userId);

    if (!REVIEWABLE_STATUSES.includes(job.status)) {
      throw new ConflictException(
        'This job is not finished yet — you can review it once it is completed or cancelled',
      );
    }

    const review = this.repo.create({
      jobId,
      reviewerId: userId,
      revieweeId,
      direction,
      rating: dto.rating,
      comment: dto.comment ?? null,
    });

    let saved: Review;
    try {
      saved = await this.repo.save(review);
    } catch (e) {
      // the unique index is the real guard — two submits racing both pass the
      // checks above, only one survives the insert
      if (
        e instanceof QueryFailedError &&
        (e as { code?: string }).code === '23505'
      ) {
        throw new ConflictException('You already reviewed this job');
      }
      throw e;
    }

    await this.syncWorkerRating(direction, revieweeId);
    return this.toPublic(saved);
  }

  async update(userId: string, reviewId: string, dto: UpdateReviewDto) {
    const review = await this.repo.findOne({ where: { id: reviewId } });
    if (!review) throw new NotFoundException('Review not found');
    if (review.reviewerId !== userId) {
      throw new ForbiddenException('Not your review');
    }
    this.assertWithinEditWindow(review, 'edited');

    if (dto.rating !== undefined) review.rating = dto.rating;
    if (dto.comment !== undefined) review.comment = dto.comment || null;
    await this.repo.save(review);

    await this.syncWorkerRating(review.direction, review.revieweeId);
    return this.toPublic(review);
  }

  // author withdraws their own review, inside the same window they could have
  // edited it in. Soft delete: the row stays for audit, but the partial unique
  // index frees up, so they may post a replacement once.
  async remove(userId: string, reviewId: string) {
    const review = await this.repo.findOne({ where: { id: reviewId } });
    if (!review) throw new NotFoundException('Review not found');
    if (review.reviewerId !== userId) {
      throw new ForbiddenException('Not your review');
    }
    this.assertWithinEditWindow(review, 'deleted');

    await this.repo.softDelete(review.id);
    await this.syncWorkerRating(review.direction, review.revieweeId);
    return { id: review.id, deleted: true };
  }

  // admin moderation — hidden reviews stay in the table but leave the
  // listings and the aggregates
  async setHidden(reviewId: string, isHidden: boolean, reason?: string) {
    const review = await this.repo.findOne({ where: { id: reviewId } });
    if (!review) throw new NotFoundException('Review not found');

    review.isHidden = isHidden;
    review.hiddenReason = isHidden ? (reason ?? null) : null;
    await this.repo.save(review);

    await this.syncWorkerRating(review.direction, review.revieweeId);
    return { id: review.id, isHidden: review.isHidden };
  }

  // ---- read path --------------------------------------------------------

  // both participants' reviews of one job — visible to the participants only.
  // Nothing is withheld until both have written: this isn't a blind-review
  // marketplace, and a job has at most two reviews anyway.
  async forJob(userId: string, jobId: string) {
    await this.jobs.getById(userId, jobId); // participant check
    const reviews = await this.repo.find({
      where: { jobId, isHidden: false },
      order: { createdAt: 'ASC' },
    });
    return reviews.map((r) => this.toPublic(r));
  }

  // public profile feed: everything this user was rated on, newest first
  async received(userId: string, query: ListReviewsDto) {
    const where = {
      revieweeId: userId,
      isHidden: false,
      ...(query.direction ? { direction: query.direction } : {}),
    };
    const [items, total] = await this.repo.findAndCount({
      where,
      order: { createdAt: 'DESC' },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    });
    return {
      items: items.map((r) => this.toPublic(r)),
      total,
      page: query.page,
      limit: query.limit,
      summary: await this.summary(userId, query.direction),
    };
  }

  // reviews the caller wrote — lets a client mark which finished jobs still
  // need feedback without probing each job
  async mine(userId: string, query: ListReviewsDto) {
    const [items, total] = await this.repo.findAndCount({
      where: { reviewerId: userId },
      order: { createdAt: 'DESC' },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    });
    return { items: items.map((r) => this.toPublic(r)), total, ...query };
  }

  // can the caller still review this job, and have they already?
  async eligibility(userId: string, jobId: string) {
    const job = await this.jobs.getById(userId, jobId);
    const existing = await this.repo.findOne({
      where: { jobId, reviewerId: userId },
    });
    const hasWorker = !!job.workerId;
    const finished = REVIEWABLE_STATUSES.includes(job.status);
    return {
      canReview: hasWorker && finished && !existing,
      alreadyReviewed: !!existing,
      reviewId: existing?.id ?? null,
      reason: !hasWorker
        ? 'This job never had an assigned worker'
        : !finished
          ? 'Job is not finished yet'
          : existing
            ? 'You already reviewed this job'
            : null,
    };
  }

  // average + star breakdown over the non-hidden reviews a user received
  async summary(
    userId: string,
    direction?: ReviewDirection,
  ): Promise<RatingSummary> {
    const qb = this.repo
      .createQueryBuilder('r')
      .select('r.rating', 'rating')
      .addSelect('COUNT(*)::int', 'count')
      .where('r.revieweeId = :userId', { userId })
      .andWhere('r.isHidden = false')
      // TypeORM adds this itself for the soft-delete column; spelled out
      // because a stale average is the one bug nobody notices
      .andWhere('r.deletedAt IS NULL')
      .groupBy('r.rating');
    if (direction) qb.andWhere('r.direction = :direction', { direction });

    const rows = await qb.getRawMany<{ rating: number; count: number }>();
    const breakdown = {
      1: 0,
      2: 0,
      3: 0,
      4: 0,
      5: 0,
    } as RatingSummary['breakdown'];
    let total = 0;
    let sum = 0;
    for (const row of rows) {
      const stars = Number(row.rating) as 1 | 2 | 3 | 4 | 5;
      breakdown[stars] = row.count;
      total += row.count;
      sum += stars * row.count;
    }
    return {
      average: total ? Math.round((sum / total) * 100) / 100 : 0,
      count: total,
      breakdown,
    };
  }

  // ---- internals --------------------------------------------------------

  private assertWithinEditWindow(review: Review, verb: 'edited' | 'deleted') {
    if (Date.now() - review.createdAt.getTime() > EDIT_WINDOW_MS) {
      throw new ConflictException(
        `This review can no longer be ${verb} (24h window has passed)`,
      );
    }
  }

  private resolveSides(job: Job, userId: string) {
    if (!job.workerId) {
      throw new ConflictException(
        'This job never had an assigned worker, so there is nobody to review',
      );
    }
    if (job.customerId === userId) {
      return {
        revieweeId: job.workerId,
        direction: ReviewDirection.CUSTOMER_TO_WORKER,
      };
    }
    return {
      revieweeId: job.customerId,
      direction: ReviewDirection.WORKER_TO_CUSTOMER,
    };
  }

  // workers.rating is a denormalised copy read by search/listing endpoints, so
  // it is recomputed from the reviews table (never incremented) after any
  // write — that keeps edits and admin hides from drifting the average.
  // A failure here must not undo a review that already committed.
  private async syncWorkerRating(
    direction: ReviewDirection,
    revieweeId: string,
  ) {
    if (direction !== ReviewDirection.CUSTOMER_TO_WORKER) return;
    try {
      const { average, count } = await this.summary(
        revieweeId,
        ReviewDirection.CUSTOMER_TO_WORKER,
      );
      await this.workers.applyRatingAggregate(revieweeId, average, count);
    } catch (e) {
      this.logger.error(
        `Failed to refresh cached rating for worker user ${revieweeId}: ${
          (e as Error).message
        }`,
      );
    }
  }

  private toPublic(r: Review) {
    return {
      id: r.id,
      jobId: r.jobId,
      reviewerId: r.reviewerId,
      revieweeId: r.revieweeId,
      direction: r.direction,
      rating: r.rating,
      comment: r.comment,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    };
  }
}
