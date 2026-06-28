# Session Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix four session/auth bugs by making JWT validation stateful, adding a 1-hour idle timeout, and introducing a 5-attempt account lockout with admin-only unlock.

**Architecture:** Every authenticated request does an indexed session lookup in Postgres that also enforces the idle window (`last_active_at > now() - 1h`). `last_active_at` is updated only on `/auth/refresh-token`. A new atomic counter on `User` tracks failed login attempts; hitting 5 flips `status = INACTIVE` and deletes all sessions. Admin unlock reuses the existing `enableUser` endpoint.

**Tech Stack:** NestJS 11, Prisma 7, PostgreSQL 17, Jest, React 19, TanStack Query v5.

**Spec:** `docs/superpowers/specs/2026-04-11-session-hardening-design.md`

---

## Prerequisite: Unblock Prisma Generate

A fresh `pnpm install` in this worktree produces a broken `@prisma/dev@0.20.0` because it does a CJS `require()` of `zeptomatch@1.2.2`, which is now ESM. The main directory only works because of a leftover `zeptomatch@2.1.0` from an older install. This must be fixed before any backend task runs.

### Task 0: Fix Prisma generate for fresh installs

**Files:**
- Modify: `yehub-be/package.json`

- [ ] **Step 1: Verify the issue is present**

Run from worktree root:
```bash
cd yehub-be && pnpm prisma:generate
```
Expected: fails with `ERR_REQUIRE_ESM` referencing `@prisma/dev` and `zeptomatch`.

- [ ] **Step 2: Add pnpm override for zeptomatch**

Edit `yehub-be/package.json` — append a `pnpm` section at the top level (after `devDependencies`):

```json
  "pnpm": {
    "overrides": {
      "zeptomatch": "^2.0.0"
    }
  }
```

- [ ] **Step 3: Reinstall and verify**

```bash
cd yehub-be && pnpm install && pnpm prisma:generate
```
Expected: install succeeds, `prisma:generate` prints `✔ Generated Prisma Client (7.5.0) to ./generated/prisma`.

If the override does not fix it, STOP and escalate to the user — do not proceed with subsequent tasks. A broken Prisma generate blocks every test.

- [ ] **Step 4: Commit**

```bash
git add yehub-be/package.json yehub-be/pnpm-lock.yaml
git commit -m "chore(be): add zeptomatch override to fix prisma dev CJS require"
```

---

## Task 1: Auth constants file

**Files:**
- Create: `yehub-be/src/auth/auth.constants.ts`

- [ ] **Step 1: Create the constants file**

```typescript
export const SESSION_IDLE_TIMEOUT_MS = 60 * 60 * 1000 // 1 hour
export const MAX_FAILED_LOGIN_ATTEMPTS = 5
```

- [ ] **Step 2: Commit**

```bash
git add yehub-be/src/auth/auth.constants.ts
git commit -m "feat(be): add auth constants for idle timeout and lockout threshold"
```

---

## Task 2: Prisma schema — lockout fields on User

**Files:**
- Modify: `yehub-be/prisma/schema.prisma`

- [ ] **Step 1: Add three fields to the User model**

Open `yehub-be/prisma/schema.prisma` and locate the `User` model. Insert these fields immediately after `last_login_at` (keep the existing formatting and alignment):

```prisma
  failed_login_attempts Int       @default(0)
  locked_at             DateTime?
  locked_reason         String?
```

- [ ] **Step 2: Create and apply the migration**

```bash
cd yehub-be && pnpm prisma migrate dev --name session_hardening_lockout_fields
```
Expected: Prisma prints the generated migration SQL (three `ALTER TABLE` statements), applies it, and regenerates the client. The migration file will appear under `prisma/migrations/<timestamp>_session_hardening_lockout_fields/migration.sql`.

- [ ] **Step 3: Verify generated client has the new fields**

```bash
grep -E "failed_login_attempts|locked_at|locked_reason" yehub-be/generated/prisma/index.d.ts | head
```
Expected: matches for all three field names.

- [ ] **Step 4: Commit**

