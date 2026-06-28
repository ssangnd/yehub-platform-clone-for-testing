import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  CampaignStatus,
  GlobalRole,
  ProjectRole,
  Platform,
  UserStatus,
  Prisma,
} from '../../generated/prisma/client';
import {
  pickGranularity,
  zeroFillBuckets,
  type Granularity,
} from './campaign-analytics';
import { CreateCampaignDto } from './dto/create-campaign.dto';
import { UpdateCampaignDto } from './dto/update-campaign.dto';
import {
  ListCampaignsQueryDto,
  type CampaignSortField,
} from './dto/list-campaigns-query.dto';
import { AddCampaignMemberDto } from './dto/add-campaign-member.dto';
import { isValidTransition } from './campaign-status.utils';
import { CampaignMetricKey, computeCampaignMetric } from './campaign-metrics';
import { isUniqueConstraintError } from '../common/prisma-errors';
import { PollingSchedulerService } from '../polling/polling-scheduler.service';

const USER_SELECT = {
  id: true,
  email: true,
  name: true,
  avatar: true,
} as const;

const CAMPAIGN_INCLUDE = {
  _count: { select: { posts: { where: { deleted_at: null } } } },
  project: { select: { id: true, name: true } },
  posts: {
    where: { deleted_at: null },
    select: { comment_count: true, likes: true, views: true },
  },
  objectives: {
    select: { objective: { select: { id: true, name: true } } },
  },
} as const;

