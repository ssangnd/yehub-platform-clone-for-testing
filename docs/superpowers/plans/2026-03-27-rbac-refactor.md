# RBAC Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor from project-only roles to two-tier RBAC (global + project-scoped) with admin-controlled email invitations.

**Architecture:** Guard-per-layer approach — `GlobalRolesGuard` for platform permissions, `ProjectRolesGuard` (updated) for project permissions. JWT payload carries global role to avoid extra DB queries. Nodemailer handles invitation emails.

**Tech Stack:** NestJS, Prisma, PostgreSQL, React, Zustand, React Query, React Router, Zod, Tailwind CSS

**Spec:** `docs/superpowers/specs/2026-03-27-rbac-refactor-design.md`

---

## File Structure

### Backend — New Files
- `src/auth/decorators/global-roles.decorator.ts` — GlobalRoles decorator for setting required global roles metadata
- `src/auth/guards/global-roles.guard.ts` — Guard that checks JWT global role against required roles
- `src/admin/admin.module.ts` — NestJS module for admin user management
- `src/admin/admin.service.ts` — Business logic: list users, invite, disable, remove, change role
- `src/admin/admin.controller.ts` — REST endpoints under `/admin/users`
- `src/admin/dto/invite-user.dto.ts` — DTO for invite endpoint
- `src/admin/dto/update-global-role.dto.ts` — DTO for role change endpoint
- `src/auth/dto/accept-invitation.dto.ts` — DTO for invitation acceptance
- `src/mail/mail.module.ts` — NestJS module for email service
- `src/mail/mail.service.ts` — Nodemailer wrapper with SMTP configuration

### Backend — Modified Files
- `prisma/schema.prisma` — Add GlobalRole enum, update ProjectRole enum, update User model
- `src/auth/strategies/jwt.strategy.ts` — Return global role in JWT validation
- `src/auth/auth.service.ts` — Add role to JWT payload, add invitation methods, remove register
- `src/auth/auth.controller.ts` — Remove register endpoint, add invitation endpoints
- `src/auth/auth.module.ts` — Register new providers and imports
- `src/auth/guards/project-roles.guard.ts` — Update enum references (ADMIN → MANAGER)
- `src/auth/decorators/roles.decorator.ts` — Rename decorator to ProjectRoles for clarity
- `src/auth/decorators/current-user.decorator.ts` — Add role to JwtUser interface
- `src/projects/projects.controller.ts` — Update role guards (ADMIN → MANAGER), add GlobalRoles for create
- `src/projects/projects.service.ts` — Update role references (ADMIN → MANAGER)
- `src/projects/dto/add-member.dto.ts` — Enum auto-updates with Prisma
- `src/projects/dto/update-member.dto.ts` — Enum auto-updates with Prisma
- `src/config/env.validation.ts` — Add optional SMTP env vars
- `src/app.module.ts` — Import AdminModule and MailModule
- `prisma/seed.ts` — Seed initial admin user with global roles

### Frontend — New Files
- `src/api/admin.ts` — API layer for admin user management endpoints
- `src/pages/admin/admin-panel.tsx` — Admin panel page with user list, invite modal, user details
- `src/pages/invitation.tsx` — Invitation acceptance page
- `src/lib/schemas.ts` — Add invitationSchema, inviteUserSchema (modify existing)
- `src/components/admin-route.tsx` — Route guard for admin-only routes

### Frontend — Modified Files
- `src/api/projects.ts` — Update ProjectRole type (remove ADMIN, add EXECUTIVE)
- `src/api/auth.ts` — Remove register method, add invitation methods
- `src/store/auth.store.ts` — Add `role` to AuthUser type
- `src/hooks/use-can.ts` — Extend with global actions and updated project permissions
- `src/pages/login.tsx` — Remove register link
- `src/pages/projects/projects-list.tsx` — Conditional create button based on global role
- `src/pages/projects/project-detail.tsx` — Update role labels and dropdown options
- `src/pages/projects/project-settings.tsx` — Update ADMIN check to MANAGER
- `src/router.tsx` — Add admin route, invitation route, remove register route

### Frontend — Delete Files
- `src/pages/register.tsx` — No more public registration

---

## Task 1: Prisma Schema Migration

**Files:**
- Modify: `yehub-be/prisma/schema.prisma`

- [ ] **Step 1: Add GlobalRole enum and EXECUTIVE to ProjectRole, update User model**

In `yehub-be/prisma/schema.prisma`, replace the `ProjectRole` enum and `User` model:

```prisma
// ─── Enums ───────────────────────────────────────────────────────────

enum GlobalRole {
  ADMIN
  INTERNAL_USER
  AUTHORIZED_USER

  @@map("global_role")
}

enum ProjectRole {
  MANAGER
  EXECUTIVE
  ANALYST
  VIEWER

  @@map("project_role")
}
```

Update the `User` model:

```prisma
model User {
  id                     String      @id @default(uuid()) @db.Uuid
  email                  String      @unique
  password_hash          String?
  name                   String
  role                   GlobalRole  @default(AUTHORIZED_USER)
  active                 Boolean     @default(true)
  refresh_token_hash     String?
  invited_by             String?     @db.Uuid
  invitation_token_hash  String?
  invitation_expires_at  DateTime?
  invitation_accepted_at DateTime?
  last_login_at          DateTime?
  created_at             DateTime    @default(now())
  updated_at             DateTime    @updatedAt

  memberships ProjectMembership[]

  @@index([active])
  @@map("users")
}
```

- [ ] **Step 2: Generate and run migration**

```bash
cd yehub-be
pnpm prisma migrate dev --name rbac-global-roles
```

Expected: Migration creates `GlobalRole` enum, adds columns to `users`, updates `ProjectRole` enum (removes `ADMIN`, adds `EXECUTIVE`).

Note: If the migration fails due to existing data with `ADMIN` role in `project_memberships`, the migration SQL may need a manual step. Generate with `--create-only` first:

```bash
pnpm prisma migrate dev --name rbac-global-roles --create-only
```

Then edit the generated migration SQL to delete ADMIN memberships before altering the enum:

```sql
-- Delete memberships with ADMIN role before removing it from enum
DELETE FROM "project_memberships" WHERE "role" = 'ADMIN';
```

Then apply:

```bash
pnpm prisma migrate dev
```

- [ ] **Step 3: Verify generated Prisma client**

```bash
cd yehub-be
pnpm prisma generate
```

Verify the generated types include `GlobalRole` and updated `ProjectRole`:

```bash
grep -r "GlobalRole" generated/prisma/client/
grep -r "EXECUTIVE" generated/prisma/client/
```

Expected: Both enums appear in the generated client.

- [ ] **Step 4: Commit**

```bash
git add yehub-be/prisma/
git commit -m "feat(be): add GlobalRole enum and update schema for two-tier RBAC"
```

---

## Task 2: Backend Global Roles Guard & Decorator

**Files:**
- Create: `yehub-be/src/auth/decorators/global-roles.decorator.ts`
- Create: `yehub-be/src/auth/guards/global-roles.guard.ts`
- Modify: `yehub-be/src/auth/decorators/current-user.decorator.ts`

- [ ] **Step 1: Update JwtUser interface to include role**

In `yehub-be/src/auth/decorators/current-user.decorator.ts`, update the interface:

```typescript
import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { GlobalRole } from '../../../generated/prisma/client';

export interface JwtUser {
  id: string;
  email: string;
  role: GlobalRole;
}

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): JwtUser => {
    const request = ctx.switchToHttp().getRequest();
    return request.user;
  },
);
```

- [ ] **Step 2: Create GlobalRoles decorator**

Create `yehub-be/src/auth/decorators/global-roles.decorator.ts`:

```typescript
import { SetMetadata } from '@nestjs/common';
import { GlobalRole } from '../../../generated/prisma/client';

export const GLOBAL_ROLES_KEY = 'globalRoles';
export const GlobalRoles = (...roles: GlobalRole[]) =>
  SetMetadata(GLOBAL_ROLES_KEY, roles);
```

- [ ] **Step 3: Create GlobalRolesGuard**

Create `yehub-be/src/auth/guards/global-roles.guard.ts`:

```typescript
import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { GlobalRole } from '../../../generated/prisma/client';
import { GLOBAL_ROLES_KEY } from '../decorators/global-roles.decorator';

@Injectable()
export class GlobalRolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<GlobalRole[]>(
      GLOBAL_ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const { user } = context.switchToHttp().getRequest();
    return requiredRoles.includes(user.role);
  }
}
```

- [ ] **Step 4: Update ProjectRolesGuard references**

In `yehub-be/src/auth/guards/project-roles.guard.ts`, the `ProjectRole` import already comes from Prisma. The enum values changed (ADMIN removed, EXECUTIVE added), so the guard logic works as-is. No code changes needed — the guard checks `requiredRoles.includes(membership.role)` which works with the new enum values.

- [ ] **Step 5: Rename Roles decorator to ProjectRoles for clarity**

