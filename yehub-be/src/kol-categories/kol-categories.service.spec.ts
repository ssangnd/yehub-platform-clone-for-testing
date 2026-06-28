import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { KolCategoriesService } from './kol-categories.service';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '../../generated/prisma/client';

const mockPrisma = {
  kolCategory: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
};

describe('KolCategoriesService', () => {
  let service: KolCategoriesService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        KolCategoriesService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();
    service = module.get<KolCategoriesService>(KolCategoriesService);
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('creates and returns a category', async () => {
      const now = new Date();
      mockPrisma.kolCategory.findFirst.mockResolvedValue(null);
      mockPrisma.kolCategory.create.mockResolvedValue({
        id: '1',
        name: 'Sports',
        description: 'Athletes',
        color: 'green',
        created_at: now,
        updated_at: now,
      });

      const result = await service.create({
        name: 'Sports',
        description: 'Athletes',
        color: 'green',
      });

      expect(result).toEqual({
        id: '1',
        name: 'Sports',
        description: 'Athletes',
        color: 'green',
        profileCount: 0,
        createdAt: now,
        updatedAt: now,
      });
      expect(mockPrisma.kolCategory.findFirst).toHaveBeenCalledWith({
        where: { name: { equals: 'Sports', mode: 'insensitive' } },
      });
    });

    it('throws ConflictException on case-insensitive duplicate name', async () => {
      mockPrisma.kolCategory.findFirst.mockResolvedValue({
        id: '1',
        name: 'Sports',
      });

      await expect(service.create({ name: 'SPORTS' })).rejects.toThrow(
        ConflictException,
      );
      expect(mockPrisma.kolCategory.create).not.toHaveBeenCalled();
    });

    it('throws ConflictException on duplicate name (P2002)', async () => {
      const err = new Prisma.PrismaClientKnownRequestError('Unique fail', {
        code: 'P2002',
        clientVersion: '0.0.0',
      });
      mockPrisma.kolCategory.findFirst.mockResolvedValue(null);
      mockPrisma.kolCategory.create.mockRejectedValue(err);

      await expect(service.create({ name: 'Sports' })).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe('update', () => {
    it('updates and returns the category', async () => {
      const now = new Date();
      mockPrisma.kolCategory.findFirst.mockResolvedValue(null);
      mockPrisma.kolCategory.update.mockResolvedValue({
        id: '1',
        name: 'Sports',
        description: null,
        color: 'blue',
        created_at: now,
        updated_at: now,
        _count: { profiles: 2 },
      });

      const result = await service.update('1', { name: 'Sports' });

      expect(result.profileCount).toBe(2);
      expect(mockPrisma.kolCategory.findFirst).toHaveBeenCalledWith({
        where: {
          id: { not: '1' },
          name: { equals: 'Sports', mode: 'insensitive' },
        },
      });
    });

    it('throws ConflictException on case-insensitive duplicate of another category', async () => {
      mockPrisma.kolCategory.findFirst.mockResolvedValue({
        id: '2',
        name: 'Sports',
      });

      await expect(service.update('1', { name: 'SPORTS' })).rejects.toThrow(
        ConflictException,
      );
      expect(mockPrisma.kolCategory.update).not.toHaveBeenCalled();
    });

    it('throws ConflictException on duplicate name (P2002)', async () => {
      const err = new Prisma.PrismaClientKnownRequestError('Unique fail', {
        code: 'P2002',
        clientVersion: '0.0.0',
      });
      mockPrisma.kolCategory.findFirst.mockResolvedValue(null);
      mockPrisma.kolCategory.update.mockRejectedValue(err);

      await expect(service.update('1', { name: 'Sports' })).rejects.toThrow(
        ConflictException,
      );
    });

    it('throws NotFoundException when record not found (P2025)', async () => {
      const err = new Prisma.PrismaClientKnownRequestError('Not found', {
        code: 'P2025',
        clientVersion: '0.0.0',
      });
      mockPrisma.kolCategory.findFirst.mockResolvedValue(null);
      mockPrisma.kolCategory.update.mockRejectedValue(err);

      await expect(service.update('missing', { name: 'X' })).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
