# Session Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single `refresh_token_hash` on User with a Session table supporting multi-device login, per-device logout, session visibility, and cross-tab sync.

**Architecture:** New `Session` Prisma model stores per-device refresh token hashes with device metadata. JWT payloads gain a `sessionId` claim. Backend CRUD on sessions, frontend Zustand `storage` event for tab sync, new sessions UI in Account Settings.

**Tech Stack:** NestJS 11, Prisma 7, PostgreSQL, ua-parser-js, geoip-lite, React, Zustand, TanStack React Query, shadcn/ui

---

## File Map

### Backend — Create
- `yehub-be/src/auth/dto/revoke-session.dto.ts` — DTO for single session revocation param
- `yehub-be/src/auth/session.util.ts` — helper to parse UA + geolocate IP

### Backend — Modify
- `yehub-be/prisma/schema.prisma` — add Session model, remove `refresh_token_hash` from User
- `yehub-be/src/auth/auth.service.ts` — refactor login/refresh/logout, add session CRUD methods
- `yehub-be/src/auth/auth.controller.ts` — add session endpoints, pass `Req` for UA/IP
- `yehub-be/src/auth/strategies/jwt.strategy.ts` — add `sessionId` to JwtPayload
- `yehub-be/src/auth/decorators/current-user.decorator.ts` — add `sessionId` to JwtUser
- `yehub-be/src/auth/auth.module.ts` — no structural changes needed
- `yehub-be/src/auth/auth.service.spec.ts` — rewrite tests for session-based auth

### Frontend — Create
- `yehub-fe/src/components/guest-only.tsx` — active session guard for public auth pages
- `yehub-fe/src/pages/MyAccountPage/SessionsCard.tsx` — sessions list UI

### Frontend — Modify
- `yehub-fe/src/store/auth.store.ts` — add cross-tab `storage` event listener
- `yehub-fe/src/api/auth.ts` — add session API methods
- `yehub-fe/src/lib/constants/query-keys.ts` — add `sessions` key
- `yehub-fe/src/pages/MyAccountPage/index.tsx` — render SessionsCard
- `yehub-fe/src/router.tsx` — wrap public auth routes with GuestOnly

---

## Task 1: Install backend dependencies

**Files:**
- Modify: `yehub-be/package.json`

- [ ] **Step 1: Install ua-parser-js and geoip-lite**

```bash
cd yehub-be && pnpm add ua-parser-js geoip-lite && pnpm add -D @types/ua-parser-js @types/geoip-lite
```

- [ ] **Step 2: Verify installation**

Run: `cd yehub-be && node -e "require('ua-parser-js'); require('geoip-lite'); console.log('OK')"`
Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add yehub-be/package.json yehub-be/pnpm-lock.yaml
git commit -m "chore: add ua-parser-js and geoip-lite for session management"
```

---

## Task 2: Prisma schema — add Session model, remove refresh_token_hash

**Files:**
- Modify: `yehub-be/prisma/schema.prisma:69-92`

- [ ] **Step 1: Add Session model and update User model**

In `yehub-be/prisma/schema.prisma`, add the Session model after the User model and update User:

```prisma
model User {
  id                     String      @id @default(uuid()) @db.Uuid
  email                  String      @unique
  password_hash          String?
  name                   String
  avatar                 String?
  role                   GlobalRole  @default(AUTHORIZED_USER)
  status                 UserStatus  @default(ACTIVE)
  invited_by             String?     @db.Uuid
  invitation_token_hash  String?
  invitation_expires_at  DateTime?
  invitation_accepted_at DateTime?
  invitation_sent_at     DateTime?
  last_login_at          DateTime?
  created_at             DateTime    @default(now())
  updated_at             DateTime    @updatedAt

  memberships ProjectMembership[]
  sessions    Session[]

  @@index([status])
  @@index([invitation_token_hash])
  @@map("users")
}

