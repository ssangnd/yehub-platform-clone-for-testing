import { platformBackoffStrategy } from './polling-backoff';
import { PlatformError, PlatformErrorCode } from './platform-error';

describe('platformBackoffStrategy', () => {
  it('returns a flat 10 minutes for ordinary failures', () => {
    expect(platformBackoffStrategy(1, 'platform', new Error('boom'))).toBe(
      600_000,
    );
    expect(platformBackoffStrategy(3, 'platform', new Error('boom'))).toBe(
      600_000,
    );
  });

  it('honors a platform rate-limit retryAfterMs', () => {
    const err = new PlatformError(
      PlatformErrorCode.RATE_LIMITED,
      'slow down',
      42_000,
    );
    expect(platformBackoffStrategy(1, 'platform', err)).toBe(42_000);
  });

  it('falls back to 10 minutes when rate-limited without retryAfterMs', () => {
    const err = new PlatformError(PlatformErrorCode.RATE_LIMITED, 'slow down');
    expect(platformBackoffStrategy(1, 'platform', err)).toBe(600_000);
  });
});
