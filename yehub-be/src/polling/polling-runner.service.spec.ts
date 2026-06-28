import { Job } from 'bullmq';
import { CampaignStatus, Platform } from '../../generated/prisma/client';
import { POLLING_JOB_NAMES } from '../queue/queue.constants';
import { ApifyRunContext } from './apify-run-context';
import { PollingRunner } from './polling-runner.service';

describe('PollingRunner', () => {
  const adapter = {
    fetchPostData: jest.fn(),
    fetchComments: jest.fn(),
  };
  const adapters = { get: jest.fn(() => adapter) };
  const prisma = {
    post: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    comment: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    socialAccount: {
      findFirst: jest.fn(),
      create: jest.fn(),
    },
    socialAccountPost: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
  };
  let runner: PollingRunner;
  const uploads = { mirrorRemoteImage: jest.fn().mockResolvedValue(null) };
  const accountPolling = { enqueueSafe: jest.fn() };
  const runContext = new ApifyRunContext();

  beforeEach(() => {
    jest.clearAllMocks();
    accountPolling.enqueueSafe.mockResolvedValue(true);
    runner = new PollingRunner(
      prisma as any,
      adapters as any,
      uploads as any,
      accountPolling as any,
      runContext,
    );
    // Default: post already has a linked account, so auto-link is a no-op
    // unless a test overrides this.
    prisma.socialAccountPost.findUnique.mockResolvedValue({
      post_id: 'post-1',
    });
    prisma.socialAccount.findFirst.mockResolvedValue(null);
    prisma.socialAccount.create.mockResolvedValue({ id: 'acc-new' });
    prisma.socialAccountPost.create.mockResolvedValue({});
  });

  const activePost = {
    id: 'post-1',
    campaign_id: 'campaign-1',
    platform: Platform.YOUTUBE,
    platform_post_id: 'video-1',
    url: 'https://youtu.be/video-1',
    deleted_at: null,
    campaign: { status: CampaignStatus.ACTIVE },
  };

  const job = (name: string): Job<{ postId: string }> =>
    ({ name, data: { postId: 'post-1' } }) as Job<{ postId: string }>;

  it('no-ops when the campaign is not active', async () => {
    prisma.post.findUnique.mockResolvedValue({
      ...activePost,
      campaign: { status: CampaignStatus.PAUSED },
    });

    await runner.process(job(POLLING_JOB_NAMES.POLL_POST_METRICS));

    expect(adapters.get).not.toHaveBeenCalled();
    expect(prisma.post.update).not.toHaveBeenCalled();
  });

  it('runs metrics jobs through fetchPostData and updates the post', async () => {
    prisma.post.findUnique.mockResolvedValue(activePost);
    adapter.fetchPostData.mockResolvedValue({
      platformPostId: 'video-1',
      platformUserId: 'UC_creator_123',
      authorUsername: 'creator',
      authorDisplayName: 'Creator',
      authorAvatarUrl: 'https://avatar.test/a.png',
      content: 'Video title',
      mediaUrls: [],
      publishedAt: new Date('2026-01-01T00:00:00.000Z'),
      metrics: {
        likeCount: 10,
        commentCount: 2,
        shareCount: 3,
        viewCount: 100,
        reactionCount: 0,
        savedCount: 0,
      },
      raw: {},
    });

    await runner.process(job(POLLING_JOB_NAMES.POLL_POST_METRICS));

    expect(adapter.fetchPostData).toHaveBeenCalledWith(activePost.url);
    expect(prisma.post.update).toHaveBeenCalledWith({
      where: { id: 'post-1' },
      data: expect.objectContaining({
        likes: 10,
        shares: 3,
        views: 100,
        comment_count: 2,
        last_poll_status: 'success',
      }),
    });
  });

  it('does not mutate platform_post_id during polling so dedup stays intact', async () => {
    prisma.post.findUnique.mockResolvedValue(activePost);
    adapter.fetchPostData.mockResolvedValue({
      // Scraper returns the platform's canonical native id, which differs from
      // the URL-derived id stored at creation ('video-1'). Persisting it would
      // break duplicate detection on re-add, so it must NOT be written.
      platformPostId: 'native-numeric-999',
      platformUserId: 'UC_creator_123',
      authorUsername: 'creator',
      authorDisplayName: 'Creator',
      authorAvatarUrl: null,
      content: 'Video title',
      mediaUrls: [],
      publishedAt: new Date('2026-01-01T00:00:00.000Z'),
      metrics: {
        likeCount: 10,
        commentCount: 2,
        shareCount: 3,
        viewCount: 100,
        reactionCount: 0,
        savedCount: 0,
      },
      raw: {},
    });

    await runner.process(job(POLLING_JOB_NAMES.POLL_POST_METRICS));

    const updateArg = prisma.post.update.mock.calls[0][0] as {
      data: Record<string, unknown>;
    };
    expect(updateArg.data).not.toHaveProperty('platform_post_id');
  });

  it('runs metric scrapes inside an ApifyRunContext attributed to the post and campaign', async () => {
    prisma.post.findUnique.mockResolvedValue(activePost);
    let seenMeta: unknown;
    adapter.fetchPostData.mockImplementation(() => {
      seenMeta = runContext.get();
      return Promise.resolve({
        platformPostId: 'video-1',
        platformUserId: 'UC_creator_123',
        authorUsername: 'creator',
        authorDisplayName: 'Creator',
        authorAvatarUrl: null,
        content: null,
        mediaUrls: [],
        publishedAt: null,
        metrics: {
          likeCount: 0,
          commentCount: 0,
          shareCount: 0,
          viewCount: 0,
          reactionCount: 0,
        },
        raw: {},
      });
    });

    await runner.process(job(POLLING_JOB_NAMES.POLL_POST_METRICS));

    expect(seenMeta).toEqual({
      jobType: POLLING_JOB_NAMES.POLL_POST_METRICS,
      postId: 'post-1',
      campaignId: 'campaign-1',
    });
  });

  it('runs comment scrapes inside an ApifyRunContext attributed to the post and campaign', async () => {
    prisma.post.findUnique.mockResolvedValue(activePost);
    prisma.comment.findFirst.mockResolvedValue(null);
    prisma.comment.count.mockResolvedValue(0);
    let seenMeta: unknown;
    adapter.fetchComments.mockImplementation(() => {
      seenMeta = runContext.get();
      return Promise.resolve([]);
    });

    await runner.process(job(POLLING_JOB_NAMES.POLL_POST_COMMENTS));

    expect(seenMeta).toEqual({
      jobType: POLLING_JOB_NAMES.POLL_POST_COMMENTS,
      postId: 'post-1',
      campaignId: 'campaign-1',
    });
  });

  it('marks the poll failed without stamping the dimension timestamp on error', async () => {
    prisma.post.findUnique.mockResolvedValue(activePost);
    adapter.fetchPostData.mockRejectedValue(new Error('boom'));

    await expect(
      runner.process(job(POLLING_JOB_NAMES.POLL_POST_METRICS)),
    ).rejects.toThrow('boom');

    expect(prisma.post.update).toHaveBeenCalledWith({
      where: { id: 'post-1' },
      data: {
        last_polled_at: expect.any(Date),
        last_poll_status: 'failed',
      },
    });
  });

  it('creates a profile + social account from the author when the post is unlinked', async () => {
    prisma.post.findUnique.mockResolvedValue(activePost);
    prisma.socialAccountPost.findUnique.mockResolvedValue(null); // no link yet
    prisma.socialAccount.findFirst.mockResolvedValue(null); // no matching account
    adapter.fetchPostData.mockResolvedValue({
      platformPostId: 'video-1',
      platformUserId: 'UC_creator_123',
      authorUsername: 'creator',
      authorDisplayName: 'Creator Channel',
      authorAvatarUrl: 'https://avatar.test/a.png',
      content: 'Video title',
      mediaUrls: [],
      publishedAt: new Date('2026-01-01T00:00:00.000Z'),
      metrics: {
        likeCount: 10,
        commentCount: 2,
        shareCount: 3,
        viewCount: 100,
        reactionCount: 0,
        savedCount: 0,
      },
      raw: {},
    });

    await runner.process(job(POLLING_JOB_NAMES.POLL_POST_METRICS));

    expect(prisma.socialAccount.create).toHaveBeenCalledWith({
      data: {
        platform: Platform.YOUTUBE,
        platform_user_id: 'UC_creator_123',
        username: 'creator',
        display_name: 'Creator Channel',
        profile: {
          create: {
            name: 'Creator Channel',
            avatar: 'https://avatar.test/a.png',
          },
        },
      },
      select: { id: true },
    });
    expect(prisma.socialAccountPost.create).toHaveBeenCalledWith({
      data: {
        post_id: 'post-1',
        social_account_id: 'acc-new',
        linked_by: 'AUTO',
      },
    });
    expect(accountPolling.enqueueSafe).toHaveBeenCalledWith('acc-new');
  });

  it('reuses an existing account and does not create a profile when one matches', async () => {
    prisma.post.findUnique.mockResolvedValue(activePost);
    prisma.socialAccountPost.findUnique.mockResolvedValue(null);
    prisma.socialAccount.findFirst.mockResolvedValue({ id: 'acc-existing' });
    adapter.fetchPostData.mockResolvedValue({
      platformPostId: 'video-1',
      platformUserId: 'UC_creator_123',
      authorUsername: 'creator',
      authorDisplayName: 'Creator Channel',
      authorAvatarUrl: null,
      content: 'Video title',
      mediaUrls: [],
      publishedAt: null,
      metrics: {
        likeCount: 0,
        commentCount: 0,
        shareCount: 0,
        viewCount: 0,
        reactionCount: 0,
        savedCount: 0,
      },
      raw: {},
    });

    await runner.process(job(POLLING_JOB_NAMES.POLL_POST_METRICS));

    expect(prisma.socialAccount.create).not.toHaveBeenCalled();
    expect(prisma.socialAccountPost.create).toHaveBeenCalledWith({
      data: {
        post_id: 'post-1',
        social_account_id: 'acc-existing',
        linked_by: 'AUTO',
      },
    });
    expect(accountPolling.enqueueSafe).not.toHaveBeenCalled();
  });

  it('skips auto-link when the author has no platform user id', async () => {
    prisma.post.findUnique.mockResolvedValue(activePost);
    prisma.socialAccountPost.findUnique.mockResolvedValue(null); // no link yet
    adapter.fetchPostData.mockResolvedValue({
      platformPostId: 'video-1',
      platformUserId: '', // scraper payload omitted the author id
      authorUsername: 'creator',
      authorDisplayName: 'Creator Channel',
      authorAvatarUrl: 'https://avatar.test/a.png',
      content: 'Video title',
      mediaUrls: [],
      publishedAt: null,
      metrics: {
        likeCount: 0,
        commentCount: 0,
        shareCount: 0,
        viewCount: 0,
        reactionCount: 0,
      },
      raw: {},
    });

    await runner.process(job(POLLING_JOB_NAMES.POLL_POST_METRICS));

    // Empty platform_user_id must not be used to match or create accounts,
    // otherwise unrelated authors collide on the [platform, ''] unique key.
    expect(prisma.socialAccount.findFirst).not.toHaveBeenCalled();
    expect(prisma.socialAccount.create).not.toHaveBeenCalled();
    expect(prisma.socialAccountPost.create).not.toHaveBeenCalled();
  });

  it('runs comment jobs with the latest stored platform timestamp', async () => {
    prisma.post.findUnique.mockResolvedValue(activePost);
    prisma.comment.findFirst
      .mockResolvedValueOnce({
        platform_created_at: new Date('2026-01-02T00:00:00.000Z'),
      })
      .mockResolvedValueOnce(null);
    adapter.fetchComments.mockResolvedValue([
      {
        platformCommentId: 'c1',
        authorUsername: 'jane',
        authorDisplayName: 'Jane Commenter',
        authorProfileUrl: 'https://youtube.com/@jane',
        text: 'hello',
        likeCount: 1,
        replyCount: 0,
        parentPlatformCommentId: null,
        publishedAt: new Date('2026-01-03T00:00:00.000Z'),
        replies: [],
        raw: {},
      },
    ]);
    prisma.comment.count.mockResolvedValue(1);
    prisma.comment.create.mockResolvedValue({ id: 'comment-db-1' });

    await runner.process(job(POLLING_JOB_NAMES.POLL_POST_COMMENTS));

    expect(adapter.fetchComments).toHaveBeenCalledWith(
      activePost.url,
      new Date('2026-01-02T00:00:00.000Z'),
    );
    expect(prisma.comment.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        post_id: 'post-1',
        platform: Platform.YOUTUBE,
        platform_comment_id: 'c1',
        author_name: 'Jane Commenter',
        author_profile_url: 'https://youtube.com/@jane',
      }),
      select: { id: true },
    });
  });
});
