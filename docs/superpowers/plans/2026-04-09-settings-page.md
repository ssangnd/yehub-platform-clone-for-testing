# Settings Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a tabbed admin Settings page that manages Project Categories and the new Category Objectives, integrated into Project and Campaign forms as multi-selects.

**Architecture:** Add a new `Objective` Prisma model with m2m to `Campaign`, mirroring the existing `Category` ↔ `Project` pattern. Build parallel `objectives/` NestJS module. On the frontend, rewrite the Settings page with shadcn `Tabs` driven by `?tab=`, share a `TagListPanel` between the two tabs, and extract a `MultiSelectChecklist` primitive that both pickers wrap.

**Tech Stack:** NestJS 11, Prisma 7, PostgreSQL 17, React 19, Vite, TanStack Query v5, React Hook Form + Zod, Tailwind v4, shadcn/ui.

**Spec:** `docs/superpowers/specs/2026-04-09-settings-page-design.md`

**Working directory:** This plan is executed inside the worktree at `.worktrees/post-campaign-demo/`. All paths below are relative to that worktree root unless otherwise stated.

**Branch:** `feature/post-campaign-demo`

---

## Task 1: Add Objective model and migration

**Files:**
- Modify: `yehub-be/prisma/schema.prisma`
- Create: `yehub-be/prisma/migrations/<timestamp>_add_objectives/migration.sql`

- [ ] **Step 1: Add the `Objective` model and `Campaign.objectives` relation**

Open `yehub-be/prisma/schema.prisma` and add the new model directly **after** the existing `Category` model (search for `model Category {` to locate it):

```prisma
model Objective {
  id         String   @id @default(uuid()) @db.Uuid
  name       String   @unique @db.VarChar(100)
  created_at DateTime @default(now())

  campaigns Campaign[]

  @@map("objectives")
}
```

In the same file, find `model Campaign {` and add the relation field. Place it on a new line **immediately after** `campaignMemberships CampaignMembership[]`:

```prisma
  objectives Objective[]
```

- [ ] **Step 2: Generate the migration**

Run from `yehub-be/`:

```bash
pnpm prisma:migrate --name add_objectives
```

Expected: a new directory `prisma/migrations/<timestamp>_add_objectives/` with `migration.sql` containing only `CREATE TABLE` / `CREATE INDEX` / `ALTER TABLE _CampaignToObjective ADD CONSTRAINT` statements.

**If `prisma:migrate` fails** (e.g., the worktree's Prisma generator hits an `ERR_REQUIRE_ESM` issue with Node 22), fall back to a hand-crafted migration:

1. Create the directory `yehub-be/prisma/migrations/20260409120000_add_objectives/` (use the current date in `YYYYMMDDHHMMSS` form).
2. Inside it create `migration.sql` with this exact content:

```sql
-- CreateTable
CREATE TABLE "objectives" (
    "id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "objectives_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "objectives_name_key" ON "objectives"("name");

-- CreateTable
CREATE TABLE "_CampaignToObjective" (
    "A" UUID NOT NULL,
    "B" UUID NOT NULL,

    CONSTRAINT "_CampaignToObjective_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE INDEX "_CampaignToObjective_B_index" ON "_CampaignToObjective"("B");

-- AddForeignKey
ALTER TABLE "_CampaignToObjective" ADD CONSTRAINT "_CampaignToObjective_A_fkey" FOREIGN KEY ("A") REFERENCES "campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_CampaignToObjective" ADD CONSTRAINT "_CampaignToObjective_B_fkey" FOREIGN KEY ("B") REFERENCES "objectives"("id") ON DELETE CASCADE ON UPDATE CASCADE;
```

3. Apply it manually with `pnpm prisma:migrate:deploy`.

- [ ] **Step 3: Hand-review the generated SQL**

Open the new `migration.sql` and confirm there are **no `DROP`, `ALTER TABLE … DROP COLUMN`, or enum changes**. The file must contain only the four `CREATE TABLE`/`CREATE INDEX`/`ADD CONSTRAINT` blocks above. If anything else appears, stop and investigate before proceeding.

- [ ] **Step 4: Regenerate the Prisma client**

```bash
pnpm prisma:generate
```

Expected: completes without error, `generated/prisma/` is updated. **If this fails** with `ERR_REQUIRE_ESM` from `@prisma/dev`, copy the generated client from the main checkout as a workaround:

```bash
cp -r /Users/dustin.nguyen/Working/yehub-platform/yehub-be/generated /Users/dustin.nguyen/Working/yehub-platform/.worktrees/post-campaign-demo/yehub-be/generated
```

Then run `pnpm prisma:migrate:deploy` to apply the migration to the dev database; the schema is already known to the local main-checkout client because both worktrees share the same physical database.

- [ ] **Step 5: Verify existing tests still pass**

```bash
cd yehub-be && pnpm test
```

Expected: 90 tests passing (no new tests added yet).

- [ ] **Step 6: Commit**

```bash
git add yehub-be/prisma/schema.prisma yehub-be/prisma/migrations/
git commit -m "feat(be): add Objective model with m2m to Campaign"
```

---

## Task 2: Build the Objectives backend module (TDD)

**Files:**
- Create: `yehub-be/src/objectives/dto/create-objective.dto.ts`
- Create: `yehub-be/src/objectives/objectives.service.ts`
- Create: `yehub-be/src/objectives/objectives.service.spec.ts`
- Create: `yehub-be/src/objectives/objectives.controller.ts`
- Create: `yehub-be/src/objectives/objectives.module.ts`
- Modify: `yehub-be/src/app.module.ts`

- [ ] **Step 1: Create the DTO**

Create `yehub-be/src/objectives/dto/create-objective.dto.ts`:

```ts
import { IsString, MinLength, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateObjectiveDto {
  @ApiProperty({ minLength: 1, maxLength: 100 })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name: string;
}
```

- [ ] **Step 2: Write the failing service test**

Create `yehub-be/src/objectives/objectives.service.spec.ts`:

```ts
import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { ObjectivesService } from './objectives.service';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '../../generated/prisma/client';

const mockPrisma = {
  objective: {
    findMany: jest.fn(),
    create: jest.fn(),
    delete: jest.fn(),
  },
};

describe('ObjectivesService', () => {
  let service: ObjectivesService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ObjectivesService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();
    service = module.get<ObjectivesService>(ObjectivesService);
    jest.clearAllMocks();
  });

  describe('findAll', () => {
    it('returns objectives with campaign_count, ordered by name', async () => {
      const raw = [
        {
          id: '1',
          name: 'Awareness',
          created_at: new Date('2026-01-01'),
          _count: { campaigns: 3 },
        },
        {
          id: '2',
          name: 'Conversion',
          created_at: new Date('2026-01-02'),
          _count: { campaigns: 0 },
        },
      ];
      mockPrisma.objective.findMany.mockResolvedValue(raw);

      const result = await service.findAll();

      expect(mockPrisma.objective.findMany).toHaveBeenCalledWith({
        orderBy: { name: 'asc' },
        select: {
          id: true,
          name: true,
          created_at: true,
          _count: { select: { campaigns: true } },
        },
      });
      expect(result).toEqual([
        { id: '1', name: 'Awareness', created_at: raw[0].created_at, campaign_count: 3 },
        { id: '2', name: 'Conversion', created_at: raw[1].created_at, campaign_count: 0 },
      ]);
    });
  });

  describe('create', () => {
    it('creates and returns an objective', async () => {
      const obj = { id: '1', name: 'Awareness', created_at: new Date() };
      mockPrisma.objective.create.mockResolvedValue(obj);

      const result = await service.create('Awareness');

      expect(result).toEqual(obj);
      expect(mockPrisma.objective.create).toHaveBeenCalledWith({
        data: { name: 'Awareness' },
      });
    });

    it('throws ConflictException on duplicate name (P2002)', async () => {
      const err = new Prisma.PrismaClientKnownRequestError('Unique fail', {
        code: 'P2002',
        clientVersion: '0.0.0',
      });
      mockPrisma.objective.create.mockRejectedValue(err);

      await expect(service.create('Awareness')).rejects.toThrow(ConflictException);
    });
  });

  describe('remove', () => {
    it('deletes an existing objective', async () => {
      mockPrisma.objective.delete.mockResolvedValue({});

      await expect(service.remove('1')).resolves.not.toThrow();
      expect(mockPrisma.objective.delete).toHaveBeenCalledWith({ where: { id: '1' } });
    });

    it('throws NotFoundException when record not found (P2025)', async () => {
      const err = new Prisma.PrismaClientKnownRequestError('Not found', {
        code: 'P2025',
        clientVersion: '0.0.0',
      });
      mockPrisma.objective.delete.mockRejectedValue(err);

      await expect(service.remove('unknown')).rejects.toThrow(NotFoundException);
    });
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

```bash
cd yehub-be && pnpm test -- objectives.service.spec
```

Expected: FAIL — `Cannot find module './objectives.service'`.

- [ ] **Step 4: Implement the service**

Create `yehub-be/src/objectives/objectives.service.ts`:

```ts
import {
  Injectable,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '../../generated/prisma/client';

@Injectable()
export class ObjectivesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    const rows = await this.prisma.objective.findMany({
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        created_at: true,
        _count: { select: { campaigns: true } },
      },
    });
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      created_at: row.created_at,
      campaign_count: row._count.campaigns,
    }));
  }

  async create(name: string) {
    try {
      return await this.prisma.objective.create({ data: { name } });
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      ) {
        throw new ConflictException('An objective with that name already exists');
      }
      throw e;
    }
  }

  async remove(id: string) {
    try {
      await this.prisma.objective.delete({ where: { id } });
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2025'
      ) {
        throw new NotFoundException('Objective not found');
      }
      throw e;
    }
  }
}
```

- [ ] **Step 5: Run the test to verify it passes**

```bash
cd yehub-be && pnpm test -- objectives.service.spec
```

Expected: 5 tests passing.

- [ ] **Step 6: Create the controller**

Create `yehub-be/src/objectives/objectives.controller.ts`:

```ts
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { GlobalRole } from '../../generated/prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { GlobalRolesGuard } from '../auth/guards/global-roles.guard';
import { GlobalRoles } from '../auth/decorators/global-roles.decorator';
import { ObjectivesService } from './objectives.service';
import { CreateObjectiveDto } from './dto/create-objective.dto';

