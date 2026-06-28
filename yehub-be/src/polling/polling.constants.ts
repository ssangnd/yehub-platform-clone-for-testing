import type { JobsOptions } from 'bullmq';
import { POLLING_JOB_NAMES } from '../queue/queue.constants';

export const DEFAULT_METRIC_POLLING_INTERVAL_SECONDS = 86400;
export const DEFAULT_COMMENT_POLLING_INTERVAL_SECONDS = 86400;

// Manual (0) plus the recurring options shared by post overrides and campaigns.
export const POLLING_INTERVAL_OPTIONS = [
  0, 900, 1800, 3600, 21600, 43200, 86400, 604800,
];

// Timezone the cron patterns are evaluated against. Wall-clock alignment
// (e.g. daily at 00:00) is relative to this zone, not the server's UTC clock.
export const POLLING_CRON_TIMEZONE = 'Asia/Ho_Chi_Minh';

// Wall-clock-aligned cron pattern per recurring interval (seconds). No offset.
export const INTERVAL_TO_CRON: Record<number, string> = {
  900: '*/15 * * * *',
  1800: '*/30 * * * *',
  3600: '0 * * * *',
  21600: '0 */6 * * *',
  43200: '0 */12 * * *',
  86400: '0 0 * * *',
  604800: '0 0 * * 0', // weekly, Sunday at 00:00
};

export const POLLING_JOB_ATTEMPTS = 3;
export const POLLING_JOB_RETRY_DELAY_MS = 600_000; // 10 minutes

// Options for the lightweight dispatch jobs produced by the job-scheduler queue.
// A failed dispatch is recovered by the next cron tick, so it does not retry.
export const SCHEDULER_TEMPLATE_OPTIONS: JobsOptions = {
  attempts: 1,
  removeOnComplete: true,
  removeOnFail: { count: 100 },
};

export type PollingJobType = 'metrics' | 'comments';

export const POLLING_JOB_TYPE_BY_NAME = {
  [POLLING_JOB_NAMES.POLL_POST_METRICS]: 'metrics',
  [POLLING_JOB_NAMES.POLL_POST_COMMENTS]: 'comments',
} as const;

export const POLLING_JOB_TYPES: Record<string, PollingJobType> =
  POLLING_JOB_TYPE_BY_NAME;
