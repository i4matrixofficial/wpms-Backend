import { JobStatus } from './entities/job.entity';

// Job lifecycle events. Jobs emits these; other modules (e.g. Payments) react
// without Jobs having to know they exist — keeps the module boundary one-way.
export const JOB_COMPLETED = 'job.completed';
export const JOB_CANCELLED = 'job.cancelled';

export interface JobCompletedEvent {
  jobId: string;
  customerId: string;
  workerId: string;
}

export interface JobCancelledEvent {
  jobId: string;
  customerId: string;
  workerId: string | null;
  cancelledByUserId: string;
  priorStatus: JobStatus; // status BEFORE it flipped to cancelled — decides refund policy
}