@ApiTags('Objectives')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('objectives')
export class ObjectivesController {
  constructor(private readonly objectivesService: ObjectivesService) {}

  @Get()
  @ApiOperation({ summary: 'List all objectives with campaign counts' })
  findAll() {
    return this.objectivesService.findAll();
  }

  @Post()
  @UseGuards(GlobalRolesGuard)
  @GlobalRoles(GlobalRole.ADMIN)
  @ApiOperation({ summary: 'Create objective (admin only)' })
  create(@Body() dto: CreateObjectiveDto) {
    return this.objectivesService.create(dto.name);
  }

  @Delete(':id')
  @UseGuards(GlobalRolesGuard)
  @GlobalRoles(GlobalRole.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete objective (admin only)' })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.objectivesService.remove(id);
  }
}
```

- [ ] **Step 7: Create the module**

Create `yehub-be/src/objectives/objectives.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ObjectivesController } from './objectives.controller';
import { ObjectivesService } from './objectives.service';

@Module({
  imports: [AuthModule],
  controllers: [ObjectivesController],
  providers: [ObjectivesService],
})
export class ObjectivesModule {}
```

- [ ] **Step 8: Register the module in `app.module.ts`**

Open `yehub-be/src/app.module.ts`. Add the import alongside other feature modules (after `import { CategoriesModule } …`):

```ts
import { ObjectivesModule } from './objectives/objectives.module';
```

In the `imports: [...]` array, add `ObjectivesModule` directly after `CategoriesModule,`.

- [ ] **Step 9: Run the full test suite**

```bash
cd yehub-be && pnpm test
```

Expected: 95 tests passing (90 existing + 5 new).

- [ ] **Step 10: Commit**

```bash
git add yehub-be/src/objectives/ yehub-be/src/app.module.ts
git commit -m "feat(be): add Objectives module with admin-gated CRUD"
```

---

## Task 3: Update CategoriesService to return `project_count` and handle duplicate names

**Files:**
- Modify: `yehub-be/src/categories/categories.service.spec.ts`
- Modify: `yehub-be/src/categories/categories.service.ts`

- [ ] **Step 1: Update the failing tests**

Open `yehub-be/src/categories/categories.service.spec.ts`. Replace the entire file contents with:

```ts
import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { CategoriesService } from './categories.service';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '../../generated/prisma/client';

const mockPrisma = {
  category: {
    findMany: jest.fn(),
    create: jest.fn(),
    delete: jest.fn(),
  },
};

