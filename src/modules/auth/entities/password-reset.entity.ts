import { Entity, Column, Index } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';

@Entity('password_resets')
export class PasswordReset extends BaseEntity {
  @Index({ unique: true })
  @Column('uuid')
  userId: string;

  @Column()
  codeHash: string; // hashed 6-digit OTP, never plaintext

  @Column({ type: 'timestamptz' })
  expiresAt: Date;

  @Column({ type: 'int', default: 0 })
  attempts: number; // cap brute-force

  @Column({ default: false })
  verified: boolean; // true after OTP confirmed, before password set
}
