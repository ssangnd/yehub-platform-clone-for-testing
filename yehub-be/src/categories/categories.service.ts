import {
  Injectable,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '../../generated/prisma/client';

@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    const rows = await this.prisma.category.findMany({
      orderBy: { name: 'asc' },
      include: { _count: { select: { projectCategories: true } } },
    });
    return rows.map(({ _count, ...rest }) => ({
      ...rest,
      project_count: _count.projectCategories,
    }));
  }

  async create(name: string) {
    const existing = await this.prisma.category.findFirst({
      where: { name: { equals: name, mode: 'insensitive' } },
    });
    if (existing) {
      throw new ConflictException('A category with that name already exists');
    }
    try {
      return await this.prisma.category.create({ data: { name } });
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      ) {
        throw new ConflictException('A category with that name already exists');
      }
      throw e;
    }
  }

  async remove(id: string) {
    try {
      await this.prisma.category.delete({ where: { id } });
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2025'
      ) {
        throw new NotFoundException('Category not found');
      }
      throw e;
    }
  }

  async rename(id: string, name: string) {
    const existing = await this.prisma.category.findFirst({
      where: { id: { not: id }, name: { equals: name, mode: 'insensitive' } },
    });
    if (existing) {
      throw new ConflictException('A category with that name already exists');
    }
    try {
      return await this.prisma.category.update({
        where: { id },
        data: { name },
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError) {
        if (e.code === 'P2002') {
          throw new ConflictException(
            'A category with that name already exists',
          );
        }
        if (e.code === 'P2025') {
          throw new NotFoundException('Category not found');
        }
      }
      throw e;
    }
  }
}
