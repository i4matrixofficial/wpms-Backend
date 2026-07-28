import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { LocationService } from './location.service';
import { JobLocation } from './entities/job-location.entity';
import { REDIS_CLIENT } from '../redis/redis.constants';
import { JobsService } from '../jobs/jobs.service';
import { JobStatus, JobType } from '../jobs/entities/job.entity';
import { LOCATION_TRACKING_ENDED, LOCATION_UPDATED } from './location.events';

const CUSTOMER = 'customer-1';
const WORKER = 'worker-1';
const JOB = 'job-1';

// UTC+5:30, no DST — the default market. Deliberately not the server's zone, so
// any rule that leaks server-local time shows up as a wrong instant.
const COLOMBO = 'Asia/Colombo';

// an accepted immediate job the worker is assigned to — the happy path.
// `location` is the destination, as TypeORM hands PostGIS back: GeoJSON with
// lng-first coordinates.
const activeJob = {
  id: JOB,
  customerId: CUSTOMER,
  workerId: WORKER,
  status: JobStatus.ACCEPTED,
  type: JobType.IMMEDIATE,
  scheduledAt: null,
  location: { type: 'Point', coordinates: [79.8612, 6.9271] },
};

describe('LocationService', () => {
  let service: LocationService;
  let repo: {
    findOne: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
    upsert: jest.Mock;
    delete: jest.Mock;
    createQueryBuilder: jest.Mock;
  };
  let jobs: { getById: jest.Mock };
  let events: { emit: jest.Mock };
  let redis: { set: jest.Mock };
  let rawResult: Record<string, unknown> | undefined;
  let sweepResult: { affected: number } | Promise<never>;
  let qb: Record<string, jest.Mock>;

  // rebuilt per test so individual cases can vary config (throttle interval,
  // timezone) without leaking into the others
  const build = async (config: Record<string, unknown> = {}) => {
    const settings: Record<string, unknown> = {
      MARKET_TIMEZONE: COLOMBO,
      SCHEDULED_TRACKING_START_HOUR: 8,
      LOCATION_MIN_PING_INTERVAL_MS: 500,
      ...config,
    };
    const moduleRef = await Test.createTestingModule({
      providers: [
        LocationService,
        { provide: getRepositoryToken(JobLocation), useValue: repo },
        { provide: REDIS_CLIENT, useValue: redis },
        { provide: JobsService, useValue: jobs },
        { provide: EventEmitter2, useValue: events },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn(
              (key: string, fallback: unknown) => settings[key] ?? fallback,
            ),
          },
        },
      ],
    }).compile();
    return moduleRef.get(LocationService);
  };

  beforeEach(async () => {
    rawResult = undefined;
    sweepResult = { affected: 0 };
    qb = {
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      getRawOne: jest.fn().mockImplementation(() => Promise.resolve(rawResult)),
      delete: jest.fn().mockReturnThis(),
      from: jest.fn().mockReturnThis(),
      execute: jest.fn().mockImplementation(() => Promise.resolve(sweepResult)),
    };
    repo = {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn((v: object) => ({ ...v })),
      save: jest.fn().mockImplementation((row: { updatedAt?: Date }) => {
        row.updatedAt = row.updatedAt ?? new Date();
        return Promise.resolve(row);
      }),
      upsert: jest
        .fn()
        .mockResolvedValue({ generatedMaps: [{ updatedAt: new Date() }] }),
      delete: jest.fn().mockResolvedValue({ affected: 1 }),
      createQueryBuilder: jest.fn().mockReturnValue(qb),
    };
    jobs = { getById: jest.fn().mockResolvedValue({ ...activeJob }) };
    events = { emit: jest.fn() };
    redis = { set: jest.fn().mockResolvedValue('OK') };

    service = await build();
  });

  describe('saveLocation', () => {
    it('stores the ping and emits it for the gateway to broadcast', async () => {
      const ping = await service.saveLocation(WORKER, JOB, {
        lat: 6.9,
        lng: 79.86,
        accuracy: 12,
      });

      expect(ping).toMatchObject({
        jobId: JOB,
        workerId: WORKER,
        lat: 6.9,
        lng: 79.86,
        accuracy: 12,
      });
      // ~3km from (6.9, 79.86) to the job at (6.9271, 79.8612)
      expect(ping.distanceMeters).toBeCloseTo(3016, -1);
      expect(repo.upsert).toHaveBeenCalledTimes(1);
      expect(events.emit).toHaveBeenCalledWith(LOCATION_UPDATED, {
        jobId: JOB,
        ping,
      });
    });

    it('reports the ping as fresh, matching the shape getLatest returns', async () => {
      const ping = await service.saveLocation(WORKER, JOB, { lat: 1, lng: 2 });
      expect(ping.stale).toBe(false);
    });

    // the distance used to cost a ST_Distance query per ping on top of the job
    // read and the write; the job row we already hold carries the destination
    it('derives distance from the already-fetched job, without extra queries', async () => {
      await service.saveLocation(WORKER, JOB, { lat: 6.9271, lng: 79.8612 });

      expect(jobs.getById).toHaveBeenCalledTimes(1);
      expect(repo.createQueryBuilder).not.toHaveBeenCalled();
    });

    it('reports zero distance once the worker is at the destination', async () => {
      const ping = await service.saveLocation(WORKER, JOB, {
        lat: 6.9271,
        lng: 79.8612,
      });
      expect(ping.distanceMeters).toBe(0);
    });

    it('degrades to a null distance when the job has no usable location', async () => {
      jobs.getById.mockResolvedValue({ ...activeJob, location: null });
      const ping = await service.saveLocation(WORKER, JOB, { lat: 1, lng: 2 });
      expect(ping.distanceMeters).toBeNull();
    });

    // REGRESSION: this used to be findOne -> create-if-missing -> save, which
    // races the unique index on jobId. Concurrent first pings for one job all
    // saw no row, all INSERTed, and every loser got a 500 from the
    // duplicate-key violation. The write must stay a single atomic statement.
    it('writes atomically via upsert on jobId, never read-modify-write', async () => {
      await service.saveLocation(WORKER, JOB, { lat: 6.9, lng: 79.86 });

      expect(repo.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ jobId: JOB, workerId: WORKER }),
        { conflictPaths: ['jobId'] },
      );
      // no separate read or non-atomic save on the write path
      expect(repo.findOne).not.toHaveBeenCalled();
      expect(repo.save).not.toHaveBeenCalled();
      expect(repo.create).not.toHaveBeenCalled();
    });

    it('overwrites rather than appending — one row per job, no history', async () => {
      await service.saveLocation(WORKER, JOB, { lat: 1, lng: 2 });
      await service.saveLocation(WORKER, JOB, { lat: 3, lng: 4 });

      expect(repo.upsert).toHaveBeenCalledTimes(2);
      // both writes target the same conflict key, so they collapse onto one row
      const calls = repo.upsert.mock.calls as [{ jobId: string }, object][];
      for (const [values, options] of calls) {
        expect(options).toEqual({ conflictPaths: ['jobId'] });
        expect(values.jobId).toBe(JOB);
      }
    });

    it('rejects a customer trying to publish a position', async () => {
      await expect(
        service.saveLocation(CUSTOMER, JOB, { lat: 1, lng: 2 }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(repo.upsert).not.toHaveBeenCalled();
    });

    it.each([JobStatus.REQUESTED, JobStatus.COMPLETED, JobStatus.CANCELLED])(
      'rejects pings while the job is %s',
      async (status) => {
        jobs.getById.mockResolvedValue({ ...activeJob, status });
        await expect(
          service.saveLocation(WORKER, JOB, { lat: 1, lng: 2 }),
        ).rejects.toBeInstanceOf(ConflictException);
      },
    );
  });

  describe('ping throttling', () => {
    it('claims a per-job slot atomically, expiring after the configured gap', async () => {
      await service.saveLocation(WORKER, JOB, { lat: 1, lng: 2 });

      expect(redis.set).toHaveBeenCalledWith(
        `location:ping:${JOB}`,
        '1',
        'PX',
        500,
        'NX',
      );
    });

    it('rejects with 429 when the slot is already taken', async () => {
      redis.set.mockResolvedValue(null); // NX lost — a ping arrived too recently

      await expect(
        service.saveLocation(WORKER, JOB, { lat: 1, lng: 2 }),
      ).rejects.toMatchObject({ status: HttpStatus.TOO_MANY_REQUESTS });
      expect(repo.upsert).not.toHaveBeenCalled();
    });

    // an unauthorized caller must not be able to burn the job's slot and
    // starve the real worker's pings
    it('authorizes before consuming the job slot', async () => {
      await expect(
        service.saveLocation(CUSTOMER, JOB, { lat: 1, lng: 2 }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(redis.set).not.toHaveBeenCalled();
    });

    it('fails open when Redis is unreachable — location outlives rate limiting', async () => {
      redis.set.mockRejectedValue(new Error('connection refused'));

      await expect(
        service.saveLocation(WORKER, JOB, { lat: 1, lng: 2 }),
      ).resolves.toMatchObject({ jobId: JOB });
    });

    it('skips Redis entirely when the interval is configured to 0', async () => {
      service = await build({ LOCATION_MIN_PING_INTERVAL_MS: 0 });

      await service.saveLocation(WORKER, JOB, { lat: 1, lng: 2 });
      expect(redis.set).not.toHaveBeenCalled();
    });
  });

  describe('scheduled tracking window', () => {
    const scheduled = (scheduledAt: Date) =>
      jobs.getById.mockResolvedValue({
        ...activeJob,
        type: JobType.SCHEDULED,
        scheduledAt,
      });

    // The window is a wall-clock rule in the market's timezone. Asserting the
    // exact instant catches the old `setHours` implementation, which resolved
    // it against whatever timezone the server happened to run in.
    it('opens at the start hour in market time, not server time', async () => {
      scheduled(new Date('2099-06-15T14:00:00+05:30'));

      await expect(
        service.saveLocation(WORKER, JOB, { lat: 1, lng: 2 }),
      ).rejects.toThrow('2099-06-15T02:30:00.000Z'); // 08:00 in Colombo
    });

    it('tracks the configured zone when the market moves', async () => {
      service = await build({ MARKET_TIMEZONE: 'America/New_York' });
      scheduled(new Date('2099-06-15T14:00:00-04:00'));

      // 08:00 EDT, i.e. UTC-4 in June — a fixed-offset shortcut would be an
      // hour out here and correct in January
      await expect(
        service.saveLocation(WORKER, JOB, { lat: 1, lng: 2 }),
      ).rejects.toThrow('2099-06-15T12:00:00.000Z');
    });

    it('honours a non-default start hour', async () => {
      service = await build({ SCHEDULED_TRACKING_START_HOUR: 6 });
      scheduled(new Date('2099-06-15T14:00:00+05:30'));

      await expect(
        service.saveLocation(WORKER, JOB, { lat: 1, lng: 2 }),
      ).rejects.toThrow('2099-06-15T00:30:00.000Z');
    });

    it('rejects pings before a scheduled job’s tracking window opens', async () => {
      scheduled(new Date(Date.now() + 36 * 60 * 60 * 1000));

      await expect(
        service.saveLocation(WORKER, JOB, { lat: 1, lng: 2 }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('allows pings once a scheduled job’s window has opened', async () => {
      scheduled(new Date(Date.now() - 60 * 60 * 1000));

      await expect(
        service.saveLocation(WORKER, JOB, { lat: 1, lng: 2 }),
      ).resolves.toMatchObject({ jobId: JOB });
    });

    // an appointment booked before the start hour must not be locked out of
    // its own tracking — the window can only ever open earlier, never later
    it('falls back to the appointment time when it precedes the start hour', async () => {
      scheduled(new Date('2099-06-15T05:00:00+05:30'));

      await expect(
        service.saveLocation(WORKER, JOB, { lat: 1, lng: 2 }),
      ).rejects.toThrow('2099-06-14T23:30:00.000Z'); // the 05:00 appointment
    });
  });

  describe('getLatest', () => {
    it('returns the fix with distance, and flags a fresh one as not stale', async () => {
      rawResult = {
        workerId: WORKER,
        accuracy: '12.00',
        updatedAt: new Date(),
        lat: '6.9',
        lng: '79.86',
      };

      const result = await service.getLatest(CUSTOMER, JOB);

      expect(result).toMatchObject({
        workerId: WORKER,
        lat: 6.9,
        lng: 79.86,
        accuracy: 12,
        stale: false,
      });
      expect(result.distanceMeters).toBeCloseTo(3016, -1);
    });

    it('flags a fix older than a minute as stale', async () => {
      rawResult = {
        workerId: WORKER,
        accuracy: null,
        updatedAt: new Date(Date.now() - 5 * 60 * 1000),
        lat: '6.9',
        lng: '79.86',
      };

      const result = await service.getLatest(CUSTOMER, JOB);

      expect(result.stale).toBe(true);
      expect(result.accuracy).toBeNull();
    });

    // reads are not pings — a customer watching the map must never be throttled
    it('does not consume the ping slot', async () => {
      rawResult = {
        workerId: WORKER,
        accuracy: null,
        updatedAt: new Date(),
        lat: '6.9',
        lng: '79.86',
      };

      await service.getLatest(CUSTOMER, JOB);
      expect(redis.set).not.toHaveBeenCalled();
    });

    it('404s when the worker has not reported yet', async () => {
      rawResult = undefined;
      await expect(service.getLatest(CUSTOMER, JOB)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('409s when the job has no assigned worker', async () => {
      jobs.getById.mockResolvedValue({ ...activeJob, workerId: null });
      await expect(service.getLatest(CUSTOMER, JOB)).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    // Teardown deletes the fix when a job settles, but it swallows its own
    // failures — so a surviving row would otherwise stay readable forever and
    // turn this table into the movement history it must never be. The read is
    // gated on the job's status so it doesn't depend on a delete succeeding.
    it.each([JobStatus.COMPLETED, JobStatus.CANCELLED, JobStatus.EXPIRED])(
      'refuses to read a fix once the job is %s, even if the row survived',
      async (status) => {
        jobs.getById.mockResolvedValue({ ...activeJob, status });
        rawResult = {
          workerId: WORKER,
          accuracy: null,
          updatedAt: new Date(),
          lat: '6.9',
          lng: '79.86',
        };

        await expect(service.getLatest(CUSTOMER, JOB)).rejects.toBeInstanceOf(
          ConflictException,
        );
        // and it must not even reach the table
        expect(repo.createQueryBuilder).not.toHaveBeenCalled();
      },
    );
  });

  describe('sweepSettledLocations', () => {
    it('deletes only fixes whose job is no longer trackable', async () => {
      sweepResult = { affected: 3 };

      await service.sweepSettledLocations();

      expect(qb.delete).toHaveBeenCalled();
      const [predicate, params] = qb.where.mock.calls[0] as [
        string,
        { trackable: JobStatus[] },
      ];
      expect(predicate).toContain('NOT IN');
      expect(params.trackable).toEqual([
        JobStatus.ACCEPTED,
        JobStatus.IN_PROGRESS,
      ]);
    });

    // it runs on a cron with no caller to report to — a throw here would be an
    // unhandled rejection, not a failed request
    it('swallows a failure rather than throwing out of the cron', async () => {
      qb.execute.mockRejectedValue(new Error('db down'));

      await expect(service.sweepSettledLocations()).resolves.toBeUndefined();
    });
  });

  describe('tracking teardown', () => {
    it('drops the stored fix and notifies watchers when the job completes', async () => {
      await service.onJobCompleted({
        jobId: JOB,
        customerId: CUSTOMER,
        workerId: WORKER,
      });

      expect(repo.delete).toHaveBeenCalledWith({ jobId: JOB });
      expect(events.emit).toHaveBeenCalledWith(LOCATION_TRACKING_ENDED, {
        jobId: JOB,
        reason: 'completed',
      });
    });

    it('does the same when the job is cancelled', async () => {
      await service.onJobCancelled({
        jobId: JOB,
        customerId: CUSTOMER,
        workerId: WORKER,
        cancelledByUserId: CUSTOMER,
        priorStatus: JobStatus.ACCEPTED,
      });

      expect(events.emit).toHaveBeenCalledWith(LOCATION_TRACKING_ENDED, {
        jobId: JOB,
        reason: 'cancelled',
      });
    });

    // the job transition has already committed by the time this runs, so a
    // cleanup failure must stay contained the way Payments' handlers do
    it('swallows a cleanup failure instead of throwing back into the transition', async () => {
      repo.delete.mockRejectedValue(new Error('db down'));

      await expect(
        service.onJobCompleted({
          jobId: JOB,
          customerId: CUSTOMER,
          workerId: WORKER,
        }),
      ).resolves.toBeUndefined();
      expect(events.emit).not.toHaveBeenCalledWith(
        LOCATION_TRACKING_ENDED,
        expect.anything(),
      );
    });
  });

  // Both of these faults recur on *every* ping once they start. Logging each
  // occurrence would emit a line per ping per job and bury the outage in its
  // own symptom, so only the transitions are logged.
  describe('degraded-mode logging', () => {
    let errors: jest.SpyInstance;

    beforeEach(() => {
      errors = jest
        .spyOn(Logger.prototype, 'error')
        .mockImplementation(() => undefined);
    });

    afterEach(() => errors.mockRestore());

    it('logs a Redis outage once, not once per ping', async () => {
      redis.set.mockRejectedValue(new Error('connection refused'));

      await service.saveLocation(WORKER, JOB, { lat: 1, lng: 2 });
      await service.saveLocation(WORKER, JOB, { lat: 1, lng: 2 });
      await service.saveLocation(WORKER, JOB, { lat: 1, lng: 2 });

      expect(errors).toHaveBeenCalledTimes(1);
    });

    it('logs again if the throttle recovers and then fails a second time', async () => {
      redis.set.mockRejectedValueOnce(new Error('connection refused'));
      await service.saveLocation(WORKER, JOB, { lat: 1, lng: 2 });

      redis.set.mockResolvedValue('OK');
      await service.saveLocation(WORKER, JOB, { lat: 1, lng: 2 });

      redis.set.mockRejectedValue(new Error('connection refused'));
      await service.saveLocation(WORKER, JOB, { lat: 1, lng: 2 });

      expect(errors).toHaveBeenCalledTimes(2);
    });

    it('logs an unreadable job location once, not once per ping', async () => {
      jobs.getById.mockResolvedValue({ ...activeJob, location: 'not-geojson' });

      const first = await service.saveLocation(WORKER, JOB, { lat: 1, lng: 2 });
      await service.saveLocation(WORKER, JOB, { lat: 1, lng: 2 });

      expect(first.distanceMeters).toBeNull();
      expect(errors).toHaveBeenCalledTimes(1);
    });
  });

  it('surfaces 429 as an HttpException the global filter can render', async () => {
    redis.set.mockResolvedValue(null);
    await expect(
      service.saveLocation(WORKER, JOB, { lat: 1, lng: 2 }),
    ).rejects.toBeInstanceOf(HttpException);
  });
});
