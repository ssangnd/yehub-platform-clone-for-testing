# Admin Full Project Access Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give `ADMIN` global-role users unrestricted access to all project operations — bypassing membership and role checks in the guard, and the membership scope in `findAll`.

**Architecture:** Two independent changes wired together at the controller. `ProjectRolesGuard` gets an admin early-exit so all `/:id` routes are unrestricted for admins. `ProjectsService.findAll` gains an `isAdmin` flag that removes the membership `where` clause. The controller passes `user.role === GlobalRole.ADMIN` to `findAll`.

**Tech Stack:** NestJS 11, Prisma ORM, Jest (unit tests). Run tests with `pnpm test`.

---

## File Map

| Action | File |
|--------|------|
| Modify | `yehub-be/src/auth/guards/project-roles.guard.ts` |
| Create | `yehub-be/src/auth/guards/project-roles.guard.spec.ts` |
| Modify | `yehub-be/src/projects/projects.service.ts` |
| Modify | `yehub-be/src/projects/projects.service.spec.ts` |
| Modify | `yehub-be/src/projects/projects.controller.ts` |

---

### Task 1: Test admin bypass in `ProjectRolesGuard`

**Files:**
- Create: `yehub-be/src/auth/guards/project-roles.guard.spec.ts`

- [ ] **Step 1: Write the failing tests**

Create `yehub-be/src/auth/guards/project-roles.guard.spec.ts`:

```ts
import { Test } from '@nestjs/testing';
import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { GlobalRole, ProjectRole } from '../../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ProjectRolesGuard } from './project-roles.guard';

const makeContext = (user: { id: string; role: GlobalRole }, params: Record<string, string> = {}) =>
  ({
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({
      getRequest: () => ({ user, params }),
    }),
  }) as unknown as ExecutionContext;

const mockReflector = { getAllAndOverride: jest.fn() };
const mockPrisma = { projectMembership: { findUnique: jest.fn() } };

describe('ProjectRolesGuard', () => {
  let guard: ProjectRolesGuard;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        ProjectRolesGuard,
        { provide: Reflector, useValue: mockReflector },
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();
    guard = module.get(ProjectRolesGuard);
    jest.clearAllMocks();
  });

  describe('admin bypass', () => {
    it('returns true for ADMIN without hitting the database', async () => {
      mockReflector.getAllAndOverride = jest.fn().mockReturnValue([ProjectRole.MANAGER]);
      const ctx = makeContext({ id: 'admin-1', role: GlobalRole.ADMIN }, { id: 'proj-1' });

      const result = await guard.canActivate(ctx);

      expect(result).toBe(true);
      expect(mockPrisma.projectMembership.findUnique).not.toHaveBeenCalled();
    });

    it('returns true for ADMIN even when no roles are required', async () => {
      mockReflector.getAllAndOverride = jest.fn().mockReturnValue(undefined);
      const ctx = makeContext({ id: 'admin-1', role: GlobalRole.ADMIN }, { id: 'proj-1' });

      const result = await guard.canActivate(ctx);

      expect(result).toBe(true);
      expect(mockPrisma.projectMembership.findUnique).not.toHaveBeenCalled();
    });
  });

  describe('non-admin membership check', () => {
    it('returns false when non-admin has no membership', async () => {
      mockReflector.getAllAndOverride = jest.fn().mockReturnValue(undefined);
      mockPrisma.projectMembership.findUnique = jest.fn().mockResolvedValue(null);
      const ctx = makeContext({ id: 'user-1', role: GlobalRole.INTERNAL_USER }, { id: 'proj-1' });

      const result = await guard.canActivate(ctx);

      expect(result).toBe(false);
    });

    it('returns true when non-admin is a member and no role is required', async () => {
      mockReflector.getAllAndOverride = jest.fn().mockReturnValue(undefined);
      mockPrisma.projectMembership.findUnique = jest.fn().mockResolvedValue({
        user_id: 'user-1',
        project_id: 'proj-1',
        role: ProjectRole.MEMBER,
      });
      const ctx = makeContext({ id: 'user-1', role: GlobalRole.INTERNAL_USER }, { id: 'proj-1' });

      const result = await guard.canActivate(ctx);

      expect(result).toBe(true);
    });

    it('returns false when non-admin is a member but lacks required role', async () => {
      mockReflector.getAllAndOverride = jest.fn().mockReturnValue([ProjectRole.MANAGER]);
      mockPrisma.projectMembership.findUnique = jest.fn().mockResolvedValue({
        user_id: 'user-1',
        project_id: 'proj-1',
        role: ProjectRole.MEMBER,
      });
      const ctx = makeContext({ id: 'user-1', role: GlobalRole.INTERNAL_USER }, { id: 'proj-1' });

      const result = await guard.canActivate(ctx);

      expect(result).toBe(false);
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd yehub-be && pnpm test --testPathPattern="project-roles.guard.spec"
```