model Session {
  id                 String   @id @default(uuid()) @db.Uuid
  user_id            String   @db.Uuid
  refresh_token_hash String
  device_name        String
  os_name            String
  ip_address         String
  location           String?
  last_active_at     DateTime @default(now())
  created_at         DateTime @default(now())

  user User @relation(fields: [user_id], references: [id], onDelete: Cascade)

  @@index([user_id])
  @@map("sessions")
}
```

Key changes to User: removed `refresh_token_hash` field, added `sessions Session[]` relation.

- [ ] **Step 2: Generate migration**

```bash
cd yehub-be && pnpm prisma:migrate --name add_sessions_table
```

This creates the `sessions` table and drops the `refresh_token_hash` column from `users`.

- [ ] **Step 3: Regenerate Prisma client**

```bash
cd yehub-be && pnpm prisma:generate
```

- [ ] **Step 4: Commit**

```bash
git add yehub-be/prisma/
git commit -m "feat: add Session model and remove refresh_token_hash from User"
```

---

## Task 3: Session utility — UA parsing and IP geolocation

**Files:**
- Create: `yehub-be/src/auth/session.util.ts`

- [ ] **Step 1: Create the session utility**

Create `yehub-be/src/auth/session.util.ts`:

```typescript
import { UAParser } from 'ua-parser-js';
import geoip from 'geoip-lite';

export interface SessionMetadata {
  deviceName: string;
  osName: string;
  ipAddress: string;
  location: string | null;
}

export function extractSessionMetadata(
  userAgent: string | undefined,
  ip: string | undefined,
): SessionMetadata {
  const parser = new UAParser(userAgent ?? '');
  const browser = parser.getBrowser();
  const os = parser.getOS();

  const deviceName = browser.name
    ? `${browser.name} ${browser.version ?? ''}`.trim()
    : 'Unknown Browser';

  const osName = os.name
    ? `${os.name} ${os.version ?? ''}`.trim()
    : 'Unknown OS';

  const ipAddress = ip ?? 'unknown';

  let location: string | null = null;
  if (ipAddress && ipAddress !== 'unknown') {
    const geo = geoip.lookup(ipAddress);
    if (geo) {
      location = [geo.city, geo.country].filter(Boolean).join(', ');
    }
  }

  return { deviceName, osName, ipAddress, location };
}
```

- [ ] **Step 2: Commit**

```bash
git add yehub-be/src/auth/session.util.ts
git commit -m "feat: add session metadata utility for UA parsing and geolocation"
```

---

## Task 4: Update JWT payload — strategy and decorator

**Files:**
- Modify: `yehub-be/src/auth/strategies/jwt.strategy.ts:8-12, 27-37`
- Modify: `yehub-be/src/auth/decorators/current-user.decorator.ts:4-8`

- [ ] **Step 1: Add sessionId to JwtPayload and validate return**

In `yehub-be/src/auth/strategies/jwt.strategy.ts`, update the `JwtPayload` interface and `validate()`:

```typescript
export interface JwtPayload {
  sub: string;
  sessionId: string;
  email: string;
  role: GlobalRole;
}
```

Update the `validate` method return to include `sessionId`:

```typescript
  async validate(payload: JwtPayload) {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
    });

    if (!user || user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException();
    }

    return {
      id: user.id,
      sessionId: payload.sessionId,
      email: user.email,
      role: user.role,
    };
  }