describe('CategoriesService', () => {
  let service: CategoriesService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CategoriesService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();
    service = module.get<CategoriesService>(CategoriesService);
    jest.clearAllMocks();
  });

  describe('findAll', () => {
    it('returns categories with project_count, ordered by name', async () => {
      const raw = [
        {
          id: '1',
          name: 'FMCG',
          created_at: new Date('2026-01-01'),
          _count: { projects: 2 },
        },
      ];
      mockPrisma.category.findMany.mockResolvedValue(raw);

      const result = await service.findAll();

      expect(mockPrisma.category.findMany).toHaveBeenCalledWith({
        orderBy: { name: 'asc' },
        select: {
          id: true,
          name: true,
          created_at: true,
          _count: { select: { projects: true } },
        },
      });
      expect(result).toEqual([
        { id: '1', name: 'FMCG', created_at: raw[0].created_at, project_count: 2 },
      ]);
    });
  });

  describe('create', () => {
    it('creates and returns a category', async () => {
      const cat = { id: '1', name: 'Tech', created_at: new Date() };
      mockPrisma.category.create.mockResolvedValue(cat);

      const result = await service.create('Tech');

      expect(result).toEqual(cat);
      expect(mockPrisma.category.create).toHaveBeenCalledWith({
        data: { name: 'Tech' },
      });
    });

    it('throws ConflictException on duplicate name (P2002)', async () => {
      const err = new Prisma.PrismaClientKnownRequestError('Unique fail', {
        code: 'P2002',
        clientVersion: '0.0.0',
      });
      mockPrisma.category.create.mockRejectedValue(err);

      await expect(service.create('Tech')).rejects.toThrow(ConflictException);
    });
  });

  describe('remove', () => {
    it('deletes an existing category', async () => {
      mockPrisma.category.delete.mockResolvedValue({});

      await expect(service.remove('1')).resolves.not.toThrow();
      expect(mockPrisma.category.delete).toHaveBeenCalledWith({ where: { id: '1' } });
    });

    it('throws NotFoundException when record not found', async () => {
      const err = new Prisma.PrismaClientKnownRequestError('Not found', {
        code: 'P2025',
        clientVersion: '0.0.0',
      });
      mockPrisma.category.delete.mockRejectedValue(err);

      await expect(service.remove('unknown')).rejects.toThrow(NotFoundException);
    });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd yehub-be && pnpm test -- categories.service.spec
```

Expected: FAIL — the `findAll` expectation now requires `_count` and the new `ConflictException` test has no implementation.

- [ ] **Step 3: Update the service**

Replace `yehub-be/src/categories/categories.service.ts` with:

```ts
import {
  Injectable,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '../../generated/prisma/client';

@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    const rows = await this.prisma.category.findMany({
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        created_at: true,
        _count: { select: { projects: true } },
      },
    });
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      created_at: row.created_at,
      project_count: row._count.projects,
    }));
  }

  async create(name: string) {
    try {
      return await this.prisma.category.create({ data: { name } });
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      ) {
        throw new ConflictException('A category with that name already exists');
      }
      throw e;
    }
  }

  async remove(id: string) {
    try {
      await this.prisma.category.delete({ where: { id } });
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2025'
      ) {
        throw new NotFoundException('Category not found');
      }
      throw e;
    }
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
cd yehub-be && pnpm test -- categories.service.spec
```

Expected: 5 tests passing.

- [ ] **Step 5: Run the full backend test suite**

```bash
cd yehub-be && pnpm test
```

Expected: 96 tests passing (one extra new test in categories spec).

- [ ] **Step 6: Commit**

```bash
git add yehub-be/src/categories/
git commit -m "feat(be): include project_count and handle duplicate names in Categories"
```

---

## Task 4: Add `objective_ids` to Campaign create/update flow

**Files:**
- Modify: `yehub-be/src/campaigns/dto/create-campaign.dto.ts`
- Modify: `yehub-be/src/campaigns/campaigns.service.ts`

- [ ] **Step 1: Update the create-campaign DTO**

Open `yehub-be/src/campaigns/dto/create-campaign.dto.ts`. Add `IsUUID` to the existing `class-validator` import:

```ts
import {
  IsString,
  IsOptional,
  MinLength,
  MaxLength,
  IsDateString,
  IsInt,
  Min,
  IsNumber,
  IsArray,
  IsEnum,
  IsUUID,
  ValidatorConstraint,
  ValidatorConstraintInterface,
  ValidationArguments,
  Validate,
} from 'class-validator';
```

Then append the new `objective_ids` field at the bottom of the `CreateCampaignDto` class (before the closing brace):

```ts
  @ApiPropertyOptional({ type: [String], format: 'uuid' })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  objective_ids?: string[];
```

`UpdateCampaignDto` extends `PartialType(CreateCampaignDto)` so it inherits this field automatically — no edit needed there.

- [ ] **Step 2: Update `CAMPAIGN_INCLUDE` to include objectives**

Open `yehub-be/src/campaigns/campaigns.service.ts`. Replace the existing `CAMPAIGN_INCLUDE` constant (currently around lines 30–37) with:

```ts
const CAMPAIGN_INCLUDE = {
  _count: { select: { posts: { where: { deleted_at: null } } } },
  project: { select: { id: true, name: true } },
  posts: {
    where: { deleted_at: null },
    select: { comment_count: true, likes: true, views: true },
  },
  objectives: { select: { id: true, name: true } },
} as const;
```

- [ ] **Step 3: Add a private helper to validate `objective_ids`**

In the same file, add this method inside the `CampaignsService` class, immediately above the existing `private buildOrderBy` method:

```ts
  private async assertObjectiveIdsExist(objectiveIds: string[]) {
    if (objectiveIds.length === 0) return;
    const found = await this.prisma.objective.count({
      where: { id: { in: objectiveIds } },
    });
    if (found !== objectiveIds.length) {
      throw new BadRequestException('One or more objective IDs are invalid');
    }
  }
```

- [ ] **Step 4: Update `create()` to handle `objective_ids`**

Locate the `create()` method. Replace its body (everything between `async create(projectId: string, dto: CreateCampaignDto) {` and the closing `}` of the method) with:

```ts
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
    });
    if (!project) throw new NotFoundException('Project not found');
    if (!project.active)
      throw new BadRequestException(
        'Cannot create campaigns in an archived project',
      );

    if (dto.objective_ids) {
      await this.assertObjectiveIdsExist(dto.objective_ids);
    }

    const campaign = await this.prisma.campaign.create({
      data: {
        project_id: projectId,
        name: dto.name,
        description: dto.description,
        start_date: dto.start_date ? new Date(dto.start_date) : undefined,
        end_date: dto.end_date ? new Date(dto.end_date) : undefined,
        metric_polling_interval: dto.metric_polling_interval,
        comments_polling_interval: dto.comments_polling_interval,
        display_metrics: dto.display_metrics ?? [],
        budget_threshold: dto.budget_threshold,
        platforms: dto.platforms ?? [],
        status: CampaignStatus.DRAFT,
        ...(dto.objective_ids && {
          objectives: { connect: dto.objective_ids.map((id) => ({ id })) },
        }),
      },
      include: CAMPAIGN_INCLUDE,
    });
    return this.formatCampaign(campaign);
