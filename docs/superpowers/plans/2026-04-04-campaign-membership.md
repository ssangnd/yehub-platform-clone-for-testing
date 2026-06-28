# Campaign Membership Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add campaign-specific membership so external users (not project members) can access individual campaigns with role-based permissions.

**Architecture:** New `CampaignMembership` model with shared `MemberRole` enum (renamed from `ProjectRole`). `CampaignRolesGuard` checks both project and campaign membership. Campaign member CRUD endpoints added to `CampaignsController`.

**Tech Stack:** NestJS, Prisma, PostgreSQL

**Spec:** `docs/superpowers/specs/2026-04-04-campaign-membership-design.md`

---

### Task 1: Rename `ProjectRole` enum to `MemberRole` in Prisma schema

**Files:**
- Modify: `yehub-be/prisma/schema.prisma:24-31` (enum definition)
- Modify: `yehub-be/prisma/schema.prisma:123-135` (ProjectMembership model)

- [ ] **Step 1: Rename the enum in schema.prisma**

Change:
```prisma
enum ProjectRole {
  MANAGER
  EXECUTIVE
  ANALYST
  VIEWER

  @@map("project_role")
}
```

To:
```prisma
enum MemberRole {
  MANAGER
  EXECUTIVE
  ANALYST
  VIEWER

  @@map("member_role")
}
```

And update `ProjectMembership.role` field type from `ProjectRole` to `MemberRole`:
```prisma
model ProjectMembership {
  user_id    String     @db.Uuid
  project_id String     @db.Uuid
  role       MemberRole
  created_at DateTime   @default(now())

  user    User    @relation(fields: [user_id], references: [id], onDelete: Cascade)
  project Project @relation(fields: [project_id], references: [id], onDelete: Cascade)

  @@id([user_id, project_id])
  @@index([project_id])
  @@map("project_memberships")
}
```

- [ ] **Step 2: Regenerate Prisma client**

Run: `cd yehub-be && pnpm prisma:generate`
Expected: Prisma client regenerated successfully. No migration needed.

- [ ] **Step 3: Commit**

```bash
git add yehub-be/prisma/schema.prisma
git commit -m "refactor: rename ProjectRole enum to MemberRole in Prisma schema"
```

---

### Task 2: Update all backend imports from `ProjectRole` to `MemberRole`

**Files:**
- Modify: `yehub-be/src/auth/decorators/roles.decorator.ts`
- Modify: `yehub-be/src/auth/guards/project-roles.guard.ts`
- Modify: `yehub-be/src/auth/guards/project-roles.guard.spec.ts`
- Modify: `yehub-be/src/auth/guards/campaign-roles.guard.ts`
- Modify: `yehub-be/src/auth/guards/post-roles.guard.ts`
- Modify: `yehub-be/src/projects/projects.controller.ts`
- Modify: `yehub-be/src/projects/projects.service.ts`
- Modify: `yehub-be/src/projects/dto/add-member.dto.ts`
- Modify: `yehub-be/src/projects/dto/update-member.dto.ts`
- Modify: `yehub-be/src/campaigns/campaigns.controller.ts`
- Modify: `yehub-be/src/posts/posts.controller.ts`

- [ ] **Step 1: Update roles decorator**

In `yehub-be/src/auth/decorators/roles.decorator.ts`, change:
```typescript
import { SetMetadata } from '@nestjs/common';
import { MemberRole } from '../../../generated/prisma/client';

export const ROLES_KEY = 'roles';
export const Roles = (...roles: MemberRole[]) =>
  SetMetadata(ROLES_KEY, roles);
```

Remove the `ProjectRoles` export and the backward-compatible alias — just export `Roles`.

- [ ] **Step 2: Update project-roles.guard.ts**

Replace all `ProjectRole` with `MemberRole` in imports and type annotations:
```typescript
import { GlobalRole, MemberRole } from '../../../generated/prisma/client';
```

Line 23: `this.reflector.getAllAndOverride<MemberRole[]>(`
Line 52: `requiredRoles: MemberRole[],`

- [ ] **Step 3: Update project-roles.guard.spec.ts**

Replace all `ProjectRole` with `MemberRole`:
```typescript
import { GlobalRole, MemberRole } from '../../../generated/prisma/client';
```

All occurrences: `ProjectRole.MANAGER` → `MemberRole.MANAGER`, `ProjectRole.VIEWER` → `MemberRole.VIEWER`

