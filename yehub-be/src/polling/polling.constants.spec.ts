import {
  INTERVAL_TO_CRON,
  POLLING_INTERVAL_OPTIONS,
  POLLING_JOB_RETRY_DELAY_MS,
} from './polling.constants';

describe('polling constants', () => {
  it('maps every non-manual interval option to a cron pattern', () => {
    for (const seconds of POLLING_INTERVAL_OPTIONS) {
      if (seconds === 0) continue;
      expect(INTERVAL_TO_CRON[seconds]).toBeDefined();
    }
  });

  it('uses the documented cron patterns', () => {
    expect(INTERVAL_TO_CRON).toEqual({
      900: '*/15 * * * *',
      1800: '*/30 * * * *',
      3600: '0 * * * *',
      21600: '0 */6 * * *',
      43200: '0 */12 * * *',
      86400: '0 0 * * *',
      604800: '0 0 * * 0',
    });
  });

  it('retries failed work jobs after 10 minutes', () => {
    expect(POLLING_JOB_RETRY_DELAY_MS).toBe(600_000);
  });
});
