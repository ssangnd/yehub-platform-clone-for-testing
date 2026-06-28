import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { UserStatus } from '../../generated/prisma/client';
import { LoginDto } from './dto/login.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { AcceptInvitationDto } from './dto/accept-invitation.dto';
import { extractSessionMetadata } from './session.util';
import {
  MAX_FAILED_LOGIN_ATTEMPTS,
  SESSION_IDLE_TIMEOUT_MS,
} from './auth.constants';

const BCRYPT_ROUNDS = 10;
const ACCESS_TOKEN_EXPIRY = '5m';
const REFRESH_TOKEN_EXPIRY = '7d';
const RESET_TOKEN_EXPIRY_MINUTES = 15;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    private readonly mail: MailService,
  ) {}

  async login(dto: LoginDto, userAgent?: string, ip?: string) {
    const email = dto.email.trim();
    const user = await this.prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }

    if (user.status === UserStatus.INACTIVE) {
      throw new UnauthorizedException({
        message: 'Account locked. Please contact an administrator.',
        locked: true,
      });
    }

    if (user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const passwordValid = user.password_hash
      ? await bcrypt.compare(dto.password, user.password_hash)
      : false;

    if (!passwordValid) {
      const updated = await this.prisma.user.update({
        where: { id: user.id },
        data: { failed_login_attempts: { increment: 1 } },
        select: { failed_login_attempts: true },
      });

      if (updated.failed_login_attempts >= MAX_FAILED_LOGIN_ATTEMPTS) {
        await this.prisma.$transaction([
          this.prisma.user.update({
            where: { id: user.id },
            data: {
              status: UserStatus.INACTIVE,
              locked_at: new Date(),
              locked_reason: 'too_many_failed_attempts',
            },
          }),
          this.prisma.session.deleteMany({ where: { user_id: user.id } }),
        ]);
        throw new UnauthorizedException({
          message:
            'Account locked due to too many failed login attempts. Please contact an administrator.',
          locked: true,
        });
      }

      throw new UnauthorizedException({
        message: 'Invalid email or password',
        attempts_remaining:
          MAX_FAILED_LOGIN_ATTEMPTS - updated.failed_login_attempts,
      });
    }

    const metadata = extractSessionMetadata(userAgent, ip);

    const session = await this.prisma.session.create({
      data: {
        user_id: user.id,
        refresh_token_hash: '$invalid$', // placeholder until real hash is set below
        device_name: metadata.deviceName,
        os_name: metadata.osName,
        ip_address: metadata.ipAddress,
        location: metadata.location,
      },
    });

    const payload = {
      sub: user.id,
      sessionId: session.id,
      email: user.email,
      role: user.role,
    };

    const accessToken = this.jwtService.sign(payload, {
      expiresIn: ACCESS_TOKEN_EXPIRY,
    });

    const refreshToken = this.jwtService.sign(payload, {
      secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
      expiresIn: REFRESH_TOKEN_EXPIRY,
    });

    const refreshTokenHash = await bcrypt.hash(refreshToken, BCRYPT_ROUNDS);
    await this.prisma.session.update({
      where: { id: session.id },
      data: { refresh_token_hash: refreshTokenHash },
    });

    await this.prisma.user.update({
      where: { id: user.id },
      data: { last_login_at: new Date(), failed_login_attempts: 0 },
    });

    return { access_token: accessToken, refresh_token: refreshToken };
  }

  async refreshToken(refreshToken: string) {
    let payload: { sub: string; sessionId: string; email: string };

    try {
      payload = this.jwtService.verify(refreshToken, {
        secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const session = await this.prisma.session.findUnique({
      where: { id: payload.sessionId },
      include: { user: true },
    });

    if (!session || session.user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    if (
      session.last_active_at.getTime() <
      Date.now() - SESSION_IDLE_TIMEOUT_MS
    ) {
      await this.prisma.session.delete({ where: { id: session.id } });
      throw new UnauthorizedException('Session expired due to inactivity');
    }

    const tokenValid = await bcrypt.compare(
      refreshToken,
      session.refresh_token_hash,
    );
    if (!tokenValid) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    await this.prisma.session.update({
      where: { id: session.id },
      data: { last_active_at: new Date() },
    });

    const newPayload = {
      sub: session.user.id,
      sessionId: session.id,
      email: session.user.email,
      role: session.user.role,
    };
    const accessToken = this.jwtService.sign(newPayload, {
      expiresIn: ACCESS_TOKEN_EXPIRY,
    });

    return { access_token: accessToken };
  }

  async getMe(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.status !== UserStatus.ACTIVE)
      throw new NotFoundException('User not found');
    const {
      password_hash: _ph,
      invitation_token_hash: _ith,
      reset_token_selector: _rts,
      reset_token_hash: _reth,
      ...result
    } = user;
    return result;
  }

  async updateProfile(
    userId: string,
    dto: UpdateProfileDto,
    currentSessionId?: string,
  ) {
    const current = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { email: true },
    });
    const emailChanged = dto.email !== undefined && dto.email !== current.email;

    if (emailChanged) {
      const existing = await this.prisma.user.findUnique({
        where: { email: dto.email! },
      });
      if (existing && existing.id !== userId) {
        throw new ConflictException('Email already in use');
      }
    }

    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { name: dto.name, ...(dto.email && { email: dto.email }) },
    });

    if (emailChanged && currentSessionId) {
      await this.prisma.session.deleteMany({
        where: { user_id: userId, id: { not: currentSessionId } },
      });
    }

    const {
      password_hash: _ph,
      invitation_token_hash: _ith,
      reset_token_selector: _rts,
      reset_token_hash: _reth,
      ...result
    } = user;
    return result;
  }

  async updateAvatar(userId: string, avatar: string | null) {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { avatar },
    });
    const {
      password_hash: _ph,
      invitation_token_hash: _ith,
      reset_token_selector: _rts,
      reset_token_hash: _reth,
      ...result
    } = user;
    return result;
  }

  async changePassword(
    userId: string,
    dto: ChangePasswordDto,
    currentSessionId?: string,
  ) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
    });

    if (!user.password_hash) {
      throw new UnauthorizedException('Account not yet activated');
    }

    const passwordValid = await bcrypt.compare(
      dto.current_password,
      user.password_hash,
    );
    if (!passwordValid) {
      throw new UnauthorizedException('Current password is incorrect');
    }

    const passwordHash = await bcrypt.hash(dto.new_password, BCRYPT_ROUNDS);
    await this.prisma.user.update({
      where: { id: userId },
      data: { password_hash: passwordHash, failed_login_attempts: 0 },
    });

    if (currentSessionId) {
      await this.prisma.session.deleteMany({
        where: { user_id: userId, id: { not: currentSessionId } },
      });
    }

    return { message: 'Password changed successfully' };
  }

  async forgotPassword(email: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });

    if (user && user.status === UserStatus.ACTIVE) {
      const selector = crypto.randomBytes(8).toString('hex');
      const verifier = crypto.randomBytes(32).toString('hex');
      const verifierHash = crypto
        .createHash('sha256')
        .update(verifier)
        .digest('hex');

      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          reset_token_selector: selector,
          reset_token_hash: verifierHash,
          reset_token_expires_at: new Date(
            Date.now() + RESET_TOKEN_EXPIRY_MINUTES * 60 * 1000,
          ),
        },
      });

      const frontendUrl = this.config.get<string>(
        'FRONTEND_URL',
        'http://localhost:5173',
      );
      const resetLink = `${frontendUrl}/reset-password?token=${selector}.${verifier}`;
      void this.mail.sendPasswordReset(user.email, user.name, resetLink);
    }

    return { message: 'If that email exists, a reset link has been sent.' };
  }

  async resetPassword(token: string, newPassword: string) {
    const [selector, verifier] = token.split('.');
    if (!selector || !verifier) {
      throw new UnauthorizedException('Invalid or expired reset token');
    }

    const user = await this.prisma.user.findUnique({
      where: { reset_token_selector: selector },
    });

    if (
      !user ||
      user.status !== UserStatus.ACTIVE ||
      !user.reset_token_hash ||
      !user.reset_token_expires_at ||
      user.reset_token_expires_at <= new Date()
    ) {
      throw new UnauthorizedException('Invalid or expired reset token');
    }

    const verifierHash = crypto.createHash('sha256').update(verifier).digest();
    const storedHash = Buffer.from(user.reset_token_hash, 'hex');

    if (
      storedHash.length !== verifierHash.length ||
      !crypto.timingSafeEqual(storedHash, verifierHash)
    ) {
      throw new UnauthorizedException('Invalid or expired reset token');
    }

    const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        password_hash: passwordHash,
        reset_token_selector: null,
        reset_token_hash: null,
        reset_token_expires_at: null,
      },
    });

    await this.prisma.session.deleteMany({
      where: { user_id: user.id },
    });

    return { message: 'Password reset successfully' };
  }

  async getSessions(userId: string, currentSessionId: string) {
    const sessions = await this.prisma.session.findMany({
      where: { user_id: userId },
      orderBy: { last_active_at: 'desc' },
      select: {
        id: true,
        device_name: true,
        os_name: true,
        ip_address: true,
        location: true,
        last_active_at: true,
        created_at: true,
      },
    });

    return sessions.map((s) => ({
      ...s,
      is_current: s.id === currentSessionId,
    }));
  }

  async revokeSession(
    userId: string,
    sessionId: string,
    currentSessionId: string,
  ) {
    if (sessionId === currentSessionId) {
      throw new UnauthorizedException(
        'Cannot revoke current session. Use logout instead.',
      );
    }

    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
    });

    if (!session || session.user_id !== userId) {
      throw new NotFoundException('Session not found');
    }

    await this.prisma.session.delete({ where: { id: sessionId } });
    return { message: 'Session revoked' };
  }

  async revokeAllOtherSessions(userId: string, currentSessionId: string) {
    await this.prisma.session.deleteMany({
      where: { user_id: userId, id: { not: currentSessionId } },
    });
    return { message: 'All other sessions revoked' };
  }

  async logout(sessionId: string) {
    await this.prisma.session.deleteMany({
      where: { id: sessionId },
    });
    return { message: 'Logged out successfully' };
  }

  async validateInvitation(token: string) {
    const users = await this.prisma.user.findMany({
      where: {
        status: UserStatus.INVITED,
        invitation_token_hash: { not: null },
        invitation_accepted_at: null,
        invitation_expires_at: { gt: new Date() },
      },
      select: {
        id: true,
        email: true,
        name: true,
        invitation_token_hash: true,
      },
    });

    for (const user of users) {
      if (!user.invitation_token_hash) continue;
      const valid = await bcrypt.compare(token, user.invitation_token_hash);
      if (valid) {
        return { email: user.email, name: user.name };
      }
    }

    throw new UnauthorizedException('Invalid or expired invitation token');
  }

  async acceptInvitation(token: string, dto: AcceptInvitationDto) {
    const users = await this.prisma.user.findMany({
      where: {
        status: UserStatus.INVITED,
        invitation_token_hash: { not: null },
        invitation_accepted_at: null,
        invitation_expires_at: { gt: new Date() },
      },
    });

    let matchedUser: (typeof users)[0] | null = null;
    for (const user of users) {
      if (!user.invitation_token_hash) continue;
      const valid = await bcrypt.compare(token, user.invitation_token_hash);
      if (valid) {
        matchedUser = user;
        break;
      }
    }

    if (!matchedUser) {
      throw new UnauthorizedException('Invalid or expired invitation token');
    }

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);

    await this.prisma.user.update({
      where: { id: matchedUser.id },
      data: {
        password_hash: passwordHash,
        status: UserStatus.ACTIVE,
        invitation_accepted_at: new Date(),
        invitation_token_hash: null,
        invitation_expires_at: null,
      },
    });

    return { message: 'Account activated successfully' };
  }
}