- [ ] **Step 4: Update campaign-roles.guard.ts**

```typescript
import { GlobalRole, MemberRole } from '../../../generated/prisma/client';
```

Line 43: `this.reflector.getAllAndOverride<MemberRole[]>(`

- [ ] **Step 5: Update post-roles.guard.ts**

```typescript
import { GlobalRole, MemberRole } from '../../../generated/prisma/client';
```

Line 46: `this.reflector.getAllAndOverride<MemberRole[]>(`

- [ ] **Step 6: Update projects.controller.ts**

```typescript
import { MemberRole, GlobalRole } from '../../generated/prisma/client';
```

All occurrences: `ProjectRole.MANAGER` → `MemberRole.MANAGER`, `ProjectRole.EXECUTIVE` → `MemberRole.EXECUTIVE`

- [ ] **Step 7: Update projects.service.ts**

```typescript
import { MemberRole, UserStatus } from '../../generated/prisma/client';
```

All occurrences: `ProjectRole.MANAGER` → `MemberRole.MANAGER`
Line 156 type: `role: MemberRole,`
Line 271 type: `role: MemberRole;`

- [ ] **Step 8: Update add-member.dto.ts**

```typescript
import { MemberRole } from '../../../generated/prisma/client';

export class AddMemberDto {
  @ApiProperty()
  @IsUUID()
  user_id: string;

  @ApiProperty({ enum: MemberRole })
  @IsEnum(MemberRole)
  role: MemberRole;
}
```

- [ ] **Step 9: Update update-member.dto.ts**

```typescript
import { MemberRole } from '../../../generated/prisma/client';

export class UpdateMemberDto {
  @ApiProperty({ enum: MemberRole })
  @IsEnum(MemberRole)
  role: MemberRole;
}
```

- [ ] **Step 10: Update campaigns.controller.ts**

```typescript
import { GlobalRole, MemberRole } from '../../generated/prisma/client';
```

All occurrences: `ProjectRole.MANAGER` → `MemberRole.MANAGER`, `ProjectRole.EXECUTIVE` → `MemberRole.EXECUTIVE`

- [ ] **Step 11: Update posts.controller.ts**

```typescript
import { GlobalRole, MemberRole } from '../../generated/prisma/client';
```

All occurrences: `ProjectRole.MANAGER` → `MemberRole.MANAGER`, `ProjectRole.EXECUTIVE` → `MemberRole.EXECUTIVE`

- [ ] **Step 12: Run tests to verify rename is clean**

Run: `cd yehub-be && pnpm test`
Expected: All existing tests pass.

- [ ] **Step 13: Commit**

```bash
git add yehub-be/src/
git commit -m "refactor: rename ProjectRole to MemberRole across all backend code"
```

---

### Task 3: Add `CampaignMembership` model to Prisma schema

**Files:**
- Modify: `yehub-be/prisma/schema.prisma` (add model + update User and Campaign relations)

- [ ] **Step 1: Add CampaignMembership model**

Add after the `ProjectMembership` model in `schema.prisma`:

```prisma
model CampaignMembership {
  user_id     String     @db.Uuid
  campaign_id String     @db.Uuid
  role        MemberRole
  added_by    String     @db.Uuid
  created_at  DateTime   @default(now())

  user        User     @relation("CampaignMember", fields: [user_id], references: [id], onDelete: Cascade)
  addedByUser User     @relation("CampaignMemberAddedBy", fields: [added_by], references: [id], onDelete: Cascade)
  campaign    Campaign @relation(fields: [campaign_id], references: [id], onDelete: Cascade)

  @@id([user_id, campaign_id])
  @@index([campaign_id])
  @@map("campaign_memberships")
}
```

- [ ] **Step 2: Update User model with campaign membership relations**

Add to the `User` model (after `memberships` field):
```prisma
  campaignMemberships    CampaignMembership[] @relation("CampaignMember")
  addedCampaignMembers   CampaignMembership[] @relation("CampaignMemberAddedBy")
```

- [ ] **Step 3: Update Campaign model with campaign membership relation**

Add to the `Campaign` model (after `posts` field):
```prisma
  campaignMemberships CampaignMembership[]
```

- [ ] **Step 4: Regenerate Prisma client**

Run: `cd yehub-be && pnpm prisma:generate`
Expected: Prisma client regenerated successfully.

- [ ] **Step 5: Commit**

```bash
git add yehub-be/prisma/schema.prisma
git commit -m "feat: add CampaignMembership model to Prisma schema"
```

