import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { UserStatus } from '../../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { SESSION_IDLE_TIMEOUT_MS } from '../auth.constants';

export interface JwtPayload {
  sub: string;
  sessionId: string;
  email: string;
  role: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('JWT_SECRET'),
    });
  }

  async validate(payload: JwtPayload) {
    const session = await this.prisma.session.findFirst({
      where: {
        id: payload.sessionId,
        user_id: payload.sub,
        last_active_at: { gt: new Date(Date.now() - SESSION_IDLE_TIMEOUT_MS) },
      },
      select: {
        id: true,
        user: {
          select: {
            id: true,
            email: true,
            role: true,
            status: true,
          },
        },
      },
    });

    if (!session) {
      throw new UnauthorizedException('Session expired or revoked');
    }
    if (session.user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException('Account inactive');
    }

    return {
      id: session.user.id,
      sessionId: session.id,
      email: session.user.email,
      role: session.user.role,
    };
  }
}
