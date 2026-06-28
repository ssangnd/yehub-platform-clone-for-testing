import { ThreadsAdapter } from './threads.adapter';
import { PlatformError, PlatformErrorCode } from '../platform-error';

describe('ThreadsAdapter.fetchAccountProfile', () => {
  const apify = { runSync: jest.fn() };
  const config = { get: jest.fn() };
  const proxy = { request: jest.fn() };
  let adapter: ThreadsAdapter;

  beforeEach(() => {
    jest.clearAllMocks();
    config.get.mockReturnValue(undefined);
    adapter = new ThreadsAdapter(
      proxy as never,
      apify as never,
      config as never,
    );
  });

  it('scrapes by username and normalizes the flat actor output', async () => {
    // Shape mirrors apify/threads-profile-api-scraper's documented output.
    apify.runSync.mockResolvedValue([
      {
        url: 'https://www.threads.net/@puregymofficial',
        is_private: false,
        pk: '187254208',
        profile_pic_url: 'https://cdn.example.com/pic.jpg',
        username: 'puregymofficial',
        follower_count: 35766,
        is_verified: true,
        biography: 'gym',
        full_name: 'PureGym',
        id: '187254208',
      },
    ]);

    const profile = await adapter.fetchAccountProfile('puregymofficial');

    expect(apify.runSync).toHaveBeenCalledWith({
      actorId: 'apify~threads-profile-api-scraper',
      input: { usernames: ['puregymofficial'] },
    });
    expect(profile.platformUserId).toBe('187254208');
    expect(profile.username).toBe('puregymofficial');
    expect(profile.displayName).toBe('PureGym');
    expect(profile.followerCount).toBe(35766);
    expect(profile.isVerified).toBe(true);
    expect(profile.avatarUrl).toBe('https://cdn.example.com/pic.jpg');
  });

  it('strips a leading @ before passing the username to the actor', async () => {
    apify.runSync.mockResolvedValue([{ pk: '1', username: 'jane' }]);

    await adapter.fetchAccountProfile('@jane');

    expect(apify.runSync).toHaveBeenCalledWith({
      actorId: 'apify~threads-profile-api-scraper',
      input: { usernames: ['jane'] },
    });
  });

  it('throws NOT_FOUND when the actor returns no items', async () => {
    apify.runSync.mockResolvedValue([]);

    await expect(adapter.fetchAccountProfile('ghost')).rejects.toMatchObject({
      code: PlatformErrorCode.NOT_FOUND,
    });
    await expect(adapter.fetchAccountProfile('ghost')).rejects.toBeInstanceOf(
      PlatformError,
    );
  });
});