```

- [ ] **Step 2: Add sessionId to JwtUser**

In `yehub-be/src/auth/decorators/current-user.decorator.ts`, update the `JwtUser` interface:

```typescript
export interface JwtUser {
  id: string;
  sessionId: string;
  email: string;
  role: GlobalRole;
}
```

- [ ] **Step 3: Commit**

```bash
git add yehub-be/src/auth/strategies/jwt.strategy.ts yehub-be/src/auth/decorators/current-user.decorator.ts
git commit -m "feat: add sessionId to JWT payload and user decorator"
```

---

## Task 5: Refactor auth service — login, refresh, logout, sessions

**Files:**
- Modify: `yehub-be/src/auth/auth.service.ts`

This is the core refactor. All methods that touch `refresh_token_hash` on User must switch to the Session table.

- [ ] **Step 1: Update imports and add session utility import**

At the top of `yehub-be/src/auth/auth.service.ts`, add:

```typescript
import { extractSessionMetadata } from './session.util';
```

- [ ] **Step 2: Refactor login method**

Replace the `login` method (lines 32-67) with:

```typescript
  async login(dto: LoginDto, userAgent?: string, ip?: string) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (!user || user.status !== UserStatus.ACTIVE || !user.password_hash) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const passwordValid = await bcrypt.compare(
      dto.password,
      user.password_hash,
    );
    if (!passwordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const metadata = extractSessionMetadata(userAgent, ip);

    const refreshToken = this.jwtService.sign(
      { sub: user.id, email: user.email, role: user.role, sessionId: 'pending' },
      {
        secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
        expiresIn: REFRESH_TOKEN_EXPIRY,
      },
    );

    const refreshTokenHash = await bcrypt.hash(refreshToken, BCRYPT_ROUNDS);

    const session = await this.prisma.session.create({
      data: {
        user_id: user.id,
        refresh_token_hash: refreshTokenHash,
        device_name: metadata.deviceName,
        os_name: metadata.osName,
        ip_address: metadata.ipAddress,
        location: metadata.location,
      },
    });

    // Re-sign tokens with the real sessionId
    const payload = {
      sub: user.id,
      sessionId: session.id,
      email: user.email,
      role: user.role,
    };

    const accessToken = this.jwtService.sign(payload, {
      expiresIn: ACCESS_TOKEN_EXPIRY,
    });

    const finalRefreshToken = this.jwtService.sign(payload, {
      secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
      expiresIn: REFRESH_TOKEN_EXPIRY,
    });

    const finalRefreshTokenHash = await bcrypt.hash(finalRefreshToken, BCRYPT_ROUNDS);
    await this.prisma.session.update({
      where: { id: session.id },
      data: { refresh_token_hash: finalRefreshTokenHash },
    });

    await this.prisma.user.update({
      where: { id: user.id },
      data: { last_login_at: new Date() },
    });

    return { access_token: accessToken, refresh_token: finalRefreshToken };
  }
```

- [ ] **Step 3: Refactor refreshToken method**

Replace the `refreshToken` method (lines 69-106) with:

```typescript
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
```

- [ ] **Step 4: Refactor logout method**

Replace the `logout` method (lines 233-239) with:

```typescript
  async logout(sessionId: string) {
    await this.prisma.session.deleteMany({
      where: { id: sessionId },
    });
    return { message: 'Logged out successfully' };
  }
```

- [ ] **Step 5: Update changePassword to delete other sessions**

In the `changePassword` method (lines 145-169), after updating the password, add session cleanup. Replace the final `return` block:

```typescript
    const passwordHash = await bcrypt.hash(dto.new_password, BCRYPT_ROUNDS);
    await this.prisma.user.update({
      where: { id: userId },
      data: { password_hash: passwordHash },
    });

    if (currentSessionId) {
      await this.prisma.session.deleteMany({
        where: { user_id: userId, id: { not: currentSessionId } },
      });
    }

    return { message: 'Password changed successfully' };
```

Update the method signature to accept `currentSessionId`:

```typescript
  async changePassword(userId: string, dto: ChangePasswordDto, currentSessionId?: string) {
```

- [ ] **Step 6: Update resetPassword to delete all sessions**

In the `resetPassword` method, after updating the password (the `prisma.user.update` call), add:

```typescript
    await this.prisma.session.deleteMany({
      where: { user_id: user.id },
    });
```

And remove `refresh_token_hash: null` from the user update data (the field no longer exists):

```typescript
    await this.prisma.user.update({
      where: { id: user.id },
      data: { password_hash: passwordHash },
    });
```

- [ ] **Step 7: Update updateProfile to delete all sessions on email change**

In the `updateProfile` method, the current code sets `refresh_token_hash: null` on email change. Replace that with session deletion:

```typescript
  async updateProfile(userId: string, dto: UpdateProfileDto, currentSessionId?: string) {
    if (dto.email) {
      const existing = await this.prisma.user.findUnique({
        where: { email: dto.email },
      });
      if (existing && existing.id !== userId) {
        throw new ConflictException('Email already in use');
      }
    }

    const user = await this.prisma.user.update({
      where: { id: userId },
      data: dto,
    });

    if (dto.email && currentSessionId) {
      await this.prisma.session.deleteMany({
        where: { user_id: userId, id: { not: currentSessionId } },
      });
    }

    const {
      password_hash: _ph,
      invitation_token_hash: _ith,
      ...result
    } = user;
    return result;
  }
```

Note: the destructured exclusion of `refresh_token_hash` must be removed since the field no longer exists on User.

- [ ] **Step 8: Also update getMe to remove refresh_token_hash exclusion**

In the `getMe` method, remove the `refresh_token_hash` destructure since the field no longer exists:

```typescript
  async getMe(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.status !== UserStatus.ACTIVE)
      throw new NotFoundException('User not found');
    const {
      password_hash: _ph,
      invitation_token_hash: _ith,
      ...result
    } = user;
    return result;
  }
