# Resend Invitation Email Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow admins to resend invitation emails, replacing the `active` boolean with a `UserStatus` enum and adding a new resend endpoint with cooldown logic.

**Architecture:** Add `UserStatus` enum to Prisma schema, replace all `active` boolean usage across admin/auth/seed flows. New `resendInvitation` method in `AdminService` generates a fresh token that overwrites the old one. Cooldown tracked via `invitation_sent_at` field.

**Tech Stack:** NestJS 11, Prisma ORM, bcrypt, nodemailer, Jest

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Modify | `prisma/schema.prisma` | Add `UserStatus` enum, replace `active` with `status`, add `invitation_sent_at` |
| Modify | `prisma/seed.ts` | Update seed to use `status` instead of `active` |
| Modify | `prisma/migrations/20260403144014_seed_default_admin/migration.sql` | Update to use `status` column |
| Modify | `src/admin/admin.service.ts` | Replace `active` with `status`, add `resendInvitation` method, change expiry to 24h |
| Modify | `src/admin/admin.controller.ts` | Add `POST :id/resend-invitation` endpoint |
| Modify | `src/admin/admin.service.spec.ts` | Update existing tests for `status`, add resend tests |
| Modify | `src/auth/auth.service.ts` | Replace all `active` checks with `status` checks |
| Modify | `src/auth/auth.service.spec.ts` | Update `active` references to `status` |
| Modify | `src/auth/strategies/jwt.strategy.ts` | Replace `active` check with `status` check |
| Modify | `src/mail/mail.service.ts` | Update "48 hours" to "24 hours" in email template |

---

### Task 1: Schema — Add UserStatus enum and update User model

**Files:**
- Modify: `prisma/schema.prisma:14-22` (enums section)
- Modify: `prisma/schema.prisma:61-83` (User model)

- [ ] **Step 1: Add UserStatus enum to schema**

In `prisma/schema.prisma`, after the `ProjectRole` enum (line 31), add:

```prisma
enum UserStatus {
  INVITED
  ACTIVE
  INACTIVE

  @@map("user_status")
}
```

- [ ] **Step 2: Update User model**

In the User model, replace line 68:
```prisma
  active                 Boolean     @default(true)
```
with:
```prisma
  status                 UserStatus  @default(ACTIVE)
```

Add after `invitation_accepted_at` (line 73):
```prisma
  invitation_sent_at     DateTime?
```

Replace line 80:
```prisma
  @@index([active])
```
with:
```prisma
  @@index([status])
```

- [ ] **Step 3: Generate Prisma client**

Run: `pnpm prisma:generate`
Expected: Client regenerates successfully with `UserStatus` enum exported.

- [ ] **Step 4: Create migration**

Run: `pnpm prisma:migrate -- --name add_user_status_enum`
Expected: New migration SQL file created. Since we run on fresh DB, no data migration needed.

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/ generated/
git commit -m "feat: add UserStatus enum, replace active boolean on User model"
```

---

### Task 2: Update seed default admin migration

**Files:**
- Modify: `prisma/migrations/20260403144014_seed_default_admin/migration.sql`

- [ ] **Step 1: Update migration SQL to use status column**

Replace the full INSERT statement with:

```sql
-- Seed default admin user
-- Password: Admin@123! (bcrypt 10 rounds)
-- This admin should be used for initial setup only.
-- After launching, invite new admins and delete this default account.
INSERT INTO "users" (
    "id",
    "email",
    "password_hash",
    "name",
    "role",
    "status",
    "invitation_accepted_at",
    "created_at",
    "updated_at"
) VALUES (
    gen_random_uuid(),
    'admin@yehub.com',
    '$2b$10$BMwRMHLz/1nI8vIpVIz22uBnHRdXedjhOAJdYmo3ILAlcanrEs97W',
    'Default Admin',
    'ADMIN',
    'ACTIVE',
    NOW(),
    NOW(),
    NOW()
) ON CONFLICT ("email") DO NOTHING;
```

- [ ] **Step 2: Commit**

```bash
git add prisma/migrations/20260403144014_seed_default_admin/migration.sql
git commit -m "fix: update seed admin migration to use status column"
```

---

### Task 3: Update mail template expiry text

**Files:**
- Modify: `src/mail/mail.service.ts:42`

- [ ] **Step 1: Update expiry text**

In `src/mail/mail.service.ts`, replace line 42:
```typescript
        <p>This link expires in 48 hours.</p>
