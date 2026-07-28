import {
  Injectable,
  Inject,
  ForbiddenException,
  ConflictException,
  NotFoundException,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import { Cron, CronExpression } from '@nestjs/schedule';
import Redis from 'ioredis';
import { JobLocation } from './entities/job-location.entity';
import { REDIS_CLIENT } from '../redis/redis.constants';
import { JobsService } from '../jobs/jobs.service';
import { JobStatus, JobType } from '../jobs/entities/job.entity';
import { UpdateLocationDto } from './dto/update-location.dto';
import { JOB_CANCELLED, JOB_COMPLETED } from '../jobs/jobs.events';
import type { JobCancelledEvent, JobCompletedEvent } from '../jobs/jobs.events';
import { haversineMeters, parsePoint } from '../../common/utils/geo.util';
import { zonedTimeOnDay } from '../../common/utils/timezone.util';
import {
  LOCATION_TRACKING_ENDED,
  LOCATION_UPDATED,
  type LocationPing,
  type LocationTrackingEndedEvent,
  type LocationUpdatedEvent,
} from './location.events';

// A last-known fix older than this is still returned, but flagged `stale` so
// the client can grey out the marker instead of showing a confident position.
const STALE_AFTER_MS = 60_000;

// The only statuses a job's position may be written or read for.
const TRACKABLE_STATUSES = [JobStatus.ACCEPTED, JobStatus.IN_PROGRESS];

@Injectable()
export class LocationService {
  private readonly logger = new Logger(LocationService.name);
  private readonly timeZone: string;
  private readonly trackingStartHour: number;
  private readonly minPingIntervalMs: number;
  // latched so a persistent fault logs its transitions, not once per ping —
  // both of these degrade on every request once they start
  private throttleDegraded = false;
  private locationParseFailed = false;

  constructor(
    @InjectRepository(JobLocation) private repo: Repository<JobLocation>,
    @Inject(REDIS_CLIENT) private redis: Redis,
    private jobs: JobsService,
    private events: EventEmitter2,
    config: ConfigService,
  ) {
    this.timeZone = config.get<string>('MARKET_TIMEZONE', 'Asia/Colombo');
    this.trackingStartHour = config.get<number>(
      'SCHEDULED_TRACKING_START_HOUR',
      8,
    );
    this.minPingIntervalMs = config.get<number>(
      'LOCATION_MIN_PING_INTERVAL_MS',
      500,
    );
  }

  // worker pushes their current position — only the assigned worker, and only
  // while the job is inside its active tracking window
  async saveLocation(
    workerUserId: string,
    jobId: string,
    dto: UpdateLocationDto,
  ): Promise<LocationPing> {
    const job = await this.jobs.getById(workerUserId, jobId);
    if (job.workerId !== workerUserId) {
      throw new ForbiddenException(
        'Only the assigned worker can share location',
      );
    }
    this.assertTrackable(job);
    this.assertScheduledWindowOpen(job);
    // deliberately after the authorization checks: the throttle key is the job,
    // so letting an unauthorized caller reach it would let any logged-in user
    // starve a real worker's pings
    await this.assertNotThrottled(jobId);

    // Single atomic INSERT ... ON CONFLICT: a read-modify-write here races
    // against the unique index on jobId, and pings are high-frequency enough
    // that concurrent first pings on the same job reliably collide.
    const result = await this.repo.upsert(
      {
        jobId,
        workerId: workerUserId,
        location: {
          type: 'Point',
          coordinates: [dto.lng, dto.lat],
        } as unknown as string,
        accuracy: dto.accuracy ?? null,
      },
      { conflictPaths: ['jobId'] },
    );

    const payload: LocationPing = {
      jobId,
      workerId: workerUserId,
      lat: dto.lat,
      lng: dto.lng,
      accuracy: dto.accuracy ?? null,
      distanceMeters: this.distanceToJob(job, dto.lat, dto.lng),
      updatedAt: (result.generatedMaps[0]?.updatedAt as Date) ?? new Date(),
      stale: false, // just written — keeps this payload shape-identical to getLatest
    };

    // LocationGateway listens and fans this out to the job's room — the single
    // place a ping actually goes over the wire, whether it arrived by REST or
    // over the socket.
    this.events.emit(LOCATION_UPDATED, {
      jobId,
      ping: payload,
    } satisfies LocationUpdatedEvent);

    return payload;
  }

  // either participant reads the worker's last known position — REST
  // fallback for clients not holding the /location socket open
  async getLatest(userId: string, jobId: string): Promise<LocationPing> {
    const job = await this.assertParticipant(userId, jobId);
    // Defence in depth, and the reason it matters: teardown deletes the stored
    // fix when a job settles, but endTracking swallows its own failures by
    // design. Without this check a fix that survived cleanup stays readable
    // forever, which quietly turns this table into the movement history it is
    // explicitly not meant to be. Gating on the job's status makes the read
    // deterministic instead of dependent on a delete having succeeded.
    this.assertTrackable(job);

    const raw = await this.repo
      .createQueryBuilder('loc')
      .select('loc."workerId"', 'workerId')
      .addSelect('loc.accuracy', 'accuracy')
      .addSelect('loc."updatedAt"', 'updatedAt')
      .addSelect('ST_Y(loc.location::geometry)', 'lat')
      .addSelect('ST_X(loc.location::geometry)', 'lng')
      .where('loc."jobId" = :jobId', { jobId })
      .getRawOne<{
        workerId: string;
        accuracy: string | null;
        updatedAt: Date;
        lat: string;
        lng: string;
      }>();
    if (!raw) {
      throw new NotFoundException('No location reported yet for this job');
    }

    const lat = Number(raw.lat);
    const lng = Number(raw.lng);
    return {
      jobId,
      workerId: raw.workerId,
      lat,
      lng,
      accuracy: raw.accuracy === null ? null : Number(raw.accuracy),
      distanceMeters: this.distanceToJob(job, lat, lng),
      updatedAt: raw.updatedAt,
      stale: Date.now() - new Date(raw.updatedAt).getTime() > STALE_AFTER_MS,
    };
  }

  // participant check reused by the gateway before letting a socket join a
  // job's location room — same rule as REST reads (customer or assigned
  // worker only, and only once a worker is actually assigned)
  async assertParticipant(userId: string, jobId: string) {
    const job = await this.jobs.getById(userId, jobId);
    if (!job.workerId) {
      throw new ConflictException('This job has no assigned worker yet');
    }
    return job;
  }

  // Tracking is only meaningful while a job is live. Once it settles, drop the
  // stored fix (we don't keep worker movement history) and tell the room to
  // stop expecting updates.
  //
  // Like the Payments settlement handlers, these must never throw: the job
  // transition has already committed, and failing to tidy up a location row is
  // not a reason to blow up an unrelated caller's request.
  @OnEvent(JOB_COMPLETED)
  async onJobCompleted(event: JobCompletedEvent) {
    await this.endTracking(event.jobId, 'completed');
  }

  @OnEvent(JOB_CANCELLED)
  async onJobCancelled(event: JobCancelledEvent) {
    await this.endTracking(event.jobId, 'cancelled');
  }

  private async endTracking(
    jobId: string,
    reason: LocationTrackingEndedEvent['reason'],
  ) {
    try {
      await this.repo.delete({ jobId });
      this.events.emit(LOCATION_TRACKING_ENDED, {
        jobId,
        reason,
      } satisfies LocationTrackingEndedEvent);
    } catch (err) {
      this.logger.error(
        `Failed to end location tracking for job ${jobId}: ${
          (err as Error).message
        }`,
      );
    }
  }

  /**
   * Straight-line metres from a reported position to the job's destination.
   *
   * Computed in-process from the job row we already hold rather than with a
   * `ST_Distance` query, because this runs on every single ping — see
   * `haversineMeters` for the accuracy tradeoff.
   *
   * `jobs.location` is NOT NULL, so a null here never means "this job has no
   * destination" — it means the driver stopped handing the column back as
   * GeoJSON, which is the one way moving this calculation out of PostGIS can
   * regress. Every distance would silently become null, so it gets a log.
   */
  private distanceToJob(
    job: { location: string },
    lat: number,
    lng: number,
  ): number | null {
    const destination = parsePoint(job.location);
    if (!destination) {
      if (!this.locationParseFailed) {
        this.locationParseFailed = true;
        this.logger.error(
          `Cannot read jobs.location as a point (got ${typeof job.location}); ` +
            'all reported distances will be null until this is fixed',
        );
      }
      return null;
    }
    this.locationParseFailed = false;
    return haversineMeters({ lat, lng }, destination);
  }

  /**
   * Reclaims stored fixes for jobs that are no longer trackable.
   *
   * `endTracking` is the primary cleanup, but it swallows failures by design
   * and `job_locations` has no FK to `jobs`, so a row that escapes it is never
   * reclaimed by anything else. Mirrors `JobsService.expireStaleJobs`: a
   * periodic sweep is this codebase's answer to state that can get stranded.
   */
  @Cron(CronExpression.EVERY_HOUR)
  async sweepSettledLocations() {
    try {
      const result = await this.repo
        .createQueryBuilder()
        .delete()
        .from(JobLocation)
        .where(
          '"jobId" NOT IN (SELECT id FROM jobs WHERE status IN (:...trackable))',
          { trackable: TRACKABLE_STATUSES },
        )
        .execute();
      if (result.affected) {
        this.logger.warn(
          `Swept ${result.affected} location fix(es) left behind by settled jobs`,
        );
      }
    } catch (err) {
      this.logger.error(`Location sweep failed: ${(err as Error).message}`);
    }
  }

  /**
   * Caps how fast one job's position can be updated.
   *
   * Keyed on the job, not the caller: the cost we're protecting is the write to
   * that job's row plus the fan-out to its room, and a worker reconnecting in a
   * loop is the realistic source of a flood. `SET NX PX` is a single atomic
   * round trip and lives in Redis, so the limit holds across app instances —
   * an in-memory counter would silently multiply by the instance count.
   *
   * Note what this does *not* cover: it runs after authorization (a job-keyed
   * limiter reachable earlier would let any logged-in user starve the real
   * worker's pings), so a flooding client still costs one job read per request.
   * This protects the write and the broadcast, not the whole request.
   *
   * Fails open: a Redis outage should degrade rate limiting, not location.
   */
  private async assertNotThrottled(jobId: string) {
    if (this.minPingIntervalMs <= 0) return;
    let accepted: string | null;
    try {
      accepted = await this.redis.set(
        `location:ping:${jobId}`,
        '1',
        'PX',
        this.minPingIntervalMs,
        'NX',
      );
    } catch (err) {
      // logged on transition only: this fails per ping once it starts failing,
      // and a line per ping would bury the outage in its own symptom
      if (!this.throttleDegraded) {
        this.throttleDegraded = true;
        this.logger.error(
          `Ping throttle unavailable, allowing all pings through: ${
            (err as Error).message
          }`,
        );
      }
      return;
    }
    if (this.throttleDegraded) {
      this.throttleDegraded = false;
      this.logger.log('Ping throttle recovered');
    }
    if (accepted === null) {
      throw new HttpException(
        `Location updates are limited to one every ${this.minPingIntervalMs}ms`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  // shared by the write and read paths so a settled job is inert on both
  private assertTrackable(job: { status: JobStatus }) {
    if (!TRACKABLE_STATUSES.includes(job.status)) {
      throw new ConflictException(
        'Live location is only available while this job is active',
      );
    }
  }

  private assertScheduledWindowOpen(job: {
    type: JobType;
    scheduledAt: Date | null;
  }) {
    if (job.type === JobType.SCHEDULED && job.scheduledAt) {
      // "opens at 8am on the scheduled day" is a wall-clock rule in the
      // market's timezone. Reading it off the server clock would open the
      // window 5h30m late on a UTC host.
      const dayStart = zonedTimeOnDay(
        job.scheduledAt,
        this.timeZone,
        this.trackingStartHour,
      );
      // never later than the appointment itself, in case it's booked before 8am
      const windowStart =
        dayStart < job.scheduledAt ? dayStart : job.scheduledAt;
      if (new Date() < windowStart) {
        throw new ConflictException(
          `Live tracking for this job opens at ${windowStart.toISOString()}`,
        );
      }
    }
  }
}
