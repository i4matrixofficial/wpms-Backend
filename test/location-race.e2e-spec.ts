import 'dotenv/config';
import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule, getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import { LocationService } from '../src/modules/location/location.service';
import { JobLocation } from '../src/modules/location/entities/job-location.entity';
import { REDIS_CLIENT } from '../src/modules/redis/redis.constants';
import { JobsService } from '../src/modules/jobs/jobs.service';
import { JobStatus, JobType } from '../src/modules/jobs/entities/job.entity';

// REGRESSION TEST for the concurrent-ping race.
//
// saveLocation used to be findOne -> create-if-missing -> save. Against the
// unique index on jobId that's a read-modify-write race: simultaneous first
// pings for one job all saw no row, all INSERTed, and every loser blew up with
// a duplicate-key QueryFailedError (surfacing as a 500). Location clients ping
// at high frequency and retry on reconnect, so this fired constantly at the
// start of tracking.
//
// This has to run against real Postgres — the race lives in the database's
// uniqueness enforcement, so a mocked repository cannot catch a regression.
// JobsService is stubbed so the test needs no job/user/service-type fixtures;
// job_locations has no FK on jobId, so a random uuid is a valid key.
describe('LocationService concurrent pings (e2e, real DB)', () => {
  let moduleRef: TestingModule;
  let service: LocationService;
  let repo: Repository<JobLocation>;
  const createdJobIds: string[] = [];

  const jobsStub = { getById: jest.fn() };

  // Ping throttling is switched off here on purpose. It would reject the
  // concurrent pings on the rate limiter — before they ever reach the write
  // path this test exists to exercise — and turn a green run into proof of
  // nothing. Throttle behaviour is covered in location.service.spec.ts.
  const configStub = {
    get: jest.fn((key: string, fallback: unknown) =>
      key === 'LOCATION_MIN_PING_INTERVAL_MS' ? 0 : fallback,
    ),
  };

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({
          type: 'postgres',
          url: process.env.DATABASE_URL,
          entities: [JobLocation],
          synchronize: false,
        }),
        TypeOrmModule.forFeature([JobLocation]),
      ],
      providers: [
        LocationService,
        { provide: JobsService, useValue: jobsStub },
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
        { provide: ConfigService, useValue: configStub },
        // unused with throttling off, but the service still injects it
        { provide: REDIS_CLIENT, useValue: { set: jest.fn() } },
      ],
    }).compile();

    service = moduleRef.get(LocationService);
    repo = moduleRef.get(getRepositoryToken(JobLocation));
  });

  afterAll(async () => {
    if (createdJobIds.length) {
      await repo.delete(createdJobIds.map((jobId) => ({ jobId })));
    }
    await moduleRef?.close();
  });

  // a fresh job id per test, with the stub reporting it as an active job the
  // worker is assigned to
  const freshJob = () => {
    const jobId = randomUUID();
    const workerId = randomUUID();
    createdJobIds.push(jobId);
    jobsStub.getById.mockResolvedValue({
      id: jobId,
      customerId: randomUUID(),
      workerId,
      status: JobStatus.ACCEPTED,
      type: JobType.IMMEDIATE,
      scheduledAt: null,
      location: { type: 'Point', coordinates: [79.8612, 6.9271] },
    });
    return { jobId, workerId };
  };

  it('survives simultaneous first pings without a duplicate-key failure', async () => {
    const { jobId, workerId } = freshJob();

    const results = await Promise.allSettled(
      Array.from({ length: 16 }, (_, i) =>
        service.saveLocation(workerId, jobId, {
          lat: 6.9 + i * 0.001,
          lng: 79.8612,
        }),
      ),
    );

    // surface the real driver error if this regresses, not just a count
    const errors = results
      .filter((r): r is PromiseRejectedResult => r.status === 'rejected')
      .map((r) => (r.reason as Error).message);
    expect(errors).toEqual([]);
    expect(await repo.count({ where: { jobId } })).toBe(1);
  });

  it('keeps exactly one row across repeated concurrent bursts', async () => {
    const { jobId, workerId } = freshJob();

    for (let burst = 0; burst < 3; burst++) {
      await Promise.all(
        Array.from({ length: 8 }, (_, i) =>
          service.saveLocation(workerId, jobId, {
            lat: 6.9 + i * 0.001,
            lng: 79.8612,
          }),
        ),
      );
    }

    expect(await repo.count({ where: { jobId } })).toBe(1);
  });

  it('persists the last write and refreshes updatedAt on the conflict path', async () => {
    const { jobId, workerId } = freshJob();

    const first = await service.saveLocation(workerId, jobId, {
      lat: 6.9,
      lng: 79.8612,
    });
    await new Promise((r) => setTimeout(r, 1100));
    const second = await service.saveLocation(workerId, jobId, {
      lat: 6.95,
      lng: 79.8612,
      accuracy: 8.25,
    });

    // ON CONFLICT DO UPDATE must bump updatedAt — `stale` is derived from it,
    // so a stuck timestamp would make a live worker look offline after a minute
    expect(second.updatedAt.getTime()).toBeGreaterThan(
      first.updatedAt.getTime(),
    );

    const stored = await repo.findOneOrFail({ where: { jobId } });
    expect(stored.updatedAt.getTime()).toBe(second.updatedAt.getTime());
    expect(Number(stored.accuracy)).toBe(8.25);

    const read = await service.getLatest(workerId, jobId);
    expect(read.lat).toBeCloseTo(6.95, 6);
    expect(read.stale).toBe(false);
  });
});