```bash
git add yehub-be/prisma/schema.prisma yehub-be/prisma/migrations
git commit -m "feat(be): add lockout fields to User (failed_login_attempts, locked_at, locked_reason)"
```

---

## Task 3: Stateful JwtStrategy with idle timeout

Switches `validate()` from a stateless user lookup to a session lookup that also enforces the 1-hour idle window. This single change fixes issues #1, #2, and #3.

**Files:**
- Modify: `yehub-be/src/auth/strategies/jwt.strategy.ts`
- Test: `yehub-be/src/auth/strategies/jwt.strategy.spec.ts`

- [ ] **Step 1: Check whether a spec file exists**

```bash
ls yehub-be/src/auth/strategies/jwt.strategy.spec.ts 2>/dev/null || echo "NO SPEC"
```
If it says `NO SPEC`, create a new file in Step 2. If the file exists, append the new `describe` block from Step 2 to it instead of creating a new file.

- [ ] **Step 2: Write the failing tests**

Create (or append to) `yehub-be/src/auth/strategies/jwt.strategy.spec.ts`:

```typescript
import { UnauthorizedException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { UserStatus, GlobalRole } from '../../../generated/prisma'
import { PrismaService } from '../../prisma/prisma.service'
import { JwtStrategy } from './jwt.strategy'
import { SESSION_IDLE_TIMEOUT_MS } from '../auth.constants'

describe('JwtStrategy.validate (stateful)', () => {
  let strategy: JwtStrategy
  let prisma: { session: { findFirst: jest.Mock } }

  const payload = {
    sub: 'user-1',
    sessionId: 'session-1',
    email: 'u@example.com',
    role: GlobalRole.USER,
  }

  beforeEach(() => {
    prisma = { session: { findFirst: jest.fn() } }
    const config = { get: jest.fn().mockReturnValue('test-secret') } as unknown as ConfigService
    strategy = new JwtStrategy(config, prisma as unknown as PrismaService)
  })

  it('returns user context when session is valid and user is active', async () => {
    prisma.session.findFirst.mockResolvedValue({
      id: 'session-1',
      user: {
        id: 'user-1',
        email: 'u@example.com',
        role: GlobalRole.USER,
        status: UserStatus.ACTIVE,
      },
    })

    const result = await strategy.validate(payload)

    expect(result).toEqual({
      id: 'user-1',
      sessionId: 'session-1',
      email: 'u@example.com',
      role: GlobalRole.USER,
    })
    const call = prisma.session.findFirst.mock.calls[0][0]
    expect(call.where.id).toBe('session-1')
    expect(call.where.user_id).toBe('user-1')
    expect(call.where.last_active_at.gt).toBeInstanceOf(Date)
    const cutoff = call.where.last_active_at.gt as Date
    const expected = Date.now() - SESSION_IDLE_TIMEOUT_MS
    expect(Math.abs(cutoff.getTime() - expected)).toBeLessThan(1000)
  })

  it('throws when the session row is missing (revoked)', async () => {
    prisma.session.findFirst.mockResolvedValue(null)
    await expect(strategy.validate(payload)).rejects.toBeInstanceOf(UnauthorizedException)
  })

  it('throws when last_active_at is older than the idle window', async () => {
    // Simulated by the prisma query returning null for the stale row;
    // the where clause enforces the time filter.
    prisma.session.findFirst.mockResolvedValue(null)
    await expect(strategy.validate(payload)).rejects.toBeInstanceOf(UnauthorizedException)
  })

  it('throws when the user is not ACTIVE', async () => {
    prisma.session.findFirst.mockResolvedValue({
      id: 'session-1',
      user: {
        id: 'user-1',
        email: 'u@example.com',
        role: GlobalRole.USER,
        status: UserStatus.INACTIVE,
      },
    })
    await expect(strategy.validate(payload)).rejects.toBeInstanceOf(UnauthorizedException)
  })
})
```

- [ ] **Step 3: Run the tests and confirm they fail**

```bash
cd yehub-be && pnpm test -- jwt.strategy.spec
```
Expected: FAIL. The current `validate()` does not call `prisma.session.findFirst`.

- [ ] **Step 4: Rewrite `JwtStrategy.validate()`**

