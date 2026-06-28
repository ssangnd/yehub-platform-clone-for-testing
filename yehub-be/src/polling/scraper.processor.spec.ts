import type { Job } from 'bullmq';
import { APIFY_JOB_NAMES, POLLING_JOB_NAMES } from '../queue/queue.constants';
import { ScraperProcessor } from './scraper.processor';

describe('ScraperProcessor', () => {
  const runner = { process: jest.fn().mockResolvedValue(undefined) };
  const accountRunner = { process: jest.fn().mockResolvedValue(undefined) };
  const usageRefresher = { process: jest.fn().mockResolvedValue(undefined) };
  let processor: ScraperProcessor;

  beforeEach(() => {
    jest.clearAllMocks();
    processor = new ScraperProcessor(
      runner as any,
      accountRunner as any,
      usageRefresher as any,
    );
  });

  it('delegates metric jobs to the runner', async () => {
    const job = {
      name: POLLING_JOB_NAMES.POLL_POST_METRICS,
      data: { postId: 'post-1' },
    } as Job;

    await processor.process(job);

    expect(runner.process).toHaveBeenCalledWith(job);
    expect(accountRunner.process).not.toHaveBeenCalled();
  });

  it('delegates comment jobs to the runner', async () => {
    const job = {
      name: POLLING_JOB_NAMES.POLL_POST_COMMENTS,
      data: { postId: 'post-1' },
    } as Job;

    await processor.process(job);

    expect(runner.process).toHaveBeenCalledWith(job);
    expect(accountRunner.process).not.toHaveBeenCalled();
  });

  it('routes poll-social-account jobs to the account runner', async () => {
    const job = {
      name: POLLING_JOB_NAMES.POLL_SOCIAL_ACCOUNT,
      data: { socialAccountId: 'acc-1' },
    } as Job;

    await processor.process(job);

    expect(accountRunner.process).toHaveBeenCalledWith(job);
    expect(runner.process).not.toHaveBeenCalled();
  });

  it('routes refresh-apify-run-usage jobs to the usage refresher', async () => {
    const job = {
      name: APIFY_JOB_NAMES.REFRESH_RUN_USAGE,
      data: { apifyRunRowId: 'row-1', apifyRunId: 'run-1' },
    } as Job;

    await processor.process(job);

    expect(usageRefresher.process).toHaveBeenCalledWith(job);
    expect(runner.process).not.toHaveBeenCalled();
    expect(accountRunner.process).not.toHaveBeenCalled();
  });
});
