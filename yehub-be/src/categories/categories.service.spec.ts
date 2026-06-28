import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { CategoriesService } from './categories.service';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '../../generated/prisma/client';

const mockPrisma = {
  category: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    delete: jest.fn(),
    update: jest.fn(),
  },
};

describe('CategoriesService', () => {
  let service: CategoriesService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CategoriesService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();
    service = module.get<CategoriesService>(CategoriesService);
    jest.clearAllMocks();
  });

  describe('findAll', () => {
    it('returns categories ordered by name with project_count', async () => {
      const created_at = new Date();
      mockPrisma.category.findMany.mockResolvedValue([
        { id: '1', name: 'FMCG', created_at, _count: { projectCategories: 3 } },
        { id: '2', name: 'Tech', created_at, _count: { projectCategories: 0 } },
      ]);
      const result = await service.findAll();
      expect(result).toEqual([
        { id: '1', name: 'FMCG', created_at, project_count: 3 },
        { id: '2', name: 'Tech', created_at, project_count: 0 },
      ]);
      expect(mockPrisma.category.findMany).toHaveBeenCalledWith({
        orderBy: { name: 'asc' },
        include: { _count: { select: { projectCategories: true } } },
      });
    });
  });

  describe('create', () => {
    it('creates and returns a category', async () => {
      const cat = { id: '1', name: 'Tech', created_at: new Date() };
      mockPrisma.category.create.mockResolvedValue(cat);
      const result = await service.create('Tech');
      expect(result).toEqual(cat);
      expect(mockPrisma.category.findFirst).toHaveBeenCalledWith({
        where: { name: { equals: 'Tech', mode: 'insensitive' } },
      });
      expect(mockPrisma.category.create).toHaveBeenCalledWith({
        data: { name: 'Tech' },
      });
    });

    it('throws ConflictException on case-insensitive duplicate name', async () => {
      mockPrisma.category.findFirst.mockResolvedValue({
        id: '1',
        name: 'Tech',
      });

      await expect(service.create('TECH')).rejects.toThrow(ConflictException);
      expect(mockPrisma.category.create).not.toHaveBeenCalled();
    });

    it('throws ConflictException on duplicate name (P2002)', async () => {
      const err = new Prisma.PrismaClientKnownRequestError('Unique fail', {
        code: 'P2002',
        clientVersion: '0.0.0',
      });
      mockPrisma.category.findFirst.mockResolvedValue(null);
      mockPrisma.category.create.mockRejectedValue(err);

      await expect(service.create('Tech')).rejects.toThrow(ConflictException);
    });
  });

  describe('remove', () => {
    it('deletes an existing category', async () => {
      mockPrisma.category.delete.mockResolvedValue({});
      await expect(service.remove('1')).resolves.not.toThrow();
      expect(mockPrisma.category.delete).toHaveBeenCalledWith({
        where: { id: '1' },
      });
    });

    it('throws NotFoundException when record not found', async () => {
      const err = new Prisma.PrismaClientKnownRequestError('Not found', {
        code: 'P2025',
        clientVersion: '0.0.0',
      });
      mockPrisma.category.delete.mockRejectedValue(err);
      await expect(service.remove('unknown')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('rename', () => {
    it('updates and returns the renamed category', async () => {
      const updated = {
        id: '1',
        name: 'Tech Products',
        created_at: new Date('2026-01-01'),
      };
      mockPrisma.category.findFirst.mockResolvedValue(null);
      mockPrisma.category.update.mockResolvedValue(updated);

      const result = await service.rename('1', 'Tech Products');

      expect(result).toEqual(updated);
      expect(mockPrisma.category.findFirst).toHaveBeenCalledWith({
        where: {
          id: { not: '1' },
          name: { equals: 'Tech Products', mode: 'insensitive' },
        },
      });
      expect(mockPrisma.category.update).toHaveBeenCalledWith({
        where: { id: '1' },
        data: { name: 'Tech Products' },
      });
    });

    it('throws ConflictException on case-insensitive duplicate of another category', async () => {
      mockPrisma.category.findFirst.mockResolvedValue({
        id: '2',
        name: 'Tech',
      });

      await expect(service.rename('1', 'TECH')).rejects.toThrow(
        ConflictException,
      );
      expect(mockPrisma.category.update).not.toHaveBeenCalled();
    });

    it('throws ConflictException on duplicate name (P2002)', async () => {
      const err = new Prisma.PrismaClientKnownRequestError('Unique fail', {
        code: 'P2002',
        clientVersion: '0.0.0',
      });
      mockPrisma.category.findFirst.mockResolvedValue(null);
      mockPrisma.category.update.mockRejectedValue(err);

      await expect(service.rename('1', 'Tech')).rejects.toThrow(
        ConflictException,
      );
    });

    it('throws NotFoundException when record not found (P2025)', async () => {
      const err = new Prisma.PrismaClientKnownRequestError('Not found', {
        code: 'P2025',
        clientVersion: '0.0.0',
      });
      mockPrisma.category.findFirst.mockResolvedValue(null);
      mockPrisma.category.update.mockRejectedValue(err);

      await expect(service.rename('missing', 'X')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