Open `yehub-be/src/auth/strategies/jwt.strategy.ts` and replace the `validate` method. Also remove the outdated stateless-tradeoff comment block. The full updated file should look like this (preserve imports; add `SESSION_IDLE_TIMEOUT_MS` and `UserStatus` imports if missing):

```typescript
import { Injectable, UnauthorizedException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { PassportStrategy } from '@nestjs/passport'
import { ExtractJwt, Strategy } from 'passport-jwt'

import { UserStatus } from '../../../generated/prisma'
import { PrismaService } from '../../prisma/prisma.service'
import { SESSION_IDLE_TIMEOUT_MS } from '../auth.constants'

export interface JwtPayload {
  sub: string
  sessionId: string
  email: string
  role: string
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_SECRET') ?? '',
    })
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
    })

    if (!session) {
      throw new UnauthorizedException('Session expired or revoked')
    }
    if (session.user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException('Account inactive')
    }

    return {
      id: session.user.id,
      sessionId: session.id,
      email: session.user.email,
      role: session.user.role,
    }
  }
}
```

Note: keep the existing `JwtPayload` export shape — if the current file exports it differently, preserve that export so consumers still compile.

- [ ] **Step 5: Run the tests and confirm they pass**

```bash
cd yehub-be && pnpm test -- jwt.strategy.spec
```
Expected: PASS (4 tests).

- [ ] **Step 6: Run the full auth test file to check for regressions**

```bash
cd yehub-be && pnpm test -- auth
```
Expected: the existing `auth.service.spec.ts` tests still pass. If any fail, they likely mock `prisma.user.findUnique` inside what used to be `JwtStrategy`'s path — but since `JwtStrategy` is only touched by HTTP integration tests (not `auth.service.spec.ts`), they should be unaffected. Investigate any failures before proceeding.

- [ ] **Step 7: Commit**

```bash
git add yehub-be/src/auth/strategies/jwt.strategy.ts yehub-be/src/auth/strategies/jwt.strategy.spec.ts
git commit -m "feat(be): make JwtStrategy stateful with 1-hour idle timeout"
```

---

## Task 4: Idle timeout enforcement in refreshToken

`refreshToken()` already updates `last_active_at`, but it does not reject stale sessions. Add an explicit check so an idle session that somehow makes it to a refresh call is killed cleanly.

**Files:**
- Modify: `yehub-be/src/auth/auth.service.ts` (method `refreshToken`)
- Test: `yehub-be/src/auth/auth.service.spec.ts` (existing `describe('refreshToken')` block)

- [ ] **Step 1: Write the failing test**

Open `yehub-be/src/auth/auth.service.spec.ts` and locate the existing `describe('refreshToken', ...)` block. Append this test inside it (use the same mock setup as neighboring tests):

```typescript
it('throws and deletes the session when last_active_at is older than 1 hour', async () => {
  const staleDate = new Date(Date.now() - 61 * 60 * 1000) // 61 minutes ago
  const session = {
    id: 'session-1',
    user_id: 'user-1',
    refresh_token_hash: 'hashed',
    last_active_at: staleDate,
    user: { id: 'user-1', status: UserStatus.ACTIVE },
  }
  jwtService.verify.mockReturnValue({ sub: 'user-1', sessionId: 'session-1' })
  prisma.session.findUnique.mockResolvedValue(session)
  prisma.session.delete.mockResolvedValue(session)

  await expect(
    service.refreshToken({ refresh_token: 'any' }),
  ).rejects.toBeInstanceOf(UnauthorizedException)

  expect(prisma.session.delete).toHaveBeenCalledWith({
    where: { id: 'session-1' },
  })
})
```

If the existing tests use a different mock shape (e.g. `prismaMock.session.findUnique`), adapt variable names to match.

- [ ] **Step 2: Run the test and confirm it fails**

```bash
cd yehub-be && pnpm test -- auth.service.spec -t "older than 1 hour"
```
Expected: FAIL — current `refreshToken` does not check `last_active_at`.

- [ ] **Step 3: Update `refreshToken()` in auth.service.ts**

