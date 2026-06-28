import { CampaignStatus } from '../../generated/prisma/client';
import { POLLING_JOB_NAMES } from '../queue/queue.constants';
import { POLLING_CRON_TIMEZONE } from './polling.constants';
import { PollingSchedulerService } from './polling-scheduler.service';

const tz = POLLING_CRON_TIMEZONE;

const activePost = {
  id: 'post-1',
  campaign_id: 'camp-1',
  polling_metric_override: null,
  polling_comment_override: 3600,
  campaign: {
    status: CampaignStatus.ACTIVE,
    metric_polling_interval: 900,
    comments_polling_interval: 21600,
  },
};

describe('PollingSchedulerService', () => {
  const scheduler = {
    upsertJobScheduler: jest.fn(),
    removeJobScheduler: jest.fn(),
    getJobScheduler: jest.fn(),
    getJobSchedulers: jest.fn(),
  };
  const scraperQueue = { add: jest.fn(), getJob: jest.fn() };
  const prisma = {
    post: { findMany: jest.fn(), findUnique: jest.fn() },
  };
  let service: PollingSchedulerService;

  beforeEach(() => {
    jest.clearAllMocks();
    scraperQueue.getJob.mockResolvedValue(undefined);
    service = new PollingSchedulerService(
      scheduler as any,
      scraperQueue as any,
      prisma as any,
    );
  });

  it('resolves post override, campaign default, and fallback intervals', () => {
    expect(service.resolveIntervals(activePost)).toEqual({
      metricIntervalSeconds: 900,
      commentIntervalSeconds: 3600,
    });
    expect(
      service.resolveIntervals({
        ...activePost,
        polling_comment_override: null,
        campaign: {
          status: CampaignStatus.ACTIVE,
          metric_polling_interval: null,
          comments_polling_interval: null,
        },
      }),
    ).toEqual({ metricIntervalSeconds: 86400, commentIntervalSeconds: 86400 });
  });

  it('upserts cron schedulers with campaign-scoped ids', async () => {
    prisma.post.findUnique.mockResolvedValue(activePost);
    await service.schedulePost('post-1');

    expect(scheduler.upsertJobScheduler).toHaveBeenCalledWith(
      'campaign:camp-1:post:post-1:metrics',
      { pattern: '*/15 * * * *', tz },
      expect.objectContaining({
        name: POLLING_JOB_NAMES.POLL_POST_METRICS,
        data: { postId: 'post-1' },
      }),
    );
    expect(scheduler.upsertJobScheduler).toHaveBeenCalledWith(
      'campaign:camp-1:post:post-1:comments',
      { pattern: '0 * * * *', tz },
      expect.objectContaining({
        name: POLLING_JOB_NAMES.POLL_POST_COMMENTS,
        data: { postId: 'post-1' },
      }),
    );
  });

  it('removes the dimension scheduler when an interval is manual', async () => {
    prisma.post.findUnique.mockResolvedValue({
      ...activePost,
      polling_metric_override: 0,
    });

    await service.schedulePost('post-1');

    expect(scheduler.upsertJobScheduler).not.toHaveBeenCalledWith(
      'campaign:camp-1:post:post-1:metrics',
      expect.anything(),
      expect.anything(),
    );
    expect(scheduler.removeJobScheduler).toHaveBeenCalledWith(
      'campaign:camp-1:post:post-1:metrics',
    );
    expect(scheduler.upsertJobScheduler).toHaveBeenCalledWith(
      'campaign:camp-1:post:post-1:comments',
      { pattern: '0 * * * *', tz },
      expect.anything(),
    );
  });

  it('removes a post by exact scheduler ids', async () => {
    prisma.post.findUnique.mockResolvedValue(activePost);

    await service.removePost('post-1');

    expect(scheduler.removeJobScheduler).toHaveBeenCalledWith(
      'campaign:camp-1:post:post-1:metrics',
    );
    expect(scheduler.removeJobScheduler).toHaveBeenCalledWith(
      'campaign:camp-1:post:post-1:comments',
    );
  });

  it('removes every scheduler for a campaign by id prefix', async () => {
    scheduler.getJobSchedulers.mockResolvedValue([
      { key: 'campaign:camp-1:post:post-1:metrics' },
      { key: 'campaign:camp-1:post:post-2:comments' },
      { key: 'campaign:camp-2:post:post-9:metrics' },
    ]);

    await service.removeCampaign('camp-1');

    expect(scheduler.removeJobScheduler).toHaveBeenCalledWith(
      'campaign:camp-1:post:post-1:metrics',
    );
    expect(scheduler.removeJobScheduler).toHaveBeenCalledWith(
      'campaign:camp-1:post:post-2:comments',
    );
    expect(scheduler.removeJobScheduler).not.toHaveBeenCalledWith(
      'campaign:camp-2:post:post-9:metrics',
    );
  });

  it('reads next sync times from the scheduler queue', async () => {
    prisma.post.findUnique.mockResolvedValue(activePost);
    const metricNext = Date.now() + 1_800_000;
    const commentNext = Date.now() + 3_600_000;
    scheduler.getJobScheduler.mockImplementation((id: string) => {
      if (id === 'campaign:camp-1:post:post-1:metrics') {
        return Promise.resolve({ key: id, next: metricNext });
      }
      if (id === 'campaign:camp-1:post:post-1:comments') {
        return Promise.resolve({ key: id, next: commentNext });
      }
      return Promise.resolve(undefined);
    });

    await expect(service.getNextSyncTimes('post-1')).resolves.toEqual({
      next_metric_sync_at: new Date(metricNext),
      next_comment_sync_at: new Date(commentNext),
    });
  });

  it('returns null for next sync times that are in the past', async () => {
    prisma.post.findUnique.mockResolvedValue(activePost);
    scheduler.getJobScheduler.mockImplementation((id: string) => {
      // A scheduler whose `next` lags into the past (worker not advanced yet).
      if (id === 'campaign:camp-1:post:post-1:metrics') {
        return Promise.resolve({ key: id, next: Date.now() - 1_000 });
      }
      // A still-upcoming scheduler is unaffected.
      if (id === 'campaign:camp-1:post:post-1:comments') {
        return Promise.resolve({ key: id, next: Date.now() + 3_600_000 });
      }
      return Promise.resolve(undefined);
    });

    const result = await service.getNextSyncTimes('post-1');
    expect(result.next_metric_sync_at).toBeNull();
    expect(result.next_comment_sync_at).toBeInstanceOf(Date);
  });

  it('enqueues manual polls directly onto the scraper queue', async () => {
    const result = await service.triggerImmediate('post-1', {
      metrics: true,
      comments: true,
    });

    expect(result).toEqual({ metrics: true, comments: true });
    expect(scraperQueue.add).toHaveBeenCalledWith(
      POLLING_JOB_NAMES.POLL_POST_METRICS,
      { postId: 'post-1', manual: true },
      expect.objectContaining({ jobId: 'post:post-1:metrics' }),
    );
    expect(scraperQueue.add).toHaveBeenCalledWith(
      POLLING_JOB_NAMES.POLL_POST_COMMENTS,
      { postId: 'post-1', manual: true },
      expect.objectContaining({ jobId: 'post:post-1:comments' }),
    );
  });

  it('skips a manual dimension whose work job is already pending', async () => {
    scraperQueue.getJob.mockImplementation((id: string) =>
      id === 'post:post-1:metrics'
        ? Promise.resolve({
            isActive: () => Promise.resolve(true),
            isWaiting: () => Promise.resolve(false),
            isDelayed: () => Promise.resolve(false),
          })
        : Promise.resolve(undefined),
    );

    const result = await service.triggerImmediate('post-1', {
      metrics: true,
      comments: true,
    });

    expect(result).toEqual({ metrics: false, comments: true });
    expect(scraperQueue.add).toHaveBeenCalledTimes(1);
    expect(scraperQueue.add).toHaveBeenCalledWith(
      POLLING_JOB_NAMES.POLL_POST_COMMENTS,
      { postId: 'post-1', manual: true },
      expect.objectContaining({ jobId: 'post:post-1:comments' }),
    );
  });

  describe('scheduleCampaign', () => {
    it('applies schedulers for all posts without triggering immediate polls', async () => {
      prisma.post.findMany.mockResolvedValue([
        {
          id: 'post-1',
          campaign_id: 'camp-1',
          polling_metric_override: 900,
          polling_comment_override: 0,
          campaign: {
            status: CampaignStatus.ACTIVE,
            metric_polling_interval: null,
            comments_polling_interval: null,
          },
        },
      ]);

      await service.scheduleCampaign('camp-1');

      expect(scheduler.upsertJobScheduler).toHaveBeenCalledWith(
        'campaign:camp-1:post:post-1:metrics',
        { pattern: '*/15 * * * *', tz },
        expect.objectContaining({ name: POLLING_JOB_NAMES.POLL_POST_METRICS }),
      );
      // comments override is manual (0) -> scheduler removed, not upserted
      expect(scheduler.removeJobScheduler).toHaveBeenCalledWith(
        'campaign:camp-1:post:post-1:comments',
      );
      expect(scraperQueue.add).not.toHaveBeenCalled();
    });
  });

  describe('rescheduleCampaignInheritedPosts', () => {
    it('reapplies schedulers for inherited posts without triggering immediate polls', async () => {
      prisma.post.findMany.mockResolvedValue([
        {
          id: 'post-1',
          campaign_id: 'camp-1',
          polling_metric_override: null,
          polling_comment_override: null,
          campaign: {
            status: CampaignStatus.ACTIVE,
            metric_polling_interval: 3600,
            comments_polling_interval: 21600,
          },
        },
      ]);

      await service.rescheduleCampaignInheritedPosts('camp-1');

      expect(scheduler.upsertJobScheduler).toHaveBeenCalledWith(
        'campaign:camp-1:post:post-1:metrics',
        { pattern: '0 * * * *', tz },
        expect.objectContaining({ name: POLLING_JOB_NAMES.POLL_POST_METRICS }),
      );
      expect(scheduler.upsertJobScheduler).toHaveBeenCalledWith(
        'campaign:camp-1:post:post-1:comments',
        { pattern: '0 */6 * * *', tz },
        expect.objectContaining({
          name: POLLING_JOB_NAMES.POLL_POST_COMMENTS,
        }),
      );
      expect(scraperQueue.add).not.toHaveBeenCalled();
    });
  });
});
