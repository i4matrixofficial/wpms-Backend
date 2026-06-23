import { Entity, Column, OneToOne, JoinColumn } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { User } from '../../users/entities/user.entity';

@Entity('workers')
export class Worker extends BaseEntity {
  @OneToOne(() => User)
  @JoinColumn({ name: 'user_id' })
  user: User; // a worker IS a user (1:1)

  @Column()
  fullName: string;

  @Column({ default: false })
  isAvailable: boolean; // on/off shift toggle

  @Column({ type: 'numeric', precision: 3, scale: 2, default: 0 })
  rating: number; // 0.00–5.00
}