Locate the method. After the existing `session` lookup and before the bcrypt compare of the refresh token, insert the idle check. The exact insertion point is: right after the session is fetched and confirmed to exist. The code block to add:

```typescript
import { SESSION_IDLE_TIMEOUT_MS } from './auth.constants'
// ... inside refreshToken, after session is fetched:

if (session.last_active_at.getTime() < Date.now() - SESSION_IDLE_TIMEOUT_MS) {
  await this.prisma.session.delete({ where: { id: session.id } })
  throw new UnauthorizedException('Session expired due to inactivity')
}
```

Keep the existing `last_active_at` update on success untouched — that's the sliding heartbeat.

- [ ] **Step 4: Run the test and confirm it passes**

```bash
cd yehub-be && pnpm test -- auth.service.spec -t "older than 1 hour"
```
Expected: PASS.

- [ ] **Step 5: Run the full refreshToken describe block to confirm no regressions**

```bash
cd yehub-be && pnpm test -- auth.service.spec -t "refreshToken"
```
Expected: all tests in the refreshToken block pass.

- [ ] **Step 6: Commit**

```bash
git add yehub-be/src/auth/auth.service.ts yehub-be/src/auth/auth.service.spec.ts
git commit -m "feat(be): enforce 1-hour idle timeout in refreshToken"
```

---

## Task 5: Failed-login counter and account lockout

Adds failed-attempt tracking to `login()`. Each wrong password atomically increments `failed_login_attempts`. The 5th consecutive failure flips `status = INACTIVE`, sets `locked_at`, `locked_reason`, deletes all sessions, and throws. A successful login resets the counter to 0.

**Files:**
- Modify: `yehub-be/src/auth/auth.service.ts` (method `login`)
- Test: `yehub-be/src/auth/auth.service.spec.ts` (existing `describe('login')` block)

- [ ] **Step 1: Write the failing tests**

Append to the existing `describe('login', ...)` block in `auth.service.spec.ts`:

```typescript
it('increments failed_login_attempts on wrong password and returns attempts_remaining', async () => {
  const user = {
    id: 'user-1',
    email: 'u@example.com',
    password_hash: 'correct-hash',
    status: UserStatus.ACTIVE,
    failed_login_attempts: 2,
    role: GlobalRole.USER,
  }
  prisma.user.findUnique.mockResolvedValue(user)
  bcryptCompare.mockResolvedValue(false)
  prisma.user.update.mockResolvedValue({ ...user, failed_login_attempts: 3 })

  await expect(
    service.login(
      { email: 'u@example.com', password: 'wrong' },
      { ip: '1.1.1.1', userAgent: 'ua' },
    ),
  ).rejects.toMatchObject({
    status: 401,
    response: expect.objectContaining({ attempts_remaining: 2 }),
  })

  expect(prisma.user.update).toHaveBeenCalledWith(
    expect.objectContaining({
      where: { id: 'user-1' },
      data: { failed_login_attempts: { increment: 1 } },
    }),
  )
})

it('locks the account on the 5th consecutive wrong password', async () => {
  const user = {
    id: 'user-1',
    email: 'u@example.com',
    password_hash: 'correct-hash',
    status: UserStatus.ACTIVE,
    failed_login_attempts: 4,
    role: GlobalRole.USER,
  }
  prisma.user.findUnique.mockResolvedValue(user)
  bcryptCompare.mockResolvedValue(false)
  prisma.user.update.mockResolvedValue({ ...user, failed_login_attempts: 5 })

  await expect(
    service.login(
      { email: 'u@example.com', password: 'wrong' },
      { ip: '1.1.1.1', userAgent: 'ua' },
    ),
  ).rejects.toMatchObject({
    status: 401,
    response: expect.objectContaining({ locked: true }),
  })

  expect(prisma.user.update).toHaveBeenCalledWith(
    expect.objectContaining({
      where: { id: 'user-1' },
      data: expect.objectContaining({
        status: UserStatus.INACTIVE,
        locked_reason: 'too_many_failed_attempts',
      }),
    }),
  )
  expect(prisma.session.deleteMany).toHaveBeenCalledWith({
    where: { user_id: 'user-1' },
  })
})

it('rejects login for an already-locked account without touching the counter', async () => {
  prisma.user.findUnique.mockResolvedValue({
    id: 'user-1',
    email: 'u@example.com',
    password_hash: 'correct-hash',
    status: UserStatus.INACTIVE,
    failed_login_attempts: 5,
    role: GlobalRole.USER,
  })

  await expect(
    service.login(
      { email: 'u@example.com', password: 'anything' },
      { ip: '1.1.1.1', userAgent: 'ua' },
    ),
  ).rejects.toMatchObject({
    response: expect.objectContaining({ locked: true }),
  })

  expect(prisma.user.update).not.toHaveBeenCalled()
  expect(bcryptCompare).not.toHaveBeenCalled()
})

it('resets failed_login_attempts to 0 on successful login', async () => {
  const user = {
    id: 'user-1',
    email: 'u@example.com',
    password_hash: 'correct-hash',
    status: UserStatus.ACTIVE,
    failed_login_attempts: 3,
    role: GlobalRole.USER,
  }
  prisma.user.findUnique.mockResolvedValue(user)
  bcryptCompare.mockResolvedValue(true)
  // ... standard session.create + jwtService.sign mocks already exist in the happy-path test

  await service.login(
    { email: 'u@example.com', password: 'correct' },
    { ip: '1.1.1.1', userAgent: 'ua' },
  )

  expect(prisma.user.update).toHaveBeenCalledWith(
    expect.objectContaining({
      where: { id: 'user-1' },
      data: expect.objectContaining({
        failed_login_attempts: 0,
      }),
    }),
  )
})

it('returns generic error with no counter update for a non-existent email', async () => {
  prisma.user.findUnique.mockResolvedValue(null)

  await expect(
    service.login(
      { email: 'nobody@example.com', password: 'anything' },
      { ip: '1.1.1.1', userAgent: 'ua' },
    ),
  ).rejects.toBeInstanceOf(UnauthorizedException)

  expect(prisma.user.update).not.toHaveBeenCalled()
})
```

