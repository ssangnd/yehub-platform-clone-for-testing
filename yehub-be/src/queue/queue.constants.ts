export const QUEUE_NAMES = {
  DEFAULT: 'default',
  JOB_SCHEDULER: 'job-scheduler',
  SCRAPER: 'scraper',
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

export const POLLING_JOB_NAMES = {
  POLL_POST_METRICS: 'poll-post-metrics',
  POLL_POST_COMMENTS: 'poll-post-comments',
  POLL_SOCIAL_ACCOUNT: 'poll-social-account',
} as const;

export type PollingJobName =
  (typeof POLLING_JOB_NAMES)[keyof typeof POLLING_JOB_NAMES];

export const APIFY_JOB_NAMES = {
  REFRESH_RUN_USAGE: 'refresh-apify-run-usage',
} as const;
