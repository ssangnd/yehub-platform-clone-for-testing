import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { ConfigService } from '@nestjs/config';
import { GlobalRole, Prisma, UserStatus } from '../../generated/prisma/client';
import { InviteUserDto } from './dto/invite-user.dto';
import { ListUsersQueryDto } from './dto/list-users-query.dto';

const BCRYPT_ROUNDS = 10;
const INVITATION_EXPIRY_HOURS = 24;
const RESEND_COOLDOWN_MINUTES = 5;

const USER_BASE_SELECT = {
  id: true,
  email: true,
  name: true,
  role: true,
  status: true,
  last_login_at: true,
  created_at: true,
  avatar: true,
} as const;

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly config: ConfigService,
  ) {}

  async listUsers(query: ListUsersQueryDto = {}) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const skip = (page - 1) * limit;

    const orderBy = query.sortBy
      ? { [query.sortBy]: query.sortDir ?? 'asc' }
      : { created_at: 'desc' as const };

    const select = {
      ...USER_BASE_SELECT,
      _count: { select: { memberships: true } },
    } as const;

    type UserListRow = Prisma.UserGetPayload<{ select: typeof select }>;

    const where = this.buildListUsersWhere(query);

    const [users, total] = (await this.prisma.$transaction([
      this.prisma.user.findMany({ where, select, orderBy, skip, take: limit }),
      this.prisma.user.count({ where }),
    ])) as [UserListRow[], number];

    return {
      data: users.map((u) => ({
        id: u.id,
        email: u.email,
        name: u.name,
        role: u.role,
        status: u.status,
        last_login_at: u.last_login_at,
        created_at: u.created_at,
        avatar: u.avatar,
        project_count: u._count.memberships,
      })),
      total,
      page,
      totalPages: total === 0 ? 0 : Math.ceil(total / limit),
    };
  }

  private buildListUsersWhere(query: ListUsersQueryDto): Prisma.UserWhereInput {
    const where: Prisma.UserWhereInput = {};
    const q = query.q?.trim();
    if (q) {
      where.OR = [
        { name: { contains: q, mode: 'insensitive' } },
        { email: { contains: q, mode: 'insensitive' } },
      ];
    }
    if (query.role && query.role.length > 0) {
      where.role = { in: query.role };
    }
    if (query.status && query.status.length > 0) {
      where.status = { in: query.status };
    }
    return where;
  }

  async getUser(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        ...USER_BASE_SELECT,
        memberships: {
          include: {
            project: { select: { id: true, name: true } },
          },
        },
      },
    });

    if (!user) throw new NotFoundException('User not found');

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      status: user.status,
      last_login_at: user.last_login_at,
      created_at: user.created_at,
      avatar: user.avatar,
      memberships: user.memberships.map((m) => ({
        project_id: m.project_id,
        project_name: m.project.name,
        role: m.role,
        joined_at: m.created_at,
      })),
    };
  }

  async inviteUser(dto: InviteUserDto, invitedById: string) {
    this.logger.debug(`Inviting user: email=${dto.email}, role=${dto.role}`);

    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (existing) {
      throw new ConflictException('Email already in use');
    }

    const { rawToken, tokenHash, expiresAt } =
      await this.generateInvitationToken();

    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        name: dto.name,
        role: dto.role,
        status: UserStatus.INVITED,
        invited_by: invitedById,
        invitation_token_hash: tokenHash,
        invitation_expires_at: expiresAt,
        invitation_sent_at: new Date(),
      },
    });

    this.logger.debug(`User created: id=${user.id}, email=${user.email}`);

    await this.sendInvitationEmail(dto.email, dto.name, rawToken);

    this.logger.debug(`Invitation email sent to ${dto.email}`);

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      status: user.status,
    };
  }

  async updateGlobalRole(
    userId: string,
    role: GlobalRole,
    currentUserId: string,
  ) {
    this.ensureNotSelf(userId, currentUserId, 'update your own role');
    const user = await this.findUserOrThrow(userId);

    if (user.role === GlobalRole.ADMIN && role !== GlobalRole.ADMIN) {
      await this.ensureNotLastAdmin(userId);
    }

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { role },
    });

    return {
      id: updated.id,
      email: updated.email,
      name: updated.name,
      role: updated.role,
    };
  }

  async disableUser(userId: string, currentUserId: string) {
    this.ensureNotSelf(userId, currentUserId, 'disable your own account');
    const user = await this.findUserOrThrow(userId);

    if (user.role === GlobalRole.ADMIN) {
      await this.ensureNotLastAdmin(userId);
    }

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: { status: UserStatus.INACTIVE },
      }),
      this.prisma.session.deleteMany({
        where: { user_id: userId },
      }),
    ]);
  }

  async enableUser(userId: string) {
    await this.findUserOrThrow(userId);

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        status: UserStatus.ACTIVE,
        failed_login_attempts: 0,
        locked_at: null,
        locked_reason: null,
      },
    });
  }

  async removeUser(userId: string, currentUserId: string) {
    this.ensureNotSelf(userId, currentUserId, 'remove your own account');
    const user = await this.findUserOrThrow(userId);

    if (user.role === GlobalRole.ADMIN) {
      await this.ensureNotLastAdmin(userId);
    }

    await this.prisma.user.delete({ where: { id: userId } });
  }

  async removeUserMembership(userId: string, projectId: string) {
    const membership = await this.prisma.projectMembership.findUnique({
      where: {
        user_id_project_id: { user_id: userId, project_id: projectId },
      },
    });
    if (!membership) throw new NotFoundException('Membership not found');

    await this.prisma.projectMembership.delete({
      where: {
        user_id_project_id: { user_id: userId, project_id: projectId },
      },
    });
  }

  async resendInvitation(userId: string) {
    this.logger.debug(`Resending invitation for userId=${userId}`);

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    if (user.status !== UserStatus.INVITED) {
      throw new BadRequestException('User is not in invited status');
    }

    if (user.invitation_sent_at) {
      const elapsed = Date.now() - user.invitation_sent_at.getTime();
      const cooldownMs = RESEND_COOLDOWN_MINUTES * 60 * 1000;
      if (elapsed < cooldownMs) {
        const remainingMin = Math.ceil((cooldownMs - elapsed) / 60000);
        this.logger.debug(
          `Cooldown active for userId=${userId}, ${remainingMin} minute(s) remaining`,
        );
        throw new HttpException(
          `Please wait before resending. You can resend after ${remainingMin} minute(s).`,
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
    }

    const { rawToken, tokenHash, expiresAt } =
      await this.generateInvitationToken();

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        invitation_token_hash: tokenHash,
        invitation_expires_at: expiresAt,
        invitation_sent_at: new Date(),
      },
    });

    this.logger.debug(`Invitation token rotated for userId=${userId}`);

    await this.sendInvitationEmail(user.email, user.name, rawToken);

    this.logger.debug(`Invitation email resent to ${user.email}`);

    return { message: 'Invitation resent successfully' };
  }

  private async generateInvitationToken() {
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = await bcrypt.hash(rawToken, BCRYPT_ROUNDS);
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + INVITATION_EXPIRY_HOURS);
    return { rawToken, tokenHash, expiresAt };
  }

  private async sendInvitationEmail(
    email: string,
    name: string,
    rawToken: string,
  ) {
    const frontendUrl = this.config.get<string>(
      'FRONTEND_URL',
      'http://localhost:5173',
    );
    const invitationLink = `${frontendUrl}/invitation/${rawToken}`;
    await this.mail.sendInvitation(email, name, invitationLink);
  }

  private ensureNotSelf(
    targetId: string,
    currentUserId: string,
    action: string,
  ) {
    if (targetId === currentUserId) {
      throw new BadRequestException(`You cannot ${action}`);
    }
  }

  private async findUserOrThrow(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  private async ensureNotLastAdmin(excludeUserId: string) {
    const adminCount = await this.prisma.user.count({
      where: {
        role: GlobalRole.ADMIN,
        status: UserStatus.ACTIVE,
        NOT: { id: excludeUserId },
      },
    });
    if (adminCount === 0) {
      throw new BadRequestException(
        'Cannot perform this action on the last admin',
      );
    }
  }
}
