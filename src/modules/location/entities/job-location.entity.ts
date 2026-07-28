import { Entity, Column, Index } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';

// One row per job — the assigned worker's latest reported position while the
// job is active. Not a history table; each ping overwrites the same row.
// `updatedAt` (from BaseEntity) doubles as "last seen at".
@Entity('job_locations')
export class JobLocation extends BaseEntity {
  @Index({ unique: true })
  @Column('uuid')
  jobId: string;

  @Index()
  @Column('uuid')
  workerId: string;

  // geography(Point, 4326) — set via GeoJSON on save, read via raw ST_X/ST_Y
  @Index('idx_job_locations_gist', { spatial: true })
  @Column({
    type: 'geography',
    spatialFeatureType: 'Point',
    srid: 4326,
  })
  location: string;

  @Column({ type: 'numeric', precision: 10, scale: 2, nullable: true })
  accuracy: number | null;
}