@Injectable()
export class CampaignsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pollingScheduler: PollingSchedulerService,
  ) {}

  async create(projectId: string, dto: CreateCampaignDto) {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
    });
    if (!project) throw new NotFoundException('Project not found');
    if (!project.active)
      throw new BadRequestException(
        'Cannot create campaigns in an archived project',
      );

    const duplicate = await this.prisma.campaign.findFirst({
      where: { project_id: projectId, name: dto.name, deleted_at: null },
    });
    if (duplicate) {
      throw new ConflictException(
        'A campaign with this name already exists in this project',
      );
    }

    if (dto.objective_ids) {
      await this.assertObjectiveIdsExist(dto.objective_ids);
    }

    try {
      const campaign = await this.prisma.campaign.create({
        data: {
          project_id: projectId,
          name: dto.name,
          description: dto.description,
          start_date: new Date(dto.start_date),
          end_date: new Date(dto.end_date),
          metric_polling_interval: dto.metric_polling_interval,
          comments_polling_interval: dto.comments_polling_interval,
          display_metrics: dto.display_metrics ?? [],
          platforms: dto.platforms,
          status: CampaignStatus.DRAFT,
          ...(dto.objective_ids && {
            objectives: {
              create: dto.objective_ids.map((id) => ({ objective_id: id })),
            },
          }),
        },
        include: CAMPAIGN_INCLUDE,
      });
      return this.formatCampaign(campaign);
    } catch (err) {
      if (isUniqueConstraintError(err)) {
        throw new ConflictException(
          'A campaign with this name already exists in this project',
        );
      }
      throw err;
    }
  }

  async findAllByProject(projectId: string, query: ListCampaignsQueryDto) {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
    });
    if (!project) throw new NotFoundException('Project not found');

    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where = {
      project_id: projectId,
      deleted_at: null,
      ...(query.status && { status: query.status }),
      ...(query.q && {
        name: { contains: query.q, mode: 'insensitive' as const },
      }),
    };

    const orderBy = this.buildOrderBy(query.sort_by, query.order);

    const [campaigns, total] = await this.prisma.$transaction([
      this.prisma.campaign.findMany({
        where,
        include: CAMPAIGN_INCLUDE,
        orderBy,
        skip,
        take: limit,
      }),
      this.prisma.campaign.count({ where }),
    ]);

    return {
      data: campaigns.map((c) => this.formatCampaign(c)),
      total,
      page,
      totalPages: Math.ceil(total / limit) || 1,
    };
  }

  async findAll(userId: string, query: ListCampaignsQueryDto, isAdmin = false) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where = {
      deleted_at: null,
      ...(!isAdmin && {
        OR: [
          {
            project: {
              active: true,
              memberships: { some: { user_id: userId } },
            },
          },
          {
            campaignMemberships: { some: { user_id: userId } },
            project: { active: true },
          },
        ],
      }),
      ...(isAdmin && { project: { active: true } }),
      ...(query.status && { status: query.status }),
      ...(query.q && {
        name: { contains: query.q, mode: 'insensitive' as const },
      }),
    };

    const orderBy = this.buildOrderBy(query.sort_by, query.order);

    const [campaigns, total] = await this.prisma.$transaction([
      this.prisma.campaign.findMany({
        where,
        include: CAMPAIGN_INCLUDE,
        orderBy,
        skip,
        take: limit,
      }),
      this.prisma.campaign.count({ where }),
    ]);

    return {
      data: campaigns.map((c) => this.formatCampaign(c)),
      total,
      page,
      totalPages: Math.ceil(total / limit) || 1,
    };
  }

  async findOne(id: string) {
    const campaign = await this.prisma.campaign.findUnique({
      where: { id },
      include: CAMPAIGN_INCLUDE,
    });
    if (!campaign || campaign.deleted_at) {
      throw new NotFoundException('Campaign not found');
    }
    return this.formatCampaign(campaign);
  }

  // Returns a single aggregated dashboard metric for a campaign. Each metric is
  // fetched independently by the frontend (one request per card).
  async getMetric(id: string, metric: CampaignMetricKey) {
    const campaign = await this.prisma.campaign.findUnique({
      where: { id },
      select: { id: true, deleted_at: true },
    });
    if (!campaign || campaign.deleted_at) {
      throw new NotFoundException('Campaign not found');
    }

    const agg = await this.prisma.post.aggregate({
      where: { campaign_id: id, deleted_at: null },
      _count: { _all: true },
      _sum: { likes: true, shares: true, views: true, comment_count: true },
    });

    const value = computeCampaignMetric(metric, {
      postCount: agg._count._all,
      likes: agg._sum.likes ?? 0,
      shares: agg._sum.shares ?? 0,
      views: agg._sum.views ?? 0,
      comments: agg._sum.comment_count ?? 0,
    });

    return { metric, value };
  }

  // Daily (or weekly, for long campaigns) total comment counts across the
  // campaign's active window, zero-filled so the trend line is continuous.
  async getCommentVolume(id: string) {
    const campaign = await this.prisma.campaign.findUnique({
      where: { id },
      select: {
        id: true,
        deleted_at: true,
        start_date: true,
        end_date: true,
      },
    });
    if (!campaign || campaign.deleted_at) {
      throw new NotFoundException('Campaign not found');
    }

    const from = campaign.start_date;
    // Cap the window at "now" so an ongoing campaign with a future end_date
    // does not render a flat-zero tail out to that future date.
    const now = new Date();
    const to = campaign.end_date < now ? campaign.end_date : now;
    const granularity: Granularity = pickGranularity(from, to);

    // Counts ingested Comment rows (including is_noise). This is a row count,
    // not the platform-reported `comments` metric (which sums Post.comment_count),
    // so totals here can be lower when not every platform comment is ingested.
    // The final bucket may be partial for active campaigns whose window ends at "now".
    // bucket keyword is from our own enum, never user input — safe to inline.
    const rows = await this.prisma.$queryRaw<
      { bucket: Date; count: bigint }[]
    >(Prisma.sql`
      SELECT date_trunc(${Prisma.raw(`'${granularity}'`)}, COALESCE(c.platform_created_at, c.created_at)) AS bucket,
             count(*)::bigint AS count
      FROM "comments" c
      JOIN "posts" p ON p.id = c.post_id
      WHERE p.campaign_id = ${id}::uuid
        AND p.deleted_at IS NULL
        AND COALESCE(c.platform_created_at, c.created_at) BETWEEN ${from} AND ${to}
      GROUP BY bucket
      ORDER BY bucket ASC
    `);

    const points = zeroFillBuckets(
      rows.map((r) => ({ date: r.bucket, count: Number(r.count) })),
      from,
      to,
      granularity,
    );

    return { granularity, points };
  }

  // Comment counts grouped by platform for the distribution pie chart.
  async getCommentsByPlatform(id: string) {
    const campaign = await this.prisma.campaign.findUnique({
      where: { id },
      select: { id: true, deleted_at: true },
    });
    if (!campaign || campaign.deleted_at) {
      throw new NotFoundException('Campaign not found');
    }

    // Counts ingested Comment rows (including is_noise), consistent with getCommentVolume.
    const grouped = await this.prisma.comment.groupBy({
      by: ['platform'],
      _count: { _all: true },
      where: { post: { campaign_id: id, deleted_at: null } },
    });

    const distribution = grouped
      .map((g) => ({ platform: g.platform, count: g._count._all }))
      .filter((d) => d.count > 0)
      .sort((a, b) => b.count - a.count);

    return { distribution };
  }

  // Apify spend for a campaign: summary, per-job-type breakdown, spend over the
  // campaign window, top cost drivers (posts/accounts), and recent runs. Runs
  // whose cost has not been finalised contribute 0 and are surfaced as pending.
  async getSpending(id: string) {
    const campaign = await this.prisma.campaign.findUnique({
      where: { id },
      select: {
        id: true,
        deleted_at: true,
        start_date: true,
        end_date: true,
      },
    });
    if (!campaign || campaign.deleted_at) {
      throw new NotFoundException('Campaign not found');
    }

    const [byTypeRaw, runCount, finalizedCount, topPostsRaw, topAccountsRaw] =
      await Promise.all([
        this.prisma.apifyRun.groupBy({
          by: ['job_type'],
          where: { campaign_id: id },
          _sum: { usage_total_usd: true },
          _count: { _all: true },
        }),
        this.prisma.apifyRun.count({ where: { campaign_id: id } }),
        this.prisma.apifyRun.count({
          where: { campaign_id: id, usage_finalized: true },
        }),
        this.prisma.apifyRun.groupBy({
          by: ['post_id'],
          where: { campaign_id: id, post_id: { not: null } },
          _sum: { usage_total_usd: true },
          _count: { _all: true },
          orderBy: { _sum: { usage_total_usd: 'desc' } },
          take: 5,
        }),
        this.prisma.apifyRun.groupBy({
          by: ['social_account_id'],
          where: { campaign_id: id, social_account_id: { not: null } },
          _sum: { usage_total_usd: true },
          _count: { _all: true },
          orderBy: { _sum: { usage_total_usd: 'desc' } },
          take: 5,
        }),
      ]);

    const by_job_type = byTypeRaw
      .map((r) => ({
        job_type: r.job_type,
        run_count: r._count._all,
        total_usd: r._sum.usage_total_usd ?? 0,
      }))
      .sort((a, b) => b.total_usd - a.total_usd);

    const total_usd = by_job_type.reduce((sum, r) => sum + r.total_usd, 0);

    // Spend over the campaign window, capped at "now" for ongoing campaigns.
    const from = campaign.start_date;
    const now = new Date();
    const to = campaign.end_date < now ? campaign.end_date : now;
    const granularity: Granularity = pickGranularity(from, to);
    const seriesRows = await this.prisma.$queryRaw<
      { bucket: Date; usd: number }[]
    >(Prisma.sql`
      SELECT date_trunc(${Prisma.raw(`'${granularity}'`)}, COALESCE(started_at, created_at)) AS bucket,
             COALESCE(SUM(usage_total_usd), 0)::float8 AS usd
      FROM "apify_runs"
      WHERE campaign_id = ${id}::uuid
        AND COALESCE(started_at, created_at) BETWEEN ${from} AND ${to}
      GROUP BY bucket
      ORDER BY bucket ASC
    `);
    const series = {
      granularity,
      points: zeroFillBuckets(
        seriesRows.map((r) => ({ date: r.bucket, count: r.usd })),
        from,
        to,
        granularity,
      ).map((p) => ({ date: p.date, usd: p.count })),
    };

    // Resolve labels for the top cost drivers.
    const postIds = topPostsRaw
      .map((r) => r.post_id)
      .filter((v): v is string => v !== null);
    const accountIds = topAccountsRaw
      .map((r) => r.social_account_id)
      .filter((v): v is string => v !== null);
    const [posts, accounts] = await Promise.all([
      postIds.length
        ? this.prisma.post.findMany({
            where: { id: { in: postIds } },
            select: {
              id: true,
              platform: true,
              platform_post_id: true,
              author_name: true,
            },
          })
        : Promise.resolve([]),
      accountIds.length
        ? this.prisma.socialAccount.findMany({
            where: { id: { in: accountIds } },
            select: { id: true, platform: true, username: true },
          })
        : Promise.resolve([]),
    ]);
    const postLabel = new Map(
      posts.map((p) => [
        p.id,
        p.author_name ?? `${p.platform} ${p.platform_post_id}`,
      ]),
    );
    const accountLabel = new Map(
      accounts.map((a) => [a.id, a.username ? `@${a.username}` : a.platform]),
    );

    const top_posts = topPostsRaw.map((r) => ({
      post_id: r.post_id as string,
      label: postLabel.get(r.post_id as string) ?? 'Unknown post',
      run_count: r._count._all,
      total_usd: r._sum.usage_total_usd ?? 0,
    }));
    const top_accounts = topAccountsRaw.map((r) => ({
      social_account_id: r.social_account_id as string,
      label:
        accountLabel.get(r.social_account_id as string) ?? 'Unknown account',
      run_count: r._count._all,
      total_usd: r._sum.usage_total_usd ?? 0,
    }));

    const recentRows = await this.prisma.apifyRun.findMany({
      where: { campaign_id: id },
      orderBy: { created_at: 'desc' },
      take: 20,
      select: {
        id: true,
        job_type: true,
        status: true,
        started_at: true,
        usage_total_usd: true,
        usage_finalized: true,
        post: {
          select: { platform: true, platform_post_id: true, author_name: true },
        },
        socialAccount: { select: { platform: true, username: true } },
      },
    });
    const recent_runs = recentRows.map((r) => ({
      id: r.id,
      job_type: r.job_type,
      status: r.status,
      started_at: r.started_at,
      usage_total_usd: r.usage_total_usd,
      usage_finalized: r.usage_finalized,
      label: r.post
        ? (r.post.author_name ??
          `${r.post.platform} ${r.post.platform_post_id}`)
        : r.socialAccount
          ? r.socialAccount.username
            ? `@${r.socialAccount.username}`
            : r.socialAccount.platform
          : null,
    }));

    return {
      currency: 'USD' as const,
      total_usd,
      run_count: runCount,
      finalized_count: finalizedCount,
      pending_count: runCount - finalizedCount,
      by_job_type,
      series,
      top_posts,
      top_accounts,
      recent_runs,
    };
  }

  async update(id: string, dto: UpdateCampaignDto) {
    const existing = await this.prisma.campaign.findUnique({
      where: { id },
      select: {
        name: true,
        status: true,
        project_id: true,
        deleted_at: true,
        metric_polling_interval: true,
        comments_polling_interval: true,
      },
    });
    if (!existing || existing.deleted_at) {
      throw new NotFoundException('Campaign not found');
    }
    if (existing.status === CampaignStatus.COMPLETED) {
      throw new BadRequestException('Completed campaigns cannot be modified');
    }

    if (dto.name !== existing.name) {
      const duplicate = await this.prisma.campaign.findFirst({
        where: {
          project_id: existing.project_id,
          name: dto.name,
          deleted_at: null,
          NOT: { id },
        },
      });
      if (duplicate) {
        throw new ConflictException(
          'A campaign with this name already exists in this project',
        );
      }
    }

    if (dto.objective_ids?.length) {
      await this.assertObjectiveIdsExist(dto.objective_ids);
    }

    const previousIntervals = {
      metric_polling_interval: existing.metric_polling_interval,
      comments_polling_interval: existing.comments_polling_interval,
    };
    const nextIntervals = {
      metric_polling_interval: dto.metric_polling_interval ?? null,
      comments_polling_interval: dto.comments_polling_interval ?? null,
    };

    try {
      const campaign = await this.prisma.campaign.update({
        where: { id },
        data: {
          name: dto.name,
          description: dto.description ?? null,
          start_date: new Date(dto.start_date),
          end_date: new Date(dto.end_date),
          metric_polling_interval: nextIntervals.metric_polling_interval,
          comments_polling_interval: nextIntervals.comments_polling_interval,
          display_metrics: dto.display_metrics ?? [],
          platforms: dto.platforms,
          objectives: {
            deleteMany: {},
            ...(dto.objective_ids?.length && {
              create: dto.objective_ids.map((oid) => ({ objective_id: oid })),
            }),
          },
        },
        include: CAMPAIGN_INCLUDE,
      });

      const intervalsChanged =
        previousIntervals.metric_polling_interval !==
          nextIntervals.metric_polling_interval ||
        previousIntervals.comments_polling_interval !==
          nextIntervals.comments_polling_interval;
      if (intervalsChanged) {
        await this.pollingScheduler.rescheduleCampaignInheritedPosts(id);
      }

      return this.formatCampaign(campaign);
    } catch (err) {
      if (isUniqueConstraintError(err)) {
        throw new ConflictException(
          'A campaign with this name already exists in this project',
        );
      }
      throw err;
    }
  }

  async changeStatus(id: string, status: CampaignStatus) {
    const existing = await this.prisma.campaign.findUnique({
      where: { id },
      select: { status: true, deleted_at: true },
    });
    if (!existing || existing.deleted_at) {
      throw new NotFoundException('Campaign not found');
    }
    if (existing.status === status) {
      return this.findOne(id);
    }
    if (!isValidTransition(existing.status, status)) {
      throw new BadRequestException(
        `Invalid status transition from ${existing.status} to ${status}`,
      );
    }

    const campaign = await this.prisma.campaign.update({
      where: { id },
      data: { status },
      include: CAMPAIGN_INCLUDE,
    });

    if (status === CampaignStatus.ACTIVE) {
      await this.pollingScheduler.scheduleCampaign(id);
    } else if (existing.status === CampaignStatus.ACTIVE) {
      await this.pollingScheduler.removeCampaign(id);
    }

    return this.formatCampaign(campaign);
  }

  async remove(id: string) {
    const existing = await this.findOne(id);
    await this.prisma.campaign.update({
      where: { id },
      data: { deleted_at: new Date() },
    });
    if (existing.status === CampaignStatus.ACTIVE) {
      await this.pollingScheduler.removeCampaign(id);
    }
  }

  async getMyRole(campaignId: string, userId: string) {
    const campaign = await this.findOne(campaignId);

    const projectMembership = await this.prisma.projectMembership.findUnique({
      where: {
        user_id_project_id: {
          user_id: userId,
          project_id: campaign.project_id,
        },
      },
    });
    if (projectMembership) {
      return { role: projectMembership.role, source: 'project' as const };
    }

    const campaignMembership = await this.prisma.campaignMembership.findUnique({
      where: {
        user_id_campaign_id: { user_id: userId, campaign_id: campaignId },
      },
    });
    if (campaignMembership) {
      return { role: campaignMembership.role, source: 'campaign' as const };
    }

    throw new NotFoundException('Member not found');
  }

  async listMembers(campaignId: string) {
    const campaign = await this.findOne(campaignId);

    const projectMembers = await this.prisma.projectMembership.findMany({
      where: { project_id: campaign.project_id },
      include: { user: { select: { ...USER_SELECT, role: true } } },
      orderBy: { created_at: 'asc' },
    });

    const campaignMembers = await this.prisma.campaignMembership.findMany({
      where: { campaign_id: campaignId },
      include: {
        user: { select: { ...USER_SELECT, role: true } },
        addedByUser: { select: USER_SELECT },
      },
      orderBy: { created_at: 'asc' },
    });

    return {
      inherited: projectMembers.map((m) => {
        const { role: global_role, ...user } = m.user;
        return {
          user,
          role: m.role,
          source: 'project' as const,
          global_role,
        };
      }),
      direct: campaignMembers.map((m) => {
        const { role: global_role, ...user } = m.user;
        return {
          user,
          role: m.role,
          source: 'campaign' as const,
          added_by: m.added_by,
          added_by_user: m.addedByUser,
          created_at: m.created_at,
          global_role,
        };
      }),
    };
  }

  async addCampaignMember(
    campaignId: string,
    dto: AddCampaignMemberDto,
    addedBy: string,
  ) {
    const campaign = await this.findOne(campaignId);

    const user = await this.prisma.user.findUnique({
      where: { id: dto.user_id },
    });
    if (!user) throw new NotFoundException('User not found');
    if (user.status !== UserStatus.ACTIVE)
      throw new BadRequestException('User account is not active');
    if (user.role === GlobalRole.ADMIN)
      throw new BadRequestException('Admin users cannot be added to campaigns');

    const projectMembership = await this.prisma.projectMembership.findUnique({
      where: {
        user_id_project_id: {
          user_id: dto.user_id,
          project_id: campaign.project_id,
        },
      },
    });
    if (projectMembership) {
      throw new ConflictException(
        'User is already a project member and has inherited access',
      );
    }

    const existing = await this.prisma.campaignMembership.findUnique({
      where: {
        user_id_campaign_id: {
          user_id: dto.user_id,
          campaign_id: campaignId,
        },
      },
    });
    if (existing) {
      throw new ConflictException('User is already a campaign member');
    }

    const membership = await this.prisma.campaignMembership.create({
      data: {
        user_id: dto.user_id,
        campaign_id: campaignId,
        role: dto.role,
        added_by: addedBy,
      },
      include: {
        user: { select: { ...USER_SELECT, role: true } },
        addedByUser: { select: USER_SELECT },
      },
    });

    const { role: globalRole, ...userInfo } = membership.user;
    return {
      user_id: membership.user_id,
      user: userInfo,
      role: membership.role,
      source: 'campaign' as const,
      added_by: membership.added_by,
      added_by_user: membership.addedByUser,
      created_at: membership.created_at,
      global_role: globalRole,
    };
  }

  async updateCampaignMember(
    campaignId: string,
    targetUserId: string,
    role: ProjectRole,
    currentUserId: string,
  ) {
    if (targetUserId === currentUserId) {
      throw new BadRequestException('You cannot update your own membership');
    }
    const membership = await this.prisma.campaignMembership.findUnique({
      where: {
        user_id_campaign_id: {
          user_id: targetUserId,
          campaign_id: campaignId,
        },
      },
    });
    if (!membership) throw new NotFoundException('Campaign member not found');

    const updated = await this.prisma.campaignMembership.update({
      where: {
        user_id_campaign_id: {
          user_id: targetUserId,
          campaign_id: campaignId,
        },
      },
      data: { role },
      include: {
        user: { select: { ...USER_SELECT, role: true } },
        addedByUser: { select: USER_SELECT },
      },
    });

    const { role: global_role, ...user } = updated.user;
    return {
      user_id: updated.user_id,
      user,
      role: updated.role,
      source: 'campaign' as const,
      added_by: updated.added_by,
      added_by_user: updated.addedByUser,
      created_at: updated.created_at,
      global_role,
    };
  }

  async removeCampaignMember(
    campaignId: string,
    targetUserId: string,
    currentUserId: string,
  ) {
    if (targetUserId === currentUserId) {
      throw new BadRequestException(
        'You cannot remove yourself from a campaign',
      );
    }
    const membership = await this.prisma.campaignMembership.findUnique({
      where: {
        user_id_campaign_id: {
          user_id: targetUserId,
          campaign_id: campaignId,
        },
      },
    });
    if (!membership) throw new NotFoundException('Campaign member not found');

    await this.prisma.campaignMembership.delete({
      where: {
        user_id_campaign_id: {
          user_id: targetUserId,
          campaign_id: campaignId,
        },
      },
    });
  }

  async getCampaignNonMembers(
    campaignId: string,
    query: { q?: string; limit?: number },
  ) {
    const campaign = await this.findOne(campaignId);
    const { q, limit = 20 } = query;

    const users = await this.prisma.user.findMany({
      where: {
        status: UserStatus.ACTIVE,
        role: { not: GlobalRole.ADMIN },
        memberships: { none: { project_id: campaign.project_id } },
        campaignMemberships: { none: { campaign_id: campaignId } },
        ...(q && {
          OR: [
            { name: { contains: q, mode: 'insensitive' } },
            { email: { contains: q, mode: 'insensitive' } },
          ],
        }),
      },
      select: { ...USER_SELECT, role: true },
      orderBy: { name: 'asc' },
      take: limit,
    });
    return users.map(({ role, ...rest }) => ({ ...rest, global_role: role }));
  }

  // TODO: Daily auto-complete cron job
  // @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  // async autoCompleteCampaigns() {
  //   Auto-complete ACTIVE campaigns whose end_date has passed
  //   await this.prisma.campaign.updateMany({
  //     where: {
  //       status: CampaignStatus.ACTIVE,
  //       end_date: { lte: new Date() },
  //       deleted_at: null,
  //     },
  //     data: { status: CampaignStatus.COMPLETED },
  //   });
  // }

  private async assertObjectiveIdsExist(objectiveIds: string[]) {
    const unique = [...new Set(objectiveIds)];
    if (unique.length === 0) return;
    const found = await this.prisma.objective.count({
      where: { id: { in: unique } },
    });
    if (found !== unique.length) {
      throw new BadRequestException('One or more objective IDs are invalid');
    }
  }

  private buildOrderBy(
    sortBy?: CampaignSortField,
    order?: 'asc' | 'desc',
  ): Record<string, unknown> {
    const dir = order ?? 'desc';
    switch (sortBy) {
      case 'name':
        return { name: dir };
      case 'post_count':
        return { posts: { _count: dir } };
      default:
        return { created_at: dir };
    }
  }

  private formatCampaign(campaign: {
    id: string;
    project_id: string;
    name: string;
    description: string | null;
    status: CampaignStatus;
    platforms: Platform[];
    start_date: Date;
    end_date: Date;
    metric_polling_interval: number | null;
    comments_polling_interval: number | null;
    display_metrics: string[];
    created_at: Date;
    updated_at: Date;
    _count: { posts: number };
    project: { id: string; name: string };
    posts: { comment_count: number; likes: number; views: number }[];
    objectives: { objective: { id: string; name: string } }[];
  }) {
    const commentCount = campaign.posts.reduce(
      (sum, p) => sum + p.comment_count,
      0,
    );
    const totalViews = campaign.posts.reduce((sum, p) => sum + p.views, 0);
    const totalLikes = campaign.posts.reduce((sum, p) => sum + p.likes, 0);
    const totalComments = commentCount;
    const engagementRate =
      totalViews > 0 ? ((totalLikes + totalComments) / totalViews) * 100 : null;

    return {
      id: campaign.id,
      project_id: campaign.project_id,
      project_name: campaign.project.name,
      name: campaign.name,
      description: campaign.description,
      status: campaign.status,
      platforms: campaign.platforms,
      start_date: campaign.start_date,
      end_date: campaign.end_date,
      metric_polling_interval: campaign.metric_polling_interval,
      comments_polling_interval: campaign.comments_polling_interval,
      display_metrics: campaign.display_metrics,
      created_at: campaign.created_at,
      updated_at: campaign.updated_at,
      post_count: campaign._count.posts,
      comment_count: commentCount,
      engagement_rate: engagementRate
        ? Math.round(engagementRate * 10) / 10
        : null,
      objectives: campaign.objectives.map((co) => co.objective),
    };
  }
}