---

### Task 4: Update `CampaignRolesGuard` to check both membership sources

**Files:**
- Modify: `yehub-be/src/auth/guards/campaign-roles.guard.ts`
- Test: `yehub-be/src/auth/guards/campaign-roles.guard.spec.ts`

- [ ] **Step 1: Write failing tests for campaign membership access**

Create `yehub-be/src/auth/guards/campaign-roles.guard.spec.ts`:

```typescript
import { Test } from '@nestjs/testing';
import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { GlobalRole, MemberRole } from '../../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CampaignRolesGuard } from './campaign-roles.guard';

const makeContext = (
  user: { id: string; role: GlobalRole },
  params: Record<string, string> = {},
) =>
  ({
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({
      getRequest: () => ({ user, params }),
    }),
  }) as unknown as ExecutionContext;

const mockReflector = { getAllAndOverride: jest.fn() };
const mockPrisma = {
  campaign: { findUnique: jest.fn() },
  projectMembership: { findUnique: jest.fn() },
  campaignMembership: { findUnique: jest.fn() },
};

describe('CampaignRolesGuard', () => {
  let guard: CampaignRolesGuard;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        CampaignRolesGuard,
        { provide: Reflector, useValue: mockReflector },
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();
    guard = module.get(CampaignRolesGuard);
    jest.clearAllMocks();
  });

  it('allows ADMIN without checking memberships', async () => {
    mockReflector.getAllAndOverride.mockReturnValue([MemberRole.MANAGER]);
    const ctx = makeContext({ id: 'admin-1', role: GlobalRole.ADMIN }, { id: 'camp-1' });

    expect(await guard.canActivate(ctx)).toBe(true);
    expect(mockPrisma.campaign.findUnique).not.toHaveBeenCalled();
  });

  it('denies when no user', async () => {
    const ctx = {
      getHandler: () => ({}),
      getClass: () => ({}),
      switchToHttp: () => ({
        getRequest: () => ({ params: { id: 'camp-1' } }),
      }),
    } as unknown as ExecutionContext;

    expect(await guard.canActivate(ctx)).toBe(false);
  });

  it('allows project member with matching role', async () => {
    mockReflector.getAllAndOverride.mockReturnValue([MemberRole.MANAGER]);
    mockPrisma.campaign.findUnique.mockResolvedValue({ project_id: 'proj-1', deleted_at: null });
    mockPrisma.projectMembership.findUnique.mockResolvedValue({ role: MemberRole.MANAGER });

    const ctx = makeContext({ id: 'user-1', role: GlobalRole.INTERNAL_USER }, { id: 'camp-1' });
    expect(await guard.canActivate(ctx)).toBe(true);
    expect(mockPrisma.campaignMembership.findUnique).not.toHaveBeenCalled();
  });

  it('falls back to campaign membership when no project membership', async () => {
    mockReflector.getAllAndOverride.mockReturnValue([MemberRole.MANAGER]);
    mockPrisma.campaign.findUnique.mockResolvedValue({ project_id: 'proj-1', deleted_at: null });
    mockPrisma.projectMembership.findUnique.mockResolvedValue(null);
    mockPrisma.campaignMembership.findUnique.mockResolvedValue({ role: MemberRole.MANAGER });

    const ctx = makeContext({ id: 'user-2', role: GlobalRole.AUTHORIZED_USER }, { id: 'camp-1' });
    expect(await guard.canActivate(ctx)).toBe(true);
  });

  it('denies campaign member with insufficient role', async () => {
    mockReflector.getAllAndOverride.mockReturnValue([MemberRole.MANAGER]);
    mockPrisma.campaign.findUnique.mockResolvedValue({ project_id: 'proj-1', deleted_at: null });
    mockPrisma.projectMembership.findUnique.mockResolvedValue(null);
    mockPrisma.campaignMembership.findUnique.mockResolvedValue({ role: MemberRole.VIEWER });

    const ctx = makeContext({ id: 'user-2', role: GlobalRole.AUTHORIZED_USER }, { id: 'camp-1' });
    expect(await guard.canActivate(ctx)).toBe(false);
  });

  it('denies when user has neither project nor campaign membership', async () => {
    mockReflector.getAllAndOverride.mockReturnValue(undefined);
    mockPrisma.campaign.findUnique.mockResolvedValue({ project_id: 'proj-1', deleted_at: null });
    mockPrisma.projectMembership.findUnique.mockResolvedValue(null);
    mockPrisma.campaignMembership.findUnique.mockResolvedValue(null);

    const ctx = makeContext({ id: 'user-3', role: GlobalRole.AUTHORIZED_USER }, { id: 'camp-1' });
    expect(await guard.canActivate(ctx)).toBe(false);
  });

  it('allows campaign member when no specific role required', async () => {
    mockReflector.getAllAndOverride.mockReturnValue(undefined);
    mockPrisma.campaign.findUnique.mockResolvedValue({ project_id: 'proj-1', deleted_at: null });
    mockPrisma.projectMembership.findUnique.mockResolvedValue(null);
    mockPrisma.campaignMembership.findUnique.mockResolvedValue({ role: MemberRole.VIEWER });

    const ctx = makeContext({ id: 'user-2', role: GlobalRole.AUTHORIZED_USER }, { id: 'camp-1' });
    expect(await guard.canActivate(ctx)).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd yehub-be && pnpm test -- --testPathPattern=campaign-roles.guard.spec`
