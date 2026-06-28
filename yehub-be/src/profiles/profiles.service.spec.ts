import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { ProfilesService } from './profiles.service';
import { PrismaService } from '../prisma/prisma.service';
import { AccountPollingService } from '../polling/account-polling.service';
import { Platform, Gender } from '../../generated/prisma/client';

const mockPrisma = {
  profile: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    count: jest.fn(),
  },
  socialAccount: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    count: jest.fn(),
  },
  $transaction: jest.fn(),
};

const mockAccountPolling = {
  enqueue: jest.fn(),
  enqueueSafe: jest.fn(),
};

const baseProfileResponse = {
  id: 'profile-1',
  name: 'John',
  description: null,
  gender: Gender.MALE,
  email: null,
  phone: null,
  avatar: null,
  tags: [],
  tier: null,
  categories: [],
  socialAccounts: [],
  created_at: new Date(),
  updated_at: new Date(),
};

describe('ProfilesService', () => {
  let service: ProfilesService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProfilesService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AccountPollingService, useValue: mockAccountPolling },
      ],
    }).compile();
    service = module.get<ProfilesService>(ProfilesService);
    jest.clearAllMocks();
    mockAccountPolling.enqueue.mockResolvedValue(true);
    mockAccountPolling.enqueueSafe.mockResolvedValue(true);
    mockPrisma.$transaction.mockImplementation((arg: unknown) => {
      if (typeof arg === 'function') {
        return (arg as (tx: typeof mockPrisma) => unknown)(mockPrisma);
      }
      return Promise.all(arg as Promise<unknown>[]);
    });
  });

  describe('create', () => {
    const dto = {
      name: 'John',
      gender: Gender.MALE,
      tierId: '00000000-0000-4000-8000-000000000001',
      categoryIds: ['cat-1'],
      socialAccounts: [
        { platform: Platform.INSTAGRAM, url: 'https://instagram.com/johndoe' },
      ],
    };

    it('throws ConflictException when a social account is already linked', async () => {
      mockPrisma.socialAccount.findMany.mockResolvedValue([
        {
          platform: Platform.INSTAGRAM,
          platform_user_id: 'instagram_johndoe',
          username: 'johndoe',
          profile: { name: 'Jane' },
        },
      ]);

      await expect(service.create(dto)).rejects.toThrow(ConflictException);
      await expect(service.create(dto)).rejects.toThrow(
        /Already linked: INSTAGRAM @johndoe \(linked to "Jane"\)/,
      );
    });

    it('throws BadRequestException for invalid extracted username', async () => {
      mockPrisma.socialAccount.findMany.mockResolvedValue([]);
      const badDto = {
        ...dto,
        socialAccounts: [
          {
            platform: Platform.INSTAGRAM,
            url: 'https://instagram.com/john doe',
          },
        ],
      };
      await expect(service.create(badDto)).rejects.toThrow(BadRequestException);
    });

    it('creates a profile when there are no conflicts', async () => {
      mockPrisma.socialAccount.findMany.mockResolvedValue([]);
      mockPrisma.profile.create.mockResolvedValue(baseProfileResponse);

      const result = await service.create(dto);

      expect(mockPrisma.profile.create).toHaveBeenCalled();
      expect(result.id).toBe('profile-1');
      expect(result).toHaveProperty('avatar', null);
    });

    it('passes avatar through to profile.create', async () => {
      mockPrisma.socialAccount.findMany.mockResolvedValue([]);
      mockPrisma.profile.create.mockResolvedValue({
        ...baseProfileResponse,
        avatar: 'uploads/avatar.jpg',
      });

      const result = await service.create({
        ...dto,
        avatar: 'uploads/avatar.jpg',
      });

      expect(mockPrisma.profile.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ avatar: 'uploads/avatar.jpg' }),
        }),
      );
      expect(result.avatar).toBe('uploads/avatar.jpg');
    });

    it('queues an account poll per created social account', async () => {
      mockPrisma.socialAccount.findMany.mockResolvedValue([]);
      mockPrisma.profile.create.mockResolvedValue({
        ...baseProfileResponse,
        socialAccounts: [
          {
            id: 'acc-1',
            platform: Platform.INSTAGRAM,
            platform_user_id: 'instagram_johndoe',
            username: 'johndoe',
            display_name: null,
            follower_count: 0,
            is_verified: false,
            created_at: new Date(),
            last_polled_at: null,
            last_poll_status: null,
            _count: { socialAccountPosts: 0 },
          },
        ],
      });

      await service.create(dto);

      expect(mockAccountPolling.enqueueSafe).toHaveBeenCalledWith('acc-1');
    });
  });

  describe('update', () => {
    const basePayload = {
      name: 'Jane',
      gender: Gender.FEMALE,
      tierId: 'tier-1',
      categoryIds: ['cat-1'],
    };

    it('passes avatar through to profile.update', async () => {
      mockPrisma.profile.findUnique.mockResolvedValue({ id: 'profile-1' });
      mockPrisma.profile.update.mockResolvedValue({
        ...baseProfileResponse,
        avatar: 'uploads/new.jpg',
      });

      await service.update('profile-1', {
        ...basePayload,
        avatar: 'uploads/new.jpg',
      });

      expect(mockPrisma.profile.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'profile-1' },
          data: expect.objectContaining({ avatar: 'uploads/new.jpg' }),
        }),
      );
    });

    it('clears avatar when null is passed', async () => {
      mockPrisma.profile.findUnique.mockResolvedValue({ id: 'profile-1' });
      mockPrisma.profile.update.mockResolvedValue(baseProfileResponse);

      await service.update('profile-1', { ...basePayload, avatar: null });

      expect(mockPrisma.profile.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ avatar: null }),
        }),
      );
    });

    it('clears optional text fields (description, email, phone) when omitted', async () => {
      mockPrisma.profile.findUnique.mockResolvedValue({ id: 'profile-1' });
      mockPrisma.profile.update.mockResolvedValue(baseProfileResponse);

      await service.update('profile-1', basePayload);

      expect(mockPrisma.profile.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            description: null,
            email: null,
            phone: null,
            avatar: null,
          }),
        }),
      );
    });
  });

  describe('linkAccount', () => {
    it('throws ConflictException when account already exists on another profile', async () => {
      mockPrisma.profile.findUnique.mockResolvedValue({ id: 'profile-1' });
      mockPrisma.socialAccount.findFirst.mockResolvedValue({
        profile: { name: 'Jane' },
      });

      await expect(
        service.linkAccount('profile-1', {
          platform: Platform.INSTAGRAM,
          username: 'johndoe',
        }),
      ).rejects.toThrow(
        /INSTAGRAM @johndoe is already linked to profile "Jane"/,
      );
    });

    it('throws BadRequestException for invalid username', async () => {
      mockPrisma.profile.findUnique.mockResolvedValue({ id: 'profile-1' });
      mockPrisma.socialAccount.findFirst.mockResolvedValue(null);

      await expect(
        service.linkAccount('profile-1', {
          platform: Platform.INSTAGRAM,
          username: 'bad name!',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('creates account when no conflict', async () => {
      mockPrisma.profile.findUnique.mockResolvedValue({ id: 'profile-1' });
      mockPrisma.socialAccount.findFirst.mockResolvedValue(null);
      mockPrisma.socialAccount.create.mockResolvedValue({
        id: 'acc-1',
        platform: Platform.INSTAGRAM,
        platform_user_id: 'instagram_johndoe',
        username: 'johndoe',
        display_name: null,
        follower_count: 0,
        is_verified: false,
        created_at: new Date(),
      });

      const result = await service.linkAccount('profile-1', {
        platform: Platform.INSTAGRAM,
        username: 'johndoe',
      });

      expect(result.id).toBe('acc-1');
      expect(mockAccountPolling.enqueueSafe).toHaveBeenCalledWith('acc-1');
    });
  });

  describe('pollAccount', () => {
    it('queues a manual poll for an account on the profile', async () => {
      mockPrisma.socialAccount.findFirst.mockResolvedValue({ id: 'acc-1' });

      const result = await service.pollAccount('profile-1', 'acc-1');

      expect(mockAccountPolling.enqueue).toHaveBeenCalledWith('acc-1', {
        manual: true,
      });
      expect(result).toEqual({ queued: true });
    });

    it('throws NotFoundException when the account is not on the profile', async () => {
      mockPrisma.socialAccount.findFirst.mockResolvedValue(null);

      await expect(service.pollAccount('profile-1', 'acc-x')).rejects.toThrow(
        NotFoundException,
      );
      expect(mockAccountPolling.enqueue).not.toHaveBeenCalled();
    });
  });

  describe('unlinkAccount', () => {
    it('throws NotFoundException when the account does not belong to the profile', async () => {
      mockPrisma.socialAccount.findFirst.mockResolvedValue(null);

      await expect(
        service.unlinkAccount('profile-1', 'acc-1'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('unlinks the account even if it is the last one on the profile', async () => {
      mockPrisma.socialAccount.findFirst.mockResolvedValue({
        id: 'acc-1',
        _count: { socialAccountPosts: 0 },
      });
      mockPrisma.socialAccount.delete.mockResolvedValue({});

      await service.unlinkAccount('profile-1', 'acc-1');

      expect(mockPrisma.socialAccount.delete).toHaveBeenCalledWith({
        where: { id: 'acc-1' },
      });
    });

    it('throws ConflictException when the account has linked posts', async () => {
      mockPrisma.socialAccount.findFirst.mockResolvedValue({
        id: 'acc-1',
        _count: { socialAccountPosts: 3 },
      });

      await expect(
        service.unlinkAccount('profile-1', 'acc-1'),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(mockPrisma.socialAccount.delete).not.toHaveBeenCalled();
    });
  });

  describe('moveAccount', () => {
    it('throws NotFoundException when the target profile does not exist', async () => {
      mockPrisma.socialAccount.findFirst.mockResolvedValue({
        id: 'acc-1',
        profile_id: 'profile-1',
      });
      mockPrisma.profile.findUnique.mockResolvedValue(null);

      await expect(
        service.moveAccount('profile-1', 'acc-1', {
          targetProfileId: 'profile-2',
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('moves the account even if it is the last one on the source profile', async () => {
      mockPrisma.socialAccount.findFirst.mockResolvedValue({
        id: 'acc-1',
        profile_id: 'profile-1',
      });
      mockPrisma.profile.findUnique.mockResolvedValue({ id: 'profile-2' });
      mockPrisma.socialAccount.update.mockResolvedValue({
        id: 'acc-1',
        platform: Platform.INSTAGRAM,
        platform_user_id: 'instagram_johndoe',
        username: 'johndoe',
        display_name: null,
        follower_count: 0,
        is_verified: false,
        created_at: new Date(),
      });

      const result = await service.moveAccount('profile-1', 'acc-1', {
        targetProfileId: 'profile-2',
      });

      expect(mockPrisma.socialAccount.update).toHaveBeenCalledWith({
        where: { id: 'acc-1' },
        data: { profile_id: 'profile-2' },
      });
      expect(result.id).toBe('acc-1');
    });
  });

  describe('remove', () => {
    it('throws NotFoundException when the profile does not exist', async () => {
      mockPrisma.profile.findUnique.mockResolvedValue(null);

      await expect(service.remove('missing')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(mockPrisma.profile.delete).not.toHaveBeenCalled();
    });

    it('throws ConflictException when the profile still has social accounts', async () => {
      mockPrisma.profile.findUnique.mockResolvedValue({
        id: 'profile-1',
        _count: { socialAccounts: 2 },
      });

      await expect(service.remove('profile-1')).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(mockPrisma.profile.delete).not.toHaveBeenCalled();
    });

    it('deletes the profile when it has no social accounts', async () => {
      mockPrisma.profile.findUnique.mockResolvedValue({
        id: 'profile-1',
        _count: { socialAccounts: 0 },
      });
      mockPrisma.profile.delete.mockResolvedValue({ id: 'profile-1' });

      await service.remove('profile-1');

      expect(mockPrisma.profile.delete).toHaveBeenCalledWith({
        where: { id: 'profile-1' },
      });
    });
  });
});
