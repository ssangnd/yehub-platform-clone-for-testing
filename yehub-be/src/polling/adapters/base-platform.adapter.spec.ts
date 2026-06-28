import { Platform } from '../../../generated/prisma/client';
import { BasePlatformAdapter } from './base-platform.adapter';
import type { RawAccountProfile } from './platform-adapter.interface';

class TestAdapter extends BasePlatformAdapter {
  readonly platform = Platform.TIKTOK;

  fetchAccountProfile(): Promise<RawAccountProfile> {
    return Promise.reject(new Error('not implemented in test adapter'));
  }

  exposeNormalizeAccountProfile(
    record: Record<string, unknown>,
    raw: unknown,
  ): RawAccountProfile {
    return this.normalizeAccountProfile(record, raw);
  }
}

describe('BasePlatformAdapter', () => {
  it('normalizes paginated comments and filters by since timestamp', async () => {
    const proxy = {
      request: jest
        .fn()
        .mockResolvedValueOnce({
          data: {
            comments: [
              {
                id: 'old',
                text: 'old comment',
                created_at: '2026-01-01T00:00:00.000Z',
              },
              {
                id: 'new',
                text: 'new comment',
                likes: '4',
                created_at: '2026-01-03T00:00:00.000Z',
                replies: [{ id: 'reply-1', text: 'reply' }],
              },
            ],
          },
          nextCursor: 'next',
        })
        .mockResolvedValueOnce({
          data: { comments: [{ id: 'newer', content: 'newer comment' }] },
          nextCursor: null,
        }),
    };
    const adapter = new TestAdapter(proxy as any);

    const comments = await adapter.fetchComments(
      'https://www.tiktok.com/@user/video/ABC123',
      new Date('2026-01-02T00:00:00.000Z'),
    );

    expect(proxy.request).toHaveBeenNthCalledWith(
      1,
      Platform.TIKTOK,
      'comments',
      {
        url: 'https://www.tiktok.com/@user/video/ABC123',
        since: '2026-01-02T00:00:00.000Z',
      },
    );
    expect(proxy.request).toHaveBeenNthCalledWith(
      2,
      Platform.TIKTOK,
      'comments',
      {
        url: 'https://www.tiktok.com/@user/video/ABC123',
        since: '2026-01-02T00:00:00.000Z',
        cursor: 'next',
      },
    );
    expect(comments.map((comment) => comment.platformCommentId)).toEqual([
      'new',
      'newer',
    ]);
    expect(comments[0].likeCount).toBe(4);
    expect(comments[0].replies[0].parentPlatformCommentId).toBe('new');
  });

  it('normalizes post metrics aliases', async () => {
    const proxy = {
      request: jest.fn().mockResolvedValue({
        data: {
          id: 'ABC123',
          caption: 'Caption',
          likes: '10',
          comments: 3,
          shares: '2',
          views: '100',
          collectCount: '7',
        },
        nextCursor: null,
      }),
    };
    const adapter = new TestAdapter(proxy as any);

    await expect(
      adapter.fetchPostData('https://www.tiktok.com/@user/video/ABC123'),
    ).resolves.toMatchObject({
      platformPostId: 'ABC123',
      content: 'Caption',
      metrics: {
        likeCount: 10,
        commentCount: 3,
        shareCount: 2,
        viewCount: 100,
        savedCount: 7,
      },
    });
  });

  describe('normalizeAccountProfile', () => {
    const adapter = new TestAdapter({ request: jest.fn() } as any);

    it('maps common profile keys', () => {
      const record = {
        id: 'user-123',
        username: 'johndoe',
        fullName: 'John Doe',
        followersCount: 1500,
        verified: true,
        profilePicUrlHD: 'https://cdn.example.com/p.jpg',
      };
      const profile = adapter.exposeNormalizeAccountProfile(record, record);
      expect(profile).toEqual({
        platformUserId: 'user-123',
        username: 'johndoe',
        displayName: 'John Doe',
        followerCount: 1500,
        isVerified: true,
        avatarUrl: 'https://cdn.example.com/p.jpg',
        raw: record,
      });
    });

    it('handles snake_case and alternate keys with safe defaults', () => {
      const record = {
        pk: '99',
        name: 'janedoe',
        follower_count: '2,000',
        is_verified: false,
      };
      const profile = adapter.exposeNormalizeAccountProfile(record, record);
      expect(profile.platformUserId).toBe('99');
      expect(profile.username).toBe('janedoe');
      expect(profile.displayName).toBeNull();
      expect(profile.followerCount).toBe(2000);
      expect(profile.isVerified).toBe(false);
      expect(profile.avatarUrl).toBeNull();
    });
  });

  it('parses a numeric Unix creation_time (seconds) into publishedAt', async () => {
    const proxy = {
      request: jest.fn().mockResolvedValue({
        data: { id: 'ABC123', creation_time: 1781080306 },
        nextCursor: null,
      }),
    };
    const adapter = new TestAdapter(proxy as any);

    const post = await adapter.fetchPostData(
      'https://www.tiktok.com/@user/video/ABC123',
    );

    expect(post.publishedAt).toEqual(new Date(1781080306 * 1000));
  });

  it('parses a Unix creation_time delivered as a numeric string', async () => {
    const proxy = {
      request: jest.fn().mockResolvedValue({
        data: { id: 'ABC123', creation_time: '1781080306' },
        nextCursor: null,
      }),
    };
    const adapter = new TestAdapter(proxy as any);

    const post = await adapter.fetchPostData(
      'https://www.tiktok.com/@user/video/ABC123',
    );

    expect(post.publishedAt).toEqual(new Date(1781080306 * 1000));
  });

  it('still parses ISO date strings and ignores epoch-millisecond magnitude', async () => {
    const proxy = {
      request: jest.fn().mockResolvedValue({
        data: { id: 'ABC123', timestamp: '2026-01-01T00:00:00.000Z' },
        nextCursor: null,
      }),
    };
    const adapter = new TestAdapter(proxy as any);

    const post = await adapter.fetchPostData(
      'https://www.tiktok.com/@user/video/ABC123',
    );

    expect(post.publishedAt).toEqual(new Date('2026-01-01T00:00:00.000Z'));
  });
});
