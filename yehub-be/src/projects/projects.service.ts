import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  GlobalRole,
  ProjectRole,
  UserStatus,
  CampaignStatus,
} from '../../generated/prisma/client';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { AddMemberDto } from './dto/add-member.dto';
import { ListProjectsQueryDto } from './dto/list-projects-query.dto';
import { isUniqueConstraintError } from '../common/prisma-errors';

const USER_SELECT = {
  id: true,
  email: true,
  name: true,
  avatar: true,
} as const;

const PROJECT_INCLUDE = {
  _count: { select: { memberships: true } },
  categories: {
    select: { category: { select: { id: true, name: true } } },
  },
  campaigns: {
    where: { deleted_at: null },
    select: {
      status: true,
      _count: { select: { posts: { where: { deleted_at: null } } } },
      posts: {
        where: { deleted_at: null },
        select: { comment_count: true },
      },
    },
  },
} as const;

@Injectable()
export class ProjectsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, dto: CreateProjectDto) {
    const { category_ids, ...projectData } = dto;

    const duplicate = await this.prisma.project.findUnique({
      where: { name: dto.name },
    });
    if (duplicate) {
      throw new ConflictException('A project with this name already exists');
    }

    try {
      const project = await this.prisma.project.create({
        data: {
          ...projectData,
          ...(category_ids?.length && {
            categories: {
              create: category_ids.map((id) => ({ category_id: id })),
            },
          }),
          memberships: {
            create: { user_id: userId, role: ProjectRole.MANAGER },
          },
        },
        include: PROJECT_INCLUDE,
      });
      return this.formatProject(project);
    } catch (err) {
      if (isUniqueConstraintError(err)) {
        throw new ConflictException('A project with this name already exists');
      }
      throw err;
    }
  }

  async findAll(userId: string, query: ListProjectsQueryDto, isAdmin = false) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where = {
      ...(!isAdmin && { memberships: { some: { user_id: userId } } }),
      ...(query.active !== undefined && { active: query.active }),
      ...(query.q && {
        OR: [
          { name: { contains: query.q, mode: 'insensitive' as const } },
          { client_name: { contains: query.q, mode: 'insensitive' as const } },
        ],
      }),
    };

    const [projects, total] = await this.prisma.$transaction([
      this.prisma.project.findMany({
        where,
        include: PROJECT_INCLUDE,
        orderBy: { created_at: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.project.count({ where }),
    ]);

    return {
      data: projects.map((p) => this.formatProject(p)),
      total,
      page,
      totalPages: total === 0 ? 0 : Math.ceil(total / limit),
    };
  }

  async findOne(projectId: string) {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      include: PROJECT_INCLUDE,
    });
    if (!project) throw new NotFoundException('Project not found');
    return this.formatProject(project);
  }

  async update(projectId: string, dto: UpdateProjectDto) {
    const existing = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { name: true, active: true },
    });
    if (!existing) throw new NotFoundException('Project not found');
    if (!existing.active) {
      throw new BadRequestException('Cannot edit an archived project');
    }

    if (dto.name !== existing.name) {
      const duplicate = await this.prisma.project.findUnique({
        where: { name: dto.name },
      });
      if (duplicate) {
        throw new ConflictException('A project with this name already exists');
      }
    }

    const { category_ids, ...projectData } = dto;
    try {
      const project = await this.prisma.project.update({
        where: { id: projectId },
        data: {
          ...projectData,
          categories: {
            deleteMany: {},
            ...(category_ids?.length && {
              create: category_ids.map((id) => ({ category_id: id })),
            }),
          },
        },
        include: PROJECT_INCLUDE,
      });
      return this.formatProject(project);
    } catch (err) {
      if (isUniqueConstraintError(err)) {
        throw new ConflictException('A project with this name already exists');
      }
      throw err;
    }
  }

  async archive(projectId: string) {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      include: PROJECT_INCLUDE,
    });
    if (!project) throw new NotFoundException('Project not found');
    if (!project.active) return this.formatProject(project);
    this.assertAllCampaignsCompleted(project.campaigns);
    const updated = await this.prisma.project.update({
      where: { id: projectId },
      data: { active: false },
      include: PROJECT_INCLUDE,
    });
    return this.formatProject(updated);
  }

  async unarchive(projectId: string) {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      include: PROJECT_INCLUDE,
    });
    if (!project) throw new NotFoundException('Project not found');
    if (project.active) return this.formatProject(project);
    const updated = await this.prisma.project.update({
      where: { id: projectId },
      data: { active: true },
      include: PROJECT_INCLUDE,
    });
    return this.formatProject(updated);
  }

  async listMembers(projectId: string) {
    await this.findOne(projectId);
    const memberships = await this.prisma.projectMembership.findMany({
      where: { project_id: projectId },
      include: {
        user: { select: { ...USER_SELECT, role: true } },
      },
      orderBy: { created_at: 'asc' },
    });
    return memberships.map((m) => this.formatMember(m));
  }

  async addMember(projectId: string, dto: AddMemberDto) {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { active: true },
    });
    if (!project) throw new NotFoundException('Project not found');
    if (!project.active)
      throw new BadRequestException(
        'Cannot modify members of an archived project',
      );
    const user = await this.prisma.user.findUnique({
      where: { id: dto.user_id },
    });
    if (!user) throw new NotFoundException('User not found');
    const existing = await this.prisma.projectMembership.findUnique({
      where: {
        user_id_project_id: { user_id: dto.user_id, project_id: projectId },
      },
    });
    if (existing) throw new ConflictException('User is already a member');
    const membership = await this.prisma.projectMembership.create({
      data: { user_id: dto.user_id, project_id: projectId, role: dto.role },
      include: {
        user: { select: { ...USER_SELECT, role: true } },
      },
    });
    return this.formatMember(membership);
  }

  async updateMember(
    projectId: string,
    targetUserId: string,
    role: ProjectRole,
    currentUserId: string,
  ) {
    if (targetUserId === currentUserId) {
      throw new BadRequestException('You cannot update your own membership');
    }
    const membership = await this.prisma.projectMembership.findUnique({
      where: {
        user_id_project_id: { user_id: targetUserId, project_id: projectId },
      },
      include: { project: { select: { active: true } } },
    });
    if (!membership) throw new NotFoundException('Member not found');
    if (!membership.project.active)
      throw new BadRequestException(
        'Cannot modify members of an archived project',
      );
    const updated = await this.prisma.projectMembership.update({
      where: {
        user_id_project_id: { user_id: targetUserId, project_id: projectId },
      },
      data: { role },
      include: {
        user: { select: { ...USER_SELECT, role: true } },
      },
    });
    return this.formatMember(updated);
  }

  async removeMember(
    projectId: string,
    targetUserId: string,
    currentUserId: string,
  ) {
    if (targetUserId === currentUserId) {
      throw new BadRequestException(
        'You cannot remove yourself from a project',
      );
    }
    const membership = await this.prisma.projectMembership.findUnique({
      where: {
        user_id_project_id: { user_id: targetUserId, project_id: projectId },
      },
      include: { project: { select: { active: true } } },
    });
    if (!membership) throw new NotFoundException('Member not found');
    if (!membership.project.active)
      throw new BadRequestException(
        'Cannot modify members of an archived project',
      );
    await this.prisma.projectMembership.delete({
      where: {
        user_id_project_id: { user_id: targetUserId, project_id: projectId },
      },
    });
  }

  async getMyRole(projectId: string, userId: string) {
    const membership = await this.prisma.projectMembership.findUnique({
      where: { user_id_project_id: { user_id: userId, project_id: projectId } },
    });
    if (!membership) throw new NotFoundException('Member not found');
    return { role: membership.role, joined_at: membership.created_at };
  }

  async getNonMembers(
    projectId: string,
    query: { q?: string; limit?: number },
  ) {
    await this.findOne(projectId);
    const { q, limit = 20 } = query;
    const users = await this.prisma.user.findMany({
      where: {
        status: UserStatus.ACTIVE,
        memberships: { none: { project_id: projectId } },
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

  private assertAllCampaignsCompleted(campaigns: { status: CampaignStatus }[]) {
    const hasIncomplete = campaigns.some(
      (c) => c.status !== CampaignStatus.COMPLETED,
    );
    if (hasIncomplete) {
      throw new BadRequestException(
        'Cannot archive a project while it has non-completed campaigns',
      );
    }
  }

  private formatProject(project: {
    id: string;
    name: string;
    description: string | null;
    client_name: string | null;
    logo: string | null;
    active: boolean;
    created_at: Date;
    updated_at: Date;
    _count: { memberships: number };
    categories: { category: { id: string; name: string } }[];
    campaigns: {
      status: CampaignStatus;
      _count: { posts: number };
      posts: { comment_count: number }[];
    }[];
  }) {
    return {
      id: project.id,
      name: project.name,
      description: project.description,
      client_name: project.client_name,
      logo: project.logo,
      categories: project.categories.map((pc) => pc.category),
      active: project.active,
      created_at: project.created_at,
      updated_at: project.updated_at,
      member_count: project._count.memberships,
      campaign_count: project.campaigns.length,
      active_campaign_count: project.campaigns.filter(
        (c) => c.status === CampaignStatus.ACTIVE,
      ).length,
      planned_campaign_count: project.campaigns.filter(
        (c) => c.status === CampaignStatus.DRAFT,
      ).length,
      post_count: project.campaigns.reduce((sum, c) => sum + c._count.posts, 0),
      comment_count: project.campaigns.reduce(
        (sum, c) => sum + c.posts.reduce((s, p) => s + p.comment_count, 0),
        0,
      ),
    };
  }

  private formatMember(membership: {
    user_id: string;
    role: ProjectRole;
    created_at: Date;
    user: {
      id: string;
      email: string;
      name: string;
      avatar: string | null;
      role: GlobalRole;
    };
  }) {
    return {
      user_id: membership.user_id,
      email: membership.user.email,
      name: membership.user.name,
      role: membership.role,
      joined_at: membership.created_at,
      avatar: membership.user.avatar,
      global_role: membership.user.role,
    };
  }
}
