import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma, Gender, Platform } from '../../generated/prisma/client';
import { CreateProfileDto } from './dto/create-profile.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import {
  ListProfilesQueryDto,
  type ProfileSortField,
} from './dto/list-profiles-query.dto';
import { LinkAccountDto } from './dto/link-account.dto';
import { MoveAccountDto } from './dto/move-account.dto';
import { validateUsername } from './social-account.validator';
import { AccountPollingService } from '../polling/account-polling.service';

@Injectable()
export class ProfilesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accountPolling: AccountPollingService,
  ) {}

  private readonly profileInclude = {
    tier: { select: { id: true, name: true, color: true } },
    categories: {
      include: {
        kolCategory: { select: { id: true, name: true, color: true } },
      },
    },
    socialAccounts: {
      orderBy: { follower_count: 'desc' as const },
      include: { _count: { select: { socialAccountPosts: true } } },
    },
  };

  async create(dto: CreateProfileDto) {
    const socialAccountsData = (dto.socialAccounts ?? []).map((sa) => {
      const username = this.extractUsernameFromUrl(sa.url);
      validateUsername(sa.platform, username);
      return {
        platform: sa.platform,
        username,
        platform_user_id: `${sa.platform.toLowerCase()}_${username}`,
      };
    });

    if (socialAccountsData.length > 0) {
      const existing = await this.prisma.socialAccount.findMany({
        where: {
          OR: socialAccountsData.map((sa) => ({
            platform: sa.platform,
            platform_user_id: sa.platform_user_id,
          })),
        },
        select: {
          platform: true,
          platform_user_id: true,
          username: true,
          profile: { select: { name: true } },
        },
      });

      if (existing.length > 0) {
        const detail = existing
          .map(
            (e) =>
              `${e.platform} @${e.username ?? e.platform_user_id} (linked to "${e.profile.name}")`,
          )
          .join('; ');
        throw new ConflictException(`Already linked: ${detail}`);
      }
    }

    try {
      const profile = await this.prisma.profile.create({
        data: {
          name: dto.name,
          description: dto.description,
          gender: dto.gender,
          email: dto.email,
          phone: dto.phone,
          avatar: dto.avatar,
          tags: dto.tags ?? [],
          tier_id: dto.tierId,
          ...(dto.categoryIds &&
            dto.categoryIds.length > 0 && {
              categories: {
                create: dto.categoryIds.map((id) => ({
                  kol_category_id: id,
                })),
              },
            }),
          ...(socialAccountsData.length > 0 && {
            socialAccounts: {
              create: socialAccountsData,
            },
          }),
        },
        include: this.profileInclude,
      });

      for (const account of profile.socialAccounts) {
        await this.accountPolling.enqueueSafe(account.id);
      }

      return this.formatProfile(profile);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          'A social account is already linked to another profile',
        );
      }
      throw error;
    }
  }

  async findAll(query: ListProfilesQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Prisma.ProfileWhereInput = { AND: [] };
    const andConditions = where.AND as Prisma.ProfileWhereInput[];

    if (query.search) {
      andConditions.push({
        OR: [
          { name: { contains: query.search, mode: 'insensitive' } },
          { tags: { hasSome: [query.search] } },
          {
            socialAccounts: {
              some: {
                username: {
                  contains: query.search,
                  mode: 'insensitive',
                },
              },
            },
          },
        ],
      });
    }

    if (query.categoryIds) {
      const ids = query.categoryIds.split(',').map((s) => s.trim());
      andConditions.push({
        categories: { some: { kol_category_id: { in: ids } } },
      });
    }

    if (query.tierIds) {
      const ids = query.tierIds.split(',').map((s) => s.trim());
      andConditions.push({
        tier_id: { in: ids },
      });
    }

    if (query.platforms) {
      const platforms = query.platforms
        .split(',')
        .map((s) => s.trim()) as Platform[];
      andConditions.push({
        socialAccounts: { some: { platform: { in: platforms } } },
      });
    }

    if (query.genders) {
      const genders = query.genders.split(',').map((s) => s.trim()) as Gender[];
      andConditions.push({ gender: { in: genders } });
    }

    if (query.tags) {
      const tags = query.tags
        .split(',')
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
      if (tags.length > 0) {
        andConditions.push({ tags: { hasSome: tags } });
      }
    }

    if (andConditions.length === 0) {
      delete where.AND;
    }

    const orderBy = this.buildOrderBy(query.sortBy, query.sortOrder);

    const [profiles, total] = await this.prisma.$transaction([
      this.prisma.profile.findMany({
        where,
        include: this.profileInclude,
        orderBy,
        skip,
        take: limit,
      }),
      this.prisma.profile.count({ where }),
    ]);

    return {
      data: profiles.map((p) => this.formatProfile(p)),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  async listTags(): Promise<string[]> {
    const rows = await this.prisma.$queryRaw<{ tag: string }[]>`
      SELECT DISTINCT unnest(tags) AS tag
      FROM profiles
      WHERE array_length(tags, 1) > 0
      ORDER BY tag ASC
    `;
    return rows.map((r) => r.tag);
  }

  async findOne(id: string) {
    const profile = await this.prisma.profile.findUnique({
      where: { id },
      include: this.profileInclude,
    });

    if (!profile) {
      throw new NotFoundException('Profile not found');
    }

    return this.formatProfile(profile);
  }

  async update(id: string, dto: UpdateProfileDto) {
    const existing = await this.prisma.profile.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!existing) {
      throw new NotFoundException('Profile not found');
    }

    const profile = await this.prisma.profile.update({
      where: { id },
      data: {
        name: dto.name,
        description: dto.description ?? null,
        gender: dto.gender,
        email: dto.email ?? null,
        phone: dto.phone ?? null,
        avatar: dto.avatar ?? null,
        tags: dto.tags ?? [],
        tier_id: dto.tierId,
        categories: {
          deleteMany: {},
          create: dto.categoryIds.map((catId) => ({
            kol_category_id: catId,
          })),
        },
      },
      include: this.profileInclude,
    });

    return this.formatProfile(profile);
  }

  async remove(id: string) {
    const profile = await this.prisma.profile.findUnique({
      where: { id },
      select: { id: true, _count: { select: { socialAccounts: true } } },
    });

    if (!profile) {
      throw new NotFoundException('Profile not found');
    }

    if (profile._count.socialAccounts > 0) {
      throw new ConflictException(
        'Cannot delete a profile that still has social accounts. Unlink all social accounts first.',
      );
    }

    await this.prisma.profile.delete({ where: { id } });
  }

  async linkAccount(profileId: string, dto: LinkAccountDto) {
    const profile = await this.prisma.profile.findUnique({
      where: { id: profileId },
    });
    if (!profile) {
      throw new NotFoundException('Profile not found');
    }

    validateUsername(dto.platform, dto.username);

    const platform_user_id =
      dto.platformUserId ?? `${dto.platform.toLowerCase()}_${dto.username}`;

    const existing = await this.prisma.socialAccount.findFirst({
      where: { platform: dto.platform, platform_user_id },
      select: { profile: { select: { name: true } } },
    });

    if (existing) {
      throw new ConflictException(
        `${dto.platform} @${dto.username} is already linked to profile "${existing.profile.name}"`,
      );
    }

    try {
      const account = await this.prisma.socialAccount.create({
        data: {
          profile_id: profileId,
          platform: dto.platform,
          username: dto.username,
          display_name: dto.displayName,
          platform_user_id,
        },
      });

      await this.accountPolling.enqueueSafe(account.id);

      return {
        id: account.id,
        platform: account.platform,
        platformUserId: account.platform_user_id,
        username: account.username,
        displayName: account.display_name,
        followerCount: account.follower_count,
        isVerified: account.is_verified,
        createdAt: account.created_at,
        lastPolledAt: account.last_polled_at,
        lastPollStatus: account.last_poll_status,
        linkedPostCount: 0,
      };
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          `${dto.platform} @${dto.username} is already linked to another profile`,
        );
      }
      throw error;
    }
  }

  async unlinkAccount(profileId: string, accountId: string) {
    const account = await this.prisma.socialAccount.findFirst({
      where: { id: accountId, profile_id: profileId },
      select: { id: true, _count: { select: { socialAccountPosts: true } } },
    });
    if (!account) {
      throw new NotFoundException('Social account not found on this profile');
    }

    if (account._count.socialAccountPosts > 0) {
      throw new ConflictException(
        'Cannot delete a social account that has linked posts. Unlink its posts first.',
      );
    }

    await this.prisma.socialAccount.delete({ where: { id: accountId } });
  }

  async moveAccount(profileId: string, accountId: string, dto: MoveAccountDto) {
    const account = await this.prisma.socialAccount.findFirst({
      where: { id: accountId, profile_id: profileId },
    });
    if (!account) {
      throw new NotFoundException('Social account not found on this profile');
    }

    const targetProfile = await this.prisma.profile.findUnique({
      where: { id: dto.targetProfileId },
    });
    if (!targetProfile) {
      throw new NotFoundException('Target profile not found');
    }

    const updated = await this.prisma.socialAccount.update({
      where: { id: accountId },
      data: { profile_id: dto.targetProfileId },
    });

    return {
      id: updated.id,
      platform: updated.platform,
      platformUserId: updated.platform_user_id,
      username: updated.username,
      displayName: updated.display_name,
      followerCount: updated.follower_count,
      isVerified: updated.is_verified,
      createdAt: updated.created_at,
      lastPolledAt: updated.last_polled_at,
      lastPollStatus: updated.last_poll_status,
    };
  }

  async pollAccount(profileId: string, accountId: string) {
    const account = await this.prisma.socialAccount.findFirst({
      where: { id: accountId, profile_id: profileId },
      select: { id: true },
    });
    if (!account) {
      throw new NotFoundException('Social account not found on this profile');
    }

    const queued = await this.accountPolling.enqueue(accountId, {
      manual: true,
    });
    return { queued };
  }

  private extractUsernameFromUrl(url: string): string {
    const cleaned = url.replace(/\/+$/, '');
    const lastSegment = cleaned.split('/').pop() || '';
    return lastSegment.replace(/^@/, '');
  }

  private buildOrderBy(
    sortBy?: ProfileSortField,
    sortOrder?: 'asc' | 'desc',
  ): Record<string, unknown> {
    const dir = sortOrder ?? 'desc';
    switch (sortBy) {
      case 'name':
        return { name: dir };
      case 'totalFollowers':
        return { socialAccounts: { _count: dir } };
      default:
        return { created_at: dir };
    }
  }

  private formatProfile(p: {
    id: string;
    name: string;
    description: string | null;
    gender: Gender | null;
    email: string | null;
    phone: string | null;
    avatar: string | null;
    tags: string[];
    created_at: Date;
    updated_at: Date;
    tier: { id: string; name: string; color: string } | null;
    categories: {
      kolCategory: { id: string; name: string; color: string };
    }[];
    socialAccounts: {
      id: string;
      platform: Platform;
      platform_user_id: string;
      username: string | null;
      display_name: string | null;
      follower_count: number;
      is_verified: boolean;
      created_at: Date;
      last_polled_at: Date | null;
      last_poll_status: string | null;
      _count: { socialAccountPosts: number };
    }[];
  }) {
    const accounts = p.socialAccounts.map((sa) => ({
      id: sa.id,
      platform: sa.platform,
      platformUserId: sa.platform_user_id,
      username: sa.username,
      displayName: sa.display_name,
      followerCount: sa.follower_count,
      isVerified: sa.is_verified,
      createdAt: sa.created_at,
      lastPolledAt: sa.last_polled_at,
      lastPollStatus: sa.last_poll_status,
      linkedPostCount: sa._count.socialAccountPosts,
    }));

    const totalFollowers = p.socialAccounts.reduce(
      (sum, sa) => sum + sa.follower_count,
      0,
    );

    return {
      id: p.id,
      name: p.name,
      description: p.description,
      gender: p.gender,
      email: p.email,
      phone: p.phone,
      avatar: p.avatar,
      tags: p.tags,
      tier: p.tier
        ? {
            id: p.tier.id,
            name: p.tier.name,
            color: p.tier.color,
          }
        : null,
      categories: p.categories.map((pc) => ({
        id: pc.kolCategory.id,
        name: pc.kolCategory.name,
        color: pc.kolCategory.color,
      })),
      accounts,
      totalFollowers,
      createdAt: p.created_at,
      updatedAt: p.updated_at,
    };
  }
}
