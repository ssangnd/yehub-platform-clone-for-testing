# Campaign Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement campaign CRUD with lifecycle management, post management with URL auto-detection and CSV bulk upload, and the full campaign management UI.

**Architecture:** Two new NestJS modules (CampaignsModule, PostsModule) following the existing ProjectsModule pattern. Frontend adds campaign/post API layer, new pages (list, form, detail, posts tab), and updates routing + ProjectDetailPage. The ProjectRolesGuard already supports `params.projectId` for nested routes. For campaign-scoped endpoints (`/campaigns/:id`), a new CampaignRolesGuard resolves the project from the campaign record.

**Tech Stack:** NestJS 11, Prisma, PostgreSQL, BullMQ (placeholder), React 19, Vite, shadcn/ui, TanStack Query, React Hook Form, Zod, papaparse

**Spec:** `docs/superpowers/specs/2026-03-30-campaign-management-design.md`

---

## File Structure

### Backend (`yehub-be`)

```
prisma/schema.prisma                              — MODIFY: enum + model changes
src/app.module.ts                                  — MODIFY: register new modules
src/auth/guards/campaign-roles.guard.ts            — CREATE: guard that resolves projectId from campaign
src/campaigns/campaigns.module.ts                  — CREATE
src/campaigns/campaigns.controller.ts              — CREATE
src/campaigns/campaigns.service.ts                 — CREATE
src/campaigns/dto/create-campaign.dto.ts           — CREATE
src/campaigns/dto/update-campaign.dto.ts           — CREATE
src/campaigns/dto/list-campaigns-query.dto.ts      — CREATE
src/campaigns/campaign-status.utils.ts             — CREATE: status transition validation
src/posts/posts.module.ts                          — CREATE
src/posts/posts.controller.ts                      — CREATE
src/posts/posts.service.ts                         — CREATE
src/posts/dto/add-post.dto.ts                      — CREATE
src/posts/dto/update-post.dto.ts                   — CREATE
src/posts/dto/list-posts-query.dto.ts              — CREATE
src/posts/platform-detect.utils.ts                 — CREATE: URL detection utility
```

### Frontend (`yehub-fe`)

```
src/api/campaigns.ts                               — CREATE
src/api/posts.ts                                   — CREATE
src/lib/constants/routes.ts                        — MODIFY: add campaign routes
src/lib/constants/query-keys.ts                    — MODIFY: add campaign/post keys
src/lib/schemas.ts                                 — MODIFY: add campaign/post schemas
src/router.tsx                                     — MODIFY: add campaign routes
src/pages/campaigns/CampaignsListPage/index.tsx    — CREATE (replace stub)
src/pages/campaigns/CampaignsListPage/use-campaigns-list.ts — CREATE
src/pages/campaigns/CampaignsListPage/components/CampaignsTableHeader.tsx — CREATE
src/pages/campaigns/CampaignsListPage/components/CampaignItem.tsx — CREATE
src/pages/campaigns/CampaignFormPage.tsx           — CREATE
src/pages/campaigns/CampaignDetailPage/index.tsx   — CREATE
src/pages/campaigns/CampaignDetailPage/use-campaign-detail.ts — CREATE
src/pages/campaigns/CampaignDetailPage/components/CampaignPostsTab.tsx — CREATE
src/pages/campaigns/CampaignDetailPage/components/use-campaign-posts.ts — CREATE
src/pages/campaigns/CampaignDetailPage/components/AddPostDialog.tsx — CREATE
src/pages/campaigns/CampaignDetailPage/components/ImportCsvDialog.tsx — CREATE
src/pages/campaigns/components/StatusBadge.tsx     — CREATE
src/pages/projects/ProjectDetailPage/components/ProjectCampaignsTab.tsx — CREATE
src/pages/projects/ProjectDetailPage/index.tsx     — MODIFY: wire up campaigns tab
src/hooks/use-can.ts                               — MODIFY: add campaign actions
```

---

## Task 1: Database Schema Changes

**Files:**
- Modify: `yehub-be/prisma/schema.prisma`

- [ ] **Step 1: Update CampaignStatus enum**

In `prisma/schema.prisma`, replace the `CampaignStatus` enum:

```prisma
enum CampaignStatus {
  DRAFT
  ACTIVE
  PAUSED
  STOPPED
  COMPLETED
}
```

(Removes `ARCHIVED`, adds `STOPPED`)

- [ ] **Step 2: Add THREADS to Platform enum**

```prisma
enum Platform {
  FACEBOOK
  INSTAGRAM
  TIKTOK
  YOUTUBE
  X
  LINKEDIN
  THREADS
}
```

- [ ] **Step 3: Add deleted_at to Campaign model**

Add after `budget_threshold`:

```prisma
  deleted_at               DateTime?
```

Also add `created_at` and `updated_at` timestamps if not present:

```prisma
  created_at               DateTime  @default(now())
  updated_at               DateTime  @updatedAt
```

- [ ] **Step 4: Update Post model**

Make `social_account_id` optional (nullable), add new fields, add `created_at`/`updated_at`:

```prisma
model Post {
  id                        String    @id @default(uuid()) @db.Uuid
  campaign_id               String    @db.Uuid
  social_account_id         String?   @db.Uuid
  platform                  Platform
  platform_post_id          String
  url                       String?
  content                   String?
  media_type                MediaType @default(TEXT)
  polling_interval_override Int?
  polling_enabled           Boolean   @default(true)
  last_polled_at            DateTime?
  last_poll_status          String?
  comment_count             Int       @default(0)
  deleted_at                DateTime?
  created_at                DateTime  @default(now())
  updated_at                DateTime  @updatedAt

  campaign      Campaign       @relation(fields: [campaign_id], references: [id], onDelete: Cascade)
  socialAccount SocialAccount? @relation(fields: [social_account_id], references: [id], onDelete: Cascade)
  comments      Comment[]

  @@unique([platform, platform_post_id])
  @@index([campaign_id])
  @@index([social_account_id])
  @@index([last_polled_at])
  @@map("posts")
}
```

Key changes: `social_account_id` is now `String?`, `socialAccount` is now `SocialAccount?`, added `polling_enabled`, `last_poll_status`, `comment_count`, `deleted_at`, `created_at`, `updated_at`.

- [ ] **Step 5: Generate Prisma client and create migration**

```bash
cd yehub-be && pnpm prisma:migrate
```

When prompted for migration name, use: `add_campaign_post_fields`

Then regenerate:

```bash
pnpm prisma:generate
```

- [ ] **Step 6: Commit**

```bash
git add prisma/
git commit -m "feat: update schema for campaign and post management"
```

---

## Task 2: Campaign Status Transition Utility

**Files:**
- Create: `yehub-be/src/campaigns/campaign-status.utils.ts`

- [ ] **Step 1: Create the utility**

```typescript
import { CampaignStatus } from '../../generated/prisma/client';

const VALID_TRANSITIONS: Record<CampaignStatus, CampaignStatus[]> = {
  [CampaignStatus.DRAFT]: [CampaignStatus.ACTIVE],
  [CampaignStatus.ACTIVE]: [
    CampaignStatus.PAUSED,
    CampaignStatus.STOPPED,
    CampaignStatus.COMPLETED,
  ],
  [CampaignStatus.PAUSED]: [CampaignStatus.ACTIVE, CampaignStatus.STOPPED],
  [CampaignStatus.STOPPED]: [],
  [CampaignStatus.COMPLETED]: [],
};

export function isValidTransition(
  from: CampaignStatus,
  to: CampaignStatus,
): boolean {
  return VALID_TRANSITIONS[from].includes(to);
}
```

- [ ] **Step 2: Commit**

```bash
git add src/campaigns/
git commit -m "feat: add campaign status transition utility"
```

---

## Task 3: Campaign Roles Guard

**Files:**
- Create: `yehub-be/src/auth/guards/campaign-roles.guard.ts`

The existing `ProjectRolesGuard` resolves `projectId` from `params.id` or `params.projectId`. For endpoints like `GET /campaigns/:id`, there is no project param — we need to look up the campaign's `project_id`.

- [ ] **Step 1: Create the guard**

```typescript
import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { GlobalRole, ProjectRole } from '../../../generated/prisma/client';
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

    const membership = await this.prisma.projectMembership.findUnique({
      where: {
        user_id_project_id: {
          user_id: user.id,
          project_id: campaign.project_id,
        },
      },
    });
    if (!membership) return false;

    const requiredRoles = this.reflector.getAllAndOverride<ProjectRole[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredRoles || requiredRoles.length === 0) return true;
    return requiredRoles.includes(membership.role);
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/auth/guards/campaign-roles.guard.ts
git commit -m "feat: add CampaignRolesGuard for campaign-scoped endpoints"
```

---

## Task 4: Campaigns Module — DTOs

**Files:**
- Create: `yehub-be/src/campaigns/dto/create-campaign.dto.ts`
- Create: `yehub-be/src/campaigns/dto/update-campaign.dto.ts`
- Create: `yehub-be/src/campaigns/dto/list-campaigns-query.dto.ts`

- [ ] **Step 1: Create CreateCampaignDto**

```typescript
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  MinLength,
  MaxLength,
  IsDateString,
  IsInt,
  Min,
  IsNumber,
} from 'class-validator';

export class CreateCampaignDto {
  @ApiProperty({ example: 'Vinamilk Q2 Campaign' })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional({ example: '2026-04-01' })
  @IsOptional()
  @IsDateString()
  start_date?: string;

  @ApiPropertyOptional({ example: '2026-06-30' })
  @IsOptional()
  @IsDateString()
  end_date?: string;

  @ApiPropertyOptional({ example: 3600, description: 'Polling interval in seconds' })
  @IsOptional()
  @IsInt()
  @Min(60)
  default_polling_interval?: number;

  @ApiPropertyOptional({ example: 50000.0, description: 'Budget threshold' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  budget_threshold?: number;
}
```

- [ ] **Step 2: Create UpdateCampaignDto**

```typescript
import { PartialType } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { CampaignStatus } from '../../../generated/prisma/client';
import { CreateCampaignDto } from './create-campaign.dto';

export class UpdateCampaignDto extends PartialType(CreateCampaignDto) {
  @IsOptional()
  @IsEnum(CampaignStatus)
  status?: CampaignStatus;
}
```

