import { ConflictException } from '@nestjs/common';
import { QueryFailedError, Repository } from 'typeorm';
import { ReviewsService } from './reviews.service';
import { Review, ReviewDirection } from './entities/review.entity';
import { Job, JobStatus } from '../jobs/entities/job.entity';
import { JobsService } from '../jobs/jobs.service';
import { WorkersService } from '../workers/workers.service';

const CUSTOMER = 'cust-1';
const WORKER = 'work-1';

function makeJob(status: JobStatus, workerId: string | null = WORKER): Job {
  return {
    id: 'job-1',
    customerId: CUSTOMER,
    workerId,
    status,
  } as unknown as Job;
}

// minimal query builder stand-in for summary(): every chained call returns
// itself, and the aggregate resolves to a single 5-star review
function fakeQueryBuilder() {
  const qb = {
    select: () => qb,
    addSelect: () => qb,
    where: () => qb,
    andWhere: () => qb,
    groupBy: () => qb,
    getRawMany: () => Promise.resolve([{ rating: 5, count: 1 }]),
  };
  return qb;
}

function makeReview(overrides: Partial<Review> = {}): Review {
  return {
    id: 'rev-1',
    jobId: 'job-1',
    reviewerId: CUSTOMER,
    revieweeId: WORKER,
    direction: ReviewDirection.CUSTOMER_TO_WORKER,
    rating: 5,
    comment: null,
    isHidden: false,
    createdAt: new Date(),
    ...overrides,
  } as unknown as Review;
}

function build(job: Job, existing: Review | null = null) {
  const save = jest.fn((r: Review) =>
    Promise.resolve({
      ...r,
      id: 'rev-1',
      createdAt: new Date(),
      updatedAt: new Date(),
    }),
  );
  const softDelete = jest.fn(() => Promise.resolve());
  const repo = {
    create: (r: Partial<Review>) => r,
    save,
    softDelete,
    findOne: () => Promise.resolve(existing),
    createQueryBuilder: fakeQueryBuilder,
  } as unknown as Repository<Review>;

  const jobs = {
    getById: () => Promise.resolve(job),
  } as unknown as JobsService;
  const applyRatingAggregate = jest.fn(() => Promise.resolve());
  const workers = { applyRatingAggregate } as unknown as WorkersService;

  return {
    service: new ReviewsService(repo, jobs, workers),
    save,
    softDelete,
    applyRatingAggregate,
  };
}

describe('ReviewsService', () => {
  it('lets the customer review the worker on a completed job', async () => {
    const { service, applyRatingAggregate } = build(
      makeJob(JobStatus.COMPLETED),
    );
    const review = await service.create(CUSTOMER, 'job-1', { rating: 5 });

    expect(review.direction).toBe(ReviewDirection.CUSTOMER_TO_WORKER);
    expect(review.revieweeId).toBe(WORKER);
    expect(applyRatingAggregate).toHaveBeenCalledWith(WORKER, 5, 1);
  });

  // the whole point of the feature: getting paired on a job earns the review,
  // the outcome doesn't have to be a happy one
  it('lets either side review a CANCELLED job', async () => {
    const { service } = build(makeJob(JobStatus.CANCELLED));
    const byWorker = await service.create(WORKER, 'job-1', { rating: 2 });

    expect(byWorker.direction).toBe(ReviewDirection.WORKER_TO_CUSTOMER);
    expect(byWorker.revieweeId).toBe(CUSTOMER);
  });

  it('rejects reviewing a job that is still live', async () => {
    const { service } = build(makeJob(JobStatus.IN_PROGRESS));
    await expect(
      service.create(CUSTOMER, 'job-1', { rating: 5 }),
    ).rejects.toThrow(ConflictException);
  });

  it('rejects a job that never had a worker', async () => {
    const { service } = build(makeJob(JobStatus.CANCELLED, null));
    await expect(
      service.create(CUSTOMER, 'job-1', { rating: 5 }),
    ).rejects.toThrow(ConflictException);
  });

  it('turns a unique-index collision into a 409, not a 500', async () => {
    const { service, save } = build(makeJob(JobStatus.COMPLETED));
    const dup = Object.assign(
      new QueryFailedError('insert', [], new Error('duplicate key')),
      { code: '23505' },
    );
    save.mockRejectedValueOnce(dup);

    await expect(
      service.create(CUSTOMER, 'job-1', { rating: 5 }),
    ).rejects.toThrow('You already reviewed this job');
  });

  it('lets the author withdraw their review and refreshes the rating', async () => {
    const { service, softDelete, applyRatingAggregate } = build(
      makeJob(JobStatus.COMPLETED),
      makeReview(),
    );

    await expect(service.remove(CUSTOMER, 'rev-1')).resolves.toEqual({
      id: 'rev-1',
      deleted: true,
    });
    expect(softDelete).toHaveBeenCalledWith('rev-1');
    expect(applyRatingAggregate).toHaveBeenCalled();
  });

  it('refuses to withdraw someone else’s review', async () => {
    const { service } = build(makeJob(JobStatus.COMPLETED), makeReview());
    await expect(service.remove(WORKER, 'rev-1')).rejects.toThrow(
      'Not your review',
    );
  });

  it('freezes edit and withdrawal once the 24h window has passed', async () => {
    const old = makeReview({
      createdAt: new Date(Date.now() - 25 * 60 * 60 * 1000),
    });
    const { service } = build(makeJob(JobStatus.COMPLETED), old);

    await expect(service.remove(CUSTOMER, 'rev-1')).rejects.toThrow(
      ConflictException,
    );
    await expect(
      service.update(CUSTOMER, 'rev-1', { rating: 1 }),
    ).rejects.toThrow(ConflictException);
  });

  it('does not touch the cached worker rating for customer-side reviews', async () => {
    const { service, applyRatingAggregate } = build(
      makeJob(JobStatus.COMPLETED),
    );
    await service.create(WORKER, 'job-1', { rating: 4 });
    expect(applyRatingAggregate).not.toHaveBeenCalled();
  });
});