Expected: New tests fail (campaign membership lookup not implemented yet).

- [ ] **Step 3: Update CampaignRolesGuard implementation**

Replace `yehub-be/src/auth/guards/campaign-roles.guard.ts`:

```typescript
import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { GlobalRole, MemberRole } from '../../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ROLES_KEY } from '../decorators/roles.decorator';

@Injectable()
export class CampaignRolesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{
      user?: { id: string; role: GlobalRole };
      params: Record<string, string>;
    }>();
    const { user } = request;

    if (!user) return false;
    if (user.role === GlobalRole.ADMIN) return true;

    const campaignId = request.params.id ?? request.params.campaignId;
    if (!campaignId) return false;

    const campaign = await this.prisma.campaign.findUnique({
      where: { id: campaignId },
      select: { project_id: true, deleted_at: true },
    });
    if (!campaign || campaign.deleted_at) return false;

    // 1. Check project membership (inherited)
    const projectMembership = await this.prisma.projectMembership.findUnique({
      where: {
        user_id_project_id: {
          user_id: user.id,
          project_id: campaign.project_id,
        },
      },
    });

    // 2. Fall back to campaign membership (direct)
    const membership = projectMembership
      ?? await this.prisma.campaignMembership.findUnique({
           where: {
             user_id_campaign_id: {
               user_id: user.id,
               campaign_id: campaignId,
             },
           },
         });

    if (!membership) return false;

    const requiredRoles = this.reflector.getAllAndOverride<MemberRole[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredRoles || requiredRoles.length === 0) return true;
    return requiredRoles.includes(membership.role);
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd yehub-be && pnpm test -- --testPathPattern=campaign-roles.guard.spec`
Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add yehub-be/src/auth/guards/campaign-roles.guard.ts yehub-be/src/auth/guards/campaign-roles.guard.spec.ts
git commit -m "feat: update CampaignRolesGuard to check both project and campaign membership"
```

---

### Task 5: Update `PostRolesGuard` to check campaign membership

**Files:**
- Modify: `yehub-be/src/auth/guards/post-roles.guard.ts`

- [ ] **Step 1: Update PostRolesGuard to fall back to campaign membership**

Replace `yehub-be/src/auth/guards/post-roles.guard.ts`:

```typescript
import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { GlobalRole, MemberRole } from '../../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ROLES_KEY } from '../decorators/roles.decorator';

