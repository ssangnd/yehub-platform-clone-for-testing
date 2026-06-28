# List Projects Pagination Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `q`, `page`, `limit`, and `active` query param support to `GET /projects`, returning `{ data, total, page, totalPages }`.

**Architecture:** Add a `ListProjectsQueryDto` in `projects/dto/`, update `ProjectsService.findAll` to accept the query, run `prisma.$transaction([findMany, count])` for a single round-trip, and return the paginated shape. Update the controller to wire the query DTO.

**Tech Stack:** NestJS 11, Prisma ORM, class-validator, class-transformer, @nestjs/swagger, Jest

---

## File Map

| File | Action |
|------|--------|
| `src/projects/dto/list-projects-query.dto.ts` | Create — query params DTO |
| `src/projects/projects.service.ts` | Modify — `findAll` signature + implementation |
| `src/projects/projects.controller.ts` | Modify — add `@Query()` to `findAll` |
| `src/projects/projects.service.spec.ts` | Create — unit tests for `findAll` |

---

### Task 1: Create `ListProjectsQueryDto`

**Files:**
- Create: `src/projects/dto/list-projects-query.dto.ts`

- [ ] **Step 1: Create the DTO file**

```typescript
// src/projects/dto/list-projects-query.dto.ts
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class ListProjectsQueryDto {
  @ApiPropertyOptional({ description: 'Search by project name or client name' })
  @IsString()
  @MaxLength(100)
  @IsOptional()
  q?: string;

  @ApiPropertyOptional({ description: 'Page number (1-based)', default: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  page?: number;

  @ApiPropertyOptional({ description: 'Items per page', default: 20 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  limit?: number;

  @ApiPropertyOptional({ description: 'Filter by active status; omit to return all' })
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  @IsOptional()
  active?: boolean;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/projects/dto/list-projects-query.dto.ts
git commit -m "feat(projects): add ListProjectsQueryDto"
```

---

### Task 2: Write failing tests for `ProjectsService.findAll`

**Files:**
- Create: `src/projects/projects.service.spec.ts`

- [ ] **Step 1: Create the spec file with failing tests**

```typescript
// src/projects/projects.service.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { ProjectsService } from './projects.service';
import { PrismaService } from '../prisma/prisma.service';

const now = new Date();

const makeProject = (overrides: Partial<{
  id: string; name: string; client_name: string | null; active: boolean;
}> = {}) => ({
  id: overrides.id ?? 'proj-1',
  name: overrides.name ?? 'Alpha',
  description: null,
  client_name: overrides.client_name ?? null,
  logo: null,
  active: overrides.active ?? true,
  created_at: now,
  updated_at: now,
  _count: { memberships: 2, campaigns: 3 },
  categories: [{ id: 'cat-1', name: 'Tech' }],
});

const mockPrisma = {
  project: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    count: jest.fn(),
  },
  projectMembership: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    count: jest.fn(),
  },
  user: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
  },
  $transaction: jest.fn(),
};

describe('ProjectsService', () => {
  let service: ProjectsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProjectsService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();
    service = module.get<ProjectsService>(ProjectsService);
    jest.clearAllMocks();
  });

  describe('findAll', () => {
    const userId = 'user-1';

    it('returns paginated projects with defaults (page=1, limit=20)', async () => {
      const project = makeProject();
      mockPrisma.$transaction.mockResolvedValue([[project], 1]);

      const result = await service.findAll(userId, {});

      expect(result).toEqual({
        data: [
          {
            id: 'proj-1',
            name: 'Alpha',
            description: null,
            client_name: null,
            logo: null,
            categories: [{ id: 'cat-1', name: 'Tech' }],
            active: true,
            created_at: now,
            updated_at: now,
            member_count: 2,
            campaign_count: 3,
          },
        ],
        total: 1,
        page: 1,
        totalPages: 1,
      });

      expect(mockPrisma.$transaction).toHaveBeenCalledWith([
        expect.anything(), // findMany promise
        expect.anything(), // count promise
      ]);
    });

    it('applies skip/take for page=2, limit=5', async () => {
      mockPrisma.$transaction.mockResolvedValue([[], 10]);
      mockPrisma.project.findMany.mockReturnValue('findManyCall');
      mockPrisma.project.count.mockReturnValue('countCall');

      await service.findAll(userId, { page: 2, limit: 5 });

      expect(mockPrisma.project.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 5, take: 5 }),
      );
    });

    it('filters by active=true', async () => {
      mockPrisma.$transaction.mockResolvedValue([[], 0]);
      mockPrisma.project.findMany.mockReturnValue('findManyCall');
      mockPrisma.project.count.mockReturnValue('countCall');

      await service.findAll(userId, { active: true });

      expect(mockPrisma.project.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ active: true }),
        }),
      );
      expect(mockPrisma.project.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ active: true }),
        }),
      );
    });

    it('omits active filter when active is undefined', async () => {
      mockPrisma.$transaction.mockResolvedValue([[], 0]);
      mockPrisma.project.findMany.mockReturnValue('findManyCall');
      mockPrisma.project.count.mockReturnValue('countCall');

      await service.findAll(userId, {});

      const whereArg = mockPrisma.project.findMany.mock.calls[0][0].where;
      expect(whereArg).not.toHaveProperty('active');
    });

    it('adds OR name/client_name search when q is provided', async () => {
      mockPrisma.$transaction.mockResolvedValue([[], 0]);
      mockPrisma.project.findMany.mockReturnValue('findManyCall');
      mockPrisma.project.count.mockReturnValue('countCall');

      await service.findAll(userId, { q: 'acme' });

      expect(mockPrisma.project.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: [
              { name: { contains: 'acme', mode: 'insensitive' } },
              { client_name: { contains: 'acme', mode: 'insensitive' } },
            ],
          }),
        }),
      );
    });

    it('omits OR filter when q is not provided', async () => {
      mockPrisma.$transaction.mockResolvedValue([[], 0]);
      mockPrisma.project.findMany.mockReturnValue('findManyCall');
      mockPrisma.project.count.mockReturnValue('countCall');

      await service.findAll(userId, {});

      const whereArg = mockPrisma.project.findMany.mock.calls[0][0].where;
      expect(whereArg).not.toHaveProperty('OR');
    });

    it('computes totalPages correctly', async () => {
      mockPrisma.$transaction.mockResolvedValue([[], 21]);

      const result = await service.findAll(userId, { limit: 10 });

      expect(result.total).toBe(21);
      expect(result.totalPages).toBe(3);
    });

    it('returns totalPages=0 when total=0', async () => {
      mockPrisma.$transaction.mockResolvedValue([[], 0]);

      const result = await service.findAll(userId, {});

      expect(result.totalPages).toBe(0);
    });
  });
});
```

