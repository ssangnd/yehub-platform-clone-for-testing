import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { GlobalRole, ProjectRole } from '../../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ROLES_KEY } from '../decorators/roles.decorator';

@Injectable()
export class ProjectRolesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const { user } = context.switchToHttp().getRequest<{
      user?: { id: string; role: GlobalRole };
      params: Record<string, string>;
    }>();

    if (!user) return false;
    if (user.role === GlobalRole.ADMIN) return true;

    const requiredRoles = this.reflector.getAllAndOverride<ProjectRole[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredRoles || requiredRoles.length === 0) {
      return this.checkMembership(context);
    }

    return this.checkRole(context, requiredRoles);
  }

  private async checkMembership(context: ExecutionContext): Promise<boolean> {
    const { user, params } = context
      .switchToHttp()
      .getRequest<{ user: { id: string }; params: Record<string, string> }>();
    const projectId = params.id ?? params.projectId;
    if (!projectId) return true;

    const membership = await this.prisma.projectMembership.findUnique({
      where: {
        user_id_project_id: { user_id: user.id, project_id: projectId },
      },
    });
    return !!membership;
  }

  private async checkRole(
    context: ExecutionContext,
    requiredRoles: ProjectRole[],
  ): Promise<boolean> {
    const { user, params } = context
      .switchToHttp()
      .getRequest<{ user: { id: string }; params: Record<string, string> }>();
    const projectId = params.id ?? params.projectId;
    if (!projectId) return false;

    const membership = await this.prisma.projectMembership.findUnique({
      where: {
        user_id_project_id: { user_id: user.id, project_id: projectId },
      },
    });

    if (!membership) return false;
    return requiredRoles.includes(membership.role);
  }
}