Note: The test file may already have a `bcryptCompare` mock; reuse it. Adjust imports at the top of the file if `UserStatus` or `GlobalRole` are not already imported from `../../generated/prisma`.

- [ ] **Step 2: Run the failing tests**

```bash
cd yehub-be && pnpm test -- auth.service.spec -t "login"
```
Expected: the 5 new tests fail; existing login tests still pass or fail depending on ordering.

- [ ] **Step 3: Rewrite `login()` in auth.service.ts**

Locate the `login()` method. Replace the credential-validation portion with this logic. The session-creation and token-generation flow that follows the credential check should remain — only the credential check and counter handling change.

```typescript
import { MAX_FAILED_LOGIN_ATTEMPTS } from './auth.constants'

// inside login():
const user = await this.prisma.user.findUnique({ where: { email: dto.email } })

if (!user) {
  throw new UnauthorizedException('Invalid email or password')
}

if (user.status === UserStatus.INACTIVE) {
  throw new UnauthorizedException({
    message: 'Account locked. Please contact an administrator.',
    locked: true,
  })
}

if (user.status !== UserStatus.ACTIVE) {
  throw new UnauthorizedException('Invalid email or password')
}

const passwordValid = user.password_hash
  ? await bcrypt.compare(dto.password, user.password_hash)
  : false

if (!passwordValid) {
  // Atomic increment, returns the new value.
  const updated = await this.prisma.user.update({
    where: { id: user.id },
    data: { failed_login_attempts: { increment: 1 } },
    select: { failed_login_attempts: true },
  })

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
    ])
    throw new UnauthorizedException({
      message: 'Account locked due to too many failed login attempts. Please contact an administrator.',
      locked: true,
    })
  }

  throw new UnauthorizedException({
    message: 'Invalid email or password',
    attempts_remaining: MAX_FAILED_LOGIN_ATTEMPTS - updated.failed_login_attempts,
  })
}

// Password is correct — reset the counter inside the same flow as the
// existing session creation. If the existing code uses a transaction for
// session creation, include this user.update in it. Otherwise, add a
// standalone update before the session.create call:
await this.prisma.user.update({
  where: { id: user.id },
  data: { failed_login_attempts: 0, last_login_at: new Date() },
})

// ... existing session.create + token signing code follows unchanged ...
```

