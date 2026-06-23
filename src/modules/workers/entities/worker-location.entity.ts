import { Entity, Column, Index, OneToOne, JoinColumn } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { Worker } from './worker.entity';

@Entity('worker_locations')
export class WorkerLocation extends BaseEntity {
  @OneToOne(() => Worker)
  @JoinColumn({ name: 'worker_id' })
  worker: Worker;

  // geography(Point, 4326) — lat/lng on a sphere, meters for distance
  @Index('idx_worker_location_gist', { spatial: true })
  @Column({
    type: 'geography',
    spatialFeatureType: 'Point',
    srid: 4326,
  })
  location: string; // set via ST_MakePoint, read via raw SQL

  @Column({ type: 'timestamptz', nullable: true })
  lastPingAt: Date;
}
