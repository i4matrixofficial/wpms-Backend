import { Entity, Column, Index } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { Role } from '../../../common/enums/role.enum';

@Entity('refresh_tokens')
export class RefreshToken extends BaseEntity {
  @Index({ unique: true })
  @Column('uuid')
  userId: string; // one active session per user (1 row each)

  @Column({ type: 'enum', enum: Role, default: Role.CUSTOMER })
  activeMode: Role; // the mode this session is operating in

  @Column()
  tokenHash: string; // we store a HASH, never the raw token

  @Column({ type: 'timestamptz' })
  expiresAt: Date;
}