```

- [ ] **Step 5: Update `update()` to handle `objective_ids`**

In the same file, locate `async update(id: string, dto: UpdateCampaignDto)`. After the existing `const { status, start_date, end_date, ... platforms, } = dto;` destructure, **add** `objective_ids` to the destructured list — replace the destructure block with:

```ts
    const {
      status,
      start_date,
      end_date,
      name,
      description,
      metric_polling_interval,
      comments_polling_interval,
      display_metrics,
      budget_threshold,
      platforms,
      objective_ids,
    } = dto;
```

Then, immediately **before** the `const data: Record<string, unknown> = {};` line, add the validation call:

```ts
    if (objective_ids) {
      await this.assertObjectiveIdsExist(objective_ids);
    }
```

Then, immediately **after** the line `if (status) data.status = status;` (the last assignment in the data-build block), add:

```ts
    if (objective_ids !== undefined) {
      data.objectives = { set: objective_ids.map((oid) => ({ id: oid })) };
    }
```

- [ ] **Step 6: Update `formatCampaign` signature and return**

Locate `private formatCampaign(campaign: { …` near the bottom of the file. In the type literal, **add** this line directly after `posts: { comment_count: number; likes: number; views: number }[];`:

```ts
    objectives: { id: string; name: string }[];
```

In the `return { … }` object at the bottom of the same function, add this line directly **after** `engagement_rate: …`:

```ts
      objectives: campaign.objectives,
```

- [ ] **Step 7: Add a focused test for the `objective_ids` validation path**

There is currently no `campaigns.service.spec.ts`. Create one that covers just the new `objective_ids` validation behavior — keep it minimal, do not try to cover the existing service surface. Create `yehub-be/src/campaigns/campaigns.service.spec.ts`:

```ts
import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { CampaignsService } from './campaigns.service';
import { PrismaService } from '../prisma/prisma.service';

const mockPrisma = {
  project: { findUnique: jest.fn() },
  objective: { count: jest.fn() },
  campaign: { create: jest.fn() },
};

describe('CampaignsService — objective_ids validation', () => {
  let service: CampaignsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CampaignsService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();
    service = module.get<CampaignsService>(CampaignsService);
    jest.clearAllMocks();
  });

  it('throws BadRequestException when objective_ids contain an unknown id', async () => {
    mockPrisma.project.findUnique.mockResolvedValue({ id: 'p1', active: true });
    // Caller asks for 2 ids; only 1 exists.
    mockPrisma.objective.count.mockResolvedValue(1);

    await expect(
      service.create('p1', {
        name: 'Test',
        objective_ids: ['11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222'],
      }),
    ).rejects.toThrow(BadRequestException);

    expect(mockPrisma.objective.count).toHaveBeenCalledWith({
      where: {
        id: {
          in: [
            '11111111-1111-1111-1111-111111111111',
            '22222222-2222-2222-2222-222222222222',
          ],
        },
      },
    });
    expect(mockPrisma.campaign.create).not.toHaveBeenCalled();
  });

  it('skips validation when objective_ids is omitted', async () => {
    mockPrisma.project.findUnique.mockResolvedValue({ id: 'p1', active: true });
    mockPrisma.campaign.create.mockResolvedValue({
      id: 'c1',
      project_id: 'p1',
      name: 'Test',
      description: null,
      status: 'DRAFT',
      platforms: [],
      start_date: null,
      end_date: null,
      metric_polling_interval: null,
      comments_polling_interval: null,
      display_metrics: [],
      budget_threshold: null,
      created_at: new Date(),
      updated_at: new Date(),
      _count: { posts: 0 },
      project: { id: 'p1', name: 'Project' },
      posts: [],
      objectives: [],
    });

    await expect(service.create('p1', { name: 'Test' })).resolves.toBeDefined();
    expect(mockPrisma.objective.count).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 8: Run the new test to verify it passes**

```bash
cd yehub-be && pnpm test -- campaigns.service.spec
```

Expected: 2 tests passing. If the second test fails because `formatCampaign`'s type literal doesn't match the fixture, adjust the fixture rather than the production code.

- [ ] **Step 9: Run the full backend test suite**

```bash
cd yehub-be && pnpm test
```

Expected: 98 tests passing (96 + 2 new). If any other test starts failing because the mock now needs `objectives` in the include, add `objectives: []` to the relevant fixture data in those test files.

- [ ] **Step 10: Run the lint**

```bash
cd yehub-be && pnpm lint
```

Expected: clean.

- [ ] **Step 11: Commit**

```bash
git add yehub-be/src/campaigns/
git commit -m "feat(be): support objective_ids on campaign create/update"
```

---

## Task 5: Frontend API client, types, query keys, and form schema

**Files:**
- Create: `yehub-fe/src/api/objectives.ts`
- Modify: `yehub-fe/src/api/categories.ts`
- Modify: `yehub-fe/src/api/campaigns.ts`
- Modify: `yehub-fe/src/lib/constants/query-keys.ts`
- Modify: `yehub-fe/src/lib/schemas.ts`

- [ ] **Step 1: Create the objectives API module**

Create `yehub-fe/src/api/objectives.ts`:

```ts
import { apiClient } from './client'

export interface Objective {
  id: string
  name: string
  campaign_count?: number
}

export const objectivesApi = {
  list: (): Promise<Objective[]> => apiClient.get<Objective[]>('/objectives').then((r) => r.data),

  create: (name: string): Promise<Objective> =>
    apiClient.post<Objective>('/objectives', { name }).then((r) => r.data),

  remove: (id: string) => apiClient.delete(`/objectives/${id}`),
}
```

- [ ] **Step 2: Add `project_count` to the Category type**

Open `yehub-fe/src/api/categories.ts`. Replace the `Category` interface with:

```ts
export interface Category {
  id: string
  name: string
  project_count?: number
}
```

Leave the rest of the file unchanged.

- [ ] **Step 3: Add `objectives` to the Campaign type and payloads**

Open `yehub-fe/src/api/campaigns.ts`. Locate the `Campaign` interface (currently around lines 9–28) and add this line directly **after** `engagement_rate: number | null`:

```ts
  objectives: { id: string; name: string }[]
```

Locate `CreateCampaignPayload` and add this line at the bottom of the interface (before the closing brace):

```ts
  objective_ids?: string[]
```

`UpdateCampaignPayload` already extends `Partial<CreateCampaignPayload>` so it inherits the new field automatically.

- [ ] **Step 4: Add the `objectives` query key**

Open `yehub-fe/src/lib/constants/query-keys.ts`. Add this line **after** the `categories: ['categories'] as const,` line:

```ts
  objectives: ['objectives'] as const,
```

- [ ] **Step 5: Add `objectives` to the campaign form schema**

Open `yehub-fe/src/lib/schemas.ts`. Locate the `campaignFormSchema` (currently around lines 71–94). Replace the `.object({ … })` portion to **add** the `objectives` field. The block that begins with `z.object({` should now be:

```ts
  .object({
    name: z.string().min(1, 'Campaign name is required'),
    description: z.string().optional(),
    platforms: z.array(z.string()).optional(),
    start_date: z.string().optional(),
    end_date: z.string().optional(),
    metric_polling_interval: z.number().optional(),
    comments_polling_interval: z.number().optional(),
    display_metrics: z.array(z.string()).optional(),
    budget_threshold: z.number().min(0).optional(),
    objectives: z.array(z.object({ id: z.string(), name: z.string() })).default([]),
  })
```

Leave the `.refine(...)` block below it unchanged.

- [ ] **Step 6: Run the lint**

```bash
cd yehub-fe && pnpm lint
```

Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add yehub-fe/src/api/objectives.ts yehub-fe/src/api/categories.ts yehub-fe/src/api/campaigns.ts yehub-fe/src/lib/constants/query-keys.ts yehub-fe/src/lib/schemas.ts
git commit -m "feat(fe): add objectives API client, types, and form schema"
```

---

## Task 6: Build the shared `MultiSelectChecklist` primitive

**Files:**
- Create: `yehub-fe/src/components/common/MultiSelectChecklist.tsx`

- [ ] **Step 1: Create the component**

Create `yehub-fe/src/components/common/MultiSelectChecklist.tsx`:

```tsx
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'

interface MultiSelectChecklistItem {
  id: string
  name: string
}

interface MultiSelectChecklistProps {
  label: string
  items: MultiSelectChecklistItem[]
  selectedIds: string[]
  onChange: (ids: string[]) => void
  emptyMessage?: string
  disabled?: boolean
}

export function MultiSelectChecklist({
  label,
  items,
  selectedIds,
  onChange,
  emptyMessage = 'No items available.',
  disabled = false,
}: MultiSelectChecklistProps) {
  const toggle = (id: string) => {
    if (selectedIds.includes(id)) {
      onChange(selectedIds.filter((sid) => sid !== id))
    } else {
      onChange([...selectedIds, id])
    }
  }

  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {items.length === 0 ? (
        <p className="text-xs text-muted-foreground">{emptyMessage}</p>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {items.map((item) => (
            <label key={item.id} className="flex items-center gap-2 cursor-pointer">
              <Checkbox
                checked={selectedIds.includes(item.id)}
                onCheckedChange={() => toggle(item.id)}
                disabled={disabled}
              />
              <span className="text-sm">{item.name}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Lint**

```bash
cd yehub-fe && pnpm lint
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add yehub-fe/src/components/common/MultiSelectChecklist.tsx
git commit -m "feat(fe): add MultiSelectChecklist shared primitive"
```

---

## Task 7: Simplify `ProjectCategoryPicker` and add `CampaignObjectivePicker`

**Files:**
- Modify: `yehub-fe/src/pages/projects/components/ProjectCategoryPicker.tsx`
- Create: `yehub-fe/src/pages/campaigns/CampaignFormPage/components/CampaignObjectivePicker.tsx`

- [ ] **Step 1: Replace `ProjectCategoryPicker` with the simplified version**

Replace the **entire contents** of `yehub-fe/src/pages/projects/components/ProjectCategoryPicker.tsx` with:

```tsx
import { useQuery } from '@tanstack/react-query'
import { queryKeys } from '@/lib/constants/query-keys'
import { categoriesApi, type Category } from '@/api/categories'
import { MultiSelectChecklist } from '@/components/common/MultiSelectChecklist'

interface ProjectCategoryPickerProps {
  selected: Category[]
  onChange: (categories: Category[]) => void
}

export function ProjectCategoryPicker({ selected, onChange }: ProjectCategoryPickerProps) {
  const { data: items = [] } = useQuery({
    queryKey: queryKeys.categories,
    queryFn: categoriesApi.list,
  })

  const selectedIds = selected.map((s) => s.id)

  const handleChange = (ids: string[]) => {
    onChange(items.filter((c) => ids.includes(c.id)))
  }

  return (
    <MultiSelectChecklist
      label="Categories"
      items={items}
      selectedIds={selectedIds}
      onChange={handleChange}
      emptyMessage="No project categories defined. Ask an admin to create one in Settings."
    />
  )
}
```

This drops the inline `Add New Category` admin dialog entirely, along with all of its imports (`useState`, `useMutation`, `useQueryClient`, `Plus`, `Dialog…`, `Input`, `Button`, `Checkbox`, `Label`, `useAuthStore`, `toast`).

- [ ] **Step 2: Create `CampaignObjectivePicker`**

Create `yehub-fe/src/pages/campaigns/CampaignFormPage/components/CampaignObjectivePicker.tsx`:

```tsx
import { useQuery } from '@tanstack/react-query'
import { queryKeys } from '@/lib/constants/query-keys'
import { objectivesApi, type Objective } from '@/api/objectives'
import { MultiSelectChecklist } from '@/components/common/MultiSelectChecklist'

interface CampaignObjectivePickerProps {
  selected: { id: string; name: string }[]
  onChange: (objectives: Objective[]) => void
}

export function CampaignObjectivePicker({ selected, onChange }: CampaignObjectivePickerProps) {
  const { data: items = [] } = useQuery({
    queryKey: queryKeys.objectives,
    queryFn: objectivesApi.list,
  })

  const selectedIds = selected.map((s) => s.id)

  const handleChange = (ids: string[]) => {
    onChange(items.filter((o) => ids.includes(o.id)))
  }

  return (
    <MultiSelectChecklist
      label="Objectives"
      items={items}
      selectedIds={selectedIds}
      onChange={handleChange}
      emptyMessage="No objectives defined. Ask an admin to create one in Settings."
    />
  )
}
```

- [ ] **Step 3: Lint**

```bash
cd yehub-fe && pnpm lint
```

Expected: clean. ESLint will likely error on any leftover imports — if it does, remove them and re-run.

- [ ] **Step 4: Commit**

```bash
git add yehub-fe/src/pages/projects/components/ProjectCategoryPicker.tsx yehub-fe/src/pages/campaigns/CampaignFormPage/components/CampaignObjectivePicker.tsx
git commit -m "feat(fe): simplify ProjectCategoryPicker and add CampaignObjectivePicker"
```

---

## Task 8: Build `ObjectivesCard` and wire it into the Campaign form

**Files:**
- Create: `yehub-fe/src/pages/campaigns/CampaignFormPage/components/ObjectivesCard.tsx`
- Modify: `yehub-fe/src/pages/campaigns/CampaignFormPage/index.tsx`

- [ ] **Step 1: Inspect a sibling card to match the visual style**

Read `yehub-fe/src/pages/campaigns/CampaignFormPage/components/DisplayMetricsCard.tsx` (or any other sibling card in the same folder) to confirm the existing pattern: typically a shadcn `Card` + `CardHeader` + `CardTitle` + `CardContent`, using `useFormContext<CampaignFormValues>()` and `FormField`. Match that idiom in the next step.

- [ ] **Step 2: Create `ObjectivesCard`**

Create `yehub-fe/src/pages/campaigns/CampaignFormPage/components/ObjectivesCard.tsx`:

```tsx
import { useFormContext } from 'react-hook-form'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { FormField, FormItem, FormControl, FormMessage } from '@/components/ui/form'
import type { CampaignFormValues } from '@/lib/schemas'
import { CampaignObjectivePicker } from './CampaignObjectivePicker'

export function ObjectivesCard() {
  const form = useFormContext<CampaignFormValues>()

  return (
    <Card className="lg:col-span-12">
      <CardHeader>
        <CardTitle>Objectives</CardTitle>
      </CardHeader>
      <CardContent>
        <FormField
          control={form.control}
          name="objectives"
          render={({ field }) => (
            <FormItem>
              <FormControl>
                <CampaignObjectivePicker
                  selected={field.value ?? []}
                  onChange={field.onChange}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </CardContent>
    </Card>
  )
}
```

If your sibling cards use different `lg:col-span-*` widths (e.g., `lg:col-span-6`), match the closest sibling that visually represents a full-width section like `DisplayMetricsCard`. Adjust the `className` accordingly.

- [ ] **Step 3: Wire `ObjectivesCard` into `CampaignFormPage`**

Open `yehub-fe/src/pages/campaigns/CampaignFormPage/index.tsx`. Make these four edits:

1. Add the import alongside other card imports (after `import { DisplayMetricsCard } …`):

```ts
import { ObjectivesCard } from './components/ObjectivesCard'
```

2. Add `objectives: []` to `defaultValues` (currently around line 35-45). The block should become:

```ts
    defaultValues: {
      name: '',
      description: '',
      platforms: [],
      start_date: '',
      end_date: '',
      metric_polling_interval: 3600,
      comments_polling_interval: 21600,
      display_metrics: [],
      budget_threshold: undefined,
      objectives: [],
    },
```

3. Add `objectives` to the edit-mode `values:` block. Find the existing `values: isEdit && existingCampaign ? { … } : undefined` and add this line at the bottom of the inner object (after `budget_threshold: …`):

```ts
            objectives: existingCampaign.objectives ?? [],
```

4. Add `objective_ids` to the mutation payload. Find the `mutationFn:` block and add this line at the bottom of the `payload` object (after `budget_threshold: values.budget_threshold,`):

```ts
        objective_ids: values.objectives?.map((o) => o.id) ?? [],
```

5. Render `<ObjectivesCard />` in the form layout. Find the existing `<div className="grid gap-6 lg:grid-cols-12">` block and add the card at the end of the children, after `<DisplayMetricsCard />`:

```tsx
            <ObjectivesCard />
```

- [ ] **Step 4: Lint**

```bash
cd yehub-fe && pnpm lint
```

Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add yehub-fe/src/pages/campaigns/CampaignFormPage/
git commit -m "feat(fe): add ObjectivesCard to campaign form"
```

---

## Task 9: Build the shared Add/Delete tag dialogs

**Files:**
- Create: `yehub-fe/src/pages/admin/SettingsPage/components/AddTagDialog.tsx`
- Create: `yehub-fe/src/pages/admin/SettingsPage/components/DeleteTagDialog.tsx`

- [ ] **Step 1: Create `AddTagDialog`**

Create `yehub-fe/src/pages/admin/SettingsPage/components/AddTagDialog.tsx`:

```tsx
import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

interface AddTagDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  entityLabel: string
  isCreating: boolean
  onCreate: (name: string) => void
}

export function AddTagDialog({ open, onOpenChange, entityLabel, isCreating, onCreate }: AddTagDialogProps) {
  const [name, setName] = useState('')

  useEffect(() => {
    if (!open) setName('')
  }, [open])

  const trimmed = name.trim()
  const isValid = trimmed.length > 0 && trimmed.length <= 100

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!isValid || isCreating) return
    onCreate(trimmed)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Add {entityLabel}</DialogTitle>
          <DialogDescription>Enter a name. Names must be unique.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="tag-name">Name</Label>
            <Input
              id="tag-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={`e.g. ${entityLabel === 'Project Category' ? 'FMCG' : 'Brand Awareness'}`}
              maxLength={100}
              autoFocus
            />
          </div>
          <div className="flex justify-end gap-3">
            <Button
              type="button"
              variant="outline"
              className="cursor-pointer"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" className="cursor-pointer" disabled={!isValid || isCreating}>
              {isCreating ? 'Adding…' : 'Add'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 2: Create `DeleteTagDialog`**

Create `yehub-fe/src/pages/admin/SettingsPage/components/DeleteTagDialog.tsx`:

```tsx
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'

interface DeleteTagDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  entityLabel: string
  usageNoun: string
  name: string
  usageCount: number
  isDeleting: boolean
  onConfirm: () => void
}

function buildDescription(usageNoun: string, usageCount: number): string {
  if (usageCount === 0) return ''
  const noun = usageCount === 1 ? usageNoun : `${usageNoun}s`
  return `It is currently used by ${usageCount} ${noun}. Deleting will remove it from ${usageCount === 1 ? 'that' : 'those'} ${noun}.`
}

export function DeleteTagDialog({
  open,
  onOpenChange,
  entityLabel,
  usageNoun,
  name,
  usageCount,
  isDeleting,
  onConfirm,
}: DeleteTagDialogProps) {
  const description = buildDescription(usageNoun, usageCount)

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            Delete {entityLabel.toLowerCase()} &quot;{name}&quot;?
          </AlertDialogTitle>
          {description && <AlertDialogDescription>{description}</AlertDialogDescription>}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel className="cursor-pointer" disabled={isDeleting}>
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            className="cursor-pointer bg-destructive text-destructive-foreground hover:bg-destructive/90"
            disabled={isDeleting}
            onClick={(e) => {
              e.preventDefault()
              onConfirm()
            }}
          >
            {isDeleting ? 'Deleting…' : 'Delete'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
```

- [ ] **Step 3: Lint**

```bash
cd yehub-fe && pnpm lint
```

Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add yehub-fe/src/pages/admin/SettingsPage/components/AddTagDialog.tsx yehub-fe/src/pages/admin/SettingsPage/components/DeleteTagDialog.tsx
git commit -m "feat(fe): add shared AddTagDialog and DeleteTagDialog"
```

---

## Task 10: Build the shared `TagListPanel`

**Files:**
- Create: `yehub-fe/src/pages/admin/SettingsPage/components/TagListPanel.tsx`

- [ ] **Step 1: Create the component**

Create `yehub-fe/src/pages/admin/SettingsPage/components/TagListPanel.tsx`:

```tsx
import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { AddTagDialog } from './AddTagDialog'
import { DeleteTagDialog } from './DeleteTagDialog'

export interface TagListItem {
  id: string
  name: string
  usage_count: number
}

interface TagListPanelProps {
  entityLabel: string
  entityLabelPlural: string
  usageNoun: string
  items: TagListItem[]
  isLoading: boolean
  isError: boolean
  onCreate: (name: string) => void
  onDelete: (id: string) => void
  isCreating: boolean
  isDeleting: boolean
}

export function TagListPanel({
  entityLabel,
  entityLabelPlural,
  usageNoun,
  items,
  isLoading,
  isError,
  onCreate,
  onDelete,
  isCreating,
  isDeleting,
}: TagListPanelProps) {
  const [addOpen, setAddOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<TagListItem | null>(null)

  const handleCreate = (name: string) => {
    onCreate(name)
    setAddOpen(false)
  }

  const handleConfirmDelete = () => {
    if (!deleteTarget) return
    onDelete(deleteTarget.id)
    setDeleteTarget(null)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">{entityLabelPlural}</h2>
          <p className="text-sm text-muted-foreground">
            {items.length} total
          </p>
        </div>
        <Button onClick={() => setAddOpen(true)} className="cursor-pointer">
          <Plus className="mr-2 h-4 w-4" />
          Add {entityLabel}
        </Button>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground py-8 text-center">Loading…</p>
      ) : isError ? (
        <p className="text-sm text-destructive py-8 text-center">Failed to load.</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-muted-foreground py-8 text-center">
          No {entityLabelPlural.toLowerCase()} yet. Add one to get started.
        </p>
      ) : (
        <ul className="divide-y rounded border">
          {items.map((item) => (
            <li key={item.id} className="flex items-center justify-between gap-3 p-3">
              <div className="flex items-center gap-3">
                <span className="font-medium">{item.name}</span>
                <Badge variant="secondary">
                  {item.usage_count} {item.usage_count === 1 ? usageNoun : `${usageNoun}s`}
                </Badge>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="cursor-pointer text-destructive hover:text-destructive"
                onClick={() => setDeleteTarget(item)}
                aria-label={`Delete ${item.name}`}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </li>
          ))}
        </ul>
      )}

      <AddTagDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        entityLabel={entityLabel}
        isCreating={isCreating}
        onCreate={handleCreate}
      />

      <DeleteTagDialog
        open={!!deleteTarget}
        onOpenChange={(v) => {
          if (!v) setDeleteTarget(null)
        }}
        entityLabel={entityLabel}
        usageNoun={usageNoun}
        name={deleteTarget?.name ?? ''}
        usageCount={deleteTarget?.usage_count ?? 0}
        isDeleting={isDeleting}
        onConfirm={handleConfirmDelete}
      />
    </div>
  )
}
```

- [ ] **Step 2: Lint**

```bash
cd yehub-fe && pnpm lint
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add yehub-fe/src/pages/admin/SettingsPage/components/TagListPanel.tsx
git commit -m "feat(fe): add shared TagListPanel for settings tabs"
```

---

## Task 11: Build the data hooks and tab components

**Files:**
- Create: `yehub-fe/src/pages/admin/SettingsPage/use-categories-tab.ts`
- Create: `yehub-fe/src/pages/admin/SettingsPage/use-objectives-tab.ts`
- Create: `yehub-fe/src/pages/admin/SettingsPage/components/ProjectCategoriesTab.tsx`
- Create: `yehub-fe/src/pages/admin/SettingsPage/components/CampaignObjectivesTab.tsx`

- [ ] **Step 1: Create `use-categories-tab.ts`**

Create `yehub-fe/src/pages/admin/SettingsPage/use-categories-tab.ts`:

```ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import axios from 'axios'
import { toast } from 'sonner'
import { categoriesApi } from '@/api/categories'
import { queryKeys } from '@/lib/constants/query-keys'

export function useCategoriesTab() {
  const queryClient = useQueryClient()

  const { data, isLoading, isError } = useQuery({
    queryKey: queryKeys.categories,
    queryFn: categoriesApi.list,
  })

  const createMutation = useMutation({
    mutationFn: (name: string) => categoriesApi.create(name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.categories })
      toast.success('Category created')
    },
    onError: (err) => {
      const msg = axios.isAxiosError(err)
        ? ((err.response?.data as { message?: string })?.message ?? 'Failed to create category')
        : 'Failed to create category'
      toast.error(msg)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => categoriesApi.remove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.categories })
      toast.success('Category deleted')
    },
    onError: () => toast.error('Failed to delete category'),
  })

  const items = (data ?? []).map((c) => ({
    id: c.id,
    name: c.name,
    usage_count: c.project_count ?? 0,
  }))

  return { items, isLoading, isError, createMutation, deleteMutation }
}
```

- [ ] **Step 2: Create `use-objectives-tab.ts`**

Create `yehub-fe/src/pages/admin/SettingsPage/use-objectives-tab.ts`:

```ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import axios from 'axios'
import { toast } from 'sonner'
import { objectivesApi } from '@/api/objectives'
import { queryKeys } from '@/lib/constants/query-keys'

export function useObjectivesTab() {
  const queryClient = useQueryClient()

  const { data, isLoading, isError } = useQuery({
    queryKey: queryKeys.objectives,
    queryFn: objectivesApi.list,
  })

  const createMutation = useMutation({
    mutationFn: (name: string) => objectivesApi.create(name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.objectives })
      toast.success('Objective created')
    },
    onError: (err) => {
      const msg = axios.isAxiosError(err)
        ? ((err.response?.data as { message?: string })?.message ?? 'Failed to create objective')
        : 'Failed to create objective'
      toast.error(msg)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => objectivesApi.remove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.objectives })
      toast.success('Objective deleted')
    },
    onError: () => toast.error('Failed to delete objective'),
  })

  const items = (data ?? []).map((o) => ({
    id: o.id,
    name: o.name,
    usage_count: o.campaign_count ?? 0,
  }))

  return { items, isLoading, isError, createMutation, deleteMutation }
}
```

- [ ] **Step 3: Create `ProjectCategoriesTab.tsx`**

Create `yehub-fe/src/pages/admin/SettingsPage/components/ProjectCategoriesTab.tsx`:

```tsx
import { useCategoriesTab } from '../use-categories-tab'
import { TagListPanel } from './TagListPanel'

export function ProjectCategoriesTab() {
  const { items, isLoading, isError, createMutation, deleteMutation } = useCategoriesTab()

  return (
    <TagListPanel
      entityLabel="Project Category"
      entityLabelPlural="Project Categories"
      usageNoun="project"
      items={items}
      isLoading={isLoading}
      isError={isError}
      onCreate={(name) => createMutation.mutate(name)}
      onDelete={(id) => deleteMutation.mutate(id)}
      isCreating={createMutation.isPending}
      isDeleting={deleteMutation.isPending}
    />
  )
}
```

- [ ] **Step 4: Create `CampaignObjectivesTab.tsx`**

Create `yehub-fe/src/pages/admin/SettingsPage/components/CampaignObjectivesTab.tsx`:

```tsx
import { useObjectivesTab } from '../use-objectives-tab'
import { TagListPanel } from './TagListPanel'

export function CampaignObjectivesTab() {
  const { items, isLoading, isError, createMutation, deleteMutation } = useObjectivesTab()

  return (
    <TagListPanel
      entityLabel="Category Objective"
      entityLabelPlural="Category Objectives"
      usageNoun="campaign"
      items={items}
      isLoading={isLoading}
      isError={isError}
      onCreate={(name) => createMutation.mutate(name)}
      onDelete={(id) => deleteMutation.mutate(id)}
      isCreating={createMutation.isPending}
      isDeleting={deleteMutation.isPending}
    />
  )
}
```

- [ ] **Step 5: Lint**

```bash
cd yehub-fe && pnpm lint
```

Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add yehub-fe/src/pages/admin/SettingsPage/use-categories-tab.ts yehub-fe/src/pages/admin/SettingsPage/use-objectives-tab.ts yehub-fe/src/pages/admin/SettingsPage/components/ProjectCategoriesTab.tsx yehub-fe/src/pages/admin/SettingsPage/components/CampaignObjectivesTab.tsx
git commit -m "feat(fe): add settings tab data hooks and tab components"
```

---

## Task 12: Rewrite the SettingsPage with tabs and URL state

**Files:**
- Modify: `yehub-fe/src/pages/admin/SettingsPage/index.tsx`

- [ ] **Step 1: Replace the entire file**

Replace the **entire contents** of `yehub-fe/src/pages/admin/SettingsPage/index.tsx` with:

```tsx
import { useSearchParams } from 'react-router-dom'
import { PageWrapper } from '@/components/common/PageWrapper'
import { PageHeader } from '@/components/common/PageHeader'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useSetPageTitle } from '@/hooks/use-page-title'
import { ProjectCategoriesTab } from './components/ProjectCategoriesTab'
import { CampaignObjectivesTab } from './components/CampaignObjectivesTab'

const VALID_TABS = ['categories', 'objectives'] as const
type SettingsTab = (typeof VALID_TABS)[number]

function parseTab(value: string | null): SettingsTab {
  return value === 'objectives' ? 'objectives' : 'categories'
}

export function SettingsPage() {
  useSetPageTitle('Settings')
  const [params, setParams] = useSearchParams()
  const tab = parseTab(params.get('tab'))

  const setTab = (value: string) => {
    const next = new URLSearchParams(params)
    next.set('tab', value)
    setParams(next, { replace: true })
  }

  return (
    <PageWrapper>
      <PageHeader
        title="Settings"
        description="Manage shared settings used across projects and campaigns."
      />
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="categories" className="cursor-pointer">
            Project Category
          </TabsTrigger>
          <TabsTrigger value="objectives" className="cursor-pointer">
            Category Objective
          </TabsTrigger>
        </TabsList>
        <TabsContent value="categories" className="mt-6">
          <ProjectCategoriesTab />
        </TabsContent>
        <TabsContent value="objectives" className="mt-6">
          <CampaignObjectivesTab />
        </TabsContent>
      </Tabs>
    </PageWrapper>
  )
}
```

If the existing project does **not** export `useSetPageTitle` from `@/hooks/use-page-title`, instead use the same import path that `AdminPanelPage/index.tsx` uses (verified to be `@/hooks/use-page-title` based on its current import). If the path differs, mirror whatever `AdminPanelPage` does.

- [ ] **Step 2: Lint**

```bash
cd yehub-fe && pnpm lint
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add yehub-fe/src/pages/admin/SettingsPage/index.tsx
git commit -m "feat(fe): rewrite SettingsPage with tabs and URL state"
```

---

## Task 13: Final verification

- [ ] **Step 1: Backend lint and test**

```bash
cd yehub-be && pnpm lint && pnpm test
```

Expected: lint clean, 98/98 tests passing.

- [ ] **Step 2: Backend build**

```bash
cd yehub-be && pnpm build
```

Expected: clean build, no TypeScript errors.

- [ ] **Step 3: Frontend lint and build**

```bash
cd yehub-fe && pnpm lint && pnpm build
```

Expected: lint clean, build succeeds.

- [ ] **Step 4: Manual smoke check (optional, if dev environment is running)**

If `docker compose up -d` is running and the BE/FE dev servers are up:

1. Log in as an admin.
2. Navigate to `/settings`. Confirm:
   - Margins match `/users` and `/projects`.
   - Two tabs visible: "Project Category" and "Category Objective".
   - URL becomes `?tab=categories` (or stays clean for default).
3. Click "Category Objective" tab — URL updates to `?tab=objectives`. Refresh the page; the tab is preserved.
4. Add a new objective. Verify it appears in the list.
5. Open `/projects/<id>/campaigns/new`. Confirm the Objectives card appears with the new objective as a checkable option.
6. Create a campaign with the objective selected, then re-open it for edit — confirm the objective is still selected.
7. Open `/settings?tab=objectives`. Try deleting the objective. Confirm the dialog message reads "It is currently used by 1 campaign." and that confirming the delete removes it.
8. Re-open the campaign; confirm objectives are now empty.
9. Open the Project create/edit form — confirm the categories picker still works but the inline "Add New Category" button is gone for everyone.
10. Log out, log back in as a non-admin. Navigate to `/settings`. Confirm redirect to `/projects`.

If any step fails, fix the underlying issue rather than working around it. Re-run lint+tests after any fix.

- [ ] **Step 5: Commit any verification fixes**

If verification surfaced fixes, commit them with appropriate messages. If not, no commit needed.

---

## Implementation order summary

1. **BE**: schema/migration → objectives module → categories upgrade → campaign integration
2. **FE**: API/types → primitives → pickers → form integration → settings page

**Constraint:** Do **not** skip the test-first steps in Tasks 2 and 3. Both rely on the failing-test-then-implement loop to catch typos in the mocked Prisma calls and the response shape.

**Constraint:** Do **not** use `--no-verify` to bypass commit hooks. If a hook fails, fix the underlying issue and re-stage.

**Constraint:** Do **not** add any tests under `yehub-e2e/`. Backend unit tests in this plan are the only test additions.
