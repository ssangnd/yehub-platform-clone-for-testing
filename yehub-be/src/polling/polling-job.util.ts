import type { Job, JobsOptions } from 'bullmq';
import {
  POLLING_JOB_ATTEMPTS,
  POLLING_JOB_RETRY_DELAY_MS,
  type PollingJobType,
} from './polling.constants';

export function schedulerId(
  campaignId: string,
  postId: string,
  dimension: PollingJobType,
): string {
  return `campaign:${campaignId}:post:${postId}:${dimension}`;
}

export function workJobId(postId: string, dimension: PollingJobType): string {
  return `post:${postId}:${dimension}`;
}

export async function isJobPending(
  job: Job | undefined | null,
): Promise<boolean> {
  if (!job) return false;
  const [active, waiting, delayed] = await Promise.all([
    job.isActive(),
    job.isWaiting(),
    job.isDelayed(),
  ]);
  return active || waiting || delayed;
}

export function workJobOptions(
  postId: string,
  dimension: PollingJobType,
): JobsOptions {
  return {
    attempts: POLLING_JOB_ATTEMPTS,
    backoff: { type: 'platform', delay: POLLING_JOB_RETRY_DELAY_MS },
    // Stable per-post-and-dimension jobId: must be removed on terminal state so
    // the id frees up for the next scheduled/manual enqueue. BullMQ silently
    // dedupes an add against a retained completed/failed job with the same id,
    // which would otherwise stop a post from ever being polled again. Failure
    // history is captured in the DB via last_poll_status.
    removeOnComplete: true,
    removeOnFail: true,
    jobId: workJobId(postId, dimension),
  };
}

export function accountWorkJobId(socialAccountId: string): string {
  // No colon separator: BullMQ rejects custom jobIds containing ':' unless they
  // split into exactly 3 parts (a back-compat loophole for repeatable jobs that
  // its source flags for removal). 'account:<uuid>' is 2 parts, so it throws
  // 'Custom Id cannot contain :'. A hyphen keeps the id stable and colon-free.
  return `account-${socialAccountId}`;
}

export function accountWorkJobOptions(socialAccountId: string): JobsOptions {
  return {
    attempts: POLLING_JOB_ATTEMPTS,
    backoff: { type: 'platform', delay: POLLING_JOB_RETRY_DELAY_MS },
    // Same rationale as workJobOptions: the stable id must free up on
    // terminal states or BullMQ silently dedupes future enqueues forever.
    removeOnComplete: true,
    removeOnFail: true,
    jobId: accountWorkJobId(socialAccountId),
  };
}
