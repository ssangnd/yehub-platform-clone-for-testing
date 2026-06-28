import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { GlobalRole } from '../../../generated/prisma/client';
import { GLOBAL_ROLES_KEY } from '../decorators/global-roles.decorator';

@Injectable()
export class GlobalRolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<GlobalRole[]>(
      GLOBAL_ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const { user } = context
      .switchToHttp()
      .getRequest<{ user?: { role: GlobalRole } }>();
    if (!user) return false;
    return requiredRoles.includes(user.role);
  }
}
