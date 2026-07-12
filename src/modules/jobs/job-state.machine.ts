import { BadRequestException } from '@nestjs/common';
import { JobStatus } from './entities/job.entity';

// what each state is allowed to move to
const TRANSITIONS: Record<JobStatus, JobStatus[]> = {
  [JobStatus.REQUESTED]: [
    JobStatus.ACCEPTED,
    JobStatus.CANCELLED,
    JobStatus.EXPIRED,
  ],
  [JobStatus.ACCEPTED]: [JobStatus.IN_PROGRESS, JobStatus.CANCELLED],
  [JobStatus.IN_PROGRESS]: [JobStatus.COMPLETED, JobStatus.CANCELLED],
  [JobStatus.COMPLETED]: [],
  [JobStatus.CANCELLED]: [],
  [JobStatus.EXPIRED]: [],
};

export function assertTransition(from: JobStatus, to: JobStatus) {
  if (!TRANSITIONS[from]?.includes(to)) {
    throw new BadRequestException(`Illegal job transition: ${from} → ${to}`);
  }
}
