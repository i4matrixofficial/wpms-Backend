import { Entity, Column, Index } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';

// blockerId has blocked blockedId from messaging them. Checked both ways —
// if either side has blocked the other, sending is refused.
@Entity('chat_blocks')
@Index(['blockerId', 'blockedId'], { unique: true })
export class ChatBlock extends BaseEntity {
  @Column('uuid')
  blockerId: string;

  @Column('uuid')
  blockedId: string;
}
