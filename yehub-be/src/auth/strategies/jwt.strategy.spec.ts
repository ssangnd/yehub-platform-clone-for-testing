import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GlobalRole, UserStatus } from '../../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { SESSION_IDLE_TIMEOUT_MS } from '../auth.constants';
import { JwtStrategy } from './jwt.strategy';

describe('JwtStrategy.validate (stateful)', () => {
  let strategy: JwtStrategy;
  let prisma: { session: { findFirst: jest.Mock } };

  const payload = {
    sub: 'user-1',
    sessionId: 'session-1',
    email: 'u@example.com',
    role: GlobalRole.AUTHORIZED_USER,
  };

  beforeEach(() => {
    prisma = { session: { findFirst: jest.fn() } };
    const config = {
      getOrThrow: jest.fn().mockReturnValue('test-secret'),
    } as unknown as ConfigService;
    strategy = new JwtStrategy(prisma as unknown as PrismaService, config);
  });

  it('returns user context when session is valid and user is active', async () => {
    prisma.session.findFirst.mockResolvedValue({
      id: 'session-1',
      user: {
        id: 'user-1',
        email: 'u@example.com',
        role: GlobalRole.AUTHORIZED_USER,
        status: UserStatus.ACTIVE,
      },
    });

    const result = await strategy.validate(payload);

    expect(result).toEqual({
      id: 'user-1',
      sessionId: 'session-1',
      email: 'u@example.com',
      role: GlobalRole.AUTHORIZED_USER,
    });
    const call = prisma.session.findFirst.mock.calls[0][0];
    expect(call.where.id).toBe('session-1');
    expect(call.where.user_id).toBe('user-1');
    expect(call.where.last_active_at.gt).toBeInstanceOf(Date);
    const cutoff = call.where.last_active_at.gt as Date;
    const expected = Date.now() - SESSION_IDLE_TIMEOUT_MS;
    expect(Math.abs(cutoff.getTime() - expected)).toBeLessThan(1000);
  });

  it('throws when the session row is missing (revoked)', async () => {
    prisma.session.findFirst.mockResolvedValue(null);
    await expect(strategy.validate(payload)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('throws when last_active_at is older than the idle window', async () => {
    // Simulated by the prisma query returning null for the stale row;
    // the where clause enforces the time filter.
    prisma.session.findFirst.mockResolvedValue(null);
    await expect(strategy.validate(payload)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('throws when the user is not ACTIVE', async () => {
    prisma.session.findFirst.mockResolvedValue({
      id: 'session-1',
      user: {
        id: 'user-1',
        email: 'u@example.com',
        role: GlobalRole.AUTHORIZED_USER,
        status: UserStatus.INACTIVE,
      },
    });
    await expect(strategy.validate(payload)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});
