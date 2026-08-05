import { Entity, Column, OneToOne, JoinColumn } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { User } from '../../users/entities/user.entity';
import { ManyToMany, JoinTable } from 'typeorm';
import { ServiceType } from '../../service-types/entities/service-type.entity';

export enum WorkerStatus {
  UNVERIFIED = 'unverified', // registered, no docs yet
  PENDING = 'pending', // docs submitted, awaiting admin
  VERIFIED = 'verified', // approved, can take jobs
  REJECTED = 'rejected', // docs rejected, must re-submit
}

@Entity('workers')
export class Worker extends BaseEntity {
  @OneToOne(() => User)
  @JoinColumn({ name: 'user_id' })
  user: User; // a worker IS a user (1:1)

  @Column({ type: 'varchar', nullable: true })
  fullName: string | null;

  @Column({
    type: 'enum',
    enum: WorkerStatus,
    default: WorkerStatus.UNVERIFIED,
  })
  status: WorkerStatus;

  @ManyToMany(() => ServiceType)
  @JoinTable({ name: 'worker_skills' }) // creates the worker_skills join table
  skills: ServiceType[];

  @Column({ default: false })
  isAvailable: boolean; // on/off shift toggle

  // denormalised copy of the worker's review average, recomputed from the
  // reviews table by ReviewsService — never incremented in place. Listing and
  // search endpoints read this instead of aggregating reviews per row.
  @Column({ type: 'numeric', precision: 3, scale: 2, default: 0 })
  rating: number; // 0.00–5.00

  @Column({ type: 'int', default: 0 })
  ratingCount: number; // number of non-hidden reviews behind `rating`
}
