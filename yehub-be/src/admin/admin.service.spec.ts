import { Test, TestingModule } from '@nestjs/testing';
import {
  NotFoundException,
  BadRequestException,
  HttpException,
} from '@nestjs/common';
import { AdminService } from './admin.service';
import { GlobalRole, UserStatus } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { ConfigService } from '@nestjs/config';

describe('AdminService', () => {
  let service: AdminService;
  let mail: { sendInvitation: jest.Mock };
  let prisma: {
    user: {
      findUnique: jest.Mock;
      findMany: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      count: jest.Mock;
      delete: jest.Mock;
    };
    session: {
      deleteMany: jest.Mock;
    };
    $transaction: jest.Mock;
  };

  beforeEach(async () => {
    mail = { sendInvitation: jest.fn().mockResolvedValue(undefined) };
    prisma = {
      user: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        count: jest.fn(),
        delete: jest.fn(),
      },
      session: {
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      // Simulates the array-argument overload of $transaction only.
      // Does not support the callback overload.
      $transaction: jest
        .fn()
        .mockImplementation((ops: Promise<unknown>[]) => Promise.all(ops)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminService,
        { provide: PrismaService, useValue: prisma },
        { provide: MailService, useValue: mail },
        {
          provide: ConfigService,
          useValue: { get: jest.fn().mockReturnValue('http://localhost:5173') },
        },
      ],
    }).compile();

    service = module.get<AdminService>(AdminService);
  });

  describe('enableUser', () => {
    it('throws NotFoundException when user does not exist', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.enableUser('non-existent')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('sets status to ACTIVE for an existing user', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        status: 'INACTIVE',
      });

      await service.enableUser('user-1');

      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: 'user-1' },
      });
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: {
          status: UserStatus.ACTIVE,
          failed_login_attempts: 0,
          locked_at: null,
          locked_reason: null,
        },
      });
    });

    it('clears lockout fields when re-enabling a user', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        status: UserStatus.INACTIVE,
      });

      await service.enableUser('user-1');

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: {
          status: UserStatus.ACTIVE,
          failed_login_attempts: 0,
          locked_at: null,
          locked_reason: null,
        },
      });
    });
  });

  describe('disableUser', () => {
    it('throws NotFoundException when user does not exist', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(
        service.disableUser('non-existent', 'caller-1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('sets status to INACTIVE and deletes all sessions', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        role: 'AUTHORIZED_USER',
        status: 'ACTIVE',
      });
      prisma.user.update.mockResolvedValue({
        id: 'user-1',
        status: 'INACTIVE',
      });

      await service.disableUser('user-1', 'caller-1');

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { status: 'INACTIVE' },
      });
      expect(prisma.session.deleteMany).toHaveBeenCalledWith({
        where: { user_id: 'user-1' },
      });
    });

    it('throws BadRequestException when disabling the last active admin', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'admin-1',
        role: 'ADMIN',
        status: 'ACTIVE',
      });
      prisma.user.count.mockResolvedValue(0);

      await expect(service.disableUser('admin-1', 'caller-1')).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('listUsers', () => {
    const makeUser = (id: string) => ({
      id,
      email: `${id}@example.com`,
      name: id,
      role: 'AUTHORIZED_USER',
      status: 'ACTIVE',
      last_login_at: null,
      created_at: new Date('2024-01-01'),
      _count: { memberships: 2 },
    });

    it('returns paginated data with defaults (page=1, limit=10)', async () => {
      const users = [makeUser('u1'), makeUser('u2')];
      prisma.user.findMany.mockResolvedValue(users);
      prisma.user.count.mockResolvedValue(12);

      const result = await service.listUsers({});

      expect(result.page).toBe(1);
      expect(result.total).toBe(12);
      expect(result.totalPages).toBe(2);
      expect(result.data).toHaveLength(2);
      expect(result.data[0]).toMatchObject({
        id: 'u1',
        email: 'u1@example.com',
        project_count: 2,
      });
      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 0, take: 10 }),
      );
    });

    it('applies page offset correctly', async () => {
      prisma.user.findMany.mockResolvedValue([]);
      prisma.user.count.mockResolvedValue(25);

      const result = await service.listUsers({ page: 3, limit: 10 });

      expect(result.page).toBe(3);
      expect(result.totalPages).toBe(3);
      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 20, take: 10 }),
      );
    });

    it('applies sortBy and sortDir when provided', async () => {
      prisma.user.findMany.mockResolvedValue([]);
      prisma.user.count.mockResolvedValue(0);

      await service.listUsers({ sortBy: 'name', sortDir: 'desc' });

      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ orderBy: { name: 'desc' } }),
      );
    });

    it('defaults sortDir to asc when sortBy is provided without sortDir', async () => {
      prisma.user.findMany.mockResolvedValue([]);
      prisma.user.count.mockResolvedValue(0);

      await service.listUsers({ sortBy: 'name' });

      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ orderBy: { name: 'asc' } }),
      );
    });

    it('falls back to created_at desc when no sortBy given', async () => {
      prisma.user.findMany.mockResolvedValue([]);
      prisma.user.count.mockResolvedValue(0);

      await service.listUsers({});

      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ orderBy: { created_at: 'desc' } }),
      );
    });

    it('returns totalPages 0 when total is 0', async () => {
      prisma.user.findMany.mockResolvedValue([]);
      prisma.user.count.mockResolvedValue(0);

      const result = await service.listUsers({});

      expect(result.totalPages).toBe(0);
    });

    describe('filters', () => {
      it('applies case-insensitive search on name and email via q', async () => {
        prisma.user.findMany.mockResolvedValue([]);
        prisma.user.count.mockResolvedValue(0);

        await service.listUsers({ q: 'alice' });

        const expectedWhere = {
          OR: [
            { name: { contains: 'alice', mode: 'insensitive' } },
            { email: { contains: 'alice', mode: 'insensitive' } },
          ],
        };
        expect(prisma.user.findMany).toHaveBeenCalledWith(
          expect.objectContaining({ where: expectedWhere }),
        );
        expect(prisma.user.count).toHaveBeenCalledWith({
          where: expectedWhere,
        });
      });

      it('treats empty-string q as no search', async () => {
        prisma.user.findMany.mockResolvedValue([]);
        prisma.user.count.mockResolvedValue(0);

        await service.listUsers({ q: '' });

        expect(prisma.user.findMany).toHaveBeenCalledWith(
          expect.objectContaining({ where: {} }),
        );
      });

      it('treats whitespace-only q as no search', async () => {
        prisma.user.findMany.mockResolvedValue([]);
        prisma.user.count.mockResolvedValue(0);

        await service.listUsers({ q: '   ' });

        expect(prisma.user.findMany).toHaveBeenCalledWith(
          expect.objectContaining({ where: {} }),
        );
      });

      it('applies role filter as Prisma `in`', async () => {
        prisma.user.findMany.mockResolvedValue([]);
        prisma.user.count.mockResolvedValue(0);

        await service.listUsers({
          role: [GlobalRole.ADMIN, GlobalRole.INTERNAL_USER],
        });

        expect(prisma.user.findMany).toHaveBeenCalledWith(
          expect.objectContaining({
            where: { role: { in: ['ADMIN', 'INTERNAL_USER'] } },
          }),
        );
      });

      it('applies status filter as Prisma `in`', async () => {
        prisma.user.findMany.mockResolvedValue([]);
        prisma.user.count.mockResolvedValue(0);

        await service.listUsers({ status: [UserStatus.INVITED] });

        expect(prisma.user.findMany).toHaveBeenCalledWith(
          expect.objectContaining({
            where: { status: { in: ['INVITED'] } },
          }),
        );
      });

      it('ignores empty role and status arrays', async () => {
        prisma.user.findMany.mockResolvedValue([]);
        prisma.user.count.mockResolvedValue(0);

        await service.listUsers({ role: [], status: [] });

        expect(prisma.user.findMany).toHaveBeenCalledWith(
          expect.objectContaining({ where: {} }),
        );
      });

      it('composes q + role + status into a single where clause', async () => {
        prisma.user.findMany.mockResolvedValue([]);
        prisma.user.count.mockResolvedValue(0);

        await service.listUsers({
          q: 'bob',
          role: [GlobalRole.ADMIN],
          status: [UserStatus.ACTIVE],
        });

        expect(prisma.user.findMany).toHaveBeenCalledWith(
          expect.objectContaining({
            where: {
              OR: [
                { name: { contains: 'bob', mode: 'insensitive' } },
                { email: { contains: 'bob', mode: 'insensitive' } },
              ],
              role: { in: ['ADMIN'] },
              status: { in: ['ACTIVE'] },
            },
          }),
        );
      });

      it('passes the same where to count and findMany so total reflects filtered rows', async () => {
        prisma.user.findMany.mockResolvedValue([]);
        prisma.user.count.mockResolvedValue(0);

        await service.listUsers({ q: 'x' });

        const findManyWhere = prisma.user.findMany.mock.calls[0][0].where;
        const countWhere = prisma.user.count.mock.calls[0][0].where;
        expect(findManyWhere).toEqual(countWhere);
      });
    });
  });

  describe('resendInvitation', () => {
    it('generates new token and sends email for INVITED user past cooldown', async () => {
      const fiveMinutesAgo = new Date(Date.now() - 6 * 60 * 1000);
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        email: 'invited@example.com',
        name: 'Invited User',
        status: 'INVITED',
        invitation_sent_at: fiveMinutesAgo,
      });
      prisma.user.update.mockResolvedValue({});

      const result = await service.resendInvitation('user-1');

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: expect.objectContaining({
          invitation_token_hash: expect.any(String),
          invitation_expires_at: expect.any(Date),
          invitation_sent_at: expect.any(Date),
        }),
      });
      expect(result).toEqual({ message: 'Invitation resent successfully' });
      expect(mail.sendInvitation).toHaveBeenCalledWith(
        'invited@example.com',
        'Invited User',
        expect.stringContaining('/invitation/'),
      );
    });

    it('allows resend when invitation_sent_at is null', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        email: 'old@example.com',
        name: 'Old User',
        status: 'INVITED',
        invitation_sent_at: null,
      });
      prisma.user.update.mockResolvedValue({});

      const result = await service.resendInvitation('user-1');
      expect(result).toEqual({ message: 'Invitation resent successfully' });
    });

    it('throws NotFoundException when user does not exist', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.resendInvitation('non-existent')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws BadRequestException when user is not in INVITED status', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        status: 'ACTIVE',
      });

      await expect(service.resendInvitation('user-1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws HttpException 429 when resend is within cooldown', async () => {
      const oneMinuteAgo = new Date(Date.now() - 1 * 60 * 1000);
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        status: 'INVITED',
        invitation_sent_at: oneMinuteAgo,
      });

      try {
        await service.resendInvitation('user-1');
        fail('Expected HttpException');
      } catch (err) {
        expect(err).toBeInstanceOf(HttpException);
        expect((err as HttpException).getStatus()).toBe(429);
      }
    });
  });
});