@Injectable()
export class PostRolesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{
      user?: { id: string; role: GlobalRole };
      params: Record<string, string>;
    }>();
    const { user } = request;

    if (!user) return false;
    if (user.role === GlobalRole.ADMIN) return true;

    const postId = request.params.id;
    if (!postId) return false;

    const post = await this.prisma.post.findUnique({
      where: { id: postId },
      select: {
        deleted_at: true,
        campaign_id: true,
        campaign: { select: { project_id: true, deleted_at: true } },
      },
    });
    if (!post || post.deleted_at || post.campaign.deleted_at) return false;

    // 1. Check project membership (inherited)
    const projectMembership = await this.prisma.projectMembership.findUnique({
      where: {
        user_id_project_id: {
          user_id: user.id,
          project_id: post.campaign.project_id,
        },
      },
    });

    // 2. Fall back to campaign membership (direct)
    const membership = projectMembership
      ?? await this.prisma.campaignMembership.findUnique({
           where: {
             user_id_campaign_id: {
               user_id: user.id,
               campaign_id: post.campaign_id,
             },
           },
         });

    if (!membership) return false;

    const requiredRoles = this.reflector.getAllAndOverride<MemberRole[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredRoles || requiredRoles.length === 0) return true;
    return requiredRoles.includes(membership.role);
  }
}
```

- [ ] **Step 2: Run tests**

Run: `cd yehub-be && pnpm test`
Expected: All tests pass.

- [ ] **Step 3: Commit**

```bash
git add yehub-be/src/auth/guards/post-roles.guard.ts
git commit -m "feat: update PostRolesGuard to check campaign membership fallback"
```

---

### Task 6: Create campaign member DTOs

**Files:**
- Create: `yehub-be/src/campaigns/dto/add-campaign-member.dto.ts`
- Create: `yehub-be/src/campaigns/dto/update-campaign-member.dto.ts`
- Create: `yehub-be/src/campaigns/dto/get-campaign-non-members-query.dto.ts`

- [ ] **Step 1: Create AddCampaignMemberDto**

Create `yehub-be/src/campaigns/dto/add-campaign-member.dto.ts`:

```typescript
import { IsUUID, IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { MemberRole } from '../../../generated/prisma/client';

export class AddCampaignMemberDto {
  @ApiProperty()
  @IsUUID()
  user_id: string;

  @ApiProperty({ enum: MemberRole })
  @IsEnum(MemberRole)
  role: MemberRole;
}
```

- [ ] **Step 2: Create UpdateCampaignMemberDto**

Create `yehub-be/src/campaigns/dto/update-campaign-member.dto.ts`:

```typescript
import { IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { MemberRole } from '../../../generated/prisma/client';

export class UpdateCampaignMemberDto {
  @ApiProperty({ enum: MemberRole })
  @IsEnum(MemberRole)
  role: MemberRole;
}
```

- [ ] **Step 3: Create GetCampaignNonMembersQueryDto**

Create `yehub-be/src/campaigns/dto/get-campaign-non-members-query.dto.ts`:

```typescript
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class GetCampaignNonMembersQueryDto {
  @ApiPropertyOptional({ description: 'Search by name or email' })
  @IsString()
  @MaxLength(100)
  @IsOptional()
  q?: string;

  @ApiPropertyOptional({ description: 'Max results to return', default: 20 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  limit?: number;
}
```

- [ ] **Step 4: Commit**

```bash
git add yehub-be/src/campaigns/dto/
git commit -m "feat: add campaign member DTOs"
```

---

### Task 7: Add campaign member service methods

**Files:**
- Modify: `yehub-be/src/campaigns/campaigns.service.ts`

- [ ] **Step 1: Write failing tests for campaign member methods**

Create `yehub-be/src/campaigns/campaigns-members.service.spec.ts`:

```typescript
import { Test } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { CampaignsService } from './campaigns.service';
import { PrismaService } from '../prisma/prisma.service';
import { MemberRole, UserStatus } from '../../generated/prisma/client';

const mockPrisma = {
  campaign: { findUnique: jest.fn() },
  projectMembership: { findUnique: jest.fn(), findMany: jest.fn() },
  campaignMembership: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  user: { findUnique: jest.fn(), findMany: jest.fn() },
};

describe('CampaignsService - members', () => {
  let service: CampaignsService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        CampaignsService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();
    service = module.get(CampaignsService);
    jest.clearAllMocks();
  });

  describe('listMembers', () => {
    it('returns inherited and direct members', async () => {
      mockPrisma.campaign.findUnique.mockResolvedValue({
        id: 'camp-1', project_id: 'proj-1', deleted_at: null,
        _count: { posts: 0 }, project: { id: 'proj-1', name: 'P' },
      });
      mockPrisma.projectMembership.findMany.mockResolvedValue([
        { user_id: 'u1', role: MemberRole.MANAGER, created_at: new Date(), user: { id: 'u1', email: 'a@b.com', name: 'A', avatar: null } },
      ]);
      mockPrisma.campaignMembership.findMany.mockResolvedValue([
        { user_id: 'u2', role: MemberRole.VIEWER, added_by: 'u1', created_at: new Date(), user: { id: 'u2', email: 'c@d.com', name: 'C', avatar: null } },
      ]);

      const result = await service.listMembers('camp-1');

      expect(result.inherited).toHaveLength(1);
      expect(result.inherited[0].source).toBe('project');
      expect(result.direct).toHaveLength(1);
      expect(result.direct[0].source).toBe('campaign');
    });
  });

  describe('addMember', () => {
    it('rejects if user is already a project member', async () => {
      mockPrisma.campaign.findUnique.mockResolvedValue({
        id: 'camp-1', project_id: 'proj-1', deleted_at: null,
        _count: { posts: 0 }, project: { id: 'proj-1', name: 'P' },
      });
      mockPrisma.user.findUnique.mockResolvedValue({ id: 'u1', status: UserStatus.ACTIVE });
      mockPrisma.projectMembership.findUnique.mockResolvedValue({ user_id: 'u1', project_id: 'proj-1' });

      await expect(service.addCampaignMember('camp-1', { user_id: 'u1', role: MemberRole.VIEWER }, 'admin-1'))
        .rejects.toThrow(ConflictException);
    });

    it('rejects if user is already a campaign member', async () => {
      mockPrisma.campaign.findUnique.mockResolvedValue({
        id: 'camp-1', project_id: 'proj-1', deleted_at: null,
        _count: { posts: 0 }, project: { id: 'proj-1', name: 'P' },
      });
      mockPrisma.user.findUnique.mockResolvedValue({ id: 'u2', status: UserStatus.ACTIVE });
      mockPrisma.projectMembership.findUnique.mockResolvedValue(null);
      mockPrisma.campaignMembership.findUnique.mockResolvedValue({ user_id: 'u2', campaign_id: 'camp-1' });

      await expect(service.addCampaignMember('camp-1', { user_id: 'u2', role: MemberRole.VIEWER }, 'admin-1'))
        .rejects.toThrow(ConflictException);
    });

    it('creates campaign membership successfully', async () => {
      mockPrisma.campaign.findUnique.mockResolvedValue({
        id: 'camp-1', project_id: 'proj-1', deleted_at: null,
        _count: { posts: 0 }, project: { id: 'proj-1', name: 'P' },
      });
      mockPrisma.user.findUnique.mockResolvedValue({ id: 'u3', status: UserStatus.ACTIVE });
      mockPrisma.projectMembership.findUnique.mockResolvedValue(null);
      mockPrisma.campaignMembership.findUnique.mockResolvedValue(null);
      mockPrisma.campaignMembership.create.mockResolvedValue({
        user_id: 'u3', campaign_id: 'camp-1', role: MemberRole.ANALYST, added_by: 'admin-1', created_at: new Date(),
        user: { id: 'u3', email: 'e@f.com', name: 'E', avatar: null },
      });

      const result = await service.addCampaignMember('camp-1', { user_id: 'u3', role: MemberRole.ANALYST }, 'admin-1');

      expect(result.user_id).toBe('u3');
      expect(result.role).toBe(MemberRole.ANALYST);
    });
  });

  describe('removeCampaignMember', () => {
    it('throws NotFoundException when membership does not exist', async () => {
      mockPrisma.campaignMembership.findUnique.mockResolvedValue(null);

      await expect(service.removeCampaignMember('camp-1', 'u99')).rejects.toThrow(NotFoundException);
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd yehub-be && pnpm test -- --testPathPattern=campaigns-members.service.spec`
Expected: Tests fail (methods not implemented yet).

- [ ] **Step 3: Add member methods to CampaignsService**

Add these imports to the top of `yehub-be/src/campaigns/campaigns.service.ts`:

```typescript
import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
```

Add `MemberRole, UserStatus` to the Prisma import:
```typescript
import { CampaignStatus, MemberRole, Platform, UserStatus } from '../../generated/prisma/client';
```

Add `AddCampaignMemberDto` import:
```typescript
import { AddCampaignMemberDto } from './dto/add-campaign-member.dto';
```

Add a `USER_SELECT` constant at the top (after imports):
```typescript
const USER_SELECT = {
  id: true,
  email: true,
  name: true,
  avatar: true,
} as const;
```

Add the following methods to the `CampaignsService` class (before `private formatCampaign`):

```typescript
  async listMembers(campaignId: string) {
    const campaign = await this.findOne(campaignId);

    const projectMembers = await this.prisma.projectMembership.findMany({
      where: { project_id: campaign.project_id },
      include: { user: { select: USER_SELECT } },
      orderBy: { created_at: 'asc' },
    });

    const campaignMembers = await this.prisma.campaignMembership.findMany({
      where: { campaign_id: campaignId },
      include: { user: { select: USER_SELECT } },
      orderBy: { created_at: 'asc' },
    });

    return {
      inherited: projectMembers.map((m) => ({
        user: m.user,
        role: m.role,
        source: 'project' as const,
      })),
      direct: campaignMembers.map((m) => ({
        user: m.user,
        role: m.role,
        source: 'campaign' as const,
        added_by: m.added_by,
        created_at: m.created_at,
      })),
    };
  }

  async addCampaignMember(
    campaignId: string,
    dto: AddCampaignMemberDto,
    addedBy: string,
  ) {
    const campaign = await this.findOne(campaignId);

    const user = await this.prisma.user.findUnique({
      where: { id: dto.user_id },
    });
    if (!user) throw new NotFoundException('User not found');

    // Reject if user is a project member (they already have inherited access)
    const projectMembership = await this.prisma.projectMembership.findUnique({
      where: {
        user_id_project_id: {
          user_id: dto.user_id,
          project_id: campaign.project_id,
        },
      },
    });
    if (projectMembership) {
      throw new ConflictException(
        'User is already a project member and has inherited access',
      );
    }

    // Reject if already a campaign member
    const existing = await this.prisma.campaignMembership.findUnique({
      where: {
        user_id_campaign_id: {
          user_id: dto.user_id,
          campaign_id: campaignId,
        },
      },
    });
    if (existing) {
      throw new ConflictException('User is already a campaign member');
    }

    const membership = await this.prisma.campaignMembership.create({
      data: {
        user_id: dto.user_id,
        campaign_id: campaignId,
        role: dto.role,
        added_by: addedBy,
      },
      include: { user: { select: USER_SELECT } },
    });

    return {
      user_id: membership.user_id,
      user: membership.user,
      role: membership.role,
      source: 'campaign' as const,
      added_by: membership.added_by,
      created_at: membership.created_at,
    };
  }

  async updateCampaignMember(
    campaignId: string,
    targetUserId: string,
    role: MemberRole,
  ) {
    const membership = await this.prisma.campaignMembership.findUnique({
      where: {
        user_id_campaign_id: {
          user_id: targetUserId,
          campaign_id: campaignId,
        },
      },
    });
    if (!membership) throw new NotFoundException('Campaign member not found');

    const updated = await this.prisma.campaignMembership.update({
      where: {
        user_id_campaign_id: {
          user_id: targetUserId,
          campaign_id: campaignId,
        },
      },
      data: { role },
      include: { user: { select: USER_SELECT } },
    });

    return {
      user_id: updated.user_id,
      user: updated.user,
      role: updated.role,
      source: 'campaign' as const,
      added_by: updated.added_by,
      created_at: updated.created_at,
    };
  }

  async removeCampaignMember(campaignId: string, targetUserId: string) {
    const membership = await this.prisma.campaignMembership.findUnique({
      where: {
        user_id_campaign_id: {
          user_id: targetUserId,
          campaign_id: campaignId,
        },
      },
    });
    if (!membership) throw new NotFoundException('Campaign member not found');

    await this.prisma.campaignMembership.delete({
      where: {
        user_id_campaign_id: {
          user_id: targetUserId,
          campaign_id: campaignId,
        },
      },
    });
  }

  async getCampaignNonMembers(
    campaignId: string,
    query: { q?: string; limit?: number },
  ) {
    const campaign = await this.findOne(campaignId);
    const { q, limit = 20 } = query;

    return this.prisma.user.findMany({
      where: {
        status: UserStatus.ACTIVE,
        // Exclude project members (they have inherited access)
        memberships: { none: { project_id: campaign.project_id } },
        // Exclude existing campaign members
        campaignMemberships: { none: { campaign_id: campaignId } },
        ...(q && {
          OR: [
            { name: { contains: q, mode: 'insensitive' } },
            { email: { contains: q, mode: 'insensitive' } },
          ],
        }),
      },
      select: USER_SELECT,
      orderBy: { name: 'asc' },
      take: limit,
    });
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd yehub-be && pnpm test -- --testPathPattern=campaigns-members.service.spec`
Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add yehub-be/src/campaigns/campaigns.service.ts yehub-be/src/campaigns/campaigns-members.service.spec.ts
git commit -m "feat: add campaign member CRUD methods to CampaignsService"
```

---

### Task 8: Add campaign member endpoints to CampaignsController

**Files:**
- Modify: `yehub-be/src/campaigns/campaigns.controller.ts`

- [ ] **Step 1: Add campaign member endpoints**

Add imports at top of `yehub-be/src/campaigns/campaigns.controller.ts`:

```typescript
import { AddCampaignMemberDto } from './dto/add-campaign-member.dto';
import { UpdateCampaignMemberDto } from './dto/update-campaign-member.dto';
import { GetCampaignNonMembersQueryDto } from './dto/get-campaign-non-members-query.dto';
```

Add the following endpoints to the `CampaignsController` class (after the `remove` method):

```typescript
  @Get('campaigns/:id/members')
  @UseGuards(CampaignRolesGuard)
  @ApiOperation({ summary: 'List campaign members (inherited + direct)' })
  listMembers(@Param('id', ParseUUIDPipe) id: string) {
    return this.campaignsService.listMembers(id);
  }

  @Get('campaigns/:id/non-members')
  @UseGuards(CampaignRolesGuard)
  @Roles(MemberRole.MANAGER)
  @ApiOperation({ summary: 'List users available to add as campaign members' })
  getCampaignNonMembers(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: GetCampaignNonMembersQueryDto,
  ) {
    return this.campaignsService.getCampaignNonMembers(id, query);
  }

  @Post('campaigns/:id/members')
  @UseGuards(CampaignRolesGuard)
  @Roles(MemberRole.MANAGER)
  @ApiOperation({ summary: 'Add a campaign member (manager only)' })
  addCampaignMember(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AddCampaignMemberDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.campaignsService.addCampaignMember(id, dto, user.id);
  }

  @Patch('campaigns/:id/members/:userId')
  @UseGuards(CampaignRolesGuard)
  @Roles(MemberRole.MANAGER)
  @ApiOperation({ summary: 'Update campaign member role (manager only)' })
  updateCampaignMember(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() dto: UpdateCampaignMemberDto,
  ) {
    return this.campaignsService.updateCampaignMember(id, userId, dto.role);
  }

  @Delete('campaigns/:id/members/:userId')
  @UseGuards(CampaignRolesGuard)
  @Roles(MemberRole.MANAGER)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove a campaign member (manager only)' })
  removeCampaignMember(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('userId', ParseUUIDPipe) userId: string,
  ) {
    return this.campaignsService.removeCampaignMember(id, userId);
  }
```

- [ ] **Step 2: Run all tests**

Run: `cd yehub-be && pnpm test`
Expected: All tests pass.

- [ ] **Step 3: Commit**

```bash
git add yehub-be/src/campaigns/campaigns.controller.ts
git commit -m "feat: add campaign member CRUD endpoints to CampaignsController"
```

---

### Task 9: Update `findAll` to include campaigns with campaign membership

**Files:**
- Modify: `yehub-be/src/campaigns/campaigns.service.ts:95-131`

- [ ] **Step 1: Update the `findAll` where clause**

In `yehub-be/src/campaigns/campaigns.service.ts`, update the `findAll` method's `where` clause to also match campaigns where the user has a direct `campaignMembership`:

Replace the where block (lines ~100-112):

```typescript
    const where = {
      deleted_at: null,
      ...(!isAdmin && {
        OR: [
          { project: { active: true, memberships: { some: { user_id: userId } } } },
          { campaignMemberships: { some: { user_id: userId } } },
        ],
      }),
      ...(isAdmin && { project: { active: true } }),
      ...(query.status && { status: query.status }),
      ...(query.q && {
        name: { contains: query.q, mode: 'insensitive' as const },
      }),
    };
```

- [ ] **Step 2: Run all tests**

Run: `cd yehub-be && pnpm test`
Expected: All tests pass.

- [ ] **Step 3: Commit**

```bash
git add yehub-be/src/campaigns/campaigns.service.ts
git commit -m "feat: include campaign-membership campaigns in findAll listing"
```

---

### Task 10: Final verification

- [ ] **Step 1: Run full test suite**

Run: `cd yehub-be && pnpm test`
Expected: All tests pass.

- [ ] **Step 2: Run build**

Run: `cd yehub-be && pnpm build`
Expected: Build succeeds with no TypeScript errors.

- [ ] **Step 3: Run lint**

Run: `cd yehub-be && pnpm lint`
Expected: No lint errors.

- [ ] **Step 4: Commit any lint fixes if needed**

```bash
git add -A
git commit -m "chore: lint fixes for campaign membership feature"
```