```
with:
```typescript
        <p>This link expires in 24 hours.</p>
```

- [ ] **Step 2: Commit**

```bash
git add src/mail/mail.service.ts
git commit -m "fix: update invitation email expiry text from 48h to 24h"
```

---

### Task 4: Update AdminService — replace active with status, add resendInvitation

**Files:**
- Modify: `src/admin/admin.service.ts`

- [ ] **Step 1: Write failing test for resendInvitation — happy path**

In `src/admin/admin.service.spec.ts`, add to the mock setup (line 15) a `user.delete` mock:

Update the prisma mock type at line 10 to add `delete`:
```typescript
  let prisma: {
    user: {
      findUnique: jest.Mock;
      findMany: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      count: jest.Mock;
      delete: jest.Mock;
    };
    $transaction: jest.Mock;
  };
```

Add `delete: jest.fn()` to the prisma.user object in beforeEach.

Then add this test block after the `listUsers` describe:

```typescript
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
    });
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- --testPathPattern=admin.service.spec`
Expected: FAIL — `service.resendInvitation is not a function`

- [ ] **Step 3: Write failing tests for resend error cases**

Add to the `resendInvitation` describe block:

```typescript
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

      await expect(service.resendInvitation('user-1')).rejects.toThrow(
        HttpException,
      );
    });
```

Add `HttpException` to the imports at the top of the spec file:
```typescript
import { NotFoundException, BadRequestException, HttpException } from '@nestjs/common';
```

- [ ] **Step 4: Update AdminService imports and constants**

In `src/admin/admin.service.ts`, update the import at line 12:
```typescript
import { GlobalRole, Prisma, UserStatus } from '../../generated/prisma/client';
```

Replace line 17:
```typescript
const INVITATION_EXPIRY_HOURS = 48;
```
with:
```typescript
const INVITATION_EXPIRY_HOURS = 24;
const RESEND_COOLDOWN_MINUTES = 5;
```

- [ ] **Step 5: Update USER_BASE_SELECT**

Replace line 24:
```typescript
  active: true,
```
with:
```typescript
  status: true,
```

- [ ] **Step 6: Update listUsers response mapping**

In the `listUsers` method, replace line 67:
```typescript
        active: u.active,
```
with:
```typescript
        status: u.status,
```

- [ ] **Step 7: Update getUser response mapping**

In the `getUser` method, replace line 99:
```typescript
      active: user.active,
```
with:
```typescript
      status: user.status,
```

- [ ] **Step 8: Update inviteUser method**

In the `inviteUser` method, replace line 130:
```typescript
        active: false,
```
with:
```typescript
        status: UserStatus.INVITED,
```

Add `invitation_sent_at: new Date(),` after the `invitation_expires_at` line (line 133):
```typescript
        invitation_expires_at: expiresAt,
        invitation_sent_at: new Date(),
```

Replace lines 149-151 (the return block):
```typescript
      active: user.active,
```
with:
```typescript
      status: user.status,
```

- [ ] **Step 9: Update disableUser method**

Replace line 189:
```typescript
      data: { active: false, refresh_token_hash: null },
```
with:
```typescript
      data: { status: UserStatus.INACTIVE, refresh_token_hash: null },
```

- [ ] **Step 10: Update enableUser method**

Replace line 198:
```typescript
      data: { active: true },
```
with:
```typescript
      data: { status: UserStatus.ACTIVE },
```

- [ ] **Step 11: Update ensureNotLastAdmin method**

Replace line 248:
```typescript
        active: true,
```
with:
```typescript
        status: UserStatus.ACTIVE,