In `yehub-be/src/auth/decorators/roles.decorator.ts`:

```typescript
import { SetMetadata } from '@nestjs/common';
import { ProjectRole } from '../../../generated/prisma/client';

export const ROLES_KEY = 'projectRoles';
export const ProjectRoles = (...roles: ProjectRole[]) =>
  SetMetadata(ROLES_KEY, roles);

// Keep backward-compatible alias during migration
export const Roles = ProjectRoles;
```

- [ ] **Step 6: Export new guard from AuthModule**

In `yehub-be/src/auth/auth.module.ts`, add the new guard:

```typescript
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { ProjectRolesGuard } from './guards/project-roles.guard';
import { GlobalRolesGuard } from './guards/global-roles.guard';

@Module({
  imports: [
    PassportModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET'),
        signOptions: { expiresIn: '24h' },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtStrategy,
    JwtAuthGuard,
    ProjectRolesGuard,
    GlobalRolesGuard,
  ],
  exports: [JwtAuthGuard, ProjectRolesGuard, GlobalRolesGuard],
})
export class AuthModule {}
```

- [ ] **Step 7: Commit**

```bash
git add yehub-be/src/auth/
git commit -m "feat(be): add GlobalRolesGuard and GlobalRoles decorator"
```

---

## Task 3: Update JWT Strategy & Auth Service

**Files:**
- Modify: `yehub-be/src/auth/strategies/jwt.strategy.ts`
- Modify: `yehub-be/src/auth/auth.service.ts`

- [ ] **Step 1: Update JWT strategy to return global role**

In `yehub-be/src/auth/strategies/jwt.strategy.ts`:

```typescript
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../../prisma/prisma.service';

export interface JwtPayload {
  sub: string;
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
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
    });

    if (!user || !user.active) {
      throw new UnauthorizedException();
    }

    return { id: user.id, email: user.email, role: user.role };
  }
}
```

- [ ] **Step 2: Update auth service — add role to JWT, update login to track last_login_at, remove register**

In `yehub-be/src/auth/auth.service.ts`, replace the entire file:

```typescript
import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { AcceptInvitationDto } from './dto/accept-invitation.dto';

const BCRYPT_ROUNDS = 10;
const ACCESS_TOKEN_EXPIRY = '24h';
const REFRESH_TOKEN_EXPIRY = '7d';
const RESET_TOKEN_EXPIRY = '15m';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (!user || !user.active || !user.password_hash) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const passwordValid = await bcrypt.compare(
      dto.password,
      user.password_hash,
    );
    if (!passwordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const payload = { sub: user.id, email: user.email, role: user.role };

    const accessToken = this.jwtService.sign(payload, {
      expiresIn: ACCESS_TOKEN_EXPIRY,
    });

    const refreshToken = this.jwtService.sign(payload, {
      secret: process.env.JWT_REFRESH_SECRET,
      expiresIn: REFRESH_TOKEN_EXPIRY,
    });

    const refreshTokenHash = await bcrypt.hash(refreshToken, BCRYPT_ROUNDS);
    await this.prisma.user.update({
      where: { id: user.id },
      data: { refresh_token_hash: refreshTokenHash, last_login_at: new Date() },
    });

    return { access_token: accessToken, refresh_token: refreshToken };
  }

  async refreshToken(refreshToken: string) {
    let payload: { sub: string; email: string };

    try {
      payload = this.jwtService.verify(refreshToken, {
        secret: process.env.JWT_REFRESH_SECRET,
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
    });

    if (!user || !user.active || !user.refresh_token_hash) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const tokenValid = await bcrypt.compare(
      refreshToken,
      user.refresh_token_hash,
    );
    if (!tokenValid) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const newPayload = { sub: user.id, email: user.email, role: user.role };
    const accessToken = this.jwtService.sign(newPayload, {
      expiresIn: ACCESS_TOKEN_EXPIRY,
    });

    return { access_token: accessToken };
  }

  async getMe(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.active) throw new NotFoundException('User not found');
    const { password_hash, refresh_token_hash, invitation_token_hash, ...result } = user;
    return result;
  }

  async updateProfile(userId: string, dto: UpdateProfileDto) {
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

    const { password_hash, refresh_token_hash, invitation_token_hash, ...result } = user;
    return result;
  }

  async changePassword(userId: string, dto: ChangePasswordDto) {
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
      data: { password_hash: passwordHash },
    });

    return { message: 'Password changed successfully' };
  }

  async forgotPassword(email: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });

    if (!user || !user.active) {
      return { message: 'If that email exists, a reset link has been sent.' };
    }

    const payload = { sub: user.id, type: 'password_reset' };
    const resetToken = this.jwtService.sign(payload, {
      expiresIn: RESET_TOKEN_EXPIRY,
    });

    // TODO: Send reset email with resetToken
    if (process.env.NODE_ENV !== 'production') {
      console.log(`[DEV] Password reset token for ${email}: ${resetToken}`);
    }

    return { message: 'If that email exists, a reset link has been sent.' };
  }

  async resetPassword(token: string, newPassword: string) {
    let payload: { sub: string; type: string };

    try {
      payload = this.jwtService.verify(token);
    } catch {
      throw new UnauthorizedException('Invalid or expired reset token');
    }

    if (payload.type !== 'password_reset') {
      throw new UnauthorizedException('Invalid reset token');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
    });

    if (!user || !user.active) {
      throw new UnauthorizedException('Invalid reset token');
    }

    const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    await this.prisma.user.update({
      where: { id: user.id },
      data: { password_hash: passwordHash, refresh_token_hash: null },
    });

    return { message: 'Password reset successfully' };
  }

  async validateInvitation(token: string) {
    const users = await this.prisma.user.findMany({
      where: {
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
      const valid = await bcrypt.compare(token, user.invitation_token_hash!);
      if (valid) {
        return { email: user.email, name: user.name };
      }
    }

    throw new UnauthorizedException('Invalid or expired invitation token');
  }

  async acceptInvitation(token: string, dto: AcceptInvitationDto) {
    const users = await this.prisma.user.findMany({
      where: {
        invitation_token_hash: { not: null },
        invitation_accepted_at: null,
        invitation_expires_at: { gt: new Date() },
      },
    });

    let matchedUser: (typeof users)[0] | null = null;
    for (const user of users) {
      const valid = await bcrypt.compare(token, user.invitation_token_hash!);
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
        active: true,
        invitation_accepted_at: new Date(),
        invitation_token_hash: null,
        invitation_expires_at: null,
      },
    });

    return { message: 'Account activated successfully' };
  }
}
```

- [ ] **Step 3: Create AcceptInvitationDto**

Create `yehub-be/src/auth/dto/accept-invitation.dto.ts`:

```typescript
import { IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class AcceptInvitationDto {
  @ApiProperty({ minLength: 8 })
  @IsString()
  @MinLength(8)
  password: string;
}
```

- [ ] **Step 4: Update auth controller — remove register, add invitation endpoints**

In `yehub-be/src/auth/auth.controller.ts`, replace entirely:

```typescript
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { AcceptInvitationDto } from './dto/accept-invitation.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { CurrentUser } from './decorators/current-user.decorator';
import type { JwtUser } from './decorators/current-user.decorator';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiOperation({ summary: 'Login with email and password' })
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Post('refresh-token')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Refresh access token' })
  refreshToken(@Body() dto: RefreshTokenDto) {
    return this.authService.refreshToken(dto.refresh_token);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current user profile' })
  getMe(@CurrentUser() user: JwtUser) {
    return this.authService.getMe(user.id);
  }

  @Patch('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update current user profile (name, email)' })
  updateProfile(@CurrentUser() user: JwtUser, @Body() dto: UpdateProfileDto) {
    return this.authService.updateProfile(user.id, dto);
  }

  @Patch('me/password')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Change current user password' })
  changePassword(@CurrentUser() user: JwtUser, @Body() dto: ChangePasswordDto) {
    return this.authService.changePassword(user.id, dto);
  }

  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  @ApiOperation({ summary: 'Request a password reset email' })
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto.email);
  }

  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reset password with token from email' })
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto.token, dto.new_password);
  }

  @Get('invitation/:token')
  @ApiOperation({ summary: 'Validate invitation token' })
  validateInvitation(@Param('token') token: string) {
    return this.authService.validateInvitation(token);
  }

  @Post('invitation/:token/accept')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Accept invitation and set password' })
  acceptInvitation(
    @Param('token') token: string,
    @Body() dto: AcceptInvitationDto,
  ) {
    return this.authService.acceptInvitation(token, dto);
  }
}
```

- [ ] **Step 5: Delete register DTO (optional cleanup)**

The `register.dto.ts` file is no longer imported anywhere. Delete it:

```bash
rm yehub-be/src/auth/dto/register.dto.ts
```

- [ ] **Step 6: Verify backend compiles**

```bash
cd yehub-be && pnpm build
```

Expected: Build succeeds with no errors.

- [ ] **Step 7: Commit**

