import { InstagramAdapter } from './instagram.adapter';
import { PlatformError, PlatformErrorCode } from '../platform-error';

describe('InstagramAdapter.fetchAccountProfile', () => {
  const apify = { runSync: jest.fn() };
  const config = { get: jest.fn() };
  const proxy = { request: jest.fn() };
  let adapter: InstagramAdapter;

  beforeEach(() => {
    jest.clearAllMocks();
    config.get.mockReturnValue(undefined);
    adapter = new InstagramAdapter(
      proxy as never,
      apify as never,
      config as never,
    );
  });

  it('fetches and normalizes a profile by username', async () => {
    apify.runSync.mockResolvedValue([
      {
        id: '321',
        username: 'johndoe',
        fullName: 'John Doe',
        followersCount: 1234,
        verified: true,
        profilePicUrlHD: 'https://cdn.example.com/hd.jpg',
      },
    ]);

    const profile = await adapter.fetchAccountProfile('johndoe');

    expect(apify.runSync).toHaveBeenCalledWith({
      actorId: 'apify~instagram-profile-scraper',
      input: { usernames: ['johndoe'] },
    });
    expect(profile.platformUserId).toBe('321');
    expect(profile.username).toBe('johndoe');
    expect(profile.displayName).toBe('John Doe');
    expect(profile.followerCount).toBe(1234);
    expect(profile.isVerified).toBe(true);
    expect(profile.avatarUrl).toBe('https://cdn.example.com/hd.jpg');
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
