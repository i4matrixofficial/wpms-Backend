import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { NotificationType } from '../enums/notification-type.enum';

@Entity('notifications')
export class Notification extends BaseEntity {
  /** Recipient user id (FK to users can be added once Users module is ready). */
  @Index()
  @Column({ type: 'uuid' })
  userId: string;

  @Column({
    type: 'enum',
    enum: NotificationType,
    enumName: 'notification_type_enum',
  })
  type: NotificationType;

  @Column({ type: 'varchar', length: 255 })
  title: string;

  @Column({ type: 'text' })
  body: string;

  /** Structured payload used to build the message (bookingId, amount, etc.). */
  @Column({ type: 'jsonb', default: () => "'{}'" })
  data: Record<string, unknown>;

  @Column({ type: 'boolean', default: false })
  isRead: boolean;

  /** Reserved for future push delivery; null means not pushed yet. */
  @Column({ type: 'timestamptz', nullable: true })
  pushedAt: Date | null;
}
