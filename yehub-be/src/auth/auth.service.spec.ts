import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';

jest.mock('bcrypt', () => ({
  compare: jest.fn(),
  hash: jest.fn(),
}));

jest.mock('./session.util', () => ({
  extractSessionMetadata: jest.fn().mockReturnValue({
    deviceName: 'Chrome 125',
    osName: 'macOS 15.1',
    ipAddress: '192.168.1.1',
    location: 'Ho Chi Minh City, VN',
  }),
}));

describe('AuthService', () => {
  let service: AuthService;
  let prisma: {
    user: {
      findUnique: jest.Mock;
      findUniqueOrThrow: jest.Mock;
      findMany: jest.Mock;
      update: jest.Mock;
    };
    session: {
      create: jest.Mock;
      findUnique: jest.Mock;
      findMany: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
      deleteMany: jest.Mock;
    };
    $transaction: jest.Mock;
  };
  let jwtService: { sign: jest.Mock; verify: jest.Mock };
  let config: { get: jest.Mock; getOrThrow: jest.Mock };
  let mail: { sendPasswordReset: jest.Mock };

  const mockSession = {
    id: 'session-1',
    user_id: 'u1',
    refresh_token_hash: 'hashed-token',
    device_name: 'Chrome 125',
    os_name: 'macOS 15.1',
    ip_address: '192.168.1.1',
    location: 'Ho Chi Minh City, VN',
    last_active_at: new Date(),
    created_at: new Date(),
  };

  const mockUser = {
    id: 'u1',
    email: 'alice@example.com',
    name: 'Alice',
    password_hash: 'hashed-password',
    status: 'ACTIVE',
    role: 'AUTHORIZED_USER',
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    prisma = {
      user: {
        findUnique: jest.fn(),
        findUniqueOrThrow: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
      },
      session: {
        create: jest.fn().mockResolvedValue(mockSession),
        findUnique: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        deleteMany: jest.fn(),
      },
      $transaction: jest
        .fn()
        .mockImplementation(async (ops: Promise<unknown>[]) =>
          Promise.all(ops),
        ),
    };
    jwtService = {
      sign: jest.fn().mockReturnValue('fake-token'),
      verify: jest.fn(),
    };
    config = {
      get: jest.fn().mockReturnValue('http://localhost:5173'),
      getOrThrow: jest.fn().mockReturnValue('jwt-secret'),
    };
    mail = { sendPasswordReset: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        { provide: JwtService, useValue: jwtService },
        { provide: ConfigService, useValue: config },
        { provide: MailService, useValue: mail },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  describe('login', () => {
    it('creates a session and returns tokens on valid credentials', async () => {
      prisma.user.findUnique.mockResolvedValue(mockUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      (bcrypt.hash as jest.Mock).mockResolvedValue('hashed');
      prisma.session.create.mockResolvedValue(mockSession);
      prisma.session.update.mockResolvedValue(mockSession);
      prisma.user.update.mockResolvedValue(mockUser);

      const result = await service.login(
        { email: 'alice@example.com', password: 'password123' },
        'Mozilla/5.0',
        '192.168.1.1',
      );

      expect(prisma.session.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            user_id: 'u1',
            device_name: 'Chrome 125',
            os_name: 'macOS 15.1',
            ip_address: '192.168.1.1',
            location: 'Ho Chi Minh City, VN',
          }),
        }),
      );
      expect(result).toHaveProperty('access_token');
      expect(result).toHaveProperty('refresh_token');
    });

    it('throws UnauthorizedException for invalid credentials', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(
        service.login({ email: 'bad@example.com', password: 'wrong' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException with locked:true when user account is locked (INACTIVE)', async () => {
      prisma.user.findUnique.mockResolvedValue({
        ...mockUser,
        status: 'INACTIVE',
      });

      try {
        await service.login({
          email: 'alice@example.com',
          password: 'password123',
        });
        fail('expected login to throw');
      } catch (err) {
        expect(err).toBeInstanceOf(UnauthorizedException);
        expect((err as UnauthorizedException).getResponse()).toEqual(
          expect.objectContaining({ locked: true }),
        );
      }
    });

    it('increments failed_login_attempts on wrong password and returns attempts_remaining', async () => {
      const user = {
        id: 'user-1',
        email: 'u@example.com',
        password_hash: 'correct-hash',
        status: 'ACTIVE',
        failed_login_attempts: 2,
        role: 'USER',
      };
      prisma.user.findUnique.mockResolvedValue(user);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);
      prisma.user.update.mockResolvedValue({
        ...user,
        failed_login_attempts: 3,
      });

      try {
        await service.login({ email: 'u@example.com', password: 'wrong' });
        fail('expected login to throw');
      } catch (err) {
        expect(err).toBeInstanceOf(UnauthorizedException);
        expect((err as UnauthorizedException).getResponse()).toEqual(
          expect.objectContaining({ attempts_remaining: 2 }),
        );
      }

      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'user-1' },
          data: { failed_login_attempts: { increment: 1 } },
        }),
      );
    });

    it('locks the account on the 5th consecutive wrong password', async () => {
      const user = {
        id: 'user-1',
        email: 'u@example.com',
        password_hash: 'correct-hash',
        status: 'ACTIVE',
        failed_login_attempts: 4,
        role: 'USER',
      };
      prisma.user.findUnique.mockResolvedValue(user);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);
      prisma.user.update.mockResolvedValue({
        ...user,
        failed_login_attempts: 5,
      });

      try {
        await service.login({ email: 'u@example.com', password: 'wrong' });
        fail('expected login to throw');
      } catch (err) {
        expect(err).toBeInstanceOf(UnauthorizedException);
        expect((err as UnauthorizedException).getResponse()).toEqual(
          expect.objectContaining({ locked: true }),
        );
      }

      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'user-1' },
          data: expect.objectContaining({
            status: 'INACTIVE',
            locked_reason: 'too_many_failed_attempts',
          }),
        }),
      );
      expect(prisma.session.deleteMany).toHaveBeenCalledWith({
        where: { user_id: 'user-1' },
      });
    });

    it('rejects login for an already-locked account without touching the counter', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        email: 'u@example.com',
        password_hash: 'correct-hash',
        status: 'INACTIVE',
        failed_login_attempts: 5,
        role: 'USER',
      });

      try {
        await service.login({ email: 'u@example.com', password: 'any' });
        fail('expected login to throw');
      } catch (err) {
        expect(err).toBeInstanceOf(UnauthorizedException);
        expect((err as UnauthorizedException).getResponse()).toEqual(
          expect.objectContaining({ locked: true }),
        );
      }

      expect(prisma.user.update).not.toHaveBeenCalled();
      expect(bcrypt.compare).not.toHaveBeenCalled();
    });

    it('resets failed_login_attempts to 0 on successful login', async () => {
      const user = {
        ...mockUser,
        failed_login_attempts: 3,
      };
      prisma.user.findUnique.mockResolvedValue(user);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      (bcrypt.hash as jest.Mock).mockResolvedValue('hashed');
      prisma.session.create.mockResolvedValue(mockSession);
      prisma.session.update.mockResolvedValue(mockSession);
      prisma.user.update.mockResolvedValue(user);

      await service.login(
        { email: 'alice@example.com', password: 'password123' },
        'Mozilla/5.0',
        '192.168.1.1',
      );

      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'u1' },
          data: expect.objectContaining({ failed_login_attempts: 0 }),
        }),
      );
    });

    it('returns generic error with no counter update for a non-existent email', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(
        service.login({ email: 'nobody@example.com', password: 'whatever' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);

      expect(prisma.user.update).not.toHaveBeenCalled();
    });
  });

  describe('refreshToken', () => {
    it('returns new access token and updates last_active_at', async () => {
      jwtService.verify.mockReturnValue({
        sub: 'u1',
        sessionId: 'session-1',
        email: 'alice@example.com',
      });
      prisma.session.findUnique.mockResolvedValue({
        ...mockSession,
        user: mockUser,
      });
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      prisma.session.update.mockResolvedValue(mockSession);

      const result = await service.refreshToken('valid-refresh-token');

      expect(prisma.session.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'session-1' },
        }),
      );
      expect(result).toHaveProperty('access_token');
    });

    it('throws UnauthorizedException when session not found (revoked)', async () => {
      jwtService.verify.mockReturnValue({
        sub: 'u1',
        sessionId: 'deleted-session',
        email: 'alice@example.com',
      });
      prisma.session.findUnique.mockResolvedValue(null);

      await expect(service.refreshToken('revoked-token')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('throws and deletes the session when last_active_at is older than 1 hour', async () => {
      const staleDate = new Date(Date.now() - 61 * 60 * 1000); // 61 minutes ago
      const session = {
        id: 'session-1',
        user_id: 'user-1',
        refresh_token_hash: 'hashed',
        last_active_at: staleDate,
        user: { id: 'user-1', status: 'ACTIVE' },
      };
      jwtService.verify.mockReturnValue({
        sub: 'user-1',
        sessionId: 'session-1',
      });
      prisma.session.findUnique.mockResolvedValue(session);
      prisma.session.delete.mockResolvedValue(session);

      await expect(service.refreshToken('any')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );

      expect(prisma.session.delete).toHaveBeenCalledWith({
        where: { id: 'session-1' },
      });
    });
  });

  describe('logout', () => {
    it('deletes the current session', async () => {
      prisma.session.deleteMany.mockResolvedValue({ count: 1 });

      const result = await service.logout('session-1');

      expect(prisma.session.deleteMany).toHaveBeenCalledWith({
        where: { id: 'session-1' },
      });
      expect(result).toEqual({ message: 'Logged out successfully' });
    });
  });

  describe('getSessions', () => {
    it('returns sessions with is_current flag', async () => {
      prisma.session.findMany.mockResolvedValue([
        { ...mockSession, id: 'session-1' },
        { ...mockSession, id: 'session-2' },
      ]);

      const result = await service.getSessions('u1', 'session-1');

      expect(result).toHaveLength(2);
      expect(result[0].is_current).toBe(true);
      expect(result[1].is_current).toBe(false);
    });
  });

  describe('revokeSession', () => {
    it('deletes a specific other session', async () => {
      prisma.session.findUnique.mockResolvedValue({
        ...mockSession,
        id: 'session-2',
        user_id: 'u1',
      });
      prisma.session.delete.mockResolvedValue({});

      const result = await service.revokeSession(
        'u1',
        'session-2',
        'session-1',
      );

      expect(prisma.session.delete).toHaveBeenCalledWith({
        where: { id: 'session-2' },
      });
      expect(result).toEqual({ message: 'Session revoked' });
    });

    it('throws when trying to revoke current session', async () => {
      await expect(
        service.revokeSession('u1', 'session-1', 'session-1'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('throws when session not found or belongs to another user', async () => {
      prisma.session.findUnique.mockResolvedValue(null);

      await expect(
        service.revokeSession('u1', 'nonexistent', 'session-1'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('revokeAllOtherSessions', () => {
    it('deletes all sessions except current', async () => {
      prisma.session.deleteMany.mockResolvedValue({ count: 3 });

      const result = await service.revokeAllOtherSessions('u1', 'session-1');

      expect(prisma.session.deleteMany).toHaveBeenCalledWith({
        where: { user_id: 'u1', id: { not: 'session-1' } },
      });
      expect(result).toEqual({ message: 'All other sessions revoked' });
    });
  });

  describe('forgotPassword', () => {
    it('returns generic message when user not found', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      const result = await service.forgotPassword('unknown@example.com');

      expect(result).toEqual({
        message: 'If that email exists, a reset link has been sent.',
      });
      expect(mail.sendPasswordReset).not.toHaveBeenCalled();
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('returns generic message and does not send email when user is inactive', async () => {
      prisma.user.findUnique.mockResolvedValue({
        ...mockUser,
        status: 'INACTIVE',
      });

      const result = await service.forgotPassword('alice@example.com');

      expect(result).toEqual({
        message: 'If that email exists, a reset link has been sent.',
      });
      expect(mail.sendPasswordReset).not.toHaveBeenCalled();
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('stores a fresh selector + verifier hash and sends email when user exists and is active', async () => {
      prisma.user.findUnique.mockResolvedValue(mockUser);
      prisma.user.update.mockResolvedValue(mockUser);

      const result = await service.forgotPassword('alice@example.com');

      expect(result).toEqual({
        message: 'If that email exists, a reset link has been sent.',
      });
      expect(prisma.user.update).toHaveBeenCalledTimes(1);
      const updateCall = prisma.user.update.mock.calls[0][0] as {
        where: { id: string };
        data: {
          reset_token_selector: string;
          reset_token_hash: string;
          reset_token_expires_at: Date;
        };
      };
      expect(updateCall.where).toEqual({ id: 'u1' });
      expect(updateCall.data.reset_token_selector).toMatch(/^[a-f0-9]{16}$/);
      expect(updateCall.data.reset_token_hash).toMatch(/^[a-f0-9]{64}$/);
      expect(updateCall.data.reset_token_expires_at).toBeInstanceOf(Date);
      expect(mail.sendPasswordReset).toHaveBeenCalledTimes(1);
      const mailArgs = mail.sendPasswordReset.mock.calls[0] as [
        string,
        string,
        string,
      ];
      expect(mailArgs[0]).toBe('alice@example.com');
      expect(mailArgs[1]).toBe('Alice');
      expect(mailArgs[2]).toMatch(
        /^http:\/\/localhost:5173\/reset-password\?token=[a-f0-9]{16}\.[a-f0-9]{64}$/,
      );
    });

    it('overwrites the previous selector + hash on each new request', async () => {
      prisma.user.findUnique.mockResolvedValue(mockUser);
      prisma.user.update.mockResolvedValue(mockUser);

      await service.forgotPassword('alice@example.com');
      await service.forgotPassword('alice@example.com');

      expect(prisma.user.update).toHaveBeenCalledTimes(2);
      const firstUpdate = prisma.user.update.mock.calls[0][0] as {
        data: { reset_token_selector: string; reset_token_hash: string };
      };
      const secondUpdate = prisma.user.update.mock.calls[1][0] as {
        data: { reset_token_selector: string; reset_token_hash: string };
      };
      expect(firstUpdate.data.reset_token_selector).not.toBe(
        secondUpdate.data.reset_token_selector,
      );
      expect(firstUpdate.data.reset_token_hash).not.toBe(
        secondUpdate.data.reset_token_hash,
      );
    });
  });

  describe('resetPassword', () => {
    const selector = 'a'.repeat(16);
    const verifier = 'b'.repeat(64);
    const verifierHash = crypto
      .createHash('sha256')
      .update(verifier)
      .digest('hex');

    it('throws UnauthorizedException when token has no selector/verifier split', async () => {
      await expect(
        service.resetPassword('no-dot-token', 'newPassword123'),
      ).rejects.toThrow(UnauthorizedException);
      expect(prisma.user.findUnique).not.toHaveBeenCalled();
    });

    it('throws UnauthorizedException when selector does not match any user', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(
        service.resetPassword(`${selector}.${verifier}`, 'newPassword123'),
      ).rejects.toThrow(UnauthorizedException);
      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { reset_token_selector: selector },
      });
    });

    it('throws UnauthorizedException when reset token has expired', async () => {
      prisma.user.findUnique.mockResolvedValue({
        ...mockUser,
        reset_token_hash: verifierHash,
        reset_token_expires_at: new Date(Date.now() - 1_000),
      });

      await expect(
        service.resetPassword(`${selector}.${verifier}`, 'newPassword123'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException when verifier hash does not match', async () => {
      prisma.user.findUnique.mockResolvedValue({
        ...mockUser,
        reset_token_hash: crypto
          .createHash('sha256')
          .update('different-verifier')
          .digest('hex'),
        reset_token_expires_at: new Date(Date.now() + 60_000),
      });

      await expect(
        service.resetPassword(`${selector}.${verifier}`, 'newPassword123'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('updates password, clears reset token fields, and deletes all sessions on success', async () => {
      prisma.user.findUnique.mockResolvedValue({
        ...mockUser,
        reset_token_hash: verifierHash,
        reset_token_expires_at: new Date(Date.now() + 60_000),
      });
      (bcrypt.hash as jest.Mock).mockResolvedValue('new-password-hash');
      prisma.user.update.mockResolvedValue(mockUser);
      prisma.session.deleteMany.mockResolvedValue({ count: 2 });

      const result = await service.resetPassword(
        `${selector}.${verifier}`,
        'newPassword123',
      );

      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'u1' },
          data: expect.objectContaining({
            password_hash: 'new-password-hash',
            reset_token_selector: null,
            reset_token_hash: null,
            reset_token_expires_at: null,
          }),
        }),
      );
      expect(prisma.session.deleteMany).toHaveBeenCalledWith({
        where: { user_id: 'u1' },
      });
      expect(result).toEqual({ message: 'Password reset successfully' });
    });
  });

  describe('changePassword', () => {
    it('updates password and deletes other sessions', async () => {
      prisma.user.findUniqueOrThrow.mockResolvedValue(mockUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      (bcrypt.hash as jest.Mock).mockResolvedValue('new-hash');
      prisma.user.update.mockResolvedValue(mockUser);
      prisma.session.deleteMany.mockResolvedValue({ count: 2 });

      const result = await service.changePassword(
        'u1',
        { current_password: 'old', new_password: 'newpass123' },
        'session-1',
      );

      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ password_hash: 'new-hash' }),
        }),
      );
      expect(prisma.session.deleteMany).toHaveBeenCalledWith({
        where: { user_id: 'u1', id: { not: 'session-1' } },
      });
      expect(result).toEqual({ message: 'Password changed successfully' });
    });

    it('throws UnauthorizedException when current password is wrong', async () => {
      prisma.user.findUniqueOrThrow.mockResolvedValue(mockUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(
        service.changePassword(
          'u1',
          { current_password: 'wrong', new_password: 'newpass123' },
          'session-1',
        ),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('resets failed_login_attempts on successful password change', async () => {
      prisma.user.findUniqueOrThrow.mockResolvedValue({
        id: 'user-1',
        password_hash: 'old-hash',
        failed_login_attempts: 3,
      });
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      (bcrypt.hash as jest.Mock).mockResolvedValue('new-hash');
      prisma.user.update.mockResolvedValue({});

      await service.changePassword(
        'user-1',
        { current_password: 'old', new_password: 'newpass123' },
        'session-1',
      );

      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'user-1' },
          data: expect.objectContaining({
            password_hash: 'new-hash',
            failed_login_attempts: 0,
          }),
        }),
      );
    });
  });

  describe('updateProfile', () => {
    it('deletes other sessions when email changes', async () => {
      prisma.user.findUniqueOrThrow.mockResolvedValue({
        email: 'old@example.com',
      });
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.update.mockResolvedValue({
        ...mockUser,
        email: 'new@example.com',
      });
      prisma.session.deleteMany.mockResolvedValue({ count: 2 });

      await service.updateProfile(
        'u1',
        { name: 'John', email: 'new@example.com' },
        'session-1',
      );

      expect(prisma.session.deleteMany).toHaveBeenCalledWith({
        where: { user_id: 'u1', id: { not: 'session-1' } },
      });
    });

    it('does not delete sessions when email is unchanged', async () => {
      prisma.user.findUniqueOrThrow.mockResolvedValue({
        email: 'old@example.com',
      });
      prisma.user.update.mockResolvedValue(mockUser);

      await service.updateProfile(
        'u1',
        { name: 'John', email: 'old@example.com' },
        'session-1',
      );

      expect(prisma.session.deleteMany).not.toHaveBeenCalled();
    });
  });
});