```bash
git add yehub-be/src/auth/
git commit -m "feat(be): update JWT with global role, add invitation endpoints, remove register"
```

---

## Task 4: Mail Service

**Files:**
- Create: `yehub-be/src/mail/mail.module.ts`
- Create: `yehub-be/src/mail/mail.service.ts`
- Modify: `yehub-be/src/config/env.validation.ts`

- [ ] **Step 1: Install nodemailer**

```bash
cd yehub-be && pnpm add nodemailer && pnpm add -D @types/nodemailer
```

- [ ] **Step 2: Add SMTP env vars to validation schema**

In `yehub-be/src/config/env.validation.ts`:

```typescript
import * as Joi from 'joi';

export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test')
    .default('development'),
  PORT: Joi.number().default(3000),
  DATABASE_URL: Joi.string().required(),
  REDIS_URL: Joi.string().uri().required(),
  JWT_SECRET: Joi.string().min(16).required(),
  JWT_REFRESH_SECRET: Joi.string().min(16).required(),
  FRONTEND_URL: Joi.string().default('http://localhost:5173'),
  SMTP_HOST: Joi.string().optional(),
  SMTP_PORT: Joi.number().default(587),
  SMTP_USER: Joi.string().optional(),
  SMTP_PASS: Joi.string().optional(),
  SMTP_FROM: Joi.string().default('noreply@yehub.com'),
});
```

- [ ] **Step 3: Create mail service**

Create `yehub-be/src/mail/mail.service.ts`:

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter: nodemailer.Transporter | null = null;

  constructor(private readonly config: ConfigService) {
    const host = this.config.get<string>('SMTP_HOST');
    if (host) {
      this.transporter = nodemailer.createTransport({
        host,
        port: this.config.get<number>('SMTP_PORT', 587),
        auth: {
          user: this.config.get<string>('SMTP_USER'),
          pass: this.config.get<string>('SMTP_PASS'),
        },
      });
    }
  }

  async sendInvitation(email: string, name: string, invitationLink: string) {
    const from = this.config.get<string>('SMTP_FROM', 'noreply@yehub.com');

    if (!this.transporter) {
      this.logger.warn(
        `[DEV] SMTP not configured. Invitation link for ${email}: ${invitationLink}`,
      );
      return;
    }

    await this.transporter.sendMail({
      from,
      to: email,
      subject: 'You have been invited to YeHub',
      html: `
        <h2>Welcome to YeHub, ${name}!</h2>
        <p>You have been invited to join the YeHub platform.</p>
        <p>Click the link below to set your password and activate your account:</p>
        <p><a href="${invitationLink}">${invitationLink}</a></p>
        <p>This link expires in 48 hours.</p>
      `,
    });
  }
}
```

- [ ] **Step 4: Create mail module**

Create `yehub-be/src/mail/mail.module.ts`:

```typescript
import { Global, Module } from '@nestjs/common';
import { MailService } from './mail.service';