- [ ] **Step 3: Create ListCampaignsQueryDto**

```typescript
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsEnum, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';
import { CampaignStatus } from '../../../generated/prisma/client';

export class ListCampaignsQueryDto {
  @ApiPropertyOptional({ description: 'Search by campaign name' })
  @IsOptional()
  @IsString()
  q?: string;

  @ApiPropertyOptional({ enum: CampaignStatus })
  @IsOptional()
  @IsEnum(CampaignStatus)
  status?: CampaignStatus;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}
```

- [ ] **Step 4: Commit**

```bash
git add src/campaigns/
git commit -m "feat: add campaign DTOs"
```

---

## Task 5: Campaigns Module — Service

**Files:**
- Create: `yehub-be/src/campaigns/campaigns.service.ts`

- [ ] **Step 1: Create the service**

```typescript
import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CampaignStatus } from '../../generated/prisma/client';
import { CreateCampaignDto } from './dto/create-campaign.dto';
import { UpdateCampaignDto } from './dto/update-campaign.dto';
import { ListCampaignsQueryDto } from './dto/list-campaigns-query.dto';
import { isValidTransition } from './campaign-status.utils';

const CAMPAIGN_INCLUDE = {
  _count: { select: { posts: { where: { deleted_at: null } } } },
  project: { select: { id: true, name: true } },
} as const;

@Injectable()
export class CampaignsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(projectId: string, dto: CreateCampaignDto) {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
    });
    if (!project) throw new NotFoundException('Project not found');

    const campaign = await this.prisma.campaign.create({
      data: {
        project_id: projectId,
        name: dto.name,
        description: dto.description,
        start_date: dto.start_date ? new Date(dto.start_date) : undefined,
        end_date: dto.end_date ? new Date(dto.end_date) : undefined,
        default_polling_interval: dto.default_polling_interval,
        budget_threshold: dto.budget_threshold,
      },
      include: CAMPAIGN_INCLUDE,
    });
    return this.formatCampaign(campaign);
  }

  async findAllByProject(
    projectId: string,
    query: ListCampaignsQueryDto,
  ) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where = {
      project_id: projectId,
      deleted_at: null,
      ...(query.status && { status: query.status }),
      ...(query.q && {
        name: { contains: query.q, mode: 'insensitive' as const },
      }),
    };

    const [campaigns, total] = await this.prisma.$transaction([
      this.prisma.campaign.findMany({
        where,
        include: CAMPAIGN_INCLUDE,
        orderBy: { created_at: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.campaign.count({ where }),
    ]);

    return {
      data: campaigns.map((c) => this.formatCampaign(c)),
      total,
      page,
      totalPages: total === 0 ? 0 : Math.ceil(total / limit),
    };
  }

  async findAll(
    userId: string,
    query: ListCampaignsQueryDto,
    isAdmin: boolean,
  ) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where = {
      deleted_at: null,
      ...(!isAdmin && {
        project: { memberships: { some: { user_id: userId } } },
      }),
      ...(query.status && { status: query.status }),
      ...(query.q && {
        name: { contains: query.q, mode: 'insensitive' as const },
      }),
    };

    const [campaigns, total] = await this.prisma.$transaction([
      this.prisma.campaign.findMany({
        where,
        include: CAMPAIGN_INCLUDE,
        orderBy: { created_at: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.campaign.count({ where }),
    ]);

    return {
      data: campaigns.map((c) => this.formatCampaign(c)),
      total,
      page,
      totalPages: total === 0 ? 0 : Math.ceil(total / limit),
    };
  }

  async findOne(id: string) {
    const campaign = await this.prisma.campaign.findUnique({
      where: { id },
      include: {
        ...CAMPAIGN_INCLUDE,
        _count: {
          select: {
            posts: { where: { deleted_at: null } },
          },
        },
      },
    });
    if (!campaign || campaign.deleted_at)
      throw new NotFoundException('Campaign not found');
    return this.formatCampaign(campaign);
  }

  async update(id: string, dto: UpdateCampaignDto) {
    const campaign = await this.prisma.campaign.findUnique({
      where: { id },
    });
    if (!campaign || campaign.deleted_at)
      throw new NotFoundException('Campaign not found');

    if (dto.status && dto.status !== campaign.status) {
      if (!isValidTransition(campaign.status, dto.status)) {
        throw new BadRequestException(
          `Cannot transition from ${campaign.status} to ${dto.status}`,
        );
      }
      // TODO: When transitioning to ACTIVE, create BullMQ polling jobs for linked posts.
      // TODO: When transitioning to PAUSED/STOPPED, remove repeatable polling jobs.
    }

    const { status, ...rest } = dto;
    const updated = await this.prisma.campaign.update({
      where: { id },
      data: {
        ...(rest.name !== undefined && { name: rest.name }),
        ...(rest.description !== undefined && { description: rest.description }),
        ...(rest.start_date !== undefined && {
          start_date: new Date(rest.start_date),
        }),
        ...(rest.end_date !== undefined && {
          end_date: new Date(rest.end_date),
        }),
        ...(rest.default_polling_interval !== undefined && {
          default_polling_interval: rest.default_polling_interval,
        }),
        ...(rest.budget_threshold !== undefined && {
          budget_threshold: rest.budget_threshold,
        }),
        ...(status && { status }),
      },
      include: CAMPAIGN_INCLUDE,
    });
    return this.formatCampaign(updated);
  }

  async remove(id: string) {
    const campaign = await this.prisma.campaign.findUnique({
      where: { id },
    });
    if (!campaign || campaign.deleted_at)
      throw new NotFoundException('Campaign not found');

    await this.prisma.campaign.update({
      where: { id },
      data: { deleted_at: new Date() },
    });
  }

  // TODO: Daily cron job to auto-complete campaigns past end_date
  // async autoCompleteCampaigns() {
  //   const now = new Date();
  //   await this.prisma.campaign.updateMany({
  //     where: {
  //       status: CampaignStatus.ACTIVE,
  //       end_date: { lte: now },
  //       deleted_at: null,
  //     },
  //     data: { status: CampaignStatus.COMPLETED },
  //   });
  // }

  private formatCampaign(campaign: {
    id: string;
    project_id: string;
    name: string;
    description: string | null;
    status: CampaignStatus;
    start_date: Date | null;
    end_date: Date | null;
    default_polling_interval: number | null;
    budget_threshold: unknown;
    deleted_at: Date | null;
    created_at: Date;
    updated_at: Date;
    _count: { posts: number };
    project: { id: string; name: string };
  }) {
    return {
      id: campaign.id,
      project_id: campaign.project_id,
      project_name: campaign.project.name,
      name: campaign.name,
      description: campaign.description,
      status: campaign.status,
      start_date: campaign.start_date,
      end_date: campaign.end_date,
      default_polling_interval: campaign.default_polling_interval,
      budget_threshold: campaign.budget_threshold,
      created_at: campaign.created_at,
      updated_at: campaign.updated_at,
      post_count: campaign._count.posts,
    };
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/campaigns/
git commit -m "feat: add CampaignsService"
```

---

## Task 6: Campaigns Module — Controller & Module Registration

**Files:**
- Create: `yehub-be/src/campaigns/campaigns.controller.ts`
- Create: `yehub-be/src/campaigns/campaigns.module.ts`
- Modify: `yehub-be/src/app.module.ts`

- [ ] **Step 1: Create the controller**

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
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { GlobalRole, ProjectRole } from '../../generated/prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ProjectRolesGuard } from '../auth/guards/project-roles.guard';
import { CampaignRolesGuard } from '../auth/guards/campaign-roles.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { JwtUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { CampaignsService } from './campaigns.service';
import { CreateCampaignDto } from './dto/create-campaign.dto';
import { UpdateCampaignDto } from './dto/update-campaign.dto';
import { ListCampaignsQueryDto } from './dto/list-campaigns-query.dto';

@ApiTags('Campaigns')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller()
export class CampaignsController {
  constructor(private readonly campaignsService: CampaignsService) {}

  @Post('projects/:projectId/campaigns')
  @UseGuards(ProjectRolesGuard)
  @Roles(ProjectRole.MANAGER, ProjectRole.EXECUTIVE)
  @ApiOperation({ summary: 'Create a campaign within a project' })
  create(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Body() dto: CreateCampaignDto,
  ) {
    return this.campaignsService.create(projectId, dto);
  }

  @Get('projects/:projectId/campaigns')
  @UseGuards(ProjectRolesGuard)
  @ApiOperation({ summary: 'List campaigns for a project' })
  findAllByProject(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Query() query: ListCampaignsQueryDto,
  ) {
    return this.campaignsService.findAllByProject(projectId, query);
  }

  @Get('campaigns')
  @ApiOperation({ summary: 'List campaigns across all user projects' })
  findAll(@CurrentUser() user: JwtUser, @Query() query: ListCampaignsQueryDto) {
    return this.campaignsService.findAll(
      user.id,
      query,
      user.role === GlobalRole.ADMIN,
    );
  }

  @Get('campaigns/:id')
  @UseGuards(CampaignRolesGuard)
  @ApiOperation({ summary: 'Get campaign detail' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.campaignsService.findOne(id);
  }

  @Patch('campaigns/:id')
  @UseGuards(CampaignRolesGuard)
  @Roles(ProjectRole.MANAGER, ProjectRole.EXECUTIVE)
  @ApiOperation({ summary: 'Update campaign details or status' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCampaignDto,
  ) {
    return this.campaignsService.update(id, dto);
  }

  @Delete('campaigns/:id')
  @UseGuards(CampaignRolesGuard)
  @Roles(ProjectRole.MANAGER)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Soft-delete a campaign' })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.campaignsService.remove(id);
  }
}
```

- [ ] **Step 2: Create the module**

```typescript
import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CampaignsController } from './campaigns.controller';
import { CampaignsService } from './campaigns.service';

