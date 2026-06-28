import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { GlobalRole } from '../../../generated/prisma/client';

export interface JwtUser {
  id: string;
  sessionId: string;
  email: string;
  role: GlobalRole;
}

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): JwtUser => {
    const request = ctx.switchToHttp().getRequest<{ user: JwtUser }>();
    return request.user;
  },
);
