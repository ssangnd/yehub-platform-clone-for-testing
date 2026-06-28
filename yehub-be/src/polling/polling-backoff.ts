import { POLLING_JOB_RETRY_DELAY_MS } from './polling.constants';
import { PlatformError, PlatformErrorCode } from './platform-error';

/**
 * Work-job backoff: a flat 10-minute delay between attempts, except when a
 * platform reports a rate limit with an explicit retry-after, which wins.
 */
export function platformBackoffStrategy(
  _attemptsMade: number,
  type?: string,
  err?: Error,
): number {
  if (
    type === 'platform' &&
    err instanceof PlatformError &&
    err.code === PlatformErrorCode.RATE_LIMITED &&
    err.retryAfterMs !== undefined
  ) {
    return err.retryAfterMs;
  }
  return POLLING_JOB_RETRY_DELAY_MS;
}