@Global()
@Module({
  providers: [MailService],
  exports: [MailService],
})
export class MailModule {}
```

- [ ] **Step 5: Register MailModule in AppModule**

In `yehub-be/src/app.module.ts`, add the import:

```typescript
import { MailModule } from './mail/mail.module';
```

Add `MailModule` to the `imports` array (after `QueueModule`):

```typescript
imports: [
  // ... existing imports
  PrismaModule,
  QueueModule,
  MailModule,
  AuthModule,
  ProjectsModule,
],
```

- [ ] **Step 6: Commit**

```bash
git add yehub-be/src/mail/ yehub-be/src/config/ yehub-be/src/app.module.ts yehub-be/package.json yehub-be/pnpm-lock.yaml
git commit -m "feat(be): add mail service with Nodemailer for invitations"
```

---

## Task 5: Admin Module

**Files:**
- Create: `yehub-be/src/admin/admin.module.ts`
- Create: `yehub-be/src/admin/admin.service.ts`
- Create: `yehub-be/src/admin/admin.controller.ts`
- Create: `yehub-be/src/admin/dto/invite-user.dto.ts`
- Create: `yehub-be/src/admin/dto/update-global-role.dto.ts`
- Modify: `yehub-be/src/app.module.ts`

- [ ] **Step 1: Create InviteUserDto**

Create `yehub-be/src/admin/dto/invite-user.dto.ts`:

```typescript
import { IsEmail, IsEnum, IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { GlobalRole } from '../../../generated/prisma/client';

export class InviteUserDto {
  @ApiProperty({ example: 'John Doe' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ example: 'user@example.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ enum: GlobalRole })
  @IsEnum(GlobalRole)
  role: GlobalRole;
}
```

- [ ] **Step 2: Create UpdateGlobalRoleDto**

Create `yehub-be/src/admin/dto/update-global-role.dto.ts`:

```typescript
import { IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { GlobalRole } from '../../../generated/prisma/client';

export class UpdateGlobalRoleDto {
  @ApiProperty({ enum: GlobalRole })
  @IsEnum(GlobalRole)
  role: GlobalRole;
}
```

- [ ] **Step 3: Create admin service**

Create `yehub-be/src/admin/admin.service.ts`:

```typescript
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { ConfigService } from '@nestjs/config';
import { GlobalRole } from '../../generated/prisma/client';
import { InviteUserDto } from './dto/invite-user.dto';

const BCRYPT_ROUNDS = 10;
const INVITATION_EXPIRY_HOURS = 48;

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly config: ConfigService,
  ) {}

  async listUsers() {
    const users = await this.prisma.user.findMany({
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        active: true,
        last_login_at: true,
        created_at: true,
        _count: { select: { memberships: true } },
      },
      orderBy: { created_at: 'desc' },
    });

    return users.map((u) => ({
      id: u.id,
      email: u.email,
      name: u.name,
      role: u.role,
      active: u.active,
      last_login_at: u.last_login_at,
      created_at: u.created_at,
      project_count: u._count.memberships,
    }));
  }

  async getUser(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        active: true,
        last_login_at: true,
        created_at: true,
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
      active: user.active,
      last_login_at: user.last_login_at,
      created_at: user.created_at,
      memberships: user.memberships.map((m) => ({
        project_id: m.project_id,
        project_name: m.project.name,
        role: m.role,
        joined_at: m.created_at,
      })),
    };
  }

  async inviteUser(dto: InviteUserDto, invitedById: string) {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (existing) {
      throw new ConflictException('Email already in use');
    }

    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = await bcrypt.hash(rawToken, BCRYPT_ROUNDS);
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + INVITATION_EXPIRY_HOURS);

    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        name: dto.name,
        role: dto.role,
        active: false,
        invited_by: invitedById,
        invitation_token_hash: tokenHash,
        invitation_expires_at: expiresAt,
      },
    });

    const frontendUrl = this.config.get<string>(
      'FRONTEND_URL',
      'http://localhost:5173',
    );
    const invitationLink = `${frontendUrl}/invitation/${rawToken}`;

    await this.mail.sendInvitation(dto.email, dto.name, invitationLink);

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      active: user.active,
    };
  }

  async updateGlobalRole(userId: string, role: GlobalRole) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });
    if (!user) throw new NotFoundException('User not found');

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

  async disableUser(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });
    if (!user) throw new NotFoundException('User not found');

    if (user.role === GlobalRole.ADMIN) {
      await this.ensureNotLastAdmin(userId);
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: { active: false, refresh_token_hash: null },
    });
  }

  async removeUser(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });
    if (!user) throw new NotFoundException('User not found');

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

  private async ensureNotLastAdmin(excludeUserId: string) {
    const adminCount = await this.prisma.user.count({
      where: {
        role: GlobalRole.ADMIN,
        active: true,
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
```

- [ ] **Step 4: Create admin controller**

Create `yehub-be/src/admin/admin.controller.ts`:

```typescript
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { GlobalRole } from '../../generated/prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { GlobalRolesGuard } from '../auth/guards/global-roles.guard';
import { GlobalRoles } from '../auth/decorators/global-roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { JwtUser } from '../auth/decorators/current-user.decorator';
import { AdminService } from './admin.service';
import { InviteUserDto } from './dto/invite-user.dto';
import { UpdateGlobalRoleDto } from './dto/update-global-role.dto';

@ApiTags('Admin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, GlobalRolesGuard)
@GlobalRoles(GlobalRole.ADMIN)
@Controller('admin/users')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get()
  @ApiOperation({ summary: 'List all users' })
  listUsers() {
    return this.adminService.listUsers();
  }

  @Post('invite')
  @ApiOperation({ summary: 'Invite a new user via email' })
  inviteUser(
    @CurrentUser() user: JwtUser,
    @Body() dto: InviteUserDto,
  ) {
    return this.adminService.inviteUser(dto, user.id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get user details with project memberships' })
  getUser(@Param('id', ParseUUIDPipe) id: string) {
    return this.adminService.getUser(id);
  }

  @Patch(':id/role')
  @ApiOperation({ summary: "Change user's global role" })
  updateRole(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateGlobalRoleDto,
  ) {
    return this.adminService.updateGlobalRole(id, dto.role);
  }

  @Patch(':id/disable')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Disable user account' })
  disableUser(@Param('id', ParseUUIDPipe) id: string) {
    return this.adminService.disableUser(id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove user permanently' })
  removeUser(@Param('id', ParseUUIDPipe) id: string) {
    return this.adminService.removeUser(id);
  }

  @Delete(':id/memberships/:projectId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove user from a project' })
  removeUserMembership(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
  ) {
    return this.adminService.removeUserMembership(id, projectId);
  }
}
```

- [ ] **Step 5: Create admin module**

Create `yehub-be/src/admin/admin.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';

@Module({
  imports: [AuthModule],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
```

- [ ] **Step 6: Register AdminModule in AppModule**

In `yehub-be/src/app.module.ts`, add the import:

```typescript
import { AdminModule } from './admin/admin.module';
```

Add `AdminModule` to the `imports` array:

```typescript
imports: [
  // ... existing imports
  MailModule,
  AuthModule,
  AdminModule,
  ProjectsModule,
],
```

- [ ] **Step 7: Verify backend compiles**

```bash
cd yehub-be && pnpm build
```

Expected: Build succeeds.

- [ ] **Step 8: Commit**

```bash
git add yehub-be/src/admin/ yehub-be/src/app.module.ts
git commit -m "feat(be): add admin module with user management endpoints"
```

---

## Task 6: Update Projects Module for New Roles

**Files:**
- Modify: `yehub-be/src/projects/projects.controller.ts`
- Modify: `yehub-be/src/projects/projects.service.ts`

- [ ] **Step 1: Update projects controller — ADMIN → MANAGER, add GlobalRoles for create**

In `yehub-be/src/projects/projects.controller.ts`, replace entirely:

```typescript
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ProjectRole, GlobalRole } from '../../generated/prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ProjectRolesGuard } from '../auth/guards/project-roles.guard';
import { GlobalRolesGuard } from '../auth/guards/global-roles.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { JwtUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { GlobalRoles } from '../auth/decorators/global-roles.decorator';
import { ProjectsService } from './projects.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { AddMemberDto } from './dto/add-member.dto';
import { UpdateMemberDto } from './dto/update-member.dto';

@ApiTags('Projects')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('projects')
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  @Post()
  @UseGuards(GlobalRolesGuard)
  @GlobalRoles(GlobalRole.ADMIN, GlobalRole.INTERNAL_USER)
  @ApiOperation({ summary: 'Create a project (admin/internal_user only)' })
  create(@CurrentUser() user: JwtUser, @Body() dto: CreateProjectDto) {
    return this.projectsService.create(user.id, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List projects the user is a member of' })
  findAll(@CurrentUser() user: JwtUser) {
    return this.projectsService.findAll(user.id);
  }

  @Get(':id')
  @UseGuards(ProjectRolesGuard)
  @ApiOperation({ summary: 'Get project detail' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.projectsService.findOne(id);
  }

  @Patch(':id')
  @UseGuards(ProjectRolesGuard)
  @Roles(ProjectRole.MANAGER)
  @ApiOperation({ summary: 'Update project (manager only)' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateProjectDto,
  ) {
    return this.projectsService.update(id, dto);
  }

  @Delete(':id')
  @UseGuards(ProjectRolesGuard)
  @Roles(ProjectRole.MANAGER)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Deactivate project (manager only)' })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.projectsService.remove(id);
  }

  @Get(':id/me')
  @UseGuards(ProjectRolesGuard)
  @ApiOperation({ summary: "Get the current user's role in a project" })
  getMyRole(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtUser,
  ) {
    return this.projectsService.getMyRole(id, user.id);
  }

  @Get(':id/members')
  @UseGuards(ProjectRolesGuard)
  @ApiOperation({ summary: 'List project members' })
  listMembers(@Param('id', ParseUUIDPipe) id: string) {
    return this.projectsService.listMembers(id);
  }

  @Post(':id/members')
  @UseGuards(ProjectRolesGuard)
  @Roles(ProjectRole.MANAGER)
  @ApiOperation({ summary: 'Add a member (manager only)' })
  addMember(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AddMemberDto,
  ) {
    return this.projectsService.addMember(id, dto);
  }

  @Patch(':id/members/:userId')
  @UseGuards(ProjectRolesGuard)
  @Roles(ProjectRole.MANAGER)
  @ApiOperation({ summary: "Update a member's role (manager only)" })
  updateMember(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() dto: UpdateMemberDto,
  ) {
    return this.projectsService.updateMember(id, userId, dto.role);
  }

  @Delete(':id/members/:userId')
  @UseGuards(ProjectRolesGuard)
  @Roles(ProjectRole.MANAGER)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove a member (manager only)' })
  removeMember(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('userId', ParseUUIDPipe) userId: string,
  ) {
    return this.projectsService.removeMember(id, userId);
  }
}
```

Note: The class-level `@UseGuards(JwtAuthGuard, ProjectRolesGuard)` is removed. Instead, `JwtAuthGuard` is at class level, and `ProjectRolesGuard`/`GlobalRolesGuard` are applied per-endpoint. This avoids ProjectRolesGuard running on endpoints without a project ID (like `POST /projects` and `GET /projects`).

- [ ] **Step 2: Update projects service — ADMIN → MANAGER**

In `yehub-be/src/projects/projects.service.ts`, make these changes:

1. Replace `ProjectRole.ADMIN` with `ProjectRole.MANAGER` in the `create` method (line where creator becomes project member).
2. Update `ensureNotLastAdmin` to `ensureNotLastManager`:

Replace the entire file:

```typescript
import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ProjectRole } from '../../generated/prisma/client';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { AddMemberDto } from './dto/add-member.dto';

@Injectable()
export class ProjectsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, dto: CreateProjectDto) {
    const project = await this.prisma.project.create({
      data: {
        name: dto.name,
        description: dto.description,
        memberships: {
          create: { user_id: userId, role: ProjectRole.MANAGER },
        },
      },
      include: {
        _count: { select: { memberships: true, campaigns: true } },
      },
    });
    return this.formatProject(project);
  }

  async findAll(userId: string) {
    const projects = await this.prisma.project.findMany({
      where: {
        memberships: { some: { user_id: userId } },
      },
      include: {
        _count: { select: { memberships: true, campaigns: true } },
      },
      orderBy: { created_at: 'desc' },
    });
    return projects.map((p) => this.formatProject(p));
  }

  async findOne(projectId: string) {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      include: {
        _count: { select: { memberships: true, campaigns: true } },
      },
    });
    if (!project) throw new NotFoundException('Project not found');
    return this.formatProject(project);
  }

  async update(projectId: string, dto: UpdateProjectDto) {
    await this.findOne(projectId);
    const project = await this.prisma.project.update({
      where: { id: projectId },
      data: dto,
      include: {
        _count: { select: { memberships: true, campaigns: true } },
      },
    });
    return this.formatProject(project);
  }

  async remove(projectId: string) {
    await this.findOne(projectId);
    await this.prisma.project.update({
      where: { id: projectId },
      data: { active: false },
    });
  }

  async listMembers(projectId: string) {
    await this.findOne(projectId);
    const memberships = await this.prisma.projectMembership.findMany({
      where: { project_id: projectId },
      include: {
        user: { select: { id: true, email: true, name: true } },
      },
      orderBy: { created_at: 'asc' },
    });
    return memberships.map((m) => this.formatMember(m));
  }

  async addMember(projectId: string, dto: AddMemberDto) {
    await this.findOne(projectId);

    const user = await this.prisma.user.findUnique({
      where: { id: dto.user_id },
    });
    if (!user) throw new NotFoundException('User not found');

    const existing = await this.prisma.projectMembership.findUnique({
      where: {
        user_id_project_id: { user_id: dto.user_id, project_id: projectId },
      },
    });
    if (existing) throw new ConflictException('User is already a member');

    const membership = await this.prisma.projectMembership.create({
      data: { user_id: dto.user_id, project_id: projectId, role: dto.role },
      include: {
        user: { select: { id: true, email: true, name: true } },
      },
    });
    return this.formatMember(membership);
  }

  async updateMember(
    projectId: string,
    targetUserId: string,
    role: ProjectRole,
  ) {
    const membership = await this.prisma.projectMembership.findUnique({
      where: {
        user_id_project_id: { user_id: targetUserId, project_id: projectId },
      },
    });
    if (!membership) throw new NotFoundException('Member not found');

    if (
      membership.role === ProjectRole.MANAGER &&
      role !== ProjectRole.MANAGER
    ) {
      await this.ensureNotLastManager(projectId, targetUserId);
    }

    const updated = await this.prisma.projectMembership.update({
      where: {
        user_id_project_id: { user_id: targetUserId, project_id: projectId },
      },
      data: { role },
      include: {
        user: { select: { id: true, email: true, name: true } },
      },
    });
    return this.formatMember(updated);
  }

  async removeMember(projectId: string, targetUserId: string) {
    const membership = await this.prisma.projectMembership.findUnique({
      where: {
        user_id_project_id: { user_id: targetUserId, project_id: projectId },
      },
    });
    if (!membership) throw new NotFoundException('Member not found');

    if (membership.role === ProjectRole.MANAGER) {
      await this.ensureNotLastManager(projectId, targetUserId);
    }

    await this.prisma.projectMembership.delete({
      where: {
        user_id_project_id: { user_id: targetUserId, project_id: projectId },
      },
    });
  }

  async getMyRole(projectId: string, userId: string) {
    const membership = await this.prisma.projectMembership.findUnique({
      where: {
        user_id_project_id: { user_id: userId, project_id: projectId },
      },
    });
    if (!membership) throw new NotFoundException('Member not found');
    return { role: membership.role, joined_at: membership.created_at };
  }

  async getNonMembers(projectId: string) {
    await this.findOne(projectId);
    const users = await this.prisma.user.findMany({
      where: {
        active: true,
        memberships: { none: { project_id: projectId } },
      },
      select: { id: true, email: true, name: true },
      orderBy: { name: 'asc' },
    });
    return users;
  }

  private async ensureNotLastManager(
    projectId: string,
    excludeUserId: string,
  ): Promise<void> {
    const managerCount = await this.prisma.projectMembership.count({
      where: {
        project_id: projectId,
        role: ProjectRole.MANAGER,
        NOT: { user_id: excludeUserId },
      },
    });
    if (managerCount === 0) {
      throw new BadRequestException('Cannot remove the last manager');
    }
  }

  private formatProject(project: {
    id: string;
    name: string;
    description: string | null;
    active: boolean;
    created_at: Date;
    updated_at: Date;
    _count: { memberships: number; campaigns: number };
  }) {
    return {
      id: project.id,
      name: project.name,
      description: project.description,
      active: project.active,
      created_at: project.created_at,
      updated_at: project.updated_at,
      member_count: project._count.memberships,
      campaign_count: project._count.campaigns,
    };
  }

  private formatMember(membership: {
    user_id: string;
    role: ProjectRole;
    created_at: Date;
    user: { id: string; email: string; name: string };
  }) {
    return {
      user_id: membership.user_id,
      email: membership.user.email,
      name: membership.user.name,
      role: membership.role,
      joined_at: membership.created_at,
    };
  }
}
```

Note: Added `getNonMembers` method — needed by the "Add Member" modal in the frontend to show users not already in the project.

- [ ] **Step 3: Add getNonMembers endpoint to controller**

In the projects controller (already written in Step 1), add this endpoint. It's already included if you used the full replacement above. If not, add before the `addMember` endpoint:

```typescript
@Get(':id/non-members')
@UseGuards(ProjectRolesGuard)
@Roles(ProjectRole.MANAGER)
@ApiOperation({ summary: 'List users not in this project (manager only)' })
getNonMembers(@Param('id', ParseUUIDPipe) id: string) {
  return this.projectsService.getNonMembers(id);
}
```

- [ ] **Step 4: Update projects module to import AuthModule (for GlobalRolesGuard)**

In `yehub-be/src/projects/projects.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ProjectsController } from './projects.controller';
import { ProjectsService } from './projects.service';

@Module({
  imports: [AuthModule],
  controllers: [ProjectsController],
  providers: [ProjectsService],
})
export class ProjectsModule {}
```

This is unchanged — AuthModule is already imported.

- [ ] **Step 5: Verify backend compiles**

```bash
cd yehub-be && pnpm build
```

Expected: Build succeeds.

- [ ] **Step 6: Commit**

```bash
git add yehub-be/src/projects/
git commit -m "feat(be): update project roles ADMIN→MANAGER, add getNonMembers endpoint"
```

---

## Task 7: Update Seed Data

**Files:**
- Modify: `yehub-be/prisma/seed.ts`

- [ ] **Step 1: Update seed to use new roles**

Read the current seed file first, then update it to:
- Set global roles on users
- Use `MANAGER` instead of `ADMIN` for project memberships
- Include `EXECUTIVE` role in some memberships
- Set passwords for all users (they're "invited and accepted")
- Set `invitation_accepted_at` and `last_login_at`

Key changes to the seed data:

1. When creating users, add `role`, `last_login_at`, and `invitation_accepted_at` fields:

```typescript
// Example for admin user
{
  email: 'admin@sociallistening.com',
  name: 'Admin User',
  password_hash: hashedPassword,
  role: 'ADMIN',
  last_login_at: new Date(),
  invitation_accepted_at: new Date(),
}
```

2. For project memberships, replace `ADMIN` with `MANAGER` and add `EXECUTIVE`:

```typescript
// Instead of: role: 'ADMIN'
// Use: role: 'MANAGER'
```

The exact changes depend on the current seed file content. Read it, update role references, and add global role assignments.

- [ ] **Step 2: Run seed**

```bash
cd yehub-be && pnpm prisma db seed
```

Expected: Seed completes without errors.

- [ ] **Step 3: Commit**

```bash
git add yehub-be/prisma/seed.ts
git commit -m "feat(be): update seed data with global roles and new project roles"
```

---

## Task 8: Frontend Types & API Layer

**Files:**
- Modify: `yehub-fe/src/api/projects.ts`
- Modify: `yehub-fe/src/api/auth.ts`
- Create: `yehub-fe/src/api/admin.ts`

- [ ] **Step 1: Update ProjectRole type and add GlobalRole type**

In `yehub-fe/src/api/projects.ts`, update the `ProjectRole` type:

```typescript
export type ProjectRole = 'MANAGER' | 'EXECUTIVE' | 'ANALYST' | 'VIEWER';
```

Remove `'ADMIN'` from the type.

Add the non-members endpoint:

```typescript
getNonMembers: (projectId: string) =>
  apiClient.get<{ id: string; email: string; name: string }[]>(
    `/projects/${projectId}/non-members`,
  ).then((r) => r.data),
```

- [ ] **Step 2: Update auth API — remove register, add invitation methods**

In `yehub-fe/src/api/auth.ts`, remove the `register` method and add invitation methods:

```typescript
import { apiClient } from './client';

export type GlobalRole = 'ADMIN' | 'INTERNAL_USER' | 'AUTHORIZED_USER';

interface LoginResponse {
  access_token: string;
  refresh_token: string;
}

interface InvitationInfo {
  email: string;
  name: string;
}

export const authApi = {
  login: (email: string, password: string) =>
    apiClient
      .post<LoginResponse>('/auth/login', { email, password })
      .then((r) => r.data),

  refreshToken: (refreshToken: string) =>
    apiClient
      .post<{ access_token: string }>('/auth/refresh-token', {
        refresh_token: refreshToken,
      })
      .then((r) => r.data),

  getMe: () => apiClient.get('/auth/me').then((r) => r.data),

  updateProfile: (data: { name?: string; email?: string }) =>
    apiClient.patch('/auth/me', data).then((r) => r.data),

  changePassword: (currentPassword: string, newPassword: string) =>
    apiClient
      .patch('/auth/me/password', {
        current_password: currentPassword,
        new_password: newPassword,
      })
      .then((r) => r.data),

  forgotPassword: (email: string) =>
    apiClient
      .post<{ message: string }>('/auth/forgot-password', { email })
      .then((r) => r.data),

  resetPassword: (token: string, newPassword: string) =>
    apiClient
      .post<{ message: string }>('/auth/reset-password', {
        token,
        new_password: newPassword,
      })
      .then((r) => r.data),

  validateInvitation: (token: string) =>
    apiClient
      .get<InvitationInfo>(`/auth/invitation/${token}`)
      .then((r) => r.data),

  acceptInvitation: (token: string, password: string) =>
    apiClient
      .post<{ message: string }>(`/auth/invitation/${token}/accept`, {
        password,
      })
      .then((r) => r.data),
};
```

- [ ] **Step 3: Create admin API**

Create `yehub-fe/src/api/admin.ts`:

```typescript
import { apiClient } from './client';
import type { GlobalRole } from './auth';
import type { ProjectRole } from './projects';

export interface AdminUser {
  id: string;
  email: string;
  name: string;
  role: GlobalRole;
  active: boolean;
  last_login_at: string | null;
  created_at: string;
  project_count: number;
}

export interface AdminUserDetail {
  id: string;
  email: string;
  name: string;
  role: GlobalRole;
  active: boolean;
  last_login_at: string | null;
  created_at: string;
  memberships: {
    project_id: string;
    project_name: string;
    role: ProjectRole;
    joined_at: string;
  }[];
}

export const adminApi = {
  listUsers: () =>
    apiClient.get<AdminUser[]>('/admin/users').then((r) => r.data),

  getUser: (id: string) =>
    apiClient.get<AdminUserDetail>(`/admin/users/${id}`).then((r) => r.data),

  inviteUser: (data: { name: string; email: string; role: GlobalRole }) =>
    apiClient.post('/admin/users/invite', data).then((r) => r.data),

  updateRole: (id: string, role: GlobalRole) =>
    apiClient
      .patch(`/admin/users/${id}/role`, { role })
      .then((r) => r.data),

  disableUser: (id: string) =>
    apiClient.patch(`/admin/users/${id}/disable`).then((r) => r.data),

  removeUser: (id: string) =>
    apiClient.delete(`/admin/users/${id}`).then((r) => r.data),

  removeUserMembership: (userId: string, projectId: string) =>
    apiClient
      .delete(`/admin/users/${userId}/memberships/${projectId}`)
      .then((r) => r.data),
};
```

- [ ] **Step 4: Commit**

```bash
git add yehub-fe/src/api/
git commit -m "feat(fe): update API layer with global roles, admin endpoints, invitation flow"
```

---

## Task 9: Frontend Auth Store & Hooks

**Files:**
- Modify: `yehub-fe/src/store/auth.store.ts`
- Modify: `yehub-fe/src/hooks/use-can.ts`

- [ ] **Step 1: Add role to AuthUser**

In `yehub-fe/src/store/auth.store.ts`, update the `AuthUser` interface:

```typescript
import type { GlobalRole } from '../api/auth';
```

```typescript
interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: GlobalRole;
}
```

No other changes needed — the store persists the full user object.

- [ ] **Step 2: Extend useCan hook for global + project actions**

In `yehub-fe/src/hooks/use-can.ts`, replace entirely:

```typescript
import type { ProjectRole } from '../api/projects';
import type { GlobalRole } from '../api/auth';

type ProjectAction =
  | 'edit'
  | 'manage_members'
  | 'export'
  | 'search'
  | 'create_campaign'
  | 'configure_alerts';

type GlobalAction = 'create_project' | 'manage_users';

const projectPermissions: Record<ProjectAction, ProjectRole[]> = {
  edit: ['MANAGER'],
  manage_members: ['MANAGER'],
  create_campaign: ['MANAGER', 'EXECUTIVE'],
  configure_alerts: ['MANAGER'],
  search: ['MANAGER', 'EXECUTIVE', 'ANALYST'],
  export: ['MANAGER', 'EXECUTIVE', 'ANALYST'],
};

const globalPermissions: Record<GlobalAction, GlobalRole[]> = {
  create_project: ['ADMIN', 'INTERNAL_USER'],
  manage_users: ['ADMIN'],
};

export function useCanProject(
  action: ProjectAction,
  myRole: ProjectRole | null,
): boolean {
  if (!myRole) return false;
  return projectPermissions[action].includes(myRole);
}

export function useCanGlobal(
  action: GlobalAction,
  myRole: GlobalRole | null,
): boolean {
  if (!myRole) return false;
  return globalPermissions[action].includes(myRole);
}

// Backward-compatible alias
export function useCan(
  action: ProjectAction,
  myRole: ProjectRole | null,
): boolean {
  return useCanProject(action, myRole);
}
```

- [ ] **Step 3: Commit**

```bash
git add yehub-fe/src/store/ yehub-fe/src/hooks/
git commit -m "feat(fe): add GlobalRole to auth store, extend useCan for global+project permissions"
```

---

## Task 10: Frontend Schemas

**Files:**
- Modify: `yehub-fe/src/lib/schemas.ts`

- [ ] **Step 1: Remove registerSchema, add invitation and invite schemas**

In `yehub-fe/src/lib/schemas.ts`, replace entirely:

```typescript
import { z } from 'zod';

export const loginSchema = z.object({
  email: z.email(),
  password: z.string().min(1, 'Password is required'),
});

export const forgotPasswordSchema = z.object({
  email: z.email(),
});

export const resetPasswordSchema = z
  .object({
    new_password: z.string().min(8, 'Password must be at least 8 characters'),
    confirm_password: z.string(),
  })
  .refine((data) => data.new_password === data.confirm_password, {
    message: 'Passwords do not match',
    path: ['confirm_password'],
  });

export const acceptInvitationSchema = z
  .object({
    password: z.string().min(8, 'Password must be at least 8 characters'),
    confirm_password: z.string(),
  })
  .refine((data) => data.password === data.confirm_password, {
    message: 'Passwords do not match',
    path: ['confirm_password'],
  });

export const inviteUserSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  email: z.email(),
  role: z.enum(['ADMIN', 'INTERNAL_USER', 'AUTHORIZED_USER']),
});

export const updateProfileSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  email: z.email(),
});

