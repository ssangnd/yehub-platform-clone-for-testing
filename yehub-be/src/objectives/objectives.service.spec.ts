import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { ObjectivesService } from './objectives.service';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '../../generated/prisma/client';

const mockPrisma = {
  objective: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    delete: jest.fn(),
    update: jest.fn(),
  },
};

describe('ObjectivesService', () => {
  let service: ObjectivesService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ObjectivesService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();
    service = module.get<ObjectivesService>(ObjectivesService);
    jest.clearAllMocks();
  });

  describe('findAll', () => {
    it('returns objectives with campaign_count, ordered by name', async () => {
      const raw = [
        {
          id: '1',
          name: 'Awareness',
          created_at: new Date('2026-01-01'),
          _count: { campaigns: 3 },
        },
        {
          id: '2',
          name: 'Conversion',
          created_at: new Date('2026-01-02'),
          _count: { campaigns: 0 },
        },
      ];
      mockPrisma.objective.findMany.mockResolvedValue(raw);

      const result = await service.findAll();

      expect(result).toEqual([
        {
          id: '1',
          name: 'Awareness',
          created_at: raw[0].created_at,
          campaign_count: 3,
        },
        {
          id: '2',
          name: 'Conversion',
          created_at: raw[1].created_at,
          campaign_count: 0,
        },
      ]);
    });

    it('excludes soft-deleted campaigns from campaign_count', async () => {
      mockPrisma.objective.findMany.mockResolvedValue([]);

      await service.findAll();

      expect(mockPrisma.objective.findMany).toHaveBeenCalledWith({
        orderBy: { name: 'asc' },
        select: {
          id: true,
          name: true,
          created_at: true,
          _count: {
            select: {
              campaigns: { where: { campaign: { deleted_at: null } } },
            },
          },
        },
      });
    });
  });

  describe('create', () => {
    it('creates and returns an objective', async () => {
      const obj = { id: '1', name: 'Awareness', created_at: new Date() };
      mockPrisma.objective.create.mockResolvedValue(obj);

      const result = await service.create('Awareness');

      expect(result).toEqual(obj);
      expect(mockPrisma.objective.findFirst).toHaveBeenCalledWith({
        where: { name: { equals: 'Awareness', mode: 'insensitive' } },
      });
      expect(mockPrisma.objective.create).toHaveBeenCalledWith({
        data: { name: 'Awareness' },
      });
    });

    it('throws ConflictException on case-insensitive duplicate name', async () => {
      mockPrisma.objective.findFirst.mockResolvedValue({
        id: '1',
        name: 'Awareness',
      });

      await expect(service.create('AWARENESS')).rejects.toThrow(
        ConflictException,
      );
      expect(mockPrisma.objective.create).not.toHaveBeenCalled();
    });

    it('throws ConflictException on duplicate name (P2002)', async () => {
      const err = new Prisma.PrismaClientKnownRequestError('Unique fail', {
        code: 'P2002',
        clientVersion: '0.0.0',
      });
      mockPrisma.objective.findFirst.mockResolvedValue(null);
      mockPrisma.objective.create.mockRejectedValue(err);

      await expect(service.create('Awareness')).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe('remove', () => {
    it('deletes an existing objective', async () => {
      mockPrisma.objective.delete.mockResolvedValue({});

      await expect(service.remove('1')).resolves.not.toThrow();
      expect(mockPrisma.objective.delete).toHaveBeenCalledWith({
        where: { id: '1' },
      });
    });

    it('throws NotFoundException when record not found (P2025)', async () => {
      const err = new Prisma.PrismaClientKnownRequestError('Not found', {
        code: 'P2025',
        clientVersion: '0.0.0',
      });
      mockPrisma.objective.delete.mockRejectedValue(err);

      await expect(service.remove('unknown')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('rename', () => {
    it('updates and returns the renamed objective', async () => {
      const updated = {
        id: '1',
        name: 'Brand Awareness',
        created_at: new Date('2026-01-01'),
      };
      mockPrisma.objective.findFirst.mockResolvedValue(null);
      mockPrisma.objective.update.mockResolvedValue(updated);

      const result = await service.rename('1', 'Brand Awareness');

      expect(result).toEqual(updated);
      expect(mockPrisma.objective.findFirst).toHaveBeenCalledWith({
        where: {
          id: { not: '1' },
          name: { equals: 'Brand Awareness', mode: 'insensitive' },
        },
      });
      expect(mockPrisma.objective.update).toHaveBeenCalledWith({
        where: { id: '1' },
        data: { name: 'Brand Awareness' },
      });
    });

    it('throws ConflictException on case-insensitive duplicate of another objective', async () => {
      mockPrisma.objective.findFirst.mockResolvedValue({
        id: '2',
        name: 'Awareness',
      });

      await expect(service.rename('1', 'AWARENESS')).rejects.toThrow(
        ConflictException,
      );
      expect(mockPrisma.objective.update).not.toHaveBeenCalled();
    });

    it('throws ConflictException on duplicate name (P2002)', async () => {
      const err = new Prisma.PrismaClientKnownRequestError('Unique fail', {
        code: 'P2002',
        clientVersion: '0.0.0',
      });
      mockPrisma.objective.findFirst.mockResolvedValue(null);
      mockPrisma.objective.update.mockRejectedValue(err);

      await expect(service.rename('1', 'Awareness')).rejects.toThrow(
        ConflictException,
      );
    });

    it('throws NotFoundException when record not found (P2025)', async () => {
      const err = new Prisma.PrismaClientKnownRequestError('Not found', {
        code: 'P2025',
        clientVersion: '0.0.0',
      });
      mockPrisma.objective.findFirst.mockResolvedValue(null);
      mockPrisma.objective.update.mockRejectedValue(err);

      await expect(service.rename('missing', 'X')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