```

- [ ] **Step 12: Add resendInvitation method**

Add this method to `AdminService` before the `private` methods section (before `ensureNotSelf`):

```typescript
  async resendInvitation(userId: string) {
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
        throw new HttpException(
          `Please wait before resending. You can resend after ${remainingMin} minute(s).`,
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
    }

    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = await bcrypt.hash(rawToken, BCRYPT_ROUNDS);
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + INVITATION_EXPIRY_HOURS);

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        invitation_token_hash: tokenHash,
        invitation_expires_at: expiresAt,
        invitation_sent_at: new Date(),
      },
    });

    const frontendUrl = this.config.get<string>(
      'FRONTEND_URL',
      'http://localhost:5173',
    );
    const invitationLink = `${frontendUrl}/invitation/${rawToken}`;

    await this.mail.sendInvitation(user.email, user.name, invitationLink);

    return { message: 'Invitation resent successfully' };
  }
```

Add `HttpException` and `HttpStatus` to the `@nestjs/common` import at the top:
```typescript
import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
```

- [ ] **Step 13: Run tests to verify they pass**

Run: `pnpm test -- --testPathPattern=admin.service.spec`
Expected: All tests pass.

- [ ] **Step 14: Commit**

```bash
git add src/admin/admin.service.ts src/admin/admin.service.spec.ts
git commit -m "feat: add resendInvitation, replace active boolean with UserStatus enum in AdminService"
```

---

### Task 5: Update AdminController — add resend endpoint

**Files:**
- Modify: `src/admin/admin.controller.ts`

- [ ] **Step 1: Add resend endpoint**

Add this method after the `inviteUser` method (after line 45):

```typescript
  @Post(':id/resend-invitation')
  @ApiOperation({ summary: 'Resend invitation email to an invited user' })
  resendInvitation(@Param('id', ParseUUIDPipe) id: string) {
    return this.adminService.resendInvitation(id);
  }