If the existing `login()` already does `last_login_at: new Date()` in a separate call, merge the counter reset into that same update instead of adding a new one.

- [ ] **Step 4: Run the login tests**

```bash
cd yehub-be && pnpm test -- auth.service.spec -t "login"
```
Expected: all login tests (new + existing) pass.

- [ ] **Step 5: Commit**

```bash
git add yehub-be/src/auth/auth.service.ts yehub-be/src/auth/auth.service.spec.ts
git commit -m "feat(be): add account lockout after 5 failed login attempts"
```

---

## Task 6: Reset counter on password change

Extends `changePassword()` to clear `failed_login_attempts`. Other-session deletion already exists and is unchanged.

**Files:**
- Modify: `yehub-be/src/auth/auth.service.ts` (method `changePassword`)
- Test: `yehub-be/src/auth/auth.service.spec.ts` (existing `describe('changePassword')` block)

- [ ] **Step 1: Write the failing test**

Append to the existing `describe('changePassword', ...)` block:

```typescript
it('resets failed_login_attempts on successful password change', async () => {
  prisma.user.findUnique.mockResolvedValue({
    id: 'user-1',
    password_hash: 'old-hash',
    failed_login_attempts: 3,
  })
  bcryptCompare.mockResolvedValueOnce(true) // current password matches
  bcryptHash.mockResolvedValue('new-hash')

  await service.changePassword('user-1', 'session-1', {
    current_password: 'old',
    new_password: 'new-password',
  })

  expect(prisma.user.update).toHaveBeenCalledWith(
    expect.objectContaining({
      where: { id: 'user-1' },
      data: expect.objectContaining({
        password_hash: 'new-hash',
        failed_login_attempts: 0,
      }),
    }),
  )
})
```

- [ ] **Step 2: Run the test and confirm it fails**

```bash
cd yehub-be && pnpm test -- auth.service.spec -t "changePassword"
```
Expected: the new test fails — current code doesn't touch `failed_login_attempts`.

- [ ] **Step 3: Update `changePassword()`**

Locate the `prisma.user.update(...)` call inside `changePassword()` that sets `password_hash`. Add `failed_login_attempts: 0` to the `data` object:

```typescript
await this.prisma.user.update({
  where: { id: userId },
  data: {
    password_hash: newHash,
    failed_login_attempts: 0,
  },
})
```

Preserve any other fields the existing code writes.

- [ ] **Step 4: Run the test and confirm it passes**

```bash
cd yehub-be && pnpm test -- auth.service.spec -t "changePassword"
```
Expected: all changePassword tests pass.

- [ ] **Step 5: Commit**

```bash
git add yehub-be/src/auth/auth.service.ts yehub-be/src/auth/auth.service.spec.ts
git commit -m "feat(be): reset failed_login_attempts on password change"
```

---

## Task 7: Admin unlock clears lockout fields

Extends `AdminService.enableUser()` so the INACTIVE→ACTIVE transition also clears `failed_login_attempts`, `locked_at`, and `locked_reason`.

**Files:**
- Modify: `yehub-be/src/admin/admin.service.ts` (method `enableUser`)
- Test: `yehub-be/src/admin/admin.service.spec.ts` (existing test file — create if missing)

- [ ] **Step 1: Check whether the spec file exists**

```bash
ls yehub-be/src/admin/admin.service.spec.ts 2>/dev/null || echo "NO SPEC"
```

- [ ] **Step 2: Write the failing test**

If the spec file exists, locate `describe('enableUser', ...)` (or create one) and add the following test. If the file does not exist, create it with a minimal harness:

```typescript
import { PrismaService } from '../prisma/prisma.service'
import { AdminService } from './admin.service'
import { UserStatus } from '../../generated/prisma'

describe('AdminService.enableUser', () => {
  let service: AdminService
  let prisma: {
    user: { findUnique: jest.Mock; update: jest.Mock }
  }

  beforeEach(() => {
    prisma = {
      user: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
    }
    service = new AdminService(prisma as unknown as PrismaService)
  })

  it('clears lockout fields when re-enabling a user', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      status: UserStatus.INACTIVE,
    })

    await service.enableUser('user-1')

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: {
        status: UserStatus.ACTIVE,
        failed_login_attempts: 0,
        locked_at: null,
        locked_reason: null,
      },
    })
  })
})
```