@Module({
  imports: [AuthModule],
  controllers: [CampaignsController],
  providers: [CampaignsService],
  exports: [CampaignsService],
})
export class CampaignsModule {}
```

- [ ] **Step 3: Register in AppModule**

In `src/app.module.ts`, add the import and register:

```typescript
import { CampaignsModule } from './campaigns/campaigns.module';
```

Add `CampaignsModule` to the `imports` array alongside the other feature modules.

- [ ] **Step 4: Verify it compiles**

```bash
cd yehub-be && pnpm build
```

Expected: Build succeeds with no errors.

- [ ] **Step 5: Commit**

```bash
git add src/campaigns/ src/app.module.ts
git commit -m "feat: add CampaignsModule with controller and registration"
```

---

## Task 7: Platform URL Detection Utility

**Files:**
- Create: `yehub-be/src/posts/platform-detect.utils.ts`

- [ ] **Step 1: Create the utility**

```typescript
import { Platform } from '../../generated/prisma/client';

interface DetectionResult {
  platform: Platform;
  platform_post_id: string;
}

const PATTERNS: {
  platform: Platform;
  regex: RegExp;
  extractId: (match: RegExpMatchArray) => string;
}[] = [
  // Facebook: facebook.com/*/posts/*, facebook.com/watch/*, fb.watch/*
  {
    platform: Platform.FACEBOOK,
    regex: /(?:www\.)?facebook\.com\/[^/]+\/posts\/(\w+)/i,
    extractId: (m) => m[1],
  },
  {
    platform: Platform.FACEBOOK,
    regex: /(?:www\.)?facebook\.com\/watch\/?\?v=(\w+)/i,
    extractId: (m) => m[1],
  },
  {
    platform: Platform.FACEBOOK,
    regex: /fb\.watch\/(\w+)/i,
    extractId: (m) => m[1],
  },
  // Instagram: instagram.com/p/*, instagram.com/reel/*
  {
    platform: Platform.INSTAGRAM,
    regex: /(?:www\.)?instagram\.com\/(?:p|reel)\/([\w-]+)/i,
    extractId: (m) => m[1],
  },
  // TikTok: tiktok.com/@*/video/*, vm.tiktok.com/*
  {
    platform: Platform.TIKTOK,
    regex: /(?:www\.)?tiktok\.com\/@[^/]+\/video\/(\d+)/i,
    extractId: (m) => m[1],
  },
  {
    platform: Platform.TIKTOK,
    regex: /vm\.tiktok\.com\/([\w]+)/i,
    extractId: (m) => m[1],
  },
  // YouTube: youtube.com/watch?v=*, youtu.be/*, youtube.com/shorts/*
  {
    platform: Platform.YOUTUBE,
    regex: /(?:www\.)?youtube\.com\/watch\?.*v=([\w-]+)/i,
    extractId: (m) => m[1],
  },
  {
    platform: Platform.YOUTUBE,
    regex: /youtu\.be\/([\w-]+)/i,
    extractId: (m) => m[1],
  },
  {
    platform: Platform.YOUTUBE,
    regex: /(?:www\.)?youtube\.com\/shorts\/([\w-]+)/i,
    extractId: (m) => m[1],
  },
  // Threads: threads.net/@*/post/*
  {
    platform: Platform.THREADS,
    regex: /(?:www\.)?threads\.net\/@[^/]+\/post\/([\w]+)/i,
    extractId: (m) => m[1],
  },
];

export function detectPlatform(url: string): DetectionResult | null {
  for (const pattern of PATTERNS) {
    const match = url.match(pattern.regex);
    if (match) {
      return {
        platform: pattern.platform,
        platform_post_id: pattern.extractId(match),
      };
    }
  }
  return null;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/posts/
git commit -m "feat: add platform URL detection utility"
```

---

## Task 8: Posts Module — DTOs

**Files:**
- Create: `yehub-be/src/posts/dto/add-post.dto.ts`
- Create: `yehub-be/src/posts/dto/update-post.dto.ts`
- Create: `yehub-be/src/posts/dto/list-posts-query.dto.ts`

- [ ] **Step 1: Create AddPostDto**

```typescript
import { ApiProperty } from '@nestjs/swagger';
import { IsUrl } from 'class-validator';

export class AddPostDto {
  @ApiProperty({ example: 'https://www.instagram.com/p/ABC123/' })
  @IsUrl()
  url: string;
}
```

- [ ] **Step 2: Create UpdatePostDto**

```typescript
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsInt, Min, IsBoolean } from 'class-validator';

export class UpdatePostDto {
  @ApiPropertyOptional({ example: 1800, description: 'Polling interval override in seconds' })
  @IsOptional()
  @IsInt()
  @Min(60)
  polling_interval_override?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  polling_enabled?: boolean;
}
```

- [ ] **Step 3: Create ListPostsQueryDto**

```typescript
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsEnum, IsInt, Min, Max } from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { Platform } from '../../../generated/prisma/client';

export class ListPostsQueryDto {
  @ApiPropertyOptional({ description: 'Search by URL or platform_post_id' })
  @IsOptional()
  @IsString()
  q?: string;

  @ApiPropertyOptional({ enum: Platform })
  @IsOptional()
  @IsEnum(Platform)
  platform?: Platform;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  polling_enabled?: boolean;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}
```

- [ ] **Step 4: Commit**

```bash
git add src/posts/
git commit -m "feat: add post DTOs"
```

---

## Task 9: Posts Module — Service

**Files:**
- Create: `yehub-be/src/posts/posts.service.ts`

- [ ] **Step 1: Install papaparse**

```bash
cd yehub-be && pnpm add papaparse && pnpm add -D @types/papaparse
```

- [ ] **Step 2: Create the service**

```typescript
import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { detectPlatform } from './platform-detect.utils';
import { AddPostDto } from './dto/add-post.dto';
import { UpdatePostDto } from './dto/update-post.dto';
import { ListPostsQueryDto } from './dto/list-posts-query.dto';
import * as Papa from 'papaparse';

const MAX_BULK_URLS = 500;

@Injectable()
export class PostsService {
  constructor(private readonly prisma: PrismaService) {}

  async addPost(campaignId: string, dto: AddPostDto) {
    const campaign = await this.prisma.campaign.findUnique({
      where: { id: campaignId },
      select: { id: true, default_polling_interval: true, deleted_at: true },
    });
    if (!campaign || campaign.deleted_at)
      throw new NotFoundException('Campaign not found');

    const detection = detectPlatform(dto.url);
    if (!detection) {
      throw new BadRequestException(
        `Unrecognized URL format. Supported platforms: Facebook, Instagram, TikTok, YouTube, Threads`,
      );
    }

    const existing = await this.prisma.post.findFirst({
      where: {
        campaign_id: campaignId,
        platform: detection.platform,
        platform_post_id: detection.platform_post_id,
        deleted_at: null,
      },
    });
    if (existing) {
      throw new BadRequestException(
        `This post is already added to this campaign`,
      );
    }

    const post = await this.prisma.post.create({
      data: {
        campaign_id: campaignId,
        url: dto.url,
        platform: detection.platform,
        platform_post_id: detection.platform_post_id,
        polling_interval_override: campaign.default_polling_interval,
      },
    });
    return post;
  }

  async bulkUpload(campaignId: string, csvContent: string) {
    const campaign = await this.prisma.campaign.findUnique({
      where: { id: campaignId },
      select: { id: true, default_polling_interval: true, deleted_at: true },
    });
    if (!campaign || campaign.deleted_at)
      throw new NotFoundException('Campaign not found');

    const parsed = Papa.parse<{ url: string }>(csvContent, {
      header: true,
      skipEmptyLines: true,
    });

    const rows = parsed.data;
    if (rows.length > MAX_BULK_URLS) {
      throw new BadRequestException(
        `CSV contains ${rows.length} URLs, maximum is ${MAX_BULK_URLS}`,
      );
    }

    const results: {
      total: number;
      success_count: number;
      failed_count: number;
      failures: { url: string; reason: string }[];
    } = { total: rows.length, success_count: 0, failed_count: 0, failures: [] };

    const toCreate: {
      campaign_id: string;
      url: string;
      platform: string;
      platform_post_id: string;
      polling_interval_override: number | null;
    }[] = [];

    const seenKeys = new Set<string>();

    for (const row of rows) {
      const url = row.url?.trim();
      if (!url) {
        results.failed_count++;
        results.failures.push({ url: url ?? '', reason: 'Empty URL' });
        continue;
      }

      const detection = detectPlatform(url);
      if (!detection) {
        results.failed_count++;
        results.failures.push({
          url,
          reason: 'Unrecognized URL format',
        });
        continue;
      }

      const key = `${detection.platform}:${detection.platform_post_id}`;
      if (seenKeys.has(key)) {
        results.failed_count++;
        results.failures.push({ url, reason: 'Duplicate URL in CSV' });
        continue;
      }
      seenKeys.add(key);

      toCreate.push({
        campaign_id: campaignId,
        url,
        platform: detection.platform,
        platform_post_id: detection.platform_post_id,
        polling_interval_override: campaign.default_polling_interval,
      });
    }

    // Check existing posts in DB for duplicates
    if (toCreate.length > 0) {
      const existingPosts = await this.prisma.post.findMany({
        where: {
          campaign_id: campaignId,
          deleted_at: null,
          OR: toCreate.map((p) => ({
            platform: p.platform as any,
            platform_post_id: p.platform_post_id,
          })),
        },
        select: { platform: true, platform_post_id: true },
      });

      const existingKeys = new Set(
        existingPosts.map((p) => `${p.platform}:${p.platform_post_id}`),
      );

      const finalCreate: typeof toCreate = [];
      for (const item of toCreate) {
        const key = `${item.platform}:${item.platform_post_id}`;
        if (existingKeys.has(key)) {
          results.failed_count++;
          results.failures.push({
            url: item.url,
            reason: 'Post already exists in this campaign',
          });
        } else {
          finalCreate.push(item);
        }
      }

      if (finalCreate.length > 0) {
        await this.prisma.post.createMany({ data: finalCreate as any });
        results.success_count = finalCreate.length;
      }
    }

    return results;
  }

