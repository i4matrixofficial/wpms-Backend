import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { ComplaintStatus } from '../enums/complaint-status.enum';

@Entity('complaints')
export class Complaint extends BaseEntity {
  /** Complainant (customer or worker). */
  @Index()
  @Column({ type: 'uuid' })
  userId!: string;

  /** User the complaint is filed against. */
  @Index()
  @Column({ type: 'uuid' })
  againstUserId!: string;

  /** Related booking (FK can be added when Bookings module exists). */
  @Index()
  @Column({ type: 'uuid' })
  bookingId!: string;

  @Column({ type: 'text' })
  description!: string;

  @Column({
    type: 'enum',
    enum: ComplaintStatus,
    enumName: 'complaint_status_enum',
    default: ComplaintStatus.PENDING,
  })
  status!: ComplaintStatus;

  /** Optional note from admin when reviewing / resolving. */
  @Column({ type: 'text', nullable: true })
  adminNote!: string | null;
}