If the existing `admin.service.spec.ts` uses a different constructor injection shape, adapt the mock setup to match neighbouring tests (don't invent a new pattern).

- [ ] **Step 3: Run the test and confirm it fails**

```bash
cd yehub-be && pnpm test -- admin.service.spec -t "enableUser"
```
Expected: FAIL.

- [ ] **Step 4: Update `enableUser()`**

Open `yehub-be/src/admin/admin.service.ts` and replace the method body:

```typescript
async enableUser(userId: string) {
  await this.findUserOrThrow(userId)

  await this.prisma.user.update({
    where: { id: userId },
    data: {
      status: UserStatus.ACTIVE,
      failed_login_attempts: 0,
      locked_at: null,
      locked_reason: null,
    },
  })
}
```

- [ ] **Step 5: Run the test and confirm it passes**

```bash
cd yehub-be && pnpm test -- admin.service.spec -t "enableUser"
```
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add yehub-be/src/admin/admin.service.ts yehub-be/src/admin/admin.service.spec.ts
git commit -m "feat(be): clear lockout fields when admin re-enables a user"
```

---

## Task 8: Full backend test run

Guardrail task — before touching the frontend, confirm the backend is green.

- [ ] **Step 1: Run the full backend test suite**

```bash
cd yehub-be && pnpm test
```
Expected: all tests pass.

- [ ] **Step 2: Run lint**

```bash
cd yehub-be && pnpm lint
```
Expected: no errors.

If either step fails, stop and fix before proceeding. Do not commit — this task is verification-only.

---

## Task 9: Frontend — lockout countdown on login page

Surfaces `attempts_remaining` and `locked: true` in the login error display.

**Files:**
- Modify: `yehub-fe/src/pages/login.tsx`
- Modify: `yehub-fe/src/lib/errors.ts` (if the helper needs extending — check first)

- [ ] **Step 1: Inspect the existing error helper**

```bash
cat yehub-fe/src/lib/errors.ts
```
Locate `getApiErrorMessage`. Understand what shape it expects and how it extracts fields from `error.response?.data`.

- [ ] **Step 2: Extend the helper to expose attempts_remaining and locked**

Add a new helper function `getLoginErrorDetails` (keep `getApiErrorMessage` unchanged — other callers rely on it):

```typescript
export interface LoginErrorDetails {
  message: string
  attemptsRemaining?: number
  locked?: boolean
}

export function getLoginErrorDetails(error: unknown): LoginErrorDetails {
  const fallback: LoginErrorDetails = { message: 'Invalid email or password' }
  if (!isAxiosError(error) || !error.response) return fallback

  const data = error.response.data as
    | { message?: string; attempts_remaining?: number; locked?: boolean }
    | undefined

  return {
    message: data?.message ?? fallback.message,
    attemptsRemaining: data?.attempts_remaining,
    locked: data?.locked,
  }
}
```

Use `isAxiosError` from the existing helper if it's already imported there; otherwise import from `axios`.

- [ ] **Step 3: Update `login.tsx` to use the new helper**

Open `yehub-fe/src/pages/login.tsx`. Replace the `onError` handler:

```typescript
import { getLoginErrorDetails } from '@/lib/errors'

// ... inside the component, in the mutation:
onError: (error) => {
  const details = getLoginErrorDetails(error)
  if (details.locked) {
    setServerError(
      'Your account has been locked due to too many failed login attempts. Please contact an administrator to unlock it.',
    )
    return
  }
  if (typeof details.attemptsRemaining === 'number') {
    setServerError(
      `Invalid email or password. ${details.attemptsRemaining} attempts remaining before lockout.`,
    )
    return
  }
  setServerError(details.message)
},
```

The banner element that renders `serverError` already exists and needs no change.

- [ ] **Step 4: Manual smoke test**

```bash
cd yehub-fe && pnpm dev
```
Open http://localhost:5173/login in a browser. With the backend running, try these flows:
1. Valid credentials → successful login
2. Wrong password 3 times in a row for an existing account → banner shows "N attempts remaining"
3. Wrong password 5 times in a row → banner shows the locked message; further attempts keep showing the locked message
4. Non-existent email → banner shows "Invalid email or password" with no countdown

Reset the locked user via the admin panel or Prisma Studio before moving on.

- [ ] **Step 5: Run frontend lint**

```bash
cd yehub-fe && pnpm lint
```
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add yehub-fe/src/lib/errors.ts yehub-fe/src/pages/login.tsx
git commit -m "feat(fe): show attempts remaining and locked state on login"
```

---

## Task 10: Frontend — session expired toast

When the axios interceptor redirects to `/login` because a refresh failed (typical for idle-expired or revoked sessions), show a toast so users know why they were kicked out.

**Files:**
- Modify: `yehub-fe/src/api/client.ts`

- [ ] **Step 1: Inspect the current redirect path**

```bash
cat yehub-fe/src/api/client.ts
```
Locate the catch block where `clearAuth()` is called and `window.location.href = '/login'` happens.

- [ ] **Step 2: Add a toast before the redirect**

At the top of the file, import the toast helper already used elsewhere in the app (confirmed: `sonner`, same as `SessionsCard.tsx`):

```typescript
import { toast } from 'sonner'
```

In the catch block, before the redirect:

```typescript
toast.error('Your session has expired. Please log in again.')
useAuthStore.getState().clearAuth()
window.location.href = '/login'
```

Make sure this toast only fires on the auth-failure path, not on every axios error.

- [ ] **Step 3: Manual smoke test**

Start the backend and frontend. Log in. Then in a second terminal, revoke the session from Prisma Studio or via the Sessions UI in another tab. Click around in the first tab — you should see the toast and be redirected to `/login`.

- [ ] **Step 4: Run frontend lint**

```bash
cd yehub-fe && pnpm lint
```

- [ ] **Step 5: Commit**

```bash
git add yehub-fe/src/api/client.ts
git commit -m "feat(fe): toast when session expires and user is forced to log in"
```

---

## Task 11: Final verification

- [ ] **Step 1: Backend green**

```bash
cd yehub-be && pnpm lint && pnpm test && pnpm build
```
Expected: all three succeed.

- [ ] **Step 2: Frontend green**

```bash
cd yehub-fe && pnpm lint && pnpm build
```
Expected: both succeed.

- [ ] **Step 3: Manual end-to-end check of the four original issues**

Start `docker compose up -d`, backend, and frontend. Verify each issue is fixed:

1. **Password change invalidates other sessions immediately.** Log in on two browsers (A and B). Change password from A. Try any protected action on B within ~1 second. B should get 401 → redirect to login with toast.

2. **Revoke from Sessions UI forces logout.** Log in on A and B. From A, revoke B's session. Try any protected action on B. B should immediately hit 401 → redirect.

3. **1-hour idle timeout.** Log in. Manually update `last_active_at` in Prisma Studio to 61 minutes ago. Try any protected action. Should hit 401 → redirect.

4. **Account lockout after 5 failed attempts.** From the login page, try wrong password 4 times. Banner should show "N remaining." On the 5th attempt, account locks and banner shows the locked message. Further attempts keep showing locked. An admin reactivates via the admin panel; the user can log in again.

- [ ] **Step 4: Record the verification in a commit (optional)**

Only commit if there are untracked verification artifacts (there shouldn't be). Otherwise skip.

---

## Scope and Out-of-Scope Reminders

**In scope:** stateful JWT validation, 1-hour idle timeout, lockout counter + admin unlock extension, login countdown UI, session-expired toast, backend unit tests for all new logic.

**Explicitly out of scope (per spec):**
- Redis-backed session cache
- Refresh token rotation
- Device fingerprinting beyond existing IP/UA
- Separate admin unlock endpoint (extend existing `enableUser`)
- New E2E tests in `yehub-e2e/`
- Frontend unit tests (the project has none today)
