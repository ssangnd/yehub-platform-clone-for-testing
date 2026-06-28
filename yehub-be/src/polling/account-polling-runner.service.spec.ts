import { Job } from 'bullmq';
import { Platform } from '../../generated/prisma/client';
import { POLLING_JOB_NAMES } from '../queue/queue.constants';
import { AccountPollingRunner } from './account-polling-runner.service';
import { ApifyRunContext } from './apify-run-context';
import { PlatformError, PlatformErrorCode } from './platform-error';

describe('AccountPollingRunner', () => {
  const adapter = { fetchAccountProfile: jest.fn() };
  const adapters = { get: jest.fn(() => adapter) };
  const prisma = {
    socialAccount: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    profile: {
      update: jest.fn(),
    },
  };
  const uploads = { mirrorRemoteImage: jest.fn() };
  const runContext = new ApifyRunContext();
  let runner: AccountPollingRunner;

  const account = {
    id: 'acc-1',
    profile_id: 'profile-1',
    platform: Platform.INSTAGRAM,
    platform_user_id: 'instagram_johndoe',
    username: 'johndoe',
    display_name: null,
    profile: { id: 'profile-1', avatar: null },
  };

  const rawProfile = {
    platformUserId: 'real-321',
    username: 'johndoe',
    displayName: 'John Doe',
    followerCount: 5000,
    isVerified: true,
    avatarUrl: 'https://cdn.example.com/a.jpg',
    raw: {},
  };

  const job = { data: { socialAccountId: 'acc-1' } } as Job<{
    socialAccountId: string;
  }>;

  beforeEach(() => {
    jest.clearAllMocks();
    uploads.mirrorRemoteImage.mockResolvedValue(null);
    prisma.socialAccount.findUnique.mockResolvedValue({ ...account });
    prisma.socialAccount.findFirst.mockResolvedValue(null);
    prisma.socialAccount.update.mockResolvedValue({});
    adapter.fetchAccountProfile.mockResolvedValue({ ...rawProfile });
    runner = new AccountPollingRunner(
      prisma as any,
      adapters as any,
      uploads as any,
      runContext,
    );
  });

  it('runs profile scrapes inside an ApifyRunContext attributed to the account', async () => {
    let seenMeta: unknown;
    adapter.fetchAccountProfile.mockImplementation(() => {
      seenMeta = runContext.get();
      return Promise.resolve({ ...rawProfile });
    });

    await runner.process(job);

    expect(seenMeta).toEqual({
      jobType: POLLING_JOB_NAMES.POLL_SOCIAL_ACCOUNT,
      socialAccountId: 'acc-1',
    });
  });

  it('updates account fields and claims the real platform user id', async () => {
    await runner.process(job);

    expect(adapter.fetchAccountProfile).toHaveBeenCalledWith('johndoe');
    expect(prisma.socialAccount.update).toHaveBeenCalledWith({
      where: { id: 'acc-1' },
      data: expect.objectContaining({
        platform_user_id: 'real-321',
        username: 'johndoe',
        display_name: 'John Doe',
        follower_count: 5000,
        is_verified: true,
        last_poll_status: 'success',
        last_polled_at: expect.any(Date),
      }),
    });
  });

  it('mirrors the avatar onto the profile only when the profile has none', async () => {
    uploads.mirrorRemoteImage.mockResolvedValue('https://s3/avatar.jpg');

    await runner.process(job);

    expect(uploads.mirrorRemoteImage).toHaveBeenCalledWith(
      'https://cdn.example.com/a.jpg',
      'avatars/profiles/profile-1',
    );
    expect(prisma.profile.update).toHaveBeenCalledWith({
      where: { id: 'profile-1' },
      data: { avatar: 'https://s3/avatar.jpg' },
    });
  });

  it('skips avatar mirroring when the profile already has one', async () => {
    prisma.socialAccount.findUnique.mockResolvedValue({
      ...account,
      profile: { id: 'profile-1', avatar: 'existing.jpg' },
    });

    await runner.process(job);

    expect(uploads.mirrorRemoteImage).not.toHaveBeenCalled();
    expect(prisma.profile.update).not.toHaveBeenCalled();
  });

  it('marks conflict and updates nothing else when the real id belongs to another account', async () => {
    prisma.socialAccount.findFirst.mockResolvedValue({ id: 'acc-other' });

    await expect(runner.process(job)).resolves.toBeUndefined();

    expect(prisma.socialAccount.update).toHaveBeenCalledTimes(1);
    expect(prisma.socialAccount.update).toHaveBeenCalledWith({
      where: { id: 'acc-1' },
      data: {
        last_polled_at: expect.any(Date),
        last_poll_status: 'conflict',
      },
    });
  });

  it('marks failed and rethrows on adapter errors so BullMQ retries', async () => {
    adapter.fetchAccountProfile.mockRejectedValue(
      new PlatformError(PlatformErrorCode.RATE_LIMITED, 'slow down'),
    );

    await expect(runner.process(job)).rejects.toBeInstanceOf(PlatformError);

    expect(prisma.socialAccount.update).toHaveBeenCalledWith({
      where: { id: 'acc-1' },
      data: {
        last_polled_at: expect.any(Date),
        last_poll_status: 'failed',
      },
    });
  });

  it('marks failed without throwing when the account has no username', async () => {
    prisma.socialAccount.findUnique.mockResolvedValue({
      ...account,
      username: null,
    });

    await expect(runner.process(job)).resolves.toBeUndefined();

    expect(adapter.fetchAccountProfile).not.toHaveBeenCalled();
    expect(prisma.socialAccount.update).toHaveBeenCalledWith({
      where: { id: 'acc-1' },
      data: {
        last_polled_at: expect.any(Date),
        last_poll_status: 'failed',
      },
    });
  });

  it('no-ops when the account no longer exists', async () => {
    prisma.socialAccount.findUnique.mockResolvedValue(null);

    await expect(runner.process(job)).resolves.toBeUndefined();

    expect(prisma.socialAccount.update).not.toHaveBeenCalled();
  });

  it('keeps the existing platform user id when the adapter returns none', async () => {
    adapter.fetchAccountProfile.mockResolvedValue({
      ...rawProfile,
      platformUserId: '',
    });

    await runner.process(job);

    expect(prisma.socialAccount.update).toHaveBeenCalledWith({
      where: { id: 'acc-1' },
      data: expect.objectContaining({
        platform_user_id: 'instagram_johndoe',
      }),
    });
  });
});