```

- [ ] **Step 9: Add session management methods**

Add these new methods to the `AuthService` class:

```typescript
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

  async revokeSession(userId: string, sessionId: string, currentSessionId: string) {
    if (sessionId === currentSessionId) {
      throw new UnauthorizedException('Cannot revoke current session. Use logout instead.');
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
```

- [ ] **Step 10: Commit**

```bash
git add yehub-be/src/auth/auth.service.ts
git commit -m "feat: refactor auth service for session-based token management"
```

---

## Task 6: Update auth controller — wire new endpoints

**Files:**
- Modify: `yehub-be/src/auth/auth.controller.ts`

- [ ] **Step 1: Update login endpoint to pass UA and IP**

Add `@Req()` to the login handler and pass user-agent and IP:

```typescript
import { Request } from 'express';
```

Update the login method:

```typescript
  @Post('login')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  login(@Body() dto: LoginDto, @Req() req: Request) {
    return this.authService.login(
      dto,
      req.headers['user-agent'],
      req.ip,
    );
  }
```

- [ ] **Step 2: Update logout endpoint to use sessionId**

```typescript
  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  logout(@CurrentUser() user: JwtUser) {
    return this.authService.logout(user.sessionId);
  }
```

- [ ] **Step 3: Update changePassword to pass sessionId**

```typescript
  @Patch('me/password')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  changePassword(
    @CurrentUser() user: JwtUser,
    @Body() dto: ChangePasswordDto,
  ) {
    return this.authService.changePassword(user.id, dto, user.sessionId);
  }
```

- [ ] **Step 4: Update updateProfile to pass sessionId**

```typescript
  @Patch('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  updateProfile(
    @CurrentUser() user: JwtUser,
    @Body() dto: UpdateProfileDto,
  ) {
    return this.authService.updateProfile(user.id, dto, user.sessionId);
  }
```

- [ ] **Step 5: Add session management endpoints**

Add these new endpoints to the controller:

```typescript
  @Get('sessions')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  getSessions(@CurrentUser() user: JwtUser) {
    return this.authService.getSessions(user.id, user.sessionId);
  }

  @Delete('sessions/:sessionId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  revokeSession(
    @CurrentUser() user: JwtUser,
    @Param('sessionId') sessionId: string,
  ) {
    return this.authService.revokeSession(user.id, sessionId, user.sessionId);
  }

  @Delete('sessions')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  revokeAllOtherSessions(@CurrentUser() user: JwtUser) {
    return this.authService.revokeAllOtherSessions(user.id, user.sessionId);
  }
```

Add `Delete` and `Param` to the `@nestjs/common` imports if not already present.

- [ ] **Step 6: Commit**

```bash
git add yehub-be/src/auth/auth.controller.ts
git commit -m "feat: add session management endpoints to auth controller"
```

---

## Task 7: Update auth service unit tests

**Files:**
- Modify: `yehub-be/src/auth/auth.service.spec.ts`

- [ ] **Step 1: Rewrite test file for session-based auth**

Replace the entire test file with:

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';

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
    user: { findUnique: jest.Mock; update: jest.Mock };
    session: {
      create: jest.Mock;
      findUnique: jest.Mock;
      findMany: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
      deleteMany: jest.Mock;
    };
  };
  let jwtService: { sign: jest.Mock; verify: jest.Mock; decode: jest.Mock };
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
    prisma = {
      user: { findUnique: jest.fn(), update: jest.fn() },
      session: {
        create: jest.fn().mockResolvedValue(mockSession),
        findUnique: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        deleteMany: jest.fn(),
      },
    };
    jwtService = {
      sign: jest.fn().mockReturnValue('fake-token'),
      verify: jest.fn(),
      decode: jest.fn(),
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
      jest.spyOn(bcrypt, 'compare').mockImplementation(() => Promise.resolve(true));
      jest.spyOn(bcrypt, 'hash').mockImplementation(() => Promise.resolve('hashed'));
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
      jest.spyOn(bcrypt, 'compare').mockImplementation(() => Promise.resolve(true));
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

      await expect(
        service.refreshToken('revoked-token'),
      ).rejects.toThrow(UnauthorizedException);
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

      const result = await service.revokeSession('u1', 'session-2', 'session-1');

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
    });

    it('sends reset email when user exists and is active', async () => {
      prisma.user.findUnique.mockResolvedValue(mockUser);
      jwtService.sign.mockReturnValue('reset-jwt-token');

      const result = await service.forgotPassword('alice@example.com');

      expect(result).toEqual({
        message: 'If that email exists, a reset link has been sent.',
      });
      expect(mail.sendPasswordReset).toHaveBeenCalledWith(
        'alice@example.com',
        'Alice',
        'http://localhost:5173/reset-password?token=reset-jwt-token',
      );
    });
  });

  describe('resetPassword', () => {
    it('throws when token cannot be decoded', async () => {
      jwtService.decode.mockReturnValue(null);

      await expect(
        service.resetPassword('bad-token', 'newPassword123'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('updates password and deletes all sessions', async () => {
      jwtService.decode.mockReturnValue({ sub: 'u1', type: 'password_reset' });
      jwtService.verify.mockReturnValue({ sub: 'u1', type: 'password_reset' });
      prisma.user.findUnique.mockResolvedValue(mockUser);
      prisma.user.update.mockResolvedValue(mockUser);
      prisma.session.deleteMany.mockResolvedValue({ count: 2 });
      jest.spyOn(bcrypt, 'hash').mockImplementation(() => Promise.resolve('new-hash'));

      const result = await service.resetPassword('valid-token', 'newPassword123');

      expect(prisma.session.deleteMany).toHaveBeenCalledWith({
        where: { user_id: 'u1' },
      });
      expect(result).toEqual({ message: 'Password reset successfully' });
    });
  });
});
```

- [ ] **Step 2: Run tests**

Run: `cd yehub-be && pnpm test -- auth.service.spec`
Expected: All tests pass.

- [ ] **Step 3: Commit**

```bash
git add yehub-be/src/auth/auth.service.spec.ts
git commit -m "test: rewrite auth service tests for session-based auth"
```

---

## Task 8: Frontend — cross-tab sync on auth store

**Files:**
- Modify: `yehub-fe/src/store/auth.store.ts`

- [ ] **Step 1: Add storage event listener for cross-tab logout**

At the bottom of `yehub-fe/src/store/auth.store.ts`, after the store creation, add:

```typescript
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e: StorageEvent) => {
    if (e.key === 'yehub-auth') {
      const newState = e.newValue ? JSON.parse(e.newValue) : null;
      const hasToken = newState?.state?.accessToken;
      if (!hasToken) {
        useAuthStore.getState().clearAuth();
        window.location.href = '/login';
      }
    }
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add yehub-fe/src/store/auth.store.ts
git commit -m "feat: add cross-tab logout sync via storage event"
```

---

## Task 9: Frontend — GuestOnly active session guard

**Files:**
- Create: `yehub-fe/src/components/guest-only.tsx`
- Modify: `yehub-fe/src/router.tsx`

- [ ] **Step 1: Create the GuestOnly component**

Create `yehub-fe/src/components/guest-only.tsx`:

```tsx
import { useNavigate, Outlet } from 'react-router-dom'
import { useAuthStore } from '@/store/auth.store'
import { ROUTES } from '@/lib/constants/routes'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

export function GuestOnly() {
  const navigate = useNavigate()
  const { user, clearAuth, isAuthenticated } = useAuthStore()

  if (!isAuthenticated()) {
    return <Outlet />
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle>Active Session</CardTitle>
          <CardDescription>
            You are currently logged in as <strong>{user?.email}</strong>
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Button onClick={() => navigate(ROUTES.HOME)} className="w-full">
            Go to Dashboard
          </Button>
          <Button
            variant="outline"
            onClick={() => clearAuth()}
            className="w-full"
          >
            Logout &amp; Continue
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
```

When the user clicks "Logout & Continue", `clearAuth()` sets tokens to `null` in Zustand and localStorage. The component re-renders, `isAuthenticated()` returns `false`, and `<Outlet />` is rendered — showing the underlying auth page. The localStorage change also triggers the cross-tab `storage` event, logging out any other tabs.

- [ ] **Step 2: Wrap public auth routes with GuestOnly in the router**

In `yehub-fe/src/router.tsx`, import GuestOnly:

```typescript
import { GuestOnly } from '@/components/guest-only'
```

Wrap the four public auth routes in a parent route with `<GuestOnly />` as the element:

```typescript
  {
    element: <GuestOnly />,
    children: [
      {
        path: ROUTES.LOGIN,
        element: (
          <SuspenseWrapper>
            <LoginPage />
          </SuspenseWrapper>
        ),
      },
      {
        path: ROUTES.INVITATION,
        element: (
          <SuspenseWrapper>
            <InvitationPage />
          </SuspenseWrapper>
        ),
      },
      {
        path: ROUTES.FORGOT_PASSWORD,
        element: (
          <SuspenseWrapper>
            <ForgotPasswordPage />
          </SuspenseWrapper>
        ),
      },
      {
        path: ROUTES.RESET_PASSWORD,
        element: (
          <SuspenseWrapper>
            <ResetPasswordPage />
          </SuspenseWrapper>
        ),
      },
    ],
  },
```

This replaces the four individual route entries at lines 35-66.

- [ ] **Step 3: Commit**

```bash
git add yehub-fe/src/components/guest-only.tsx yehub-fe/src/router.tsx
git commit -m "feat: add GuestOnly guard to prevent auth page access while logged in"
```

---

## Task 10: Frontend — sessions API and query keys

**Files:**
- Modify: `yehub-fe/src/api/auth.ts`
- Modify: `yehub-fe/src/lib/constants/query-keys.ts`

- [ ] **Step 1: Add session types and API methods**

In `yehub-fe/src/api/auth.ts`, add the session type and API methods:

```typescript
export interface SessionInfo {
  id: string
  device_name: string
  os_name: string
  ip_address: string
  location: string | null
  last_active_at: string
  created_at: string
  is_current: boolean
}
```

Add to the `authApi` object:

```typescript
  getSessions: () =>
    apiClient.get<SessionInfo[]>('/auth/sessions').then((r) => r.data),

  revokeSession: (sessionId: string) =>
    apiClient.delete<{ message: string }>(`/auth/sessions/${sessionId}`).then((r) => r.data),

  revokeAllOtherSessions: () =>
    apiClient.delete<{ message: string }>('/auth/sessions').then((r) => r.data),
```

- [ ] **Step 2: Add sessions query key**

In `yehub-fe/src/lib/constants/query-keys.ts`, add:

```typescript
  sessions: ['sessions'] as const,
```

- [ ] **Step 3: Commit**

```bash
git add yehub-fe/src/api/auth.ts yehub-fe/src/lib/constants/query-keys.ts
git commit -m "feat: add sessions API methods and query keys"
```

---

## Task 11: Frontend — Sessions UI in Account Settings

**Files:**
- Create: `yehub-fe/src/pages/MyAccountPage/SessionsCard.tsx`
- Modify: `yehub-fe/src/pages/MyAccountPage/index.tsx`

- [ ] **Step 1: Create SessionsCard component**

Create `yehub-fe/src/pages/MyAccountPage/SessionsCard.tsx`:

```tsx
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Monitor, Smartphone, Globe, LogOut } from 'lucide-react'
import { toast } from 'sonner'
import { authApi, SessionInfo } from '@/api/auth'
import { queryKeys } from '@/lib/constants/query-keys'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'

function formatRelativeTime(dateString: string) {
  const date = new Date(dateString)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMinutes = Math.floor(diffMs / 60_000)
  const diffHours = Math.floor(diffMs / 3_600_000)
  const diffDays = Math.floor(diffMs / 86_400_000)

  if (diffMinutes < 1) return 'Just now'
  if (diffMinutes < 60) return `${diffMinutes}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  return `${diffDays}d ago`
}

function DeviceIcon({ osName }: { osName: string }) {
  const isMobile = /android|ios/i.test(osName)
  return isMobile ? <Smartphone className="h-5 w-5" /> : <Monitor className="h-5 w-5" />
}

function SessionRow({
  session,
  onRevoke,
  isRevoking,
}: {
  session: SessionInfo
  onRevoke?: (id: string) => void
  isRevoking?: boolean
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 text-muted-foreground">
          <DeviceIcon osName={session.os_name} />
        </div>
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">{session.device_name}</span>
            {session.is_current && (
              <Badge variant="secondary" className="text-xs">This device</Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground">{session.os_name}</p>
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Globe className="h-3 w-3" />
            <span>{session.ip_address}</span>
            {session.location && <span>({session.location})</span>}
          </div>
          <p className="text-xs text-muted-foreground">
            Active {formatRelativeTime(session.last_active_at)}
          </p>
        </div>
      </div>
      {onRevoke && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onRevoke(session.id)}
          disabled={isRevoking}
        >
          <LogOut className="mr-1 h-4 w-4" />
          Revoke
        </Button>
      )}
    </div>
  )
}

export function SessionsCard() {
  const queryClient = useQueryClient()

  const { data: sessions = [], isLoading } = useQuery({
    queryKey: queryKeys.sessions,
    queryFn: () => authApi.getSessions(),
  })

  const revokeMutation = useMutation({
    mutationFn: (sessionId: string) => authApi.revokeSession(sessionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.sessions })
      toast.success('Session revoked')
    },
    onError: () => toast.error('Failed to revoke session'),
  })

  const revokeAllMutation = useMutation({
    mutationFn: () => authApi.revokeAllOtherSessions(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.sessions })
      toast.success('All other sessions revoked')
    },
    onError: () => toast.error('Failed to revoke sessions'),
  })

  const currentSession = sessions.find((s) => s.is_current)
  const otherSessions = sessions.filter((s) => !s.is_current)

  if (isLoading) return null

  return (
    <Card>
      <CardHeader>
        <CardTitle>Active Sessions</CardTitle>
        <CardDescription>
          Manage your active sessions across devices.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {currentSession && (
          <div>
            <h4 className="mb-2 text-sm font-medium">Current Session</h4>
            <SessionRow session={currentSession} />
          </div>
        )}

        {otherSessions.length > 0 && (
          <>
            <Separator />
            <div>
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-sm font-medium">Other Sessions</h4>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => revokeAllMutation.mutate()}
                  disabled={revokeAllMutation.isPending}
                >
                  Revoke all others
                </Button>
              </div>
              <div className="divide-y">
                {otherSessions.map((session) => (
                  <SessionRow
                    key={session.id}
                    session={session}
                    onRevoke={(id) => revokeMutation.mutate(id)}
                    isRevoking={revokeMutation.isPending}
                  />
                ))}
              </div>
            </div>
          </>
        )}

        {otherSessions.length === 0 && (
          <>
            <Separator />
            <p className="text-sm text-muted-foreground">
              No other active sessions.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  )
}
```

- [ ] **Step 2: Add SessionsCard to MyAccountPage**

In `yehub-fe/src/pages/MyAccountPage/index.tsx`, import and render:

```typescript
import { SessionsCard } from './SessionsCard'
```

Add `<SessionsCard />` after `<ChangePasswordCard />` in the return JSX.

- [ ] **Step 3: Commit**

```bash
git add yehub-fe/src/pages/MyAccountPage/SessionsCard.tsx yehub-fe/src/pages/MyAccountPage/index.tsx
git commit -m "feat: add sessions management UI to account settings"
```

---

## Task 12: Final verification

- [ ] **Step 1: Run backend tests**

```bash
cd yehub-be && pnpm test
```

Expected: All tests pass.

- [ ] **Step 2: Run backend lint**

```bash
cd yehub-be && pnpm lint
```

Expected: No errors.

- [ ] **Step 3: Run frontend lint**

```bash
cd yehub-fe && pnpm lint
```

Expected: No errors.

- [ ] **Step 4: Build backend**

```bash
cd yehub-be && pnpm build
```

Expected: Compiles successfully.

- [ ] **Step 5: Build frontend**

```bash
cd yehub-fe && pnpm build
```

Expected: Compiles successfully.

- [ ] **Step 6: Final commit if any lint fixes were needed**

```bash
git add -A
git commit -m "fix: lint and build fixes for session management"
```