export const changePasswordSchema = z
  .object({
    current_password: z.string().min(1, 'Current password is required'),
    new_password: z.string().min(8, 'Password must be at least 8 characters'),
    confirm_password: z.string(),
  })
  .refine((data) => data.new_password === data.confirm_password, {
    message: 'Passwords do not match',
    path: ['confirm_password'],
  });

export const createProjectSchema = z.object({
  name: z.string().min(2).max(100),
  description: z.string().max(500).optional(),
});

export const updateProjectSchema = createProjectSchema.partial().extend({
  active: z.boolean().optional(),
});

export type LoginFormValues = z.infer<typeof loginSchema>;
export type ForgotPasswordFormValues = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordFormValues = z.infer<typeof resetPasswordSchema>;
export type AcceptInvitationFormValues = z.infer<typeof acceptInvitationSchema>;
export type InviteUserFormValues = z.infer<typeof inviteUserSchema>;
export type UpdateProfileFormValues = z.infer<typeof updateProfileSchema>;
export type ChangePasswordFormValues = z.infer<typeof changePasswordSchema>;
export type CreateProjectFormValues = z.infer<typeof createProjectSchema>;
export type UpdateProjectFormValues = z.infer<typeof updateProjectSchema>;
```

- [ ] **Step 2: Commit**

```bash
git add yehub-fe/src/lib/schemas.ts
git commit -m "feat(fe): update schemas — remove register, add invitation and invite user schemas"
```

---

## Task 11: Frontend Admin Panel Page

**Files:**
- Create: `yehub-fe/src/pages/admin/admin-panel.tsx`
- Create: `yehub-fe/src/components/admin-route.tsx`

- [ ] **Step 1: Create AdminRoute guard component**

Create `yehub-fe/src/components/admin-route.tsx`:

```typescript
import { Navigate, Outlet } from 'react-router-dom';
import { useAuthStore } from '../store/auth.store';