- [ ] **Step 2: Run tests — expect them to FAIL**

```bash
cd yehub-be && pnpm test src/projects/projects.service.spec.ts --no-coverage
```

Expected: multiple test failures because `findAll` does not yet accept a query param.

---

### Task 3: Implement `ProjectsService.findAll` with pagination

**Files:**
- Modify: `src/projects/projects.service.ts`

- [ ] **Step 1: Update the import block and `findAll` method**

Replace the existing `findAll` method (lines 39–46) with the following. Also add the import for `ListProjectsQueryDto` at the top.

Add import at the top of the file (after existing imports):
```typescript
import { ListProjectsQueryDto } from './dto/list-projects-query.dto';
```

Replace `findAll`:
```typescript
async findAll(userId: string, query: ListProjectsQueryDto) {
  const page = query.page ?? 1;
  const limit = query.limit ?? 20;
  const skip = (page - 1) * limit;

  const where = {
    memberships: { some: { user_id: userId } },
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

- [ ] **Step 2: Run tests — expect them to PASS**

```bash
cd yehub-be && pnpm test src/projects/projects.service.spec.ts --no-coverage
```

Expected output: all 7 tests passing.

- [ ] **Step 3: Commit**

```bash
git add src/projects/projects.service.ts src/projects/projects.service.spec.ts
git commit -m "feat(projects): paginate findAll with q, page, limit, active filters"
```

---

### Task 4: Update `ProjectsController.findAll`

**Files:**
- Modify: `src/projects/projects.controller.ts`

- [ ] **Step 1: Add `Query` to NestJS imports and import the DTO**

At the top of `projects.controller.ts`, add `Query` to the existing `@nestjs/common` import list:

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
  Query,
  UseGuards,
} from '@nestjs/common';
```

Add import for the DTO after the existing dto imports:
```typescript
import { ListProjectsQueryDto } from './dto/list-projects-query.dto';
```

- [ ] **Step 2: Update the `findAll` handler**

Replace the existing `findAll` method:
```typescript
@Get()
@ApiOperation({ summary: 'List projects the user is a member of' })
findAll(@CurrentUser() user: JwtUser, @Query() query: ListProjectsQueryDto) {
  return this.projectsService.findAll(user.id, query);
}
```

- [ ] **Step 3: Verify the project compiles**

```bash
cd yehub-be && pnpm build
```

Expected: exits with code 0, no TypeScript errors.

- [ ] **Step 4: Run the full test suite**

```bash
cd yehub-be && pnpm test --no-coverage
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/projects/projects.controller.ts
git commit -m "feat(projects): wire ListProjectsQueryDto to GET /projects controller"
```

---

## Self-Review

**Spec coverage:**
- [x] `q` search on name/client_name — Task 3 `OR` clause
- [x] `page` / `limit` pagination — Task 3 `skip`/`take`
- [x] `active` filter — Task 3 conditional `where`
- [x] `{ data, total, page, totalPages }` response — Task 3 return shape
- [x] Defaults (page=1, limit=20) — Task 3 defaults
- [x] DTO validation (400 on bad input) — Task 1 class-validator decorators + NestJS global ValidationPipe
- [x] Empty result returns `totalPages=0` — Task 2 test + Task 3 implementation

**Placeholder scan:** No TBDs or incomplete steps.

**Type consistency:** `ListProjectsQueryDto` is created in Task 1, imported in Tasks 3 and 4 using the same name and path.
