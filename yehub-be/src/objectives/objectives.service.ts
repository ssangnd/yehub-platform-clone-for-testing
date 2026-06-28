import {
  Injectable,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '../../generated/prisma/client';

@Injectable()
export class ObjectivesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    const rows = await this.prisma.objective.findMany({
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
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      created_at: row.created_at,
      campaign_count: row._count.campaigns,
    }));
  }

  async create(name: string) {
    const existing = await this.prisma.objective.findFirst({
      where: { name: { equals: name, mode: 'insensitive' } },
    });
    if (existing) {
      throw new ConflictException('An objective with that name already exists');
    }
    try {
      return await this.prisma.objective.create({ data: { name } });
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      ) {
        throw new ConflictException(
          'An objective with that name already exists',
        );
      }
      throw e;
    }
  }

  async remove(id: string) {
    try {
      await this.prisma.objective.delete({ where: { id } });
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2025'
      ) {
        throw new NotFoundException('Objective not found');
      }
      throw e;
    }
  }

  async rename(id: string, name: string) {
    const existing = await this.prisma.objective.findFirst({
      where: { id: { not: id }, name: { equals: name, mode: 'insensitive' } },
    });
    if (existing) {
      throw new ConflictException('An objective with that name already exists');
    }
    try {
      return await this.prisma.objective.update({
        where: { id },
        data: { name },
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError) {
        if (e.code === 'P2002') {
          throw new ConflictException(
            'An objective with that name already exists',
          );
        }
        if (e.code === 'P2025') {
          throw new NotFoundException('Objective not found');
        }
      }
      throw e;
    }
  }
}
