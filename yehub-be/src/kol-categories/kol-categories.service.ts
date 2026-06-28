import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateKolCategoryDto } from './dto/create-kol-category.dto';
import { UpdateKolCategoryDto } from './dto/update-kol-category.dto';

@Injectable()
export class KolCategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateKolCategoryDto) {
    const existing = await this.prisma.kolCategory.findFirst({
      where: { name: { equals: dto.name, mode: 'insensitive' } },
    });
    if (existing) {
      throw new ConflictException('A category with this name already exists');
    }
    try {
      const category = await this.prisma.kolCategory.create({
        data: {
          name: dto.name,
          description: dto.description,
          color: dto.color ?? 'blue',
        },
      });
      return {
        id: category.id,
        name: category.name,
        description: category.description,
        color: category.color,
        profileCount: 0,
        createdAt: category.created_at,
        updatedAt: category.updated_at,
      };
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      ) {
        throw new ConflictException('A category with this name already exists');
      }
      throw e;
    }
  }

  async findAll() {
    const categories = await this.prisma.kolCategory.findMany({
      orderBy: { name: 'asc' },
      include: { _count: { select: { profiles: true } } },
    });
    return categories.map((c) => ({
      id: c.id,
      name: c.name,
      description: c.description,
      color: c.color,
      profileCount: c._count.profiles,
      createdAt: c.created_at,
      updatedAt: c.updated_at,
    }));
  }

  async findOne(id: string) {
    const category = await this.prisma.kolCategory.findUnique({
      where: { id },
      include: { _count: { select: { profiles: true } } },
    });
    if (!category) {
      throw new NotFoundException('KOL category not found');
    }
    return {
      id: category.id,
      name: category.name,
      description: category.description,
      color: category.color,
      profileCount: category._count.profiles,
      createdAt: category.created_at,
      updatedAt: category.updated_at,
    };
  }

  async update(id: string, dto: UpdateKolCategoryDto) {
    const existing = await this.prisma.kolCategory.findFirst({
      where: {
        id: { not: id },
        name: { equals: dto.name, mode: 'insensitive' },
      },
    });
    if (existing) {
      throw new ConflictException('A category with this name already exists');
    }
    try {
      const category = await this.prisma.kolCategory.update({
        where: { id },
        data: {
          name: dto.name,
          description: dto.description ?? null,
          color: dto.color ?? 'blue',
        },
        include: { _count: { select: { profiles: true } } },
      });
      return {
        id: category.id,
        name: category.name,
        description: category.description,
        color: category.color,
        profileCount: category._count.profiles,
        createdAt: category.created_at,
        updatedAt: category.updated_at,
      };
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError) {
        if (e.code === 'P2025') {
          throw new NotFoundException('KOL category not found');
        }
        if (e.code === 'P2002') {
          throw new ConflictException(
            'A category with this name already exists',
          );
        }
      }
      throw e;
    }
  }

  async remove(id: string) {
    try {
      await this.prisma.kolCategory.delete({ where: { id } });
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2025'
      ) {
        throw new NotFoundException('KOL category not found');
      }
      throw e;
    }
  }
}