```

- [ ] **Step 2: Commit**

```bash
git add src/admin/admin.controller.ts
git commit -m "feat: add POST /admin/users/:id/resend-invitation endpoint"
```

---

### Task 6: Update AuthService — replace active with status

**Files:**
- Modify: `src/auth/auth.service.ts`

- [ ] **Step 1: Update imports**

Add `UserStatus` to the Prisma import. The auth service doesn't currently import from Prisma client, so add at the top of the file after existing imports:

```typescript
import { UserStatus } from '../../generated/prisma/client';
```

- [ ] **Step 2: Update login method**

Replace line 36:
```typescript
    if (!user || !user.active || !user.password_hash) {
```
with:
```typescript
    if (!user || user.status !== UserStatus.ACTIVE || !user.password_hash) {
```

- [ ] **Step 3: Update refreshToken method**

Replace line 83:
```typescript
    if (!user || !user.active || !user.refresh_token_hash) {
```
with:
```typescript
    if (!user || user.status !== UserStatus.ACTIVE || !user.refresh_token_hash) {
```

- [ ] **Step 4: Update getMe method**

Replace line 105:
```typescript
    if (!user || !user.active) throw new NotFoundException('User not found');
```
with:
```typescript
    if (!user || user.status !== UserStatus.ACTIVE) throw new NotFoundException('User not found');
```

- [ ] **Step 5: Update forgotPassword method**

Replace line 168:
```typescript
    if (!user || !user.active) {
```
with:
```typescript
    if (!user || user.status !== UserStatus.ACTIVE) {
```

- [ ] **Step 6: Update resetPassword method**

Replace line 204:
```typescript
    if (!user || !user.active) {
```
with:
```typescript
    if (!user || user.status !== UserStatus.ACTIVE) {
```

- [ ] **Step 7: Update validateInvitation method**

In the `validateInvitation` method (line 226), add `status: UserStatus.INVITED` to the where clause:

```typescript
    const users = await this.prisma.user.findMany({
      where: {
        status: UserStatus.INVITED,
        invitation_token_hash: { not: null },
        invitation_accepted_at: null,
        invitation_expires_at: { gt: new Date() },
      },
```

Do the same for the `acceptInvitation` method's findMany query (line 251):

```typescript
    const users = await this.prisma.user.findMany({
      where: {
        status: UserStatus.INVITED,
        invitation_token_hash: { not: null },
        invitation_accepted_at: null,
        invitation_expires_at: { gt: new Date() },
      },
    });
```

- [ ] **Step 8: Update acceptInvitation method**

Replace line 278:
```typescript
        active: true,
```
with:
```typescript
        status: UserStatus.ACTIVE,
```

- [ ] **Step 9: Run auth tests**

Run: `pnpm test -- --testPathPattern=auth.service.spec`
Expected: All tests pass (the spec mocks don't reference `active` on the user directly in assertions — they use mock return values).

- [ ] **Step 10: Commit**

```bash
git add src/auth/auth.service.ts
git commit -m "refactor: replace active boolean with UserStatus enum in AuthService"
```

---

### Task 7: Update AuthService tests

**Files:**
- Modify: `src/auth/auth.service.spec.ts`

- [ ] **Step 1: Update mock user objects**

Replace all `active: false` with `status: 'INACTIVE'` and `active: true` with `status: 'ACTIVE'` in the spec file.

Line 55:
```typescript
        active: false,
```
becomes:
```typescript
        status: 'INACTIVE',
```

Line 71:
```typescript
        active: true,
```
becomes:
```typescript
        status: 'ACTIVE',
```

Line 123:
```typescript
        active: true,
```
becomes:
```typescript
        status: 'ACTIVE',
```

- [ ] **Step 2: Run tests**

Run: `pnpm test -- --testPathPattern=auth.service.spec`
Expected: All tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/auth/auth.service.spec.ts
git commit -m "test: update auth service tests to use UserStatus enum"
```

---

### Task 8: Update JWT strategy

**Files:**
- Modify: `src/auth/strategies/jwt.strategy.ts`

- [ ] **Step 1: Add UserStatus import**

Add to imports:
```typescript
import { UserStatus } from '../../../generated/prisma/client';
```

- [ ] **Step 2: Replace active check**

Replace line 32:
```typescript
    if (!user || !user.active) {
```
with:
```typescript
    if (!user || user.status !== UserStatus.ACTIVE) {
```

- [ ] **Step 3: Commit**

```bash
git add src/auth/strategies/jwt.strategy.ts
git commit -m "refactor: replace active boolean with UserStatus check in JWT strategy"
```

---

### Task 9: Update AdminService tests for status field

**Files:**
- Modify: `src/admin/admin.service.spec.ts`

- [ ] **Step 1: Update existing test mock data**

Replace all `active: true` / `active: false` references in existing tests:

Line 62 (`enableUser` test):
```typescript
      prisma.user.findUnique.mockResolvedValue({ id: 'user-1', active: false });
```
becomes:
```typescript
      prisma.user.findUnique.mockResolvedValue({ id: 'user-1', status: 'INACTIVE' });
```

Line 71 (`enableUser` assertion):
```typescript
        data: { active: true },
```
becomes:
```typescript
        data: { status: 'ACTIVE' },
```

Line 89 (`disableUser` mock):
```typescript
        active: true,
```
becomes:
```typescript
        status: 'ACTIVE',
```

Line 91:
```typescript
      prisma.user.update.mockResolvedValue({ id: 'user-1', active: false });
```
becomes:
```typescript
      prisma.user.update.mockResolvedValue({ id: 'user-1', status: 'INACTIVE' });
```

Line 97 (`disableUser` assertion):
```typescript
        data: { active: false, refresh_token_hash: null },
```
becomes:
```typescript
        data: { status: 'INACTIVE', refresh_token_hash: null },
```

Line 105 (`disableUser` last admin mock):
```typescript
        active: true,
```
becomes:
```typescript
        status: 'ACTIVE',
```

Line 121 (`listUsers` makeUser helper):
```typescript
      active: true,
```
becomes:
```typescript
      status: 'ACTIVE',
```

- [ ] **Step 2: Run all tests**

Run: `pnpm test -- --testPathPattern=admin.service.spec`
Expected: All tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/admin/admin.service.spec.ts
git commit -m "test: update admin service tests to use UserStatus enum"
```

---

### Task 10: Final verification

- [ ] **Step 1: Run full test suite**

Run: `pnpm test`
Expected: All tests pass.

- [ ] **Step 2: Build check**

Run: `pnpm build`
Expected: TypeScript compiles without errors.

- [ ] **Step 3: Lint**

Run: `pnpm lint`
Expected: No linting errors.

- [ ] **Step 4: Commit any lint fixes if needed**

```bash
git add -A
git commit -m "chore: lint fixes"
```