Expected: FAIL — `ProjectRolesGuard` has no admin bypass yet.

---

### Task 2: Implement admin bypass in `ProjectRolesGuard`

**Files:**
- Modify: `yehub-be/src/auth/guards/project-roles.guard.ts`

- [ ] **Step 1: Add the admin early-exit**

Replace the content of `yehub-be/src/auth/guards/project-roles.guard.ts` with:

```ts
import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { GlobalRole, ProjectRole } from '../../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ROLES_KEY } from '../decorators/roles.decorator';

@Injectable()
export class ProjectRolesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const { user } = context
      .switchToHttp()
      .getRequest<{ user: { id: string; role: GlobalRole }; params: Record<string, string> }>();

    if (user.role === GlobalRole.ADMIN) return true;

    const requiredRoles = this.reflector.getAllAndOverride<ProjectRole[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredRoles || requiredRoles.length === 0) {
      return this.checkMembership(context);
    }

    return this.checkRole(context, requiredRoles);
  }

  private async checkMembership(context: ExecutionContext): Promise<boolean> {
    const { user, params } = context
      .switchToHttp()
      .getRequest<{ user: { id: string }; params: Record<string, string> }>();
    const projectId = params.id ?? params.projectId;
    if (!projectId) return true;

    const membership = await this.prisma.projectMembership.findUnique({
      where: {
        user_id_project_id: { user_id: user.id, project_id: projectId },
      },
    });
    return !!membership;
  }

  private async checkRole(
    context: ExecutionContext,
    requiredRoles: ProjectRole[],
  ): Promise<boolean> {
    const { user, params } = context
      .switchToHttp()
      .getRequest<{ user: { id: string }; params: Record<string, string> }>();
    const projectId = params.id ?? params.projectId;
    if (!projectId) return false;

    const membership = await this.prisma.projectMembership.findUnique({
      where: {
        user_id_project_id: { user_id: user.id, project_id: projectId },
      },
    });

    if (!membership) return false;
    return requiredRoles.includes(membership.role);
  }
}
```

- [ ] **Step 2: Run the guard tests to verify they pass**

```bash
cd yehub-be && pnpm test --testPathPattern="project-roles.guard.spec"
```

Expected: All 5 tests PASS.

- [ ] **Step 3: Commit**

```bash
cd yehub-be && git add src/auth/guards/project-roles.guard.ts src/auth/guards/project-roles.guard.spec.ts
git commit -m "feat(auth): bypass ProjectRolesGuard for ADMIN global role"
```

---

### Task 3: Test `isAdmin` flag in `ProjectsService.findAll`

**Files:**
- Modify: `yehub-be/src/projects/projects.service.spec.ts`

- [ ] **Step 1: Add failing tests for `isAdmin=true`**

In `yehub-be/src/projects/projects.service.spec.ts`, add these two test cases inside the existing `describe('findAll', ...)` block, after the last existing test:

