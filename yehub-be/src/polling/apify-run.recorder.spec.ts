import { ApifyRunRecorder } from './apify-run.recorder';
import { APIFY_JOB_NAMES } from '../queue/queue.constants';

describe('ApifyRunRecorder', () => {
  const prisma = {
    apifyRun: {
      create: jest.fn(),
      update: jest.fn(),
    },
  };
  const queue = { add: jest.fn() };
  const context = { get: jest.fn() };
  const config = { get: jest.fn() };
  let recorder: ApifyRunRecorder;

  const baseRecord = {
    apifyRunId: 'run-1',
    actorId: 'apify~facebook-posts-scraper',
    status: 'SUCCEEDED',
    startedAt: new Date('2026-06-12T00:00:00Z'),
    finishedAt: new Date('2026-06-12T00:01:00Z'),
    runTimeSecs: 60,
    computeUnits: 0.05,
    usageTotalUsd: 0.012,
    usageUsd: { ACTOR_COMPUTE_UNITS: 0.012 },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.apifyRun.create.mockResolvedValue({ id: 'row-1' });
    prisma.apifyRun.update.mockResolvedValue({ id: 'row-1' });
    queue.add.mockResolvedValue({});
    context.get.mockReturnValue(undefined);
    config.get.mockReturnValue(undefined);
    recorder = new ApifyRunRecorder(
      prisma as any,
      queue as any,
      context as any,
      config as any,
    );
  });

  it('persists a run row merging the active scrape context', async () => {
    context.get.mockReturnValue({
      jobType: 'post-metrics',
      postId: 'post-1',
      campaignId: 'campaign-1',
    });

    await recorder.record(baseRecord);

    expect(prisma.apifyRun.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          apify_run_id: 'run-1',
          actor_id: 'apify~facebook-posts-scraper',
          job_type: 'post-metrics',
          status: 'SUCCEEDED',
          post_id: 'post-1',
          campaign_id: 'campaign-1',
          social_account_id: null,
          usage_total_usd: 0.012,
          run_time_secs: 60,
          compute_units: 0.05,
        }),
      }),
    );
  });

  it('persists with unknown job type and no attribution outside a context', async () => {
    await recorder.record(baseRecord);

    expect(prisma.apifyRun.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          job_type: 'unknown',
          post_id: null,
          campaign_id: null,
          social_account_id: null,
        }),
      }),
    );
  });

  it('enqueues a delayed usage refresh job for the recorded run', async () => {
    config.get.mockReturnValue(15_000);

    await recorder.record(baseRecord);

    expect(queue.add).toHaveBeenCalledWith(
      APIFY_JOB_NAMES.REFRESH_RUN_USAGE,
      { apifyRunRowId: 'row-1', apifyRunId: 'run-1' },
      expect.objectContaining({ delay: 15_000 }),
    );
  });

  it('does not enqueue a refresh when the run was never started', async () => {
    await recorder.record({ ...baseRecord, apifyRunId: null });

    expect(queue.add).not.toHaveBeenCalled();
  });

  it('never throws when persistence fails', async () => {
    prisma.apifyRun.create.mockRejectedValue(new Error('db down'));

    await expect(recorder.record(baseRecord)).resolves.toBeUndefined();
    expect(queue.add).not.toHaveBeenCalled();
  });

  it('updates a row with finalized usage', async () => {
    await recorder.updateUsage('row-1', {
      status: 'SUCCEEDED',
      finishedAt: new Date('2026-06-12T00:01:00Z'),
      runTimeSecs: 61,
      computeUnits: 0.06,
      usageTotalUsd: 0.013,
      usageUsd: { ACTOR_COMPUTE_UNITS: 0.013 },
    });

    expect(prisma.apifyRun.update).toHaveBeenCalledWith({
      where: { id: 'row-1' },
      data: expect.objectContaining({
        status: 'SUCCEEDED',
        usage_total_usd: 0.013,
        usage_finalized: true,
      }),
    });
  });
});