export function AdminRoute() {
  const user = useAuthStore((s) => s.user);

  if (!user || user.role !== 'ADMIN') {
    return <Navigate to="/projects" replace />;
  }

  return <Outlet />;
}
```

- [ ] **Step 2: Create admin panel page**

Create `yehub-fe/src/pages/admin/admin-panel.tsx`:

```typescript
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { UserPlus, X, Trash2, Ban } from 'lucide-react';
import { adminApi } from '../../api/admin';
import type { AdminUser, AdminUserDetail } from '../../api/admin';
import type { GlobalRole } from '../../api/auth';
import { inviteUserSchema } from '../../lib/schemas';
import type { InviteUserFormValues } from '../../lib/schemas';
import { Button } from '../../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '../../components/ui/form';

const ROLE_LABELS: Record<GlobalRole, string> = {
  ADMIN: 'Admin',
  INTERNAL_USER: 'Internal User',
  AUTHORIZED_USER: 'Authorized User',
};

const ROLE_COLORS: Record<GlobalRole, string> = {
  ADMIN: 'bg-red-100 text-red-800',
  INTERNAL_USER: 'bg-blue-100 text-blue-800',
  AUTHORIZED_USER: 'bg-gray-100 text-gray-800',
};

function formatDate(dateStr: string | null) {
  if (!dateStr) return 'Never';
  const date = new Date(dateStr);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  if (days < 1) return 'Today';
  if (days < 30) return `${days} days ago`;
  if (days < 365) return `about ${Math.floor(days / 30)} months ago`;
  return `about ${Math.floor(days / 365)} years ago`;
}

export default function AdminPanelPage() {
  const queryClient = useQueryClient();
  const [showInvite, setShowInvite] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);

  const { data: users = [], isLoading } = useQuery({
    queryKey: ['admin-users'],
    queryFn: adminApi.listUsers,
  });

  const { data: selectedUser } = useQuery({
    queryKey: ['admin-users', selectedUserId],
    queryFn: () => adminApi.getUser(selectedUserId!),
    enabled: !!selectedUserId,
  });

  return (
    <div className="mx-auto max-w-6xl p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Admin Panel</h1>
          <p className="text-muted-foreground">Manage users and permissions</p>
        </div>
        <Button onClick={() => setShowInvite(true)}>
          <UserPlus className="mr-2 h-4 w-4" />
          Invite User
        </Button>
      </div>

      {isLoading ? (
        <p className="text-muted-foreground">Loading...</p>
      ) : (
        <UserTable
          users={users}
          onSelect={(id) => setSelectedUserId(id)}
        />
      )}

      {showInvite && (
        <InviteModal
          onClose={() => setShowInvite(false)}
          onSuccess={() => {
            setShowInvite(false);
            queryClient.invalidateQueries({ queryKey: ['admin-users'] });
          }}
        />
      )}

      {selectedUser && (
        <UserDetailPanel
          user={selectedUser}
          onClose={() => setSelectedUserId(null)}
          onUpdate={() => {
            queryClient.invalidateQueries({ queryKey: ['admin-users'] });
          }}
        />
      )}
    </div>
  );
}

