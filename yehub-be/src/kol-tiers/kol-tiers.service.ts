import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateKolTierDto } from './dto/create-kol-tier.dto';
import { UpdateKolTierDto } from './dto/update-kol-tier.dto';

@Injectable()
export class KolTiersService {
  constructor(private readonly prisma: PrismaService) {}

  private formatTier(tier: {
    id: string;
    name: string;
    description: string | null;
    color: string;
    min_followers: number;
    max_followers: number | null;
    created_at: Date;
    updated_at: Date;
    _count?: { profiles: number };
  }) {
    return {
      id: tier.id,
      name: tier.name,
      description: tier.description,
      color: tier.color,
      minFollowers: tier.min_followers,
      maxFollowers: tier.max_followers,
      profileCount: tier._count?.profiles ?? 0,
      createdAt: tier.created_at,
      updatedAt: tier.updated_at,
    };
  }

  async create(dto: CreateKolTierDto) {
    const existing = await this.prisma.kolTier.findFirst({
      where: { name: { equals: dto.name, mode: 'insensitive' } },
    });
    if (existing) {
      throw new ConflictException('A tier with this name already exists');
    }
    try {
      const tier = await this.prisma.kolTier.create({
        data: {
          name: dto.name,
          description: dto.description,
          color: dto.color ?? 'blue',
          min_followers: dto.minFollowers,
          max_followers: dto.maxFollowers ?? null,
        },
      });
      return this.formatTier(tier);
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      ) {
        throw new ConflictException('A tier with this name already exists');
      }
      throw e;
    }
  }

  async findAll() {
    const tiers = await this.prisma.kolTier.findMany({
      orderBy: { min_followers: 'desc' },
      include: { _count: { select: { profiles: true } } },
    });
    return tiers.map((t) => this.formatTier(t));
  }

  async findOne(id: string) {
    const tier = await this.prisma.kolTier.findUnique({
      where: { id },
      include: { _count: { select: { profiles: true } } },
    });
    if (!tier) {
      throw new NotFoundException('KOL tier not found');
    }
    return this.formatTier(tier);
  }

  async update(id: string, dto: UpdateKolTierDto) {
    const existing = await this.prisma.kolTier.findFirst({
      where: {
        id: { not: id },
        name: { equals: dto.name, mode: 'insensitive' },
      },
    });
    if (existing) {
      throw new ConflictException('A tier with this name already exists');
    }
    try {
      const tier = await this.prisma.kolTier.update({
        where: { id },
        data: {
          name: dto.name,
          description: dto.description ?? null,
          color: dto.color ?? 'blue',
          min_followers: dto.minFollowers,
          max_followers: dto.maxFollowers ?? null,
        },
        include: { _count: { select: { profiles: true } } },
      });
      return this.formatTier(tier);
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError) {
        if (e.code === 'P2025') {
          throw new NotFoundException('KOL tier not found');
        }
        if (e.code === 'P2002') {
          throw new ConflictException('A tier with this name already exists');
        }
      }
      throw e;
    }
  }

  async remove(id: string) {
    try {
      await this.prisma.kolTier.delete({ where: { id } });
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2025'
      ) {
        throw new NotFoundException('KOL tier not found');
      }
      throw e;
    }
  }
}
