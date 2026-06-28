import type { Job } from 'bullmq';
import { CampaignStatus } from '../../generated/prisma/client';
import { POLLING_JOB_NAMES } from '../queue/queue.constants';
import { PollingDispatchProcessor } from './polling-dispatch.processor';

describe('PollingDispatchProcessor', () => {
  const scraperQueue = { add: jest.fn(), getJob: jest.fn() };
  const prisma = { post: { findUnique: jest.fn() } };
  let processor: PollingDispatchProcessor;

  const activePost = {
    id: 'post-1',
    url: 'https://x/y',
    deleted_at: null,
    campaign: { status: CampaignStatus.ACTIVE },
  };

  const job = (name: string): Job =>
    ({ name, data: { postId: 'post-1' } }) as Job;

  beforeEach(() => {
    jest.clearAllMocks();
    scraperQueue.getJob.mockResolvedValue(undefined);
    processor = new PollingDispatchProcessor(
      scraperQueue as any,
      prisma as any,
    );
  });

  it('forwards a metrics dispatch with a metrics work job id', async () => {
    prisma.post.findUnique.mockResolvedValue(activePost);

    await processor.process(job(POLLING_JOB_NAMES.POLL_POST_METRICS));

    expect(scraperQueue.add).toHaveBeenCalledWith(
      POLLING_JOB_NAMES.POLL_POST_METRICS,
      { postId: 'post-1' },
      expect.objectContaining({ jobId: 'post:post-1:metrics' }),
    );
  });

  it('forwards a comments dispatch with a comments work job id', async () => {
    prisma.post.findUnique.mockResolvedValue(activePost);

    await processor.process(job(POLLING_JOB_NAMES.POLL_POST_COMMENTS));

    expect(scraperQueue.add).toHaveBeenCalledWith(
      POLLING_JOB_NAMES.POLL_POST_COMMENTS,
      { postId: 'post-1' },
      expect.objectContaining({ jobId: 'post:post-1:comments' }),
    );
  });

  it('dedups against the per-dimension work job id', async () => {
    prisma.post.findUnique.mockResolvedValue(activePost);

    await processor.process(job(POLLING_JOB_NAMES.POLL_POST_METRICS));

    expect(scraperQueue.getJob).toHaveBeenCalledWith('post:post-1:metrics');
  });

  it('no-ops when the campaign is not active', async () => {
    prisma.post.findUnique.mockResolvedValue({
      ...activePost,
      campaign: { status: CampaignStatus.PAUSED },
    });

    await processor.process(job(POLLING_JOB_NAMES.POLL_POST_METRICS));

    expect(scraperQueue.add).not.toHaveBeenCalled();
  });

  it('no-ops when the post is deleted or has no url', async () => {
    prisma.post.findUnique.mockResolvedValue({
      ...activePost,
      deleted_at: new Date(),
    });
    await processor.process(job(POLLING_JOB_NAMES.POLL_POST_METRICS));

    prisma.post.findUnique.mockResolvedValue({ ...activePost, url: null });
    await processor.process(job(POLLING_JOB_NAMES.POLL_POST_METRICS));

    expect(scraperQueue.add).not.toHaveBeenCalled();
  });

  it('skips when a work job for the post is already pending', async () => {
    prisma.post.findUnique.mockResolvedValue(activePost);
    scraperQueue.getJob.mockResolvedValue({
      isActive: () => Promise.resolve(true),
      isWaiting: () => Promise.resolve(false),
      isDelayed: () => Promise.resolve(false),
    });

    await processor.process(job(POLLING_JOB_NAMES.POLL_POST_METRICS));

    expect(scraperQueue.add).not.toHaveBeenCalled();
  });
});