function UserTable({
  users,
  onSelect,
}: {
  users: AdminUser[];
  onSelect: (id: string) => void;
}) {
  return (
    <Card>
      <table className="w-full">
        <thead>
          <tr className="border-b text-left text-sm text-muted-foreground">
            <th className="p-4">User</th>
            <th className="p-4">Role</th>
            <th className="p-4">Status</th>
            <th className="p-4">Projects</th>
            <th className="p-4">Last Login</th>
          </tr>
        </thead>
        <tbody>
          {users.map((user) => (
            <tr
              key={user.id}
              className="cursor-pointer border-b hover:bg-muted/50"
              onClick={() => onSelect(user.id)}
            >
              <td className="p-4">
                <div className="font-medium">{user.name}</div>
                <div className="text-sm text-muted-foreground">
                  {user.email}
                </div>
              </td>
              <td className="p-4">
                <span
                  className={`rounded-full px-2 py-1 text-xs font-medium ${ROLE_COLORS[user.role]}`}
                >
                  {ROLE_LABELS[user.role]}
                </span>
              </td>
              <td className="p-4">
                <span
                  className={`rounded-full px-2 py-1 text-xs font-medium ${
                    user.active
                      ? 'bg-green-100 text-green-800'
                      : 'bg-gray-100 text-gray-500'
                  }`}
                >
                  {user.active ? 'Active' : 'Inactive'}
                </span>
              </td>
              <td className="p-4">
                {user.role === 'ADMIN'
                  ? 'All projects'
                  : `${user.project_count} projects`}
              </td>
              <td className="p-4 text-sm text-muted-foreground">
                {formatDate(user.last_login_at)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

function InviteModal({
  onClose,
  onSuccess,
}: {
  onClose: () => void;
  onSuccess: () => void;
}) {
  const form = useForm<InviteUserFormValues>({
    resolver: zodResolver(inviteUserSchema),
    defaultValues: { name: '', email: '', role: 'AUTHORIZED_USER' },
  });

  const mutation = useMutation({
    mutationFn: (data: InviteUserFormValues) =>
      adminApi.inviteUser(data),
    onSuccess: () => {
      toast.success('Invitation sent successfully');
      onSuccess();
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || 'Failed to send invitation');
    },
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <Card className="w-full max-w-md">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Invite User</CardTitle>
            <p className="text-sm text-muted-foreground">
              Send an invitation email to add a new team member.
            </p>
          </div>
          <Button variant="ghost" size="icon-sm" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form
              onSubmit={form.handleSubmit((data) => mutation.mutate(data))}
              className="space-y-4"
            >
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Full Name</FormLabel>
                    <FormControl>
                      <Input placeholder="John Doe" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input placeholder="user@company.com" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="role"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Role</FormLabel>
                    <FormControl>
                      <select
                        {...field}
                        className="w-full rounded-md border px-3 py-2"
                      >
                        <option value="AUTHORIZED_USER">Authorized User</option>
                        <option value="INTERNAL_USER">Internal User</option>
                        <option value="ADMIN">Admin</option>
                      </select>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={onClose}>
                  Cancel
                </Button>
                <Button type="submit" disabled={mutation.isPending}>
                  {mutation.isPending ? 'Sending...' : 'Send Invitation'}
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}

function UserDetailPanel({
  user,
  onClose,
  onUpdate,
}: {
  user: AdminUserDetail;
  onClose: () => void;
  onUpdate: () => void;
}) {
  const queryClient = useQueryClient();

  const updateRoleMutation = useMutation({
    mutationFn: (role: GlobalRole) => adminApi.updateRole(user.id, role),
    onSuccess: () => {
      toast.success('Role updated');
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      onUpdate();
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || 'Failed to update role');
    },
  });

  const disableMutation = useMutation({
    mutationFn: () => adminApi.disableUser(user.id),
    onSuccess: () => {
      toast.success('User disabled');
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      onUpdate();
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || 'Failed to disable user');
    },
  });

  const removeMutation = useMutation({
    mutationFn: () => adminApi.removeUser(user.id),
    onSuccess: () => {
      toast.success('User removed');
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      onClose();
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || 'Failed to remove user');
    },
  });

  const removeMembershipMutation = useMutation({
    mutationFn: (projectId: string) =>
      adminApi.removeUserMembership(user.id, projectId),
    onSuccess: () => {
      toast.success('Membership removed');
      queryClient.invalidateQueries({
        queryKey: ['admin-users', user.id],
      });
      onUpdate();
    },
    onError: (err: any) => {
      toast.error(
        err.response?.data?.message || 'Failed to remove membership',
      );
    },
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <Card className="w-full max-w-lg max-h-[80vh] overflow-y-auto">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>User Details</CardTitle>
            <p className="text-sm text-muted-foreground">
              View user information and project memberships.
            </p>
          </div>
          <Button variant="ghost" size="icon-sm" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </CardHeader>
        <CardContent className="space-y-6">
          <div>
            <h3 className="font-medium">{user.name}</h3>
            <p className="text-sm text-muted-foreground">{user.email}</p>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Label>Role:</Label>
              <select
                value={user.role}
                onChange={(e) =>
                  updateRoleMutation.mutate(e.target.value as GlobalRole)
                }
                className="rounded-md border px-2 py-1 text-sm"
              >
                <option value="ADMIN">Admin</option>
                <option value="INTERNAL_USER">Internal User</option>
                <option value="AUTHORIZED_USER">Authorized User</option>
              </select>
            </div>
            <span
              className={`rounded-full px-2 py-1 text-xs font-medium ${
                user.active
                  ? 'bg-green-100 text-green-800'
                  : 'bg-gray-100 text-gray-500'
              }`}
            >
              {user.active ? 'Active' : 'Inactive'}
            </span>
          </div>

          <div className="flex gap-4 text-sm text-muted-foreground">
            <span>Last login: {formatDate(user.last_login_at)}</span>
            <span>
              Created: {new Date(user.created_at).toLocaleDateString()}
            </span>
          </div>

          <div>
            <h4 className="mb-2 font-medium">Access</h4>
            {user.memberships.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No project memberships
              </p>
            ) : (
              <div className="space-y-2">
                {user.memberships.map((m) => (
                  <div
                    key={m.project_id}
                    className="flex items-center justify-between rounded-md border p-3"
                  >
                    <span className="font-medium">{m.project_name}</span>
                    <div className="flex items-center gap-2">
                      <span className="rounded-full bg-gray-100 px-2 py-1 text-xs">
                        {m.role}
                      </span>
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        onClick={() =>
                          removeMembershipMutation.mutate(m.project_id)
                        }
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-center justify-between border-t pt-4">
            <Button
              variant="destructive"
              size="sm"
              onClick={() => {
                if (confirm('Permanently remove this user?')) {
                  removeMutation.mutate();
                }
              }}
            >
              <Trash2 className="mr-1 h-3 w-3" />
              Remove User
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => disableMutation.mutate()}
              disabled={!user.active}
            >
              <Ban className="mr-1 h-3 w-3" />
              Disable Account
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add yehub-fe/src/pages/admin/ yehub-fe/src/components/admin-route.tsx
git commit -m "feat(fe): add admin panel page with user management, invite modal, user details"
```

---

## Task 12: Frontend Invitation Page

**Files:**
- Create: `yehub-fe/src/pages/invitation.tsx`

- [ ] **Step 1: Create invitation acceptance page**

Create `yehub-fe/src/pages/invitation.tsx`:

```typescript
import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { CheckCircle2, AlertCircle } from 'lucide-react';
import { authApi } from '../api/auth';
import { acceptInvitationSchema } from '../lib/schemas';
import type { AcceptInvitationFormValues } from '../lib/schemas';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Input } from '../components/ui/input';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '../components/ui/form';

export default function InvitationPage() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const [accepted, setAccepted] = useState(false);

  const {
    data: invitation,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ['invitation', token],
    queryFn: () => authApi.validateInvitation(token!),
    enabled: !!token,
    retry: false,
  });

  const form = useForm<AcceptInvitationFormValues>({
    resolver: zodResolver(acceptInvitationSchema),
    defaultValues: { password: '', confirm_password: '' },
  });

  const mutation = useMutation({
    mutationFn: (data: AcceptInvitationFormValues) =>
      authApi.acceptInvitation(token!, data.password),
    onSuccess: () => {
      setAccepted(true);
      toast.success('Account activated! Redirecting to login...');
      setTimeout(() => navigate('/login'), 3000);
    },
    onError: (err: any) => {
      toast.error(
        err.response?.data?.message || 'Failed to activate account',
      );
    },
  });

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-muted-foreground">Validating invitation...</p>
      </div>
    );
  }

  if (isError || !invitation) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Card className="w-full max-w-md">
          <CardContent className="flex flex-col items-center gap-4 py-8">
            <AlertCircle className="h-12 w-12 text-destructive" />
            <h2 className="text-lg font-medium">Invalid or Expired Link</h2>
            <p className="text-center text-sm text-muted-foreground">
              This invitation link is invalid or has expired. Please contact
              your administrator for a new invitation.
            </p>
            <Button onClick={() => navigate('/login')}>Go to Login</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (accepted) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Card className="w-full max-w-md">
          <CardContent className="flex flex-col items-center gap-4 py-8">
            <CheckCircle2 className="h-12 w-12 text-green-600" />
            <h2 className="text-lg font-medium">Account Activated!</h2>
            <p className="text-sm text-muted-foreground">
              Redirecting to login...
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Set Your Password</CardTitle>
          <p className="text-sm text-muted-foreground">
            Welcome, {invitation.name}! Set your password to activate your
            account.
          </p>
        </CardHeader>
        <CardContent>
          <div className="mb-4 rounded-md bg-muted p-3">
            <p className="text-sm">
              <span className="text-muted-foreground">Email: </span>
              <span className="font-medium">{invitation.email}</span>
            </p>
          </div>
          <Form {...form}>
            <form
              onSubmit={form.handleSubmit((data) => mutation.mutate(data))}
              className="space-y-4"
            >
              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Password</FormLabel>
                    <FormControl>
                      <Input
                        type="password"
                        placeholder="At least 8 characters"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="confirm_password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Confirm Password</FormLabel>
                    <FormControl>
                      <Input
                        type="password"
                        placeholder="Re-enter password"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button
                type="submit"
                className="w-full"
                disabled={mutation.isPending}
              >
                {mutation.isPending ? 'Activating...' : 'Activate Account'}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add yehub-fe/src/pages/invitation.tsx
git commit -m "feat(fe): add invitation acceptance page"
```

---

## Task 13: Update Router & Remove Register

**Files:**
- Modify: `yehub-fe/src/router.tsx`
- Delete: `yehub-fe/src/pages/register.tsx`
- Modify: `yehub-fe/src/pages/login.tsx`

- [ ] **Step 1: Update router — add admin + invitation routes, remove register**

In `yehub-fe/src/router.tsx`, replace entirely:

```typescript
import { createBrowserRouter, Navigate } from 'react-router-dom';
import { ProtectedRoute } from './components/protected-route';
import { AdminRoute } from './components/admin-route';
import LoginPage from './pages/login';
import ForgotPasswordPage from './pages/forgot-password';
import ResetPasswordPage from './pages/reset-password';
import InvitationPage from './pages/invitation';
import ProfilePage from './pages/profile';
import ProjectsListPage from './pages/projects/projects-list';
import ProjectLayout from './pages/projects/project-layout';
import ProjectDetailPage from './pages/projects/project-detail';
import ProjectSettingsPage from './pages/projects/project-settings';
import AdminPanelPage from './pages/admin/admin-panel';

export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  { path: '/forgot-password', element: <ForgotPasswordPage /> },
  { path: '/reset-password', element: <ResetPasswordPage /> },
  { path: '/invitation/:token', element: <InvitationPage /> },
  {
    element: <ProtectedRoute />,
    children: [
      { path: '/profile', element: <ProfilePage /> },
      { path: '/projects', element: <ProjectsListPage /> },
      {
        path: '/projects/:id',
        element: <ProjectLayout />,
        children: [
          { index: true, element: <ProjectDetailPage /> },
          { path: 'settings', element: <ProjectSettingsPage /> },
        ],
      },
      {
        element: <AdminRoute />,
        children: [
          { path: '/admin/users', element: <AdminPanelPage /> },
        ],
      },
    ],
  },
  { path: '/', element: <Navigate to="/projects" replace /> },
  { path: '*', element: <Navigate to="/login" replace /> },
]);
```

- [ ] **Step 2: Delete register page**

```bash
rm yehub-fe/src/pages/register.tsx
```

- [ ] **Step 3: Update login page — remove register link**

In `yehub-fe/src/pages/login.tsx`, find and remove the "Sign up" / register link. This is typically near the bottom of the JSX. Remove the entire block that links to `/register` (the `<p>` or `<div>` containing "Don't have an account?" or similar text with a link to the register page).

Also remove the `RegisterDto` or register-related import if present.

- [ ] **Step 4: Verify frontend compiles**

```bash
cd yehub-fe && pnpm build
```

Expected: Build succeeds with no errors.

- [ ] **Step 5: Commit**

```bash
git add yehub-fe/src/router.tsx yehub-fe/src/pages/
git commit -m "feat(fe): update router — add admin/invitation routes, remove register"
```

---

## Task 14: Update Existing Frontend Components

**Files:**
- Modify: `yehub-fe/src/pages/projects/projects-list.tsx`
- Modify: `yehub-fe/src/pages/projects/project-detail.tsx`
- Modify: `yehub-fe/src/pages/projects/project-settings.tsx`

- [ ] **Step 1: Update projects list — conditional create button**

In `yehub-fe/src/pages/projects/projects-list.tsx`, import `useCanGlobal` and `useAuthStore`:

```typescript
import { useCanGlobal } from '../../hooks/use-can';
import { useAuthStore } from '../../store/auth.store';
```

At the top of the component, add:

```typescript
const user = useAuthStore((s) => s.user);
const canCreateProject = useCanGlobal('create_project', user?.role ?? null);
```

Then wrap the "Create Project" button/form toggle with `{canCreateProject && ...}`.

- [ ] **Step 2: Update project detail — new role labels and dropdown options**

In `yehub-fe/src/pages/projects/project-detail.tsx`, update role-related code:

1. Update role labels map (if it exists):

```typescript
const ROLE_LABELS: Record<string, string> = {
  MANAGER: 'Manager',
  EXECUTIVE: 'Executive',
  ANALYST: 'Analyst',
  VIEWER: 'Viewer',
};
```

2. Update the role dropdown options to use the new roles (remove ADMIN, add EXECUTIVE):

```typescript
<option value="MANAGER">Manager</option>
<option value="EXECUTIVE">Executive</option>
<option value="ANALYST">Analyst</option>
<option value="VIEWER">Viewer</option>
```

3. Update the `useCan` call — `manage_members` now checks for `MANAGER` instead of `ADMIN` (this is handled automatically since the hook was updated).

4. In the "Add Member" form, replace the user_id text input with a searchable user list. Use the `getNonMembers` endpoint:

```typescript
import { projectsApi } from '../../api/projects';

// Inside the component:
const { data: nonMembers = [] } = useQuery({
  queryKey: ['non-members', project.id],
  queryFn: () => projectsApi.getNonMembers(project.id),
  enabled: canManageMembers,
});
```

Then render a select/dropdown with the non-members list instead of a raw UUID input.

- [ ] **Step 3: Update project settings — ADMIN check → MANAGER check**

In `yehub-fe/src/pages/projects/project-settings.tsx`, find the role check that redirects non-admins. Change:

```typescript
// Before: checking for 'ADMIN'
if (myRole !== 'ADMIN') {
```

To:

```typescript
if (myRole !== 'MANAGER') {
```

- [ ] **Step 4: Verify frontend compiles and works**

```bash
cd yehub-fe && pnpm build
```

Expected: Build succeeds.

- [ ] **Step 5: Commit**

```bash
git add yehub-fe/src/pages/projects/
git commit -m "feat(fe): update project pages for new RBAC roles"
```

---

## Task 15: Final Integration & Verification

- [ ] **Step 1: Verify backend builds and starts**

```bash
cd yehub-be && pnpm build && pnpm start:dev
```

Expected: Server starts on port 3000 without errors.

- [ ] **Step 2: Verify frontend builds and starts**

```bash
cd yehub-fe && pnpm build && pnpm dev
```

Expected: Dev server starts on port 5173 without errors.

- [ ] **Step 3: Run database migration and seed**

```bash
cd yehub-be && pnpm prisma migrate dev && pnpm prisma db seed
```

Expected: Migration applies cleanly, seed populates test data.

- [ ] **Step 4: Smoke test key flows**

1. Login as admin user → should see admin panel link
2. Navigate to `/admin/users` → should see user list
3. Click "Invite User" → fill form → submit (check console for invitation link in dev)
4. Open invitation link → set password → account activated
5. Login as invited user → navigate to projects
6. As admin, create a project → should work
7. As authorized_user, verify "Create Project" button is hidden
8. In a project, verify role dropdown shows MANAGER/EXECUTIVE/ANALYST/VIEWER
9. Add a member via the searchable user list

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "feat: complete two-tier RBAC refactor with admin invitations"
```
