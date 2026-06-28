import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { KolTiersService } from './kol-tiers.service';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '../../generated/prisma/client';

const mockPrisma = {
  kolTier: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
};

describe('KolTiersService', () => {
  let service: KolTiersService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        KolTiersService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();
    service = module.get<KolTiersService>(KolTiersService);
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('creates and returns a tier', async () => {
      const now = new Date();
      mockPrisma.kolTier.findFirst.mockResolvedValue(null);
      mockPrisma.kolTier.create.mockResolvedValue({
        id: '1',
        name: 'Mega',
        description: 'Top tier',
        color: 'gold',
        min_followers: 1000000,
        max_followers: null,
        created_at: now,
        updated_at: now,
      });

      const result = await service.create({
        name: 'Mega',
        description: 'Top tier',
        color: 'gold',
        minFollowers: 1000000,
      });

      expect(result).toEqual({
        id: '1',
        name: 'Mega',
        description: 'Top tier',
        color: 'gold',
        minFollowers: 1000000,
        maxFollowers: null,
        profileCount: 0,
        createdAt: now,
        updatedAt: now,
      });
      expect(mockPrisma.kolTier.findFirst).toHaveBeenCalledWith({
        where: { name: { equals: 'Mega', mode: 'insensitive' } },
      });
    });

    it('throws ConflictException on case-insensitive duplicate name', async () => {
      mockPrisma.kolTier.findFirst.mockResolvedValue({ id: '1', name: 'Mega' });

      await expect(
        service.create({ name: 'MEGA', minFollowers: 1000000 }),
      ).rejects.toThrow(ConflictException);
      expect(mockPrisma.kolTier.create).not.toHaveBeenCalled();
    });

    it('throws ConflictException on duplicate name (P2002)', async () => {
      const err = new Prisma.PrismaClientKnownRequestError('Unique fail', {
        code: 'P2002',
        clientVersion: '0.0.0',
      });
      mockPrisma.kolTier.findFirst.mockResolvedValue(null);
      mockPrisma.kolTier.create.mockRejectedValue(err);

      await expect(
        service.create({ name: 'Mega', minFollowers: 1000000 }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('update', () => {
    it('updates and returns the tier', async () => {
      const now = new Date();
      mockPrisma.kolTier.findFirst.mockResolvedValue(null);
      mockPrisma.kolTier.update.mockResolvedValue({
        id: '1',
        name: 'Mega',
        description: null,
        color: 'blue',
        min_followers: 1000000,
        max_followers: null,
        created_at: now,
        updated_at: now,
        _count: { profiles: 2 },
      });

      const result = await service.update('1', {
        name: 'Mega',
        minFollowers: 1000000,
      });

      expect(result.profileCount).toBe(2);
      expect(mockPrisma.kolTier.findFirst).toHaveBeenCalledWith({
        where: {
          id: { not: '1' },
          name: { equals: 'Mega', mode: 'insensitive' },
        },
      });
    });

    it('throws ConflictException on case-insensitive duplicate of another tier', async () => {
      mockPrisma.kolTier.findFirst.mockResolvedValue({ id: '2', name: 'Mega' });

      await expect(
        service.update('1', { name: 'MEGA', minFollowers: 1000000 }),
      ).rejects.toThrow(ConflictException);
      expect(mockPrisma.kolTier.update).not.toHaveBeenCalled();
    });

    it('throws ConflictException on duplicate name (P2002)', async () => {
      const err = new Prisma.PrismaClientKnownRequestError('Unique fail', {
        code: 'P2002',
        clientVersion: '0.0.0',
      });
      mockPrisma.kolTier.findFirst.mockResolvedValue(null);
      mockPrisma.kolTier.update.mockRejectedValue(err);

      await expect(
        service.update('1', { name: 'Mega', minFollowers: 1000000 }),
      ).rejects.toThrow(ConflictException);
    });

    it('throws NotFoundException when record not found (P2025)', async () => {
      const err = new Prisma.PrismaClientKnownRequestError('Not found', {
        code: 'P2025',
        clientVersion: '0.0.0',
      });
      mockPrisma.kolTier.findFirst.mockResolvedValue(null);
      mockPrisma.kolTier.update.mockRejectedValue(err);

      await expect(
        service.update('missing', { name: 'X', minFollowers: 0 }),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