```ts
it('omits memberships filter when isAdmin=true', async () => {
  mockPrisma.$transaction.mockResolvedValue([[], 0]);
  mockPrisma.project.findMany.mockReturnValue('findManyCall');
  mockPrisma.project.count.mockReturnValue('countCall');

  await service.findAll(userId, {}, true);

  const whereArg = mockPrisma.project.findMany.mock.calls[0][0].where;
  expect(whereArg).not.toHaveProperty('memberships');
});

it('includes memberships filter when isAdmin=false (default)', async () => {
  mockPrisma.$transaction.mockResolvedValue([[], 0]);
  mockPrisma.project.findMany.mockReturnValue('findManyCall');
  mockPrisma.project.count.mockReturnValue('countCall');

  await service.findAll(userId, {});

  const whereArg = mockPrisma.project.findMany.mock.calls[0][0].where;
  expect(whereArg).toHaveProperty('memberships', { some: { user_id: userId } });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd yehub-be && pnpm test --testPathPattern="projects.service.spec"
```

Expected: The two new tests FAIL — `findAll` doesn't accept `isAdmin` yet.

---

### Task 4: Implement `isAdmin` flag in `ProjectsService.findAll`

**Files:**
- Modify: `yehub-be/src/projects/projects.service.ts`

- [ ] **Step 1: Update the `findAll` signature and `where` clause**

In `yehub-be/src/projects/projects.service.ts`, replace the `findAll` method:

```ts
async findAll(userId: string, query: ListProjectsQueryDto, isAdmin = false) {
  const page = query.page ?? 1;
  const limit = query.limit ?? 20;
  const skip = (page - 1) * limit;

  const where = {
    ...(!isAdmin && { memberships: { some: { user_id: userId } } }),
    ...(query.active !== undefined && { active: query.active }),
    ...(query.q && {
      OR: [
        { name: { contains: query.q, mode: 'insensitive' as const } },
        { client_name: { contains: query.q, mode: 'insensitive' as const } },
      ],
    }),
  };

  const [projects, total] = await this.prisma.$transaction([
    this.prisma.project.findMany({
      where,
      include: PROJECT_INCLUDE,
      orderBy: { created_at: 'desc' },
      skip,
      take: limit,
    }),
    this.prisma.project.count({ where }),
  ]);

  return {
    data: projects.map((p) => this.formatProject(p)),
    total,
    page,
    totalPages: total === 0 ? 0 : Math.ceil(total / limit),
  };
}
```

- [ ] **Step 2: Run the service tests**

```bash
cd yehub-be && pnpm test --testPathPattern="projects.service.spec"
```

Expected: All tests PASS (new + existing).

- [ ] **Step 3: Commit**

```bash
cd yehub-be && git add src/projects/projects.service.ts src/projects/projects.service.spec.ts
git commit -m "feat(projects): skip membership scope in findAll for admin users"
```

---

### Task 5: Wire `isAdmin` in `ProjectsController`

**Files:**
- Modify: `yehub-be/src/projects/projects.controller.ts`

- [ ] **Step 1: Update the `findAll` controller method**

In `yehub-be/src/projects/projects.controller.ts`, replace the `findAll` method:

```ts
@Get()
@ApiOperation({ summary: 'List projects the user is a member of (admin sees all)' })
findAll(@CurrentUser() user: JwtUser, @Query() query: ListProjectsQueryDto) {
  return this.projectsService.findAll(user.id, query, user.role === GlobalRole.ADMIN);
}
```

- [ ] **Step 2: Run the full test suite**

```bash
cd yehub-be && pnpm test
```

Expected: All tests PASS.

- [ ] **Step 3: Commit**

```bash
cd yehub-be && git add src/projects/projects.controller.ts
git commit -m "feat(projects): pass isAdmin to findAll based on GlobalRole"
```
