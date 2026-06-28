import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { GlobalRole, ProjectRole } from '../../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ROLES_KEY } from '../decorators/roles.decorator';

@Injectable()
export class CommentRolesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{
      user?: { id: string; role: GlobalRole };
      params: Record<string, string>;
    }>();
    const { user } = request;

    if (!user) return false;
    if (user.role === GlobalRole.ADMIN) return true;

    const commentId = request.params.id;
    if (!commentId) return false;

    const comment = await this.prisma.comment.findUnique({
      where: { id: commentId },
      select: {
        post: {
          select: {
            deleted_at: true,
            campaign_id: true,
            campaign: { select: { project_id: true, deleted_at: true } },
          },
        },
      },
    });
    if (
      !comment ||
      !comment.post ||
      comment.post.deleted_at ||
      comment.post.campaign.deleted_at
    )
      return false;

    // 1. Check project membership (inherited)
    const projectMembership = await this.prisma.projectMembership.findUnique({
      where: {
        user_id_project_id: {
          user_id: user.id,
          project_id: comment.post.campaign.project_id,
        },
      },
    });

    // 2. Fall back to campaign membership (direct)
    const membership =
      projectMembership ??
      (await this.prisma.campaignMembership.findUnique({
        where: {
          user_id_campaign_id: {
            user_id: user.id,
            campaign_id: comment.post.campaign_id,
          },
        },
      }));

    if (!membership) return false;

    const requiredRoles = this.reflector.getAllAndOverride<ProjectRole[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredRoles || requiredRoles.length === 0) return true;
    return requiredRoles.includes(membership.role);
  }
}
