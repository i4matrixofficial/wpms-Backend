import { Entity, Column, OneToOne, JoinColumn } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { User } from '../../users/entities/user.entity';

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

  @Column({ default: false })
  isAvailable: boolean; // on/off shift toggle

  @Column({ type: 'numeric', precision: 3, scale: 2, default: 0 })
  rating: number; // 0.00–5.00
}
