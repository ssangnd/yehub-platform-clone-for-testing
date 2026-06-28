import { FacebookAdapter } from './facebook.adapter';

const reelFixture = {
  facebookUrl: 'https://www.facebook.com/reel/27806365428965122/?__tn__=-R',
  likers: { count: 51 },
  unified_reactors: { count: 51 },
  total_comment_count: 2,
  id: 'UzpfSTEwMDA2NDMyNTA2NDMzMTpWSzoyNzgwNjM2NTQyODk2NTEyMg==',
  share_count_reduced: '2',
  short_form_video_context: {
    video: {
      id: '27806365428965122',
      first_frame_thumbnail: 'https://thumb.example/first-frame.jpg',
      owner: { __typename: 'User', id: '100064325064331' },
    },
    shareable_url: 'https://www.facebook.com/reel/27806365428965122',
    playback_video: {
      id: '27806365428965122',
      thumbnailImage: { uri: 'https://thumb.example/reel.jpg' },
    },
    video_owner: {
      __typename: 'User',
      id: '100064325064331',
      name: 'CafeF',
      url: 'https://www.facebook.com/CafeF',
      displayPicture: { uri: 'https://avatar.example/cafef.png' },
    },
  },
  post_id: '1475591874594967',
  creation_time: 1780282309,
  message: {
    text: 'Bộ Tài chính báo cáo Thủ tướng việc tạm hoãn xuất cảnh với trường hợp nợ thuế ít \n\n#CafeF #nothue #tax #botaichinh',
  },
  video: {
    id: '27806365428965122',
    owner: { __typename: 'User', id: '100064325064331' },
  },
  facebookId: '27806365428965122',
  pageName: 'CafeF',
};

const postFixture = {
  postId: '1234567890',
  url: 'https://www.facebook.com/CafeF/posts/1234567890',
  text: 'Regular post text',
  likes: 10,
  comments: 3,
  shares: 2,
  viewsCount: 100,
  topReactionsCount: 12,
  time: '2026-01-01T00:00:00.000Z',
  user: {
    id: '100064325064331',
    name: 'CafeF',
    profilePicture: 'https://avatar.example/cafef.png',
  },
  pageName: 'CafeF',
  media: [{ url: 'https://media.example/photo.jpg' }],
};

const createAdapter = (items: Record<string, unknown>[]) => {
  const apify = { runSync: jest.fn().mockResolvedValue(items) };
  const config = { get: jest.fn().mockReturnValue(undefined) };
  const adapter = new FacebookAdapter(
    {} as never,
    apify as never,
    config as never,
  );
  return { adapter, apify };
};

describe('FacebookAdapter', () => {
  it('normalizes a regular post payload', async () => {
    const { adapter } = createAdapter([postFixture]);

    const post = await adapter.fetchPostData(
      'https://www.facebook.com/CafeF/posts/1234567890',
    );

    expect(post.platformPostId).toBe('1234567890');
    expect(post.platformUserId).toBe('100064325064331');
    expect(post.authorUsername).toBe('CafeF');
    expect(post.authorDisplayName).toBe('CafeF');
    expect(post.authorAvatarUrl).toBe('https://avatar.example/cafef.png');
    expect(post.content).toBe('Regular post text');
    expect(post.mediaUrls).toEqual(['https://media.example/photo.jpg']);
    expect(post.metrics).toEqual({
      likeCount: 10,
      commentCount: 3,
      shareCount: 2,
      viewCount: 100,
      reactionCount: 12,
      savedCount: 0,
    });
    expect(post.publishedAt).toEqual(new Date('2026-01-01T00:00:00.000Z'));
  });

  it('normalizes a reel payload', async () => {
    const { adapter } = createAdapter([reelFixture]);

    const post = await adapter.fetchPostData(
      'https://www.facebook.com/reel/27806365428965122',
    );

    expect(post.platformPostId).toBe('27806365428965122');
    expect(post.platformUserId).toBe('100064325064331');
    expect(post.authorUsername).toBe('CafeF');
    expect(post.authorDisplayName).toBe('CafeF');
    expect(post.authorAvatarUrl).toBe('https://avatar.example/cafef.png');
    expect(post.content).toContain('Bộ Tài chính báo cáo Thủ tướng');
    expect(post.mediaUrls).toEqual(['https://thumb.example/reel.jpg']);
    expect(post.metrics).toEqual({
      likeCount: 51,
      commentCount: 2,
      shareCount: 2,
      viewCount: 0,
      reactionCount: 51,
      savedCount: 0,
    });
    expect(post.publishedAt).toEqual(new Date(1780282309 * 1000));
  });

  it('matches the reel by facebookId when the run returns multiple items', async () => {
    const otherReel = {
      ...reelFixture,
      facebookId: '999',
      facebookUrl: 'https://www.facebook.com/reel/999',
    };
    const { adapter } = createAdapter([otherReel, reelFixture]);

    const post = await adapter.fetchPostData(
      'https://www.facebook.com/reel/27806365428965122',
    );

    expect(post.platformPostId).toBe('27806365428965122');
  });

  it('builds the comment profile url from profileId when profileUrl is missing', async () => {
    const { adapter } = createAdapter([
      {
        id: 'comment-1',
        text: 'with url',
        profileId: 'user.one',
        profileUrl: 'https://www.facebook.com/user.one.custom',
      },
      {
        id: 'comment-2',
        text: 'without url',
        profileId: '100064325064331',
      },
      {
        id: 'comment-3',
        text: 'without url or id',
      },
    ]);

    const comments = await adapter.fetchComments(
      'https://www.facebook.com/reel/27806365428965122',
    );

    expect(comments.map((comment) => comment.authorProfileUrl)).toEqual([
      'https://www.facebook.com/user.one.custom',
      'https://www.facebook.com/100064325064331',
      null,
    ]);
  });

  it('falls back to the first frame thumbnail when no playback thumbnail exists', async () => {
    const fixture = {
      ...reelFixture,
      short_form_video_context: {
        ...reelFixture.short_form_video_context,
        playback_video: { id: '27806365428965122' },
      },
    };
    const { adapter } = createAdapter([fixture]);

    const post = await adapter.fetchPostData(
      'https://www.facebook.com/reel/27806365428965122',
    );

    expect(post.mediaUrls).toEqual(['https://thumb.example/first-frame.jpg']);
  });

  describe('fetchAccountProfile', () => {
    it('fetches a page by url built from the username', async () => {
      const { adapter, apify } = createAdapter([
        {
          facebookId: 'fb-1',
          pageName: 'Some Page',
          followers: 42000,
          profilePictureUrl: 'https://cdn.example.com/page.jpg',
        },
      ]);

      const profile = await adapter.fetchAccountProfile('somepage');

      expect(apify.runSync).toHaveBeenCalledWith({
        actorId: 'apify~facebook-pages-scraper',
        input: { startUrls: [{ url: 'https://www.facebook.com/somepage' }] },
      });
      expect(profile.platformUserId).toBe('fb-1');
      expect(profile.displayName).toBe('Some Page');
      expect(profile.followerCount).toBe(42000);
      expect(profile.avatarUrl).toBe('https://cdn.example.com/page.jpg');
    });

    it('throws NOT_FOUND when the actor returns no items', async () => {
      const { adapter } = createAdapter([]);

      await expect(adapter.fetchAccountProfile('ghost')).rejects.toMatchObject({
        code: 'NOT_FOUND',
      });
    });
  });
});
