import { Entity, Column, Index } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';

@Entity('refresh_tokens')
export class RefreshToken extends BaseEntity {
  @Index({ unique: true })
  @Column('uuid')
  userId: string; // one active session per user (1 row each)

  @Column()
  tokenHash: string; // we store a HASH, never the raw token

  @Column({ type: 'timestamptz' })
  expiresAt: Date;
}
