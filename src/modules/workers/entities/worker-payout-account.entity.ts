import { Entity, Column, Index } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';

// The bank account a worker gets paid out to. workerId here is the worker's
// userId (matches Payout.workerId / Job.workerId), not the internal Worker
// profile id — a worker can submit this any time, independent of
// verification status. One row per worker (upserted on re-submit).
@Entity('worker_payout_accounts')
export class WorkerPayoutAccount extends BaseEntity {
  @Index({ unique: true })
  @Column('uuid')
  workerId: string;

  @Column()
  bankName: string;

  @Column()
  accountHolderName: string;

  @Column()
  accountNumber: string;

  @Column({ type: 'varchar', nullable: true })
  branchCode: string | null;
}