  async findAll(campaignId: string, query: ListPostsQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where = {
      campaign_id: campaignId,
      deleted_at: null,
      ...(query.platform && { platform: query.platform }),
      ...(query.polling_enabled !== undefined && {
        polling_enabled: query.polling_enabled,
      }),
      ...(query.q && {
        OR: [
          { url: { contains: query.q, mode: 'insensitive' as const } },
          {
            platform_post_id: {
              contains: query.q,
              mode: 'insensitive' as const,
            },
          },
        ],
      }),
    };

    const [posts, total] = await this.prisma.$transaction([
      this.prisma.post.findMany({
        where,
        orderBy: { created_at: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.post.count({ where }),
    ]);

    return {
      data: posts,
      total,
      page,
      totalPages: total === 0 ? 0 : Math.ceil(total / limit),
    };
  }

  async update(postId: string, dto: UpdatePostDto) {
    const post = await this.prisma.post.findUnique({
      where: { id: postId },
    });
    if (!post || post.deleted_at) throw new NotFoundException('Post not found');

    return this.prisma.post.update({
      where: { id: postId },
      data: {
        ...(dto.polling_interval_override !== undefined && {
          polling_interval_override: dto.polling_interval_override,
        }),
        ...(dto.polling_enabled !== undefined && {
          polling_enabled: dto.polling_enabled,
        }),
      },
    });
  }

  async remove(postId: string) {
    const post = await this.prisma.post.findUnique({
      where: { id: postId },
    });
    if (!post || post.deleted_at) throw new NotFoundException('Post not found');

    await this.prisma.post.update({
      where: { id: postId },
      data: { deleted_at: new Date() },
    });
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add src/posts/ package.json pnpm-lock.yaml
git commit -m "feat: add PostsService with URL detection and CSV bulk upload"
```

---

## Task 10: Posts Module — Controller & Module Registration

**Files:**
- Create: `yehub-be/src/posts/posts.controller.ts`
- Create: `yehub-be/src/posts/posts.module.ts`
- Modify: `yehub-be/src/app.module.ts`

- [ ] **Step 1: Create the controller**

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
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ProjectRole } from '../../generated/prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CampaignRolesGuard } from '../auth/guards/campaign-roles.guard';
import { PostRolesGuard } from '../auth/guards/post-roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { PostsService } from './posts.service';
import { AddPostDto } from './dto/add-post.dto';
import { UpdatePostDto } from './dto/update-post.dto';
import { ListPostsQueryDto } from './dto/list-posts-query.dto';

@ApiTags('Posts')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller()
export class PostsController {
  constructor(private readonly postsService: PostsService) {}

  @Post('campaigns/:campaignId/posts')
  @UseGuards(CampaignRolesGuard)
  @Roles(ProjectRole.MANAGER, ProjectRole.EXECUTIVE)
  @ApiOperation({ summary: 'Add a post by URL to a campaign' })
  addPost(
    @Param('campaignId', ParseUUIDPipe) campaignId: string,
    @Body() dto: AddPostDto,
  ) {
    return this.postsService.addPost(campaignId, dto);
  }

  @Post('campaigns/:campaignId/posts/bulk')
  @UseGuards(CampaignRolesGuard)
  @Roles(ProjectRole.MANAGER, ProjectRole.EXECUTIVE)
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Bulk upload posts via CSV' })
  bulkUpload(
    @Param('campaignId', ParseUUIDPipe) campaignId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) {
      throw new Error('File is required');
    }
    const csvContent = file.buffer.toString('utf-8');
    return this.postsService.bulkUpload(campaignId, csvContent);
  }

  @Get('campaigns/:campaignId/posts')
  @UseGuards(CampaignRolesGuard)
  @ApiOperation({ summary: 'List posts for a campaign' })
  findAll(
    @Param('campaignId', ParseUUIDPipe) campaignId: string,
    @Query() query: ListPostsQueryDto,
  ) {
    return this.postsService.findAll(campaignId, query);
  }

  @Patch('posts/:id')
  @UseGuards(PostRolesGuard)
  @Roles(ProjectRole.MANAGER, ProjectRole.EXECUTIVE)
  @ApiOperation({ summary: 'Update post polling settings' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePostDto,
  ) {
    return this.postsService.update(id, dto);
  }

  @Delete('posts/:id')
  @UseGuards(PostRolesGuard)
  @Roles(ProjectRole.MANAGER)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Soft-delete a post' })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.postsService.remove(id);
  }
}
```

**Important:** The `PATCH /posts/:id` and `DELETE /posts/:id` endpoints need a guard that resolves the project from the post's campaign. Create a `PostRolesGuard`:

- [ ] **Step 2: Create PostRolesGuard**

Create `yehub-be/src/auth/guards/post-roles.guard.ts`:

```typescript
import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { GlobalRole, ProjectRole } from '../../../generated/prisma/client';
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
        campaign: { select: { project_id: true, deleted_at: true } },
      },
    });
    if (!post || post.deleted_at || post.campaign.deleted_at) return false;

    const membership = await this.prisma.projectMembership.findUnique({
      where: {
        user_id_project_id: {
          user_id: user.id,
          project_id: post.campaign.project_id,
        },
      },
    });
    if (!membership) return false;

    const requiredRoles = this.reflector.getAllAndOverride<ProjectRole[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredRoles || requiredRoles.length === 0) return true;
    return requiredRoles.includes(membership.role);
  }
}
```

- [ ] **Step 3: Create the module**

```typescript
import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PostsController } from './posts.controller';
import { PostsService } from './posts.service';

@Module({
  imports: [AuthModule],
  controllers: [PostsController],
  providers: [PostsService],
  exports: [PostsService],
})
export class PostsModule {}
```

- [ ] **Step 4: Register in AppModule**

In `src/app.module.ts`, add:

```typescript
import { PostsModule } from './posts/posts.module';
```

Add `PostsModule` to the `imports` array.

- [ ] **Step 5: Verify it compiles**

```bash
cd yehub-be && pnpm build
```

Expected: Build succeeds.

- [ ] **Step 6: Commit**

```bash
git add src/posts/ src/auth/guards/post-roles.guard.ts src/app.module.ts
git commit -m "feat: add PostsModule with controller, PostRolesGuard, and registration"
```

---

## Task 11: Frontend — API Layer

**Files:**
- Create: `yehub-fe/src/api/campaigns.ts`
- Create: `yehub-fe/src/api/posts.ts`

- [ ] **Step 1: Create campaigns API**

```typescript
import { apiClient } from './client'

export type CampaignStatus = 'DRAFT' | 'ACTIVE' | 'PAUSED' | 'STOPPED' | 'COMPLETED'

export interface Campaign {
  id: string
  project_id: string
  project_name: string
  name: string
  description: string | null
  status: CampaignStatus
  start_date: string | null
  end_date: string | null
  default_polling_interval: number | null
  budget_threshold: number | null
  created_at: string
  updated_at: string
  post_count: number
}

export interface CampaignsPage {
  data: Campaign[]
  total: number
  page: number
  totalPages: number
}

export interface CreateCampaignPayload {
  name: string
  description?: string
  start_date?: string
  end_date?: string
  default_polling_interval?: number
  budget_threshold?: number
}

export interface UpdateCampaignPayload extends Partial<CreateCampaignPayload> {
  status?: CampaignStatus
}

export const campaignsApi = {
  createCampaign: (projectId: string, data: CreateCampaignPayload) =>
    apiClient.post<Campaign>(`/projects/${projectId}/campaigns`, data),

  listCampaignsByProject: (projectId: string, params?: { q?: string; status?: CampaignStatus; page?: number; limit?: number }) =>
    apiClient.get<CampaignsPage>(`/projects/${projectId}/campaigns`, { params }).then((r) => r.data),

  listAllCampaigns: (params?: { q?: string; status?: CampaignStatus; page?: number; limit?: number }) =>
    apiClient.get<CampaignsPage>('/campaigns', { params }).then((r) => r.data),

  getCampaign: (id: string) =>
    apiClient.get<Campaign>(`/campaigns/${id}`).then((r) => r.data),

  updateCampaign: (id: string, data: UpdateCampaignPayload) =>
    apiClient.patch<Campaign>(`/campaigns/${id}`, data),

  deleteCampaign: (id: string) =>
    apiClient.delete(`/campaigns/${id}`),
}
```

- [ ] **Step 2: Create posts API**

```typescript
import { apiClient } from './client'

export type Platform = 'FACEBOOK' | 'INSTAGRAM' | 'TIKTOK' | 'YOUTUBE' | 'X' | 'LINKEDIN' | 'THREADS'

export interface PostItem {
  id: string
  campaign_id: string
  url: string | null
  platform: Platform
  platform_post_id: string
  polling_interval_override: number | null
  polling_enabled: boolean
  last_polled_at: string | null
  last_poll_status: string | null
  comment_count: number
  created_at: string
  updated_at: string
}

export interface PostsPage {
  data: PostItem[]
  total: number
  page: number
  totalPages: number
}

export interface BulkUploadResult {
  total: number
  success_count: number
  failed_count: number
  failures: { url: string; reason: string }[]
}

export const postsApi = {
  addPost: (campaignId: string, url: string) =>
    apiClient.post<PostItem>(`/campaigns/${campaignId}/posts`, { url }),

  bulkUploadPosts: (campaignId: string, file: File) => {
    const formData = new FormData()
    formData.append('file', file)
    return apiClient.post<BulkUploadResult>(`/campaigns/${campaignId}/posts/bulk`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
  },

  listPosts: (campaignId: string, params?: { q?: string; platform?: Platform; polling_enabled?: boolean; page?: number; limit?: number }) =>
    apiClient.get<PostsPage>(`/campaigns/${campaignId}/posts`, { params }).then((r) => r.data),

  updatePost: (postId: string, data: { polling_interval_override?: number; polling_enabled?: boolean }) =>
    apiClient.patch<PostItem>(`/posts/${postId}`, data),

  deletePost: (postId: string) =>
    apiClient.delete(`/posts/${postId}`),
}
```

- [ ] **Step 3: Commit**

```bash
cd yehub-fe && git add src/api/campaigns.ts src/api/posts.ts
git commit -m "feat: add campaigns and posts API layer"
```

---

## Task 12: Frontend — Constants & Schemas

**Files:**
- Modify: `yehub-fe/src/lib/constants/routes.ts`
- Modify: `yehub-fe/src/lib/constants/query-keys.ts`
- Modify: `yehub-fe/src/lib/schemas.ts`
- Modify: `yehub-fe/src/hooks/use-can.ts`

- [ ] **Step 1: Update routes**

Add to the `ROUTES` object in `src/lib/constants/routes.ts`:

```typescript
export const ROUTES = {
  // ... existing routes ...
  CAMPAIGNS: '/campaigns',
  CAMPAIGN_NEW: '/projects/:projectId/campaigns/new',
  CAMPAIGN_DETAIL: '/projects/:projectId/campaigns/:campaignId',
  CAMPAIGN_EDIT: '/projects/:projectId/campaigns/:campaignId/edit',
  CAMPAIGN_POSTS: '/projects/:projectId/campaigns/:campaignId/posts',
} as const
```

- [ ] **Step 2: Update query keys**

Add to `src/lib/constants/query-keys.ts`:

```typescript
  campaigns: {
    all: ['campaigns'] as const,
    list: (page: number, search: string, status: string) => ['campaigns', page, search, status] as const,
    byProject: (projectId: string) => ['campaigns', 'project', projectId] as const,
    listByProject: (projectId: string, page: number, search: string, status: string) =>
      ['campaigns', 'project', projectId, page, search, status] as const,
  },

  campaign: (id: string) => ['campaign', id] as const,

  posts: {
    byCampaign: (campaignId: string) => ['posts', 'campaign', campaignId] as const,
    list: (campaignId: string, page: number, search: string, platform: string) =>
      ['posts', 'campaign', campaignId, page, search, platform] as const,
  },
```

- [ ] **Step 3: Add Zod schemas**

Add to `src/lib/schemas.ts`:

```typescript
export const campaignFormSchema = z.object({
  name: z.string().min(1, 'Campaign name is required'),
  description: z.string().optional(),
  start_date: z.string().optional(),
  end_date: z.string().optional(),
  default_polling_interval: z.number().optional(),
  budget_threshold: z.number().min(0).optional(),
})
export type CampaignFormValues = z.infer<typeof campaignFormSchema>

export const addPostSchema = z.object({
  url: z.string().url('Please enter a valid URL'),
})
export type AddPostFormValues = z.infer<typeof addPostSchema>
```

- [ ] **Step 4: Update permissions**

In `src/hooks/use-can.ts`, add campaign-related actions:

```typescript
type ProjectAction = 'edit' | 'manage_members' | 'export' | 'search' | 'create_campaign' | 'configure_alerts' | 'edit_campaign' | 'manage_posts'

const projectPermissions: Record<ProjectAction, ProjectRole[]> = {
  // ... existing ...
  edit_campaign: ['MANAGER', 'EXECUTIVE'],
  manage_posts: ['MANAGER', 'EXECUTIVE'],
}
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/ src/hooks/use-can.ts
git commit -m "feat: add campaign/post route constants, query keys, schemas, and permissions"
```

---

## Task 13: Frontend — CampaignsListPage (flat view)

**Files:**
- Create: `yehub-fe/src/pages/campaigns/CampaignsListPage/index.tsx`
- Create: `yehub-fe/src/pages/campaigns/CampaignsListPage/use-campaigns-list.ts`
- Create: `yehub-fe/src/pages/campaigns/CampaignsListPage/components/CampaignsTableHeader.tsx`
- Create: `yehub-fe/src/pages/campaigns/CampaignsListPage/components/CampaignItem.tsx`
- Create: `yehub-fe/src/pages/campaigns/components/StatusBadge.tsx`

- [ ] **Step 1: Create StatusBadge**

```tsx
import { Badge } from '@/components/ui/badge'
import type { CampaignStatus } from '@/api/campaigns'

const STATUS_STYLES: Record<CampaignStatus, string> = {
  DRAFT: 'bg-gray-100 text-gray-700 hover:bg-gray-100',
  ACTIVE: 'bg-green-100 text-green-700 hover:bg-green-100',
  PAUSED: 'bg-yellow-100 text-yellow-700 hover:bg-yellow-100',
  STOPPED: 'bg-red-100 text-red-700 hover:bg-red-100',
  COMPLETED: 'bg-blue-100 text-blue-700 hover:bg-blue-100',
}

export function StatusBadge({ status }: { status: CampaignStatus }) {
  return (
    <Badge variant="outline" className={STATUS_STYLES[status]}>
      {status.charAt(0) + status.slice(1).toLowerCase()}
    </Badge>
  )
}
```

- [ ] **Step 2: Create use-campaigns-list hook**

```tsx
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { campaignsApi, type CampaignStatus } from '@/api/campaigns'
import { queryKeys } from '@/lib/constants/query-keys'
import { useDebounce } from '@/hooks/use-debounce'

const PAGE_LIMIT = 20

export function useCampaignsList() {
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<CampaignStatus | ''>('')
  const debouncedSearch = useDebounce(search, 300)

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.campaigns.list(page, debouncedSearch, statusFilter),
    queryFn: () =>
      campaignsApi.listAllCampaigns({
        page,
        limit: PAGE_LIMIT,
        q: debouncedSearch || undefined,
        status: statusFilter || undefined,
      }),
  })

  const handleSearchChange = (value: string) => {
    setSearch(value)
    setPage(1)
  }

  const handleStatusChange = (value: string) => {
    setStatusFilter(value as CampaignStatus | '')
    setPage(1)
  }

  return {
    campaigns: data?.data ?? [],
    totalPages: data?.totalPages ?? 0,
    isLoading,
    page,
    setPage,
    search,
    handleSearchChange,
    statusFilter,
    handleStatusChange,
  }
}
```

**Note:** Check if `use-debounce` hook exists. If not, the SearchBar component handles debounce internally in uncontrolled mode. Adjust accordingly — use uncontrolled SearchBar with `onChange` callback.

- [ ] **Step 3: Create CampaignsTableHeader**

```tsx
import { TableHead, TableHeader, TableRow } from '@/components/ui/table'

export function CampaignsTableHeader() {
  return (
    <TableHeader>
      <TableRow>
        <TableHead>Name</TableHead>
        <TableHead>Project</TableHead>
        <TableHead>Status</TableHead>
        <TableHead>Date Range</TableHead>
        <TableHead className="text-right">Posts</TableHead>
        <TableHead>Polling Interval</TableHead>
      </TableRow>
    </TableHeader>
  )
}
```

- [ ] **Step 4: Create CampaignItem**

```tsx
import { useNavigate } from 'react-router-dom'
import { TableCell, TableRow } from '@/components/ui/table'
import type { Campaign } from '@/api/campaigns'
import { StatusBadge } from '../../components/StatusBadge'

function formatInterval(seconds: number | null): string {
  if (!seconds) return '—'
  if (seconds < 3600) return `${Math.round(seconds / 60)}min`
  return `${Math.round(seconds / 3600)}hr`
}

function formatDateRange(start: string | null, end: string | null): string {
  if (!start && !end) return '—'
  const fmt = (d: string) => new Date(d).toLocaleDateString()
  if (start && end) return `${fmt(start)} – ${fmt(end)}`
  if (start) return `From ${fmt(start)}`
  return `Until ${fmt(end!)}`
}

export function CampaignItem({ campaign }: { campaign: Campaign }) {
  const navigate = useNavigate()

  return (
    <TableRow
      className="cursor-pointer hover:bg-muted/50"
      onClick={() => navigate(`/projects/${campaign.project_id}/campaigns/${campaign.id}`)}
    >
      <TableCell>
        <div className="font-medium">{campaign.name}</div>
        {campaign.description && (
          <div className="text-xs text-muted-foreground truncate max-w-[300px]">
            {campaign.description}
          </div>
        )}
      </TableCell>
      <TableCell className="text-muted-foreground">{campaign.project_name}</TableCell>
      <TableCell>
        <StatusBadge status={campaign.status} />
      </TableCell>
      <TableCell className="text-sm text-muted-foreground">
        {formatDateRange(campaign.start_date, campaign.end_date)}
      </TableCell>
      <TableCell className="text-right font-mono">{campaign.post_count}</TableCell>
      <TableCell className="text-sm text-muted-foreground">
        {formatInterval(campaign.default_polling_interval)}
      </TableCell>
    </TableRow>
  )
}
```

- [ ] **Step 5: Create CampaignsListPage**

```tsx
import { useState } from 'react'
import { MegaphoneIcon } from 'lucide-react'
import { PageHeader } from '@/components/common/PageHeader'
import { SearchBar } from '@/components/common/SearchBar'
import { EmptyState } from '@/components/common/EmptyState'
import { PageWrapper } from '@/components/common/PageWrapper'
import { PaginationBar } from '@/components/common/PaginationBar'
import { Table, TableBody } from '@/components/ui/table'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useCampaignsList } from './use-campaigns-list'
import { CampaignsTableHeader } from './components/CampaignsTableHeader'
import { CampaignItem } from './components/CampaignItem'

export function CampaignsListPage() {
  const {
    campaigns,
    totalPages,
    isLoading,
    page,
    setPage,
    search,
    handleSearchChange,
    statusFilter,
    handleStatusChange,
  } = useCampaignsList()

  return (
    <PageWrapper>
      <PageHeader title="Campaigns" description="View campaigns across all projects" />

      <div className="flex items-center gap-3">
        <SearchBar value={search} onChange={handleSearchChange} placeholder="Search campaigns…" className="max-w-md" />
        <Select value={statusFilter} onValueChange={handleStatusChange}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">All statuses</SelectItem>
            <SelectItem value="DRAFT">Draft</SelectItem>
            <SelectItem value="ACTIVE">Active</SelectItem>
            <SelectItem value="PAUSED">Paused</SelectItem>
            <SelectItem value="STOPPED">Stopped</SelectItem>
            <SelectItem value="COMPLETED">Completed</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading campaigns…</p>
      ) : campaigns.length === 0 ? (
        <EmptyState
          icon={<MegaphoneIcon className="h-12 w-12" />}
          title="No campaigns found"
          description={search ? 'Try a different search term.' : 'Campaigns will appear here once created within projects.'}
        />
      ) : (
        <div className="rounded-lg border">
          <Table>
            <CampaignsTableHeader />
            <TableBody>
              {campaigns.map((campaign) => (
                <CampaignItem key={campaign.id} campaign={campaign} />
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <PaginationBar page={page} setPage={setPage} totalPages={totalPages} />
    </PageWrapper>
  )
}
```

- [ ] **Step 6: Update the stub page**

Delete the existing stub at `src/pages/campaigns/CampaignsPage.tsx` (or wherever the "coming soon" page lives). Update `src/router.tsx` to import from the new location:

```typescript
const CampaignsListPage = lazy(() =>
  import('@/pages/campaigns/CampaignsListPage').then((m) => ({ default: m.CampaignsListPage })),
)
```

Replace the `CampaignsPage` reference in the router with `CampaignsListPage`.

- [ ] **Step 7: Commit**

```bash
git add src/pages/campaigns/ src/router.tsx
git commit -m "feat: add CampaignsListPage with search, status filter, and pagination"
```

---

## Task 14: Frontend — CampaignFormPage

**Files:**
- Create: `yehub-fe/src/pages/campaigns/CampaignFormPage.tsx`
- Modify: `yehub-fe/src/router.tsx`

- [ ] **Step 1: Create the form page**

```tsx
import { useNavigate, useParams } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import axios from 'axios'
import { campaignsApi } from '@/api/campaigns'
import { campaignFormSchema, type CampaignFormValues } from '@/lib/schemas'
import { queryKeys } from '@/lib/constants/query-keys'
import { PageHeader } from '@/components/common/PageHeader'
import { PageWrapper } from '@/components/common/PageWrapper'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

const POLLING_OPTIONS = [
  { value: '900', label: '15 minutes' },
  { value: '3600', label: '1 hour' },
  { value: '21600', label: '6 hours' },
  { value: '43200', label: '12 hours' },
  { value: '86400', label: '24 hours' },
]

export function CampaignFormPage() {
  const { projectId, campaignId } = useParams<{ projectId: string; campaignId: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const isEdit = !!campaignId

  const { data: existingCampaign } = useQuery({
    queryKey: queryKeys.campaign(campaignId ?? ''),
    queryFn: () => campaignsApi.getCampaign(campaignId!),
    enabled: isEdit,
  })

  const form = useForm<CampaignFormValues>({
    resolver: zodResolver(campaignFormSchema),
    defaultValues: {
      name: '',
      description: '',
      start_date: '',
      end_date: '',
      default_polling_interval: 3600,
      budget_threshold: undefined,
    },
    values: isEdit && existingCampaign
      ? {
          name: existingCampaign.name,
          description: existingCampaign.description ?? '',
          start_date: existingCampaign.start_date?.slice(0, 10) ?? '',
          end_date: existingCampaign.end_date?.slice(0, 10) ?? '',
          default_polling_interval: existingCampaign.default_polling_interval ?? 3600,
          budget_threshold: existingCampaign.budget_threshold ?? undefined,
        }
      : undefined,
  })

  const mutation = useMutation({
    mutationFn: (values: CampaignFormValues) => {
      const payload = {
        name: values.name.trim(),
        description: values.description?.trim() || undefined,
        start_date: values.start_date || undefined,
        end_date: values.end_date || undefined,
        default_polling_interval: values.default_polling_interval,
        budget_threshold: values.budget_threshold,
      }
      if (isEdit) {
        return campaignsApi.updateCampaign(campaignId!, payload)
      }
      return campaignsApi.createCampaign(projectId!, payload)
    },
    onSuccess: (response) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.campaigns.all })
      if (projectId) {
        queryClient.invalidateQueries({ queryKey: queryKeys.campaigns.byProject(projectId) })
      }
      toast.success(isEdit ? 'Campaign updated' : 'Campaign created')
      const id = isEdit ? campaignId : (response as any).data?.id ?? (response as any).id
      navigate(`/projects/${projectId}/campaigns/${id}`)
    },
    onError: (err) => {
      if (axios.isAxiosError(err)) {
        const msg = (err.response?.data as { message?: string })?.message ?? 'Failed to save campaign'
        toast.error(msg)
      }
    },
  })

  return (
    <PageWrapper>
      <PageHeader
        title={isEdit ? 'Edit Campaign' : 'New Campaign'}
        description={isEdit ? 'Update campaign details' : 'Create a new campaign for this project'}
      />

      <Form {...form}>
        <form onSubmit={form.handleSubmit((v) => mutation.mutate(v))} className="space-y-6 max-w-2xl">
          <Card>
            <CardHeader>
              <CardTitle>Basic Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Campaign Name</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g. Vinamilk Q2 Social Listening" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description</FormLabel>
                    <FormControl>
                      <Textarea placeholder="Campaign description…" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Schedule</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="start_date"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Start Date</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="end_date"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>End Date</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Settings</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="default_polling_interval"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Default Polling Interval</FormLabel>
                    <Select
                      value={String(field.value)}
                      onValueChange={(v) => field.onChange(Number(v))}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {POLLING_OPTIONS.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="budget_threshold"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Budget Threshold</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        placeholder="e.g. 50000"
                        {...field}
                        onChange={(e) => field.onChange(e.target.value ? Number(e.target.value) : undefined)}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          <div className="flex gap-3">
            <Button type="submit" disabled={mutation.isPending} className="cursor-pointer">
              {mutation.isPending ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Campaign'}
            </Button>
            <Button type="button" variant="outline" className="cursor-pointer" onClick={() => navigate(-1)}>
              Cancel
            </Button>
          </div>
        </form>
      </Form>
    </PageWrapper>
  )
}
```

- [ ] **Step 2: Add routes in router.tsx**

Add these inside the ProtectedRoute children:

```typescript
const CampaignFormPage = lazy(() =>
  import('@/pages/campaigns/CampaignFormPage').then((m) => ({ default: m.CampaignFormPage })),
)
const CampaignDetailPage = lazy(() =>
  import('@/pages/campaigns/CampaignDetailPage').then((m) => ({ default: m.CampaignDetailPage })),
)
```

Add route entries:

```typescript
{
  path: '/projects/:projectId/campaigns/new',
  element: <SuspenseWrapper><CampaignFormPage /></SuspenseWrapper>,
},
{
  path: '/projects/:projectId/campaigns/:campaignId/edit',
  element: <SuspenseWrapper><CampaignFormPage /></SuspenseWrapper>,
},
{
  path: '/projects/:projectId/campaigns/:campaignId/*',
  element: <SuspenseWrapper><CampaignDetailPage /></SuspenseWrapper>,
},
```

**Important:** Place these routes BEFORE the `${ROUTES.PROJECT_DETAIL}/*` route so they match first.

- [ ] **Step 3: Commit**

```bash
git add src/pages/campaigns/CampaignFormPage.tsx src/router.tsx
git commit -m "feat: add CampaignFormPage with create/edit support"
```

---

## Task 15: Frontend — CampaignDetailPage

**Files:**
- Create: `yehub-fe/src/pages/campaigns/CampaignDetailPage/index.tsx`
- Create: `yehub-fe/src/pages/campaigns/CampaignDetailPage/use-campaign-detail.ts`

- [ ] **Step 1: Create the detail hook**

```tsx
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { campaignsApi, type CampaignStatus, type UpdateCampaignPayload } from '@/api/campaigns'
import { queryKeys } from '@/lib/constants/query-keys'
import { toast } from 'sonner'
import axios from 'axios'

export function useCampaignDetail(campaignId: string) {
  const queryClient = useQueryClient()

  const { data: campaign, isLoading } = useQuery({
    queryKey: queryKeys.campaign(campaignId),
    queryFn: () => campaignsApi.getCampaign(campaignId),
    enabled: !!campaignId,
  })

  const updateMutation = useMutation({
    mutationFn: (data: UpdateCampaignPayload) => campaignsApi.updateCampaign(campaignId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.campaign(campaignId) })
      queryClient.invalidateQueries({ queryKey: queryKeys.campaigns.all })
      toast.success('Campaign updated')
    },
    onError: (err) => {
      if (axios.isAxiosError(err)) {
        toast.error((err.response?.data as { message?: string })?.message ?? 'Failed to update campaign')
      }
    },
  })

  const deleteMutation = useMutation({
    mutationFn: () => campaignsApi.deleteCampaign(campaignId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.campaigns.all })
      toast.success('Campaign deleted')
    },
    onError: (err) => {
      if (axios.isAxiosError(err)) {
        toast.error((err.response?.data as { message?: string })?.message ?? 'Failed to delete campaign')
      }
    },
  })

  const changeStatus = (status: CampaignStatus) => {
    updateMutation.mutate({ status })
  }

  return { campaign, isLoading, changeStatus, deleteMutation, isUpdating: updateMutation.isPending }
}
```

- [ ] **Step 2: Create the detail page**

```tsx
import { useParams, useNavigate, useLocation, NavLink } from 'react-router-dom'
import { ArrowLeft, Pencil, Play, Pause, Square } from 'lucide-react'
import { PageWrapper } from '@/components/common/PageWrapper'
import { Button } from '@/components/ui/button'
import { StatusBadge } from '../components/StatusBadge'
import { useCampaignDetail } from './use-campaign-detail'
import { CampaignPostsTab } from './components/CampaignPostsTab'
import { EmptyState } from '@/components/common/EmptyState'
import { cn } from '@/lib/utils'

export function CampaignDetailPage() {
  const { projectId, campaignId } = useParams<{ projectId: string; campaignId: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const { campaign, isLoading, changeStatus, isUpdating } = useCampaignDetail(campaignId!)

  if (isLoading) return <PageWrapper><p className="text-sm text-muted-foreground">Loading…</p></PageWrapper>
  if (!campaign) return <PageWrapper><p>Campaign not found.</p></PageWrapper>

  const basePath = `/projects/${projectId}/campaigns/${campaignId}`
  const activeTab = location.pathname.endsWith('/posts') ? 'posts' : 'overview'

  return (
    <PageWrapper>
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(`/projects/${projectId}`)}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold truncate">{campaign.name}</h1>
            <StatusBadge status={campaign.status} />
          </div>
          {campaign.description && (
            <p className="text-sm text-muted-foreground mt-1">{campaign.description}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {campaign.status === 'DRAFT' && (
            <Button size="sm" className="cursor-pointer" onClick={() => changeStatus('ACTIVE')} disabled={isUpdating}>
              <Play className="mr-1 h-3 w-3" /> Activate
            </Button>
          )}
          {campaign.status === 'ACTIVE' && (
            <>
              <Button size="sm" variant="outline" className="cursor-pointer" onClick={() => changeStatus('PAUSED')} disabled={isUpdating}>
                <Pause className="mr-1 h-3 w-3" /> Pause
              </Button>
              <Button size="sm" variant="destructive" className="cursor-pointer" onClick={() => changeStatus('STOPPED')} disabled={isUpdating}>
                <Square className="mr-1 h-3 w-3" /> Stop
              </Button>
            </>
          )}
          {campaign.status === 'PAUSED' && (
            <>
              <Button size="sm" className="cursor-pointer" onClick={() => changeStatus('ACTIVE')} disabled={isUpdating}>
                <Play className="mr-1 h-3 w-3" /> Resume
              </Button>
              <Button size="sm" variant="destructive" className="cursor-pointer" onClick={() => changeStatus('STOPPED')} disabled={isUpdating}>
                <Square className="mr-1 h-3 w-3" /> Stop
              </Button>
            </>
          )}
          <Button size="sm" variant="outline" className="cursor-pointer" onClick={() => navigate(`${basePath}/edit`)}>
            <Pencil className="mr-1 h-3 w-3" /> Edit
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b">
        <nav className="flex gap-4">
          <NavLink
            to={basePath}
            end
            className={({ isActive }) =>
              cn('pb-2 text-sm font-medium border-b-2', isActive ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground')
            }
          >
            Overview
          </NavLink>
          <NavLink
            to={`${basePath}/posts`}
            className={({ isActive }) =>
              cn('pb-2 text-sm font-medium border-b-2', isActive ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground')
            }
          >
            Posts ({campaign.post_count})
          </NavLink>
        </nav>
      </div>

      {/* Tab content */}
      {activeTab === 'overview' && (
        <EmptyState title="Campaign Overview" description="Overview analytics will be available in a future release." />
      )}
      {activeTab === 'posts' && (
        <CampaignPostsTab campaignId={campaignId!} />
      )}
    </PageWrapper>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add src/pages/campaigns/CampaignDetailPage/
git commit -m "feat: add CampaignDetailPage with lifecycle controls and tabs"
```

---

## Task 16: Frontend — CampaignPostsTab

**Files:**
- Create: `yehub-fe/src/pages/campaigns/CampaignDetailPage/components/CampaignPostsTab.tsx`
- Create: `yehub-fe/src/pages/campaigns/CampaignDetailPage/components/use-campaign-posts.ts`
- Create: `yehub-fe/src/pages/campaigns/CampaignDetailPage/components/AddPostDialog.tsx`
- Create: `yehub-fe/src/pages/campaigns/CampaignDetailPage/components/ImportCsvDialog.tsx`

- [ ] **Step 1: Create use-campaign-posts hook**

```tsx
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { postsApi, type Platform } from '@/api/posts'
import { queryKeys } from '@/lib/constants/query-keys'
import { toast } from 'sonner'
import axios from 'axios'

const PAGE_LIMIT = 20

export function useCampaignPosts(campaignId: string) {
  const queryClient = useQueryClient()
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [platformFilter, setPlatformFilter] = useState<Platform | ''>('')

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.posts.list(campaignId, page, search, platformFilter),
    queryFn: () =>
      postsApi.listPosts(campaignId, {
        page,
        limit: PAGE_LIMIT,
        q: search || undefined,
        platform: platformFilter || undefined,
      }),
  })

  const handleSearchChange = (value: string) => {
    setSearch(value)
    setPage(1)
  }

  const togglePolling = useMutation({
    mutationFn: ({ postId, enabled }: { postId: string; enabled: boolean }) =>
      postsApi.updatePost(postId, { polling_enabled: enabled }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.posts.byCampaign(campaignId) })
    },
    onError: (err) => {
      if (axios.isAxiosError(err)) {
        toast.error((err.response?.data as { message?: string })?.message ?? 'Failed to update')
      }
    },
  })

  const deletePost = useMutation({
    mutationFn: (postId: string) => postsApi.deletePost(postId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.posts.byCampaign(campaignId) })
      queryClient.invalidateQueries({ queryKey: queryKeys.campaigns.all })
      toast.success('Post removed')
    },
    onError: (err) => {
      if (axios.isAxiosError(err)) {
        toast.error((err.response?.data as { message?: string })?.message ?? 'Failed to delete')
      }
    },
  })

  return {
    posts: data?.data ?? [],
    totalPages: data?.totalPages ?? 0,
    isLoading,
    page,
    setPage,
    search,
    handleSearchChange,
    platformFilter,
    setPlatformFilter,
    togglePolling,
    deletePost,
  }
}
```

- [ ] **Step 2: Create AddPostDialog**

```tsx
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import axios from 'axios'
import { postsApi } from '@/api/posts'
import { addPostSchema, type AddPostFormValues } from '@/lib/schemas'
import { queryKeys } from '@/lib/constants/query-keys'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'
import { Input } from '@/components/ui/input'

interface AddPostDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  campaignId: string
}

export function AddPostDialog({ open, onOpenChange, campaignId }: AddPostDialogProps) {
  const queryClient = useQueryClient()

  const form = useForm<AddPostFormValues>({
    resolver: zodResolver(addPostSchema),
    defaultValues: { url: '' },
  })

  const handleOpenChange = (next: boolean) => {
    if (!next) form.reset()
    onOpenChange(next)
  }

  const mutation = useMutation({
    mutationFn: (values: AddPostFormValues) => postsApi.addPost(campaignId, values.url),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.posts.byCampaign(campaignId) })
      queryClient.invalidateQueries({ queryKey: queryKeys.campaigns.all })
      toast.success('Post added')
      handleOpenChange(false)
    },
    onError: (err) => {
      if (axios.isAxiosError(err)) {
        toast.error((err.response?.data as { message?: string })?.message ?? 'Failed to add post')
      }
    },
  })

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add Post</DialogTitle>
          <DialogDescription>
            Paste a social media post URL. Supported: Facebook, Instagram, TikTok, YouTube, Threads.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit((v) => mutation.mutate(v))} className="space-y-4">
            <FormField
              control={form.control}
              name="url"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Post URL</FormLabel>
                  <FormControl>
                    <Input placeholder="https://www.instagram.com/p/ABC123/" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button type="submit" className="w-full cursor-pointer" disabled={mutation.isPending}>
              {mutation.isPending ? 'Adding…' : 'Add Post'}
            </Button>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 3: Create ImportCsvDialog**

```tsx
import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import axios from 'axios'
import { postsApi, type BulkUploadResult } from '@/api/posts'
import { queryKeys } from '@/lib/constants/query-keys'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Upload, X } from 'lucide-react'

interface ImportCsvDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  campaignId: string
}

export function ImportCsvDialog({ open, onOpenChange, campaignId }: ImportCsvDialogProps) {
  const queryClient = useQueryClient()
  const [file, setFile] = useState<File | null>(null)
  const [result, setResult] = useState<BulkUploadResult | null>(null)

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      setFile(null)
      setResult(null)
    }
    onOpenChange(next)
  }

  const mutation = useMutation({
    mutationFn: () => postsApi.bulkUploadPosts(campaignId, file!),
    onSuccess: (response) => {
      const data = response.data
      setResult(data)
      queryClient.invalidateQueries({ queryKey: queryKeys.posts.byCampaign(campaignId) })
      queryClient.invalidateQueries({ queryKey: queryKeys.campaigns.all })
      toast.success(`Imported ${data.success_count} of ${data.total} posts`)
    },
    onError: (err) => {
      if (axios.isAxiosError(err)) {
        toast.error((err.response?.data as { message?: string })?.message ?? 'Upload failed')
      }
    },
  })

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Import Posts from CSV</DialogTitle>
          <DialogDescription>
            Upload a CSV file with a &quot;url&quot; column. Maximum 500 URLs per upload.
          </DialogDescription>
        </DialogHeader>

        {!result ? (
          <div className="space-y-4">
            {!file ? (
              <label className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-6 cursor-pointer hover:bg-muted/50">
                <Upload className="h-8 w-8 text-muted-foreground mb-2" />
                <span className="text-sm text-muted-foreground">Click to select CSV file</span>
                <input
                  type="file"
                  accept=".csv"
                  className="hidden"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                />
              </label>
            ) : (
              <div className="flex items-center justify-between rounded-lg border p-3">
                <span className="text-sm truncate">{file.name}</span>
                <Button variant="ghost" size="icon" onClick={() => setFile(null)}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            )}
            <Button
              className="w-full cursor-pointer"
              disabled={!file || mutation.isPending}
              onClick={() => mutation.mutate()}
            >
              {mutation.isPending ? 'Uploading…' : 'Upload'}
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="rounded-lg border p-3">
                <div className="text-2xl font-bold">{result.total}</div>
                <div className="text-xs text-muted-foreground">Total</div>
              </div>
              <div className="rounded-lg border p-3">
                <div className="text-2xl font-bold text-green-600">{result.success_count}</div>
                <div className="text-xs text-muted-foreground">Success</div>
              </div>
              <div className="rounded-lg border p-3">
                <div className="text-2xl font-bold text-red-600">{result.failed_count}</div>
                <div className="text-xs text-muted-foreground">Failed</div>
              </div>
            </div>
            {result.failures.length > 0 && (
              <div className="max-h-40 overflow-y-auto rounded-lg border p-3 space-y-1">
                {result.failures.map((f, i) => (
                  <div key={i} className="text-xs">
                    <span className="font-mono truncate">{f.url}</span>
                    <span className="text-red-500 ml-2">— {f.reason}</span>
                  </div>
                ))}
              </div>
            )}
            <Button className="w-full cursor-pointer" onClick={() => handleOpenChange(false)}>
              Done
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 4: Create CampaignPostsTab**

```tsx
import { useState } from 'react'
import { Plus, Upload, FileText, Trash2 } from 'lucide-react'
import { SearchBar } from '@/components/common/SearchBar'
import { EmptyState } from '@/components/common/EmptyState'
import { PaginationBar } from '@/components/common/PaginationBar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useCampaignPosts } from './use-campaign-posts'
import { AddPostDialog } from './AddPostDialog'
import { ImportCsvDialog } from './ImportCsvDialog'
import type { Platform } from '@/api/posts'

const PLATFORM_COLORS: Record<string, string> = {
  FACEBOOK: 'bg-blue-100 text-blue-700',
  INSTAGRAM: 'bg-pink-100 text-pink-700',
  TIKTOK: 'bg-gray-100 text-gray-700',
  YOUTUBE: 'bg-red-100 text-red-700',
  THREADS: 'bg-purple-100 text-purple-700',
}

function formatInterval(seconds: number | null): string {
  if (!seconds) return '—'
  if (seconds < 3600) return `${Math.round(seconds / 60)}min`
  return `${Math.round(seconds / 3600)}hr`
}

export function CampaignPostsTab({ campaignId }: { campaignId: string }) {
  const [addOpen, setAddOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const {
    posts,
    totalPages,
    isLoading,
    page,
    setPage,
    search,
    handleSearchChange,
    platformFilter,
    setPlatformFilter,
    togglePolling,
    deletePost,
  } = useCampaignPosts(campaignId)

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <SearchBar value={search} onChange={handleSearchChange} placeholder="Search by URL…" className="max-w-md" />
        <Select value={platformFilter} onValueChange={(v) => setPlatformFilter(v as Platform | '')}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="All platforms" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">All platforms</SelectItem>
            <SelectItem value="FACEBOOK">Facebook</SelectItem>
            <SelectItem value="INSTAGRAM">Instagram</SelectItem>
            <SelectItem value="TIKTOK">TikTok</SelectItem>
            <SelectItem value="YOUTUBE">YouTube</SelectItem>
            <SelectItem value="THREADS">Threads</SelectItem>
          </SelectContent>
        </Select>
        <div className="ml-auto flex gap-2">
          <Button size="sm" variant="outline" className="cursor-pointer" onClick={() => setImportOpen(true)}>
            <Upload className="mr-1 h-3 w-3" /> Import CSV
          </Button>
          <Button size="sm" className="cursor-pointer" onClick={() => setAddOpen(true)}>
            <Plus className="mr-1 h-3 w-3" /> Add Post
          </Button>
        </div>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading posts…</p>
      ) : posts.length === 0 ? (
        <EmptyState
          icon={<FileText className="h-12 w-12" />}
          title="No posts yet"
          description="Add posts by URL or import from a CSV file."
        />
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>URL</TableHead>
                <TableHead>Platform</TableHead>
                <TableHead>Polling</TableHead>
                <TableHead>Interval</TableHead>
                <TableHead>Last Polled</TableHead>
                <TableHead className="text-right">Comments</TableHead>
                <TableHead className="w-[50px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {posts.map((post) => (
                <TableRow key={post.id}>
                  <TableCell className="max-w-[300px]">
                    <span className="text-sm font-mono truncate block">{post.url ?? post.platform_post_id}</span>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={PLATFORM_COLORS[post.platform] ?? ''}>
                      {post.platform}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Switch
                      checked={post.polling_enabled}
                      onCheckedChange={(checked) =>
                        togglePolling.mutate({ postId: post.id, enabled: checked })
                      }
                    />
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {formatInterval(post.polling_interval_override)}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {post.last_polled_at ? new Date(post.last_polled_at).toLocaleString() : '—'}
                  </TableCell>
                  <TableCell className="text-right font-mono">{post.comment_count}</TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="cursor-pointer text-destructive hover:text-destructive"
                      onClick={() => deletePost.mutate(post.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <PaginationBar page={page} setPage={setPage} totalPages={totalPages} />

      <AddPostDialog open={addOpen} onOpenChange={setAddOpen} campaignId={campaignId} />
      <ImportCsvDialog open={importOpen} onOpenChange={setImportOpen} campaignId={campaignId} />
    </div>
  )
}
```

- [ ] **Step 5: Commit**

```bash
git add src/pages/campaigns/CampaignDetailPage/components/
git commit -m "feat: add CampaignPostsTab with add, import CSV, toggle polling, and delete"
```

---

## Task 17: Frontend — Wire Up ProjectDetailPage Campaigns Tab

**Files:**
- Create: `yehub-fe/src/pages/projects/ProjectDetailPage/components/ProjectCampaignsTab.tsx`
- Modify: `yehub-fe/src/pages/projects/ProjectDetailPage/index.tsx`

- [ ] **Step 1: Create ProjectCampaignsTab**

```tsx
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { MegaphoneIcon, Plus } from 'lucide-react'
import { campaignsApi } from '@/api/campaigns'
import { queryKeys } from '@/lib/constants/query-keys'
import { SearchBar } from '@/components/common/SearchBar'
import { EmptyState } from '@/components/common/EmptyState'
import { PaginationBar } from '@/components/common/PaginationBar'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { StatusBadge } from '@/pages/campaigns/components/StatusBadge'
import { useCan } from '@/hooks/use-can'
import type { ProjectRole } from '@/api/projects'

function formatInterval(seconds: number | null): string {
  if (!seconds) return '—'
  if (seconds < 3600) return `${Math.round(seconds / 60)}min`
  return `${Math.round(seconds / 3600)}hr`
}

function formatDateRange(start: string | null, end: string | null): string {
  if (!start && !end) return '—'
  const fmt = (d: string) => new Date(d).toLocaleDateString()
  if (start && end) return `${fmt(start)} – ${fmt(end)}`
  if (start) return `From ${fmt(start)}`
  return `Until ${fmt(end!)}`
}

export function ProjectCampaignsTab({ projectId, myRole }: { projectId: string; myRole: ProjectRole | null }) {
  const navigate = useNavigate()
  const canCreate = useCan('create_campaign', myRole)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.campaigns.listByProject(projectId, page, search, ''),
    queryFn: () =>
      campaignsApi.listCampaignsByProject(projectId, {
        page,
        limit: 20,
        q: search || undefined,
      }),
  })

  const campaigns = data?.data ?? []
  const totalPages = data?.totalPages ?? 0

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <SearchBar
          value={search}
          onChange={(v) => { setSearch(v); setPage(1) }}
          placeholder="Search campaigns…"
          className="max-w-md"
        />
        {canCreate && (
          <Button size="sm" className="ml-auto cursor-pointer" onClick={() => navigate(`/projects/${projectId}/campaigns/new`)}>
            <Plus className="mr-1 h-3 w-3" /> New Campaign
          </Button>
        )}
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading campaigns…</p>
      ) : campaigns.length === 0 ? (
        <EmptyState
          icon={<MegaphoneIcon className="h-10 w-10" />}
          title="No campaigns yet"
          description="Create your first campaign to start monitoring posts."
          action={canCreate ? (
            <Button size="sm" className="cursor-pointer" onClick={() => navigate(`/projects/${projectId}/campaigns/new`)}>
              <Plus className="mr-1 h-3 w-3" /> New Campaign
            </Button>
          ) : undefined}
        />
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Date Range</TableHead>
                <TableHead className="text-right">Posts</TableHead>
                <TableHead>Polling Interval</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {campaigns.map((c) => (
                <TableRow
                  key={c.id}
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => navigate(`/projects/${projectId}/campaigns/${c.id}`)}
                >
                  <TableCell>
                    <div className="font-medium">{c.name}</div>
                    {c.description && (
                      <div className="text-xs text-muted-foreground truncate max-w-[250px]">{c.description}</div>
                    )}
                  </TableCell>
                  <TableCell><StatusBadge status={c.status} /></TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {formatDateRange(c.start_date, c.end_date)}
                  </TableCell>
                  <TableCell className="text-right font-mono">{c.post_count}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {formatInterval(c.default_polling_interval)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <PaginationBar page={page} setPage={setPage} totalPages={totalPages} />
    </div>
  )
}
```

- [ ] **Step 2: Update ProjectDetailPage**

In the existing `ProjectDetailPage/index.tsx`, replace the campaigns tab `EmptyState` placeholder with:

```tsx
import { ProjectCampaignsTab } from './components/ProjectCampaignsTab'
```

Replace the campaigns tab content section (the `TabsContent` or conditional render for campaigns) with:

```tsx
<ProjectCampaignsTab projectId={projectId} myRole={myRole} />
```

Where `myRole` is the user's project role (already fetched in this page via `getMyRole`). Also remove the disabled "New Campaign" button from the page header if it exists — the button now lives inside `ProjectCampaignsTab`.

- [ ] **Step 3: Commit**

```bash
git add src/pages/projects/ src/pages/campaigns/
git commit -m "feat: wire up ProjectCampaignsTab in ProjectDetailPage"
```

---

## Task 18: Frontend — Verify Build

- [ ] **Step 1: Check for missing shadcn components**

The plan uses `Switch` component. Ensure it's installed:

```bash
cd yehub-fe && pnpm dlx shadcn@latest add switch
```

Also ensure `Select` is available:

```bash
pnpm dlx shadcn@latest add select
```

(Skip if already installed — the command is idempotent.)

- [ ] **Step 2: Build frontend**

```bash
cd yehub-fe && pnpm build
```

Expected: Build succeeds with no TypeScript errors.

- [ ] **Step 3: Build backend**

```bash
cd yehub-be && pnpm build
```

Expected: Build succeeds with no TypeScript errors.

- [ ] **Step 4: Fix any issues and commit**

If any build errors, fix them and commit:

```bash
git add -A
git commit -m "fix: resolve build issues"
```

---

## Task 19: Final Verification

- [ ] **Step 1: Start backend and verify API**

```bash
cd yehub-be && pnpm start:dev
```

Test with curl or Swagger at `/api/docs`:
- `POST /v1/projects/{projectId}/campaigns` — creates a DRAFT campaign
- `GET /v1/campaigns` — lists all campaigns
- `PATCH /v1/campaigns/{id}` with `{"status": "ACTIVE"}` — activates campaign

- [ ] **Step 2: Start frontend and verify UI**

```bash
cd yehub-fe && pnpm dev
```

Verify:
- `/campaigns` page loads with campaign list
- Click on project → campaigns tab shows campaigns
- "New Campaign" button → form page works
- Campaign detail page → lifecycle buttons work
- Posts tab → add post, import CSV dialogs work

- [ ] **Step 3: Commit any remaining fixes**

```bash
git add -A
git commit -m "feat: complete campaign management implementation"
```
