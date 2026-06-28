# Cost Explorer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an admin-only Cost Explorer page that aggregates Apify spend (`ApifyRun.usage_total_usd`) across the whole platform, sliceable by date range, platform, project, and campaign.

**Architecture:** A single read-only backend module (`src/cost/`) exposes `GET /v1/cost` (one snapshot payload with all sections) and `GET /v1/cost/filter-options` (dropdown data), both guarded by `GlobalRolesGuard` + `@GlobalRoles(GlobalRole.ADMIN)`. Aggregation uses raw SQL with `LEFT JOIN`s because `ApifyRun` has no `platform`/`project_id` columns — platform is `COALESCE(post.platform, social_account.platform)`, project is `campaign.project_id`. The frontend adds an admin page (`pages/cost/CostExplorerPage/`) with URL-synced filter state and one React Query, reusing the existing `DatePicker`, `MultiSelectChecklist`, `ChartContainer`, and formatting helpers.

**Tech Stack:** NestJS 11 + Prisma 7 (`$queryRaw`, raw SQL), Jest (backend). React 19 + Vite, TanStack Query v5, Recharts, shadcn/ui, Tailwind v4 (frontend).

**Reference spec:** `docs/superpowers/specs/2026-06-15-cost-explorer-design.md`

---

## File Structure

**Backend (`yehub-be/`):**
- Create `src/cost/dto/cost-query.dto.ts` — query params + CSV→array transforms + validation.
- Create `src/cost/cost-query.builder.ts` — pure helpers that build the shared `Prisma.Sql` JOIN + WHERE fragments (unit-testable without DB).
- Create `src/cost/cost.service.ts` — `getFilterOptions()` and `getOverview(query)`.
- Create `src/cost/cost.service.spec.ts` — service unit tests (mock `PrismaService`).
- Create `src/cost/cost-query.builder.spec.ts` — builder unit tests (pure).
- Create `src/cost/cost.controller.ts` — two admin-guarded GET routes.
- Create `src/cost/cost.module.ts` — wires controller + service.
- Modify `src/app.module.ts` — import `CostModule`.

**Frontend (`yehub-fe/`):**
- Create `src/lib/apify.ts` — `JOB_TYPE_LABELS` + `jobTypeLabel` (lifted from `CampaignSpendingTab`).
- Create `src/components/common/RunStatusBadge.tsx` — `RunStatusBadge` (lifted from `CampaignSpendingTab`).
- Modify `src/pages/campaigns/CampaignDetailPage/components/CampaignSpendingTab.tsx` — import the lifted helpers.
- Create `src/api/cost.ts` — `costApi` + response types.
- Modify `src/lib/constants/query-keys.ts` — add `cost` keys.
- Modify `src/lib/constants/routes.ts` — add `COST: '/cost'`.
- Create `src/pages/cost/CostExplorerPage/use-cost-filter-options.ts` — filter dropdown query.
- Create `src/pages/cost/CostExplorerPage/use-cost-explorer.ts` — URL-synced filter state + snapshot query.
- Create `src/pages/cost/CostExplorerPage/components/CostFilterBar.tsx`
- Create `src/pages/cost/CostExplorerPage/components/CostSummaryCards.tsx`
- Create `src/pages/cost/CostExplorerPage/components/CostOverTimeChart.tsx`
- Create `src/pages/cost/CostExplorerPage/components/CostByPlatformChart.tsx`
- Create `src/pages/cost/CostExplorerPage/components/CostBreakdownTable.tsx`
- Create `src/pages/cost/CostExplorerPage/components/CostByJobTypeCards.tsx`
- Create `src/pages/cost/CostExplorerPage/components/RecentRunsTable.tsx`
- Create `src/pages/cost/CostExplorerPage/index.tsx`
- Modify `src/router.tsx` — lazy route under `<AdminRoute>`.
- Modify `src/components/app-sidebar.tsx` — admin-gated nav item.

---

## Backend Tasks

### Task 1: Cost query DTO

**Files:**
- Create: `yehub-be/src/cost/dto/cost-query.dto.ts`

The DTO accepts `from`/`to` as ISO date strings and `platforms`/`project_ids`/`campaign_ids` as comma-separated strings, transformed into arrays. `from`/`to` are required; the `from > to` check happens in the service (so it can throw a domain `BadRequestException` with a clear message).

- [ ] **Step 1: Write the DTO**

```ts
// yehub-be/src/cost/dto/cost-query.dto.ts
import { Transform } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsEnum,
  IsOptional,
  IsUUID,
} from 'class-validator';
import { Platform } from '../../../generated/prisma/client';

// Splits a comma-separated query param ("A,B") into a trimmed, non-empty array.
// Already-array input (repeated params) is passed through unchanged.
function csvToArray(value: unknown): string[] | undefined {
  if (Array.isArray(value)) return value as string[];
  if (typeof value !== 'string') return undefined;
  const parts = value
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  return parts.length ? parts : undefined;
}

export class CostQueryDto {
  @IsDateString()
  from!: string;

  @IsDateString()
  to!: string;

  @IsOptional()
  @Transform(({ value }) => csvToArray(value))
  @IsArray()
  @IsEnum(Platform, { each: true })
  platforms?: Platform[];

  @IsOptional()
  @Transform(({ value }) => csvToArray(value))
  @IsArray()
  @IsUUID('all', { each: true })
  project_ids?: string[];

  @IsOptional()
  @Transform(({ value }) => csvToArray(value))
  @IsArray()
  @IsUUID('all', { each: true })
  campaign_ids?: string[];
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cd yehub-be && pnpm exec tsc --noEmit -p tsconfig.json`
Expected: No errors referencing `cost-query.dto.ts`. (Pre-existing errors elsewhere from a stale Prisma client are acceptable per project memory — confirm none mention this new file.)

- [ ] **Step 3: Commit**

```bash
git add yehub-be/src/cost/dto/cost-query.dto.ts
git commit -m "feat(be): add Cost Explorer query DTO"
```

---

### Task 2: Cost query builder (shared SQL fragments)

**Files:**
- Create: `yehub-be/src/cost/cost-query.builder.ts`
- Test: `yehub-be/src/cost/cost-query.builder.spec.ts`

Pure functions that build the reusable `Prisma.Sql` JOIN fragment and WHERE fragment from a `CostQueryDto` plus a resolved `from`/`to`. Keeping these pure makes the dynamic filter logic unit-testable without a database.

- [ ] **Step 1: Write the failing test**

```ts
// yehub-be/src/cost/cost-query.builder.spec.ts
import { Platform } from '../../generated/prisma/client';
import { buildCostJoins, buildCostWhere } from './cost-query.builder';

describe('cost-query.builder', () => {
  const from = new Date('2026-05-01T00:00:00.000Z');
  const to = new Date('2026-05-31T23:59:59.999Z');

  it('builds a JOIN fragment referencing posts, social_accounts, campaigns', () => {
    const sql = buildCostJoins().sql;
    expect(sql).toContain('posts');
    expect(sql).toContain('social_accounts');
    expect(sql).toContain('campaigns');
  });

  it('builds a WHERE fragment with only the date range when no filters', () => {
    const where = buildCostWhere({} as never, from, to);
    expect(where.sql).toContain('BETWEEN');
    expect(where.sql).not.toContain('IN (');
  });

  it('adds a platform filter when platforms are provided', () => {
    const where = buildCostWhere(
      { platforms: [Platform.FACEBOOK, Platform.TIKTOK] } as never,
      from,
      to,
    );
    expect(where.sql).toContain('COALESCE(p.platform, sa.platform)');
    // Two bound params for the platform list.
    expect(where.values).toEqual(
      expect.arrayContaining([Platform.FACEBOOK, Platform.TIKTOK]),
    );
  });

  it('adds project and campaign filters when provided', () => {
    const where = buildCostWhere(
      { project_ids: ['11111111-1111-1111-1111-111111111111'], campaign_ids: ['22222222-2222-2222-2222-222222222222'] } as never,
      from,
      to,
    );
    expect(where.sql).toContain('c.project_id');
    expect(where.sql).toContain('r.campaign_id');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd yehub-be && pnpm test -- cost-query.builder`
Expected: FAIL — "Cannot find module './cost-query.builder'".

- [ ] **Step 3: Write the builder**

```ts
// yehub-be/src/cost/cost-query.builder.ts
import { Prisma } from '../../generated/prisma/client';
import type { CostQueryDto } from './dto/cost-query.dto';

// Shared LEFT JOINs that let every aggregation derive platform (from the post or
// social account) and project (from the campaign). Always join from alias `r`
// (apify_runs).
export function buildCostJoins(): Prisma.Sql {
  return Prisma.sql`
    LEFT JOIN "posts" p            ON p.id = r.post_id
    LEFT JOIN "social_accounts" sa ON sa.id = r.social_account_id
    LEFT JOIN "campaigns" c        ON c.id = r.campaign_id
  `;
}

// Shared WHERE clause: always the date window, plus any active filters.
export function buildCostWhere(
  query: CostQueryDto,
  from: Date,
  to: Date,
): Prisma.Sql {
  const conditions: Prisma.Sql[] = [
    Prisma.sql`COALESCE(r.started_at, r.created_at) BETWEEN ${from} AND ${to}`,
  ];

  if (query.platforms?.length) {
    conditions.push(
      Prisma.sql`COALESCE(p.platform, sa.platform) IN (${Prisma.join(
        query.platforms.map((p) => Prisma.sql`${p}::"Platform"`),
      )})`,
    );
  }
  if (query.project_ids?.length) {
    conditions.push(
      Prisma.sql`c.project_id IN (${Prisma.join(
        query.project_ids.map((id) => Prisma.sql`${id}::uuid`),
      )})`,
    );
  }
  if (query.campaign_ids?.length) {
    conditions.push(
      Prisma.sql`r.campaign_id IN (${Prisma.join(
        query.campaign_ids.map((id) => Prisma.sql`${id}::uuid`),
      )})`,
    );
  }

  return Prisma.sql`WHERE ${Prisma.join(conditions, ' AND ')}`;
}
```

> Note on `::"Platform"`: confirm the enum's Postgres type name during implementation by checking an existing enum cast in the schema/migrations. If the generated type name differs, adjust the cast. The string values themselves match the `Platform` enum.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd yehub-be && pnpm test -- cost-query.builder`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add yehub-be/src/cost/cost-query.builder.ts yehub-be/src/cost/cost-query.builder.spec.ts
git commit -m "feat(be): add Cost Explorer SQL query builder"
```

---

### Task 3: CostService

**Files:**
- Create: `yehub-be/src/cost/cost.service.ts`
- Test: `yehub-be/src/cost/cost.service.spec.ts`

`getOverview` runs seven `$queryRaw` calls (in this fixed order: summary, series, by_platform, by_project, by_campaign, by_job_type, recent_runs), then shapes the response. Names for projects/campaigns and the recent-run label are resolved inside SQL via the joins, so no extra Prisma calls are needed. `getFilterOptions` returns active projects and non-deleted campaigns for the dropdowns.

- [ ] **Step 1: Write the failing test**

```ts
// yehub-be/src/cost/cost.service.spec.ts
import { Test } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CostService } from './cost.service';
import type { CostQueryDto } from './dto/cost-query.dto';

const mockPrisma = {
  $queryRaw: jest.fn(),
  project: { findMany: jest.fn() },
  campaign: { findMany: jest.fn() },
};

describe('CostService', () => {
  let service: CostService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        CostService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();
    service = moduleRef.get(CostService);
  });

  const baseQuery: CostQueryDto = {
    from: '2026-05-01',
    to: '2026-05-31',
  };

  it('rejects an inverted date range', async () => {
    await expect(
      service.getOverview({ from: '2026-05-31', to: '2026-05-01' } as CostQueryDto),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('aggregates all sections from the raw query results', async () => {
    mockPrisma.$queryRaw
      // 1. summary
      .mockResolvedValueOnce([
        { total_usd: 12.5, run_count: 4n, finalized_count: 3n },
      ])
      // 2. series
      .mockResolvedValueOnce([{ bucket: new Date('2026-05-02T00:00:00Z'), usd: 12.5 }])
      // 3. by_platform
      .mockResolvedValueOnce([
        { platform: 'FACEBOOK', run_count: 3n, total_usd: 10 },
        { platform: null, run_count: 1n, total_usd: 2.5 },
      ])
      // 4. by_project
      .mockResolvedValueOnce([
        { project_id: 'p1', project_name: 'Alpha', run_count: 3n, total_usd: 10 },
        { project_id: null, project_name: null, run_count: 1n, total_usd: 2.5 },
      ])
      // 5. by_campaign
      .mockResolvedValueOnce([
        { campaign_id: 'c1', campaign_name: 'Launch', project_name: 'Alpha', run_count: 3n, total_usd: 10 },
      ])
      // 6. by_job_type
      .mockResolvedValueOnce([
        { job_type: 'poll-post-metrics', run_count: 4n, total_usd: 12.5 },
      ])
      // 7. recent_runs
      .mockResolvedValueOnce([
        {
          id: 'r1',
          job_type: 'poll-post-metrics',
          status: 'SUCCEEDED',
          started_at: new Date('2026-05-02T00:00:00Z'),
          usage_total_usd: 12.5,
          usage_finalized: true,
          platform: 'FACEBOOK',
          project_name: 'Alpha',
          label: '@brand',
        },
      ]);

    const result = await service.getOverview(baseQuery);

    expect(result.currency).toBe('USD');
    expect(result.summary).toEqual({
      total_usd: 12.5,
      run_count: 4,
      finalized_count: 3,
      pending_count: 1,
    });
    expect(result.series.points.length).toBeGreaterThan(0);
    // null platform/project surface as UNATTRIBUTED.
    expect(result.by_platform).toContainEqual({
      platform: 'UNATTRIBUTED',
      run_count: 1,
      total_usd: 2.5,
    });
    expect(result.by_project).toContainEqual({
      project_id: null,
      project_name: 'UNATTRIBUTED',
      run_count: 1,
      total_usd: 2.5,
    });
    expect(result.by_campaign[0].campaign_name).toBe('Launch');
    expect(result.by_job_type[0].job_type).toBe('poll-post-metrics');
    expect(result.recent_runs[0].id).toBe('r1');
  });

  it('returns filter options', async () => {
    mockPrisma.project.findMany.mockResolvedValue([{ id: 'p1', name: 'Alpha' }]);
    mockPrisma.campaign.findMany.mockResolvedValue([
      { id: 'c1', name: 'Launch', project_id: 'p1' },
    ]);

    const result = await service.getFilterOptions();

    expect(result.projects).toEqual([{ id: 'p1', name: 'Alpha' }]);
    expect(result.campaigns).toEqual([{ id: 'c1', name: 'Launch', project_id: 'p1' }]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd yehub-be && pnpm test -- cost.service`
Expected: FAIL — "Cannot find module './cost.service'".

- [ ] **Step 3: Write the service**

```ts
// yehub-be/src/cost/cost.service.ts
import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '../../generated/prisma/client';
import {
  pickGranularity,
  zeroFillBuckets,
  type Granularity,
} from '../campaigns/campaign-analytics';
import { CostQueryDto } from './dto/cost-query.dto';
import { buildCostJoins, buildCostWhere } from './cost-query.builder';

const UNATTRIBUTED = 'UNATTRIBUTED';
const TOP_N = 10;
const RECENT_LIMIT = 20;

@Injectable()
export class CostService {
  constructor(private readonly prisma: PrismaService) {}

  // Projects + campaigns used to populate the cascading filter dropdowns.
  async getFilterOptions() {
    const [projects, campaigns] = await Promise.all([
      this.prisma.project.findMany({
        where: { active: true },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      }),
      this.prisma.campaign.findMany({
        where: { deleted_at: null },
        select: { id: true, name: true, project_id: true },
        orderBy: { name: 'asc' },
      }),
    ]);
    return { projects, campaigns };
  }

  async getOverview(query: CostQueryDto) {
    const from = new Date(query.from);
    const to = new Date(query.to);
    if (from > to) {
      throw new BadRequestException('`from` must be on or before `to`');
    }

    const joins = buildCostJoins();
    const where = buildCostWhere(query, from, to);
    const granularity: Granularity = pickGranularity(from, to);

    // 1. Summary
    const [summaryRow] = await this.prisma.$queryRaw<
      { total_usd: number; run_count: bigint; finalized_count: bigint }[]
    >(Prisma.sql`
      SELECT COALESCE(SUM(r.usage_total_usd), 0)::float8 AS total_usd,
             COUNT(*)::bigint AS run_count,
             COUNT(*) FILTER (WHERE r.usage_finalized)::bigint AS finalized_count
      FROM "apify_runs" r
      ${joins}
      ${where}
    `);
    const runCount = Number(summaryRow?.run_count ?? 0);
    const finalizedCount = Number(summaryRow?.finalized_count ?? 0);

    // 2. Spend over time
    const seriesRows = await this.prisma.$queryRaw<
      { bucket: Date; usd: number }[]
    >(Prisma.sql`
      SELECT date_trunc(${Prisma.raw(`'${granularity}'`)}, COALESCE(r.started_at, r.created_at)) AS bucket,
             COALESCE(SUM(r.usage_total_usd), 0)::float8 AS usd
      FROM "apify_runs" r
      ${joins}
      ${where}
      GROUP BY bucket
      ORDER BY bucket ASC
    `);
    const series = {
      granularity,
      points: zeroFillBuckets(
        seriesRows.map((row) => ({ date: row.bucket, count: row.usd })),
        from,
        to,
        granularity,
      ).map((p) => ({ date: p.date, usd: p.count })),
    };

    // 3. By platform
    const platformRows = await this.prisma.$queryRaw<
      { platform: string | null; run_count: bigint; total_usd: number }[]
    >(Prisma.sql`
      SELECT COALESCE(p.platform, sa.platform)::text AS platform,
             COUNT(*)::bigint AS run_count,
             COALESCE(SUM(r.usage_total_usd), 0)::float8 AS total_usd
      FROM "apify_runs" r
      ${joins}
      ${where}
      GROUP BY COALESCE(p.platform, sa.platform)
      ORDER BY total_usd DESC
    `);
    const by_platform = platformRows.map((row) => ({
      platform: row.platform ?? UNATTRIBUTED,
      run_count: Number(row.run_count),
      total_usd: row.total_usd,
    }));

    // 4. By project (top N; null project_id => UNATTRIBUTED)
    const projectRows = await this.prisma.$queryRaw<
      {
        project_id: string | null;
        project_name: string | null;
        run_count: bigint;
        total_usd: number;
      }[]
    >(Prisma.sql`
      SELECT c.project_id AS project_id,
             pr.name AS project_name,
             COUNT(*)::bigint AS run_count,
             COALESCE(SUM(r.usage_total_usd), 0)::float8 AS total_usd
      FROM "apify_runs" r
      ${joins}
      LEFT JOIN "projects" pr ON pr.id = c.project_id
      ${where}
      GROUP BY c.project_id, pr.name
      ORDER BY total_usd DESC
      LIMIT ${TOP_N}
    `);
    const by_project = projectRows.map((row) => ({
      project_id: row.project_id,
      project_name: row.project_name ?? UNATTRIBUTED,
      run_count: Number(row.run_count),
      total_usd: row.total_usd,
    }));

    // 5. By campaign (top N)
    const campaignRows = await this.prisma.$queryRaw<
      {
        campaign_id: string | null;
        campaign_name: string | null;
        project_name: string | null;
        run_count: bigint;
        total_usd: number;
      }[]
    >(Prisma.sql`
      SELECT r.campaign_id AS campaign_id,
             c.name AS campaign_name,
             pr.name AS project_name,
             COUNT(*)::bigint AS run_count,
             COALESCE(SUM(r.usage_total_usd), 0)::float8 AS total_usd
      FROM "apify_runs" r
      ${joins}
      LEFT JOIN "projects" pr ON pr.id = c.project_id
      ${where}
      GROUP BY r.campaign_id, c.name, pr.name
      ORDER BY total_usd DESC
      LIMIT ${TOP_N}
    `);
    const by_campaign = campaignRows.map((row) => ({
      campaign_id: row.campaign_id,
      campaign_name: row.campaign_name ?? UNATTRIBUTED,
      project_name: row.project_name ?? UNATTRIBUTED,
      run_count: Number(row.run_count),
      total_usd: row.total_usd,
    }));

    // 6. By job type
    const jobTypeRows = await this.prisma.$queryRaw<
      { job_type: string; run_count: bigint; total_usd: number }[]
    >(Prisma.sql`
      SELECT r.job_type AS job_type,
             COUNT(*)::bigint AS run_count,
             COALESCE(SUM(r.usage_total_usd), 0)::float8 AS total_usd
      FROM "apify_runs" r
      ${joins}
      ${where}
      GROUP BY r.job_type
      ORDER BY total_usd DESC
    `);
    const by_job_type = jobTypeRows.map((row) => ({
      job_type: row.job_type,
      run_count: Number(row.run_count),
      total_usd: row.total_usd,
    }));

    // 7. Recent runs (label/platform/project resolved in SQL)
    const recentRows = await this.prisma.$queryRaw<
      {
        id: string;
        job_type: string;
        status: string;
        started_at: Date | null;
        usage_total_usd: number | null;
        usage_finalized: boolean;
        platform: string | null;
        project_name: string | null;
        label: string | null;
      }[]
    >(Prisma.sql`
      SELECT r.id,
             r.job_type,
             r.status,
             r.started_at,
             r.usage_total_usd,
             r.usage_finalized,
             COALESCE(p.platform, sa.platform)::text AS platform,
             pr.name AS project_name,
             COALESCE(
               p.author_name,
               CASE WHEN p.id IS NOT NULL THEN p.platform || ' ' || p.platform_post_id END,
               CASE WHEN sa.username IS NOT NULL THEN '@' || sa.username END,
               sa.platform::text
             ) AS label
      FROM "apify_runs" r
      ${joins}
      LEFT JOIN "projects" pr ON pr.id = c.project_id
      ${where}
      ORDER BY r.created_at DESC
      LIMIT ${RECENT_LIMIT}
    `);
    const recent_runs = recentRows.map((row) => ({
      id: row.id,
      job_type: row.job_type,
      status: row.status,
      started_at: row.started_at,
      usage_total_usd: row.usage_total_usd,
      usage_finalized: row.usage_finalized,
      platform: row.platform ?? UNATTRIBUTED,
      project_name: row.project_name ?? UNATTRIBUTED,
      label: row.label,
    }));

    return {
      currency: 'USD' as const,
      summary: {
        total_usd: summaryRow?.total_usd ?? 0,
        run_count: runCount,
        finalized_count: finalizedCount,
        pending_count: runCount - finalizedCount,
      },
      series,
      by_platform,
      by_project,
      by_campaign,
      by_job_type,
      recent_runs,
    };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd yehub-be && pnpm test -- cost.service`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add yehub-be/src/cost/cost.service.ts yehub-be/src/cost/cost.service.spec.ts
git commit -m "feat(be): add CostService aggregation"
```

---

### Task 4: CostController + module wiring

**Files:**
- Create: `yehub-be/src/cost/cost.controller.ts`
- Create: `yehub-be/src/cost/cost.module.ts`
- Modify: `yehub-be/src/app.module.ts`

- [ ] **Step 1: Write the controller**

```ts
// yehub-be/src/cost/cost.controller.ts
import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { GlobalRole } from '../../generated/prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { GlobalRolesGuard } from '../auth/guards/global-roles.guard';
import { GlobalRoles } from '../auth/decorators/global-roles.decorator';
import { CostService } from './cost.service';
import { CostQueryDto } from './dto/cost-query.dto';

@ApiTags('Cost')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, GlobalRolesGuard)
@GlobalRoles(GlobalRole.ADMIN)
@Controller('cost')
export class CostController {
  constructor(private readonly costService: CostService) {}

  @Get('filter-options')
  @ApiOperation({ summary: 'Projects and campaigns for Cost Explorer filters' })
  getFilterOptions() {
    return this.costService.getFilterOptions();
  }

  @Get()
  @ApiOperation({ summary: 'Aggregated Apify spend overview' })
  getOverview(@Query() query: CostQueryDto) {
    return this.costService.getOverview(query);
  }
}
```

> Route order: declare `filter-options` before the root `@Get()` so the literal path is matched and never shadowed.

- [ ] **Step 2: Write the module**

```ts
// yehub-be/src/cost/cost.module.ts
import { Module } from '@nestjs/common';
import { CostController } from './cost.controller';
import { CostService } from './cost.service';

@Module({
  controllers: [CostController],
  providers: [CostService],
})
export class CostModule {}
```

- [ ] **Step 3: Register the module in AppModule**

In `yehub-be/src/app.module.ts`, add the import and include `CostModule` in the `imports` array (place it alphabetically/near `CampaignsModule`):

```ts
import { CostModule } from './cost/cost.module';
```

Then add `CostModule` to the `@Module({ imports: [...] })` list.

- [ ] **Step 4: Verify build and full backend test suite**

Run: `cd yehub-be && pnpm test -- cost`
Expected: PASS (cost.service + cost-query.builder specs).

Run: `cd yehub-be && pnpm test`
Expected: All suites pass (this is the reliable signal per project memory; a stale-Prisma build/lint failure is pre-existing and unrelated).

- [ ] **Step 5: Commit**

```bash
git add yehub-be/src/cost/cost.controller.ts yehub-be/src/cost/cost.module.ts yehub-be/src/app.module.ts
git commit -m "feat(be): expose Cost Explorer endpoints"
```

---

## Frontend Tasks

### Task 5: Lift shared Apify helpers out of CampaignSpendingTab

**Files:**
- Create: `yehub-fe/src/lib/apify.ts`
- Create: `yehub-fe/src/components/common/RunStatusBadge.tsx`
- Modify: `yehub-fe/src/pages/campaigns/CampaignDetailPage/components/CampaignSpendingTab.tsx`

- [ ] **Step 1: Create the job-type label helper**

```ts
// yehub-fe/src/lib/apify.ts
export const JOB_TYPE_LABELS: Record<string, string> = {
  'poll-post-metrics': 'Post metrics',
  'poll-post-comments': 'Post comments',
  'poll-social-account': 'Account profile',
}

export function jobTypeLabel(jobType: string): string {
  return JOB_TYPE_LABELS[jobType] ?? jobType
}
```

- [ ] **Step 2: Create the shared status badge**

```tsx
// yehub-fe/src/components/common/RunStatusBadge.tsx
import { Badge } from '@/components/ui/badge'

export function RunStatusBadge({ status }: { status: string }) {
  const tone =
    status === 'SUCCEEDED'
      ? 'bg-emerald-100 text-emerald-700'
      : status === 'FAILED' || status === 'ABORTED' || status === 'TIMED-OUT'
        ? 'bg-red-100 text-red-700'
        : 'bg-amber-100 text-amber-700'
  return (
    <Badge variant="outline" className={`${tone} border-0`}>
      {status}
    </Badge>
  )
}
```

- [ ] **Step 3: Update CampaignSpendingTab to use the shared helpers**

In `CampaignSpendingTab.tsx`:
1. Delete the local `JOB_TYPE_LABELS`, `jobTypeLabel`, and `StatusBadge` definitions (lines 11–19 and 34–46 in the current file).
2. Add imports near the top:

```tsx
import { jobTypeLabel } from '@/lib/apify'
import { RunStatusBadge } from '@/components/common/RunStatusBadge'
```

3. Replace the single `<StatusBadge status={run.status} />` usage with `<RunStatusBadge status={run.status} />`.

- [ ] **Step 4: Verify lint + build**

Run: `cd yehub-fe && pnpm lint && pnpm build`
Expected: No errors. (Build runs `tsc`, catching the removed-symbol references.)

- [ ] **Step 5: Commit**

```bash
git add yehub-fe/src/lib/apify.ts yehub-fe/src/components/common/RunStatusBadge.tsx yehub-fe/src/pages/campaigns/CampaignDetailPage/components/CampaignSpendingTab.tsx
git commit -m "refactor(fe): lift shared Apify job-type label and run status badge"
```

---

### Task 6: Cost API layer, query keys, route constant

**Files:**
- Create: `yehub-fe/src/api/cost.ts`
- Modify: `yehub-fe/src/lib/constants/query-keys.ts`
- Modify: `yehub-fe/src/lib/constants/routes.ts`

- [ ] **Step 1: Create the API module**

```ts
// yehub-fe/src/api/cost.ts
import { apiClient } from './client'
import type { Platform, CommentVolumeGranularity } from './campaigns'

export interface CostFilters {
  from: string
  to: string
  platforms: Platform[]
  project_ids: string[]
  campaign_ids: string[]
}

export interface CostFilterOptions {
  projects: { id: string; name: string }[]
  campaigns: { id: string; name: string; project_id: string }[]
}

export interface CostOverview {
  currency: 'USD'
  summary: {
    total_usd: number
    run_count: number
    finalized_count: number
    pending_count: number
  }
  series: {
    granularity: CommentVolumeGranularity
    points: { date: string; usd: number }[]
  }
  by_platform: { platform: string; run_count: number; total_usd: number }[]
  by_project: {
    project_id: string | null
    project_name: string
    run_count: number
    total_usd: number
  }[]
  by_campaign: {
    campaign_id: string | null
    campaign_name: string
    project_name: string
    run_count: number
    total_usd: number
  }[]
  by_job_type: { job_type: string; run_count: number; total_usd: number }[]
  recent_runs: {
    id: string
    job_type: string
    status: string
    started_at: string | null
    usage_total_usd: number | null
    usage_finalized: boolean
    platform: string
    project_name: string
    label: string | null
  }[]
}

// Builds the query params, omitting empty arrays so the URL stays clean.
function toParams(filters: CostFilters): Record<string, string> {
  const params: Record<string, string> = { from: filters.from, to: filters.to }
  if (filters.platforms.length) params.platforms = filters.platforms.join(',')
  if (filters.project_ids.length) params.project_ids = filters.project_ids.join(',')
  if (filters.campaign_ids.length) params.campaign_ids = filters.campaign_ids.join(',')
  return params
}

export const costApi = {
  getFilterOptions: () =>
    apiClient.get<CostFilterOptions>('/cost/filter-options').then((r) => r.data),

  getOverview: (filters: CostFilters) =>
    apiClient.get<CostOverview>('/cost', { params: toParams(filters) }).then((r) => r.data),
}
```

- [ ] **Step 2: Add query keys**

In `yehub-fe/src/lib/constants/query-keys.ts`, add inside the `queryKeys` object (e.g. after `campaignSpending`):

```ts
  cost: {
    filterOptions: ['cost', 'filter-options'] as const,
    overview: (filters: Record<string, unknown>) => ['cost', 'overview', filters] as const,
  },
```

- [ ] **Step 3: Add the route constant**

In `yehub-fe/src/lib/constants/routes.ts`, add to the `ROUTES` object (near `USERS`):

```ts
  COST: '/cost',
```

- [ ] **Step 4: Verify build**

Run: `cd yehub-fe && pnpm build`
Expected: No errors.

- [ ] **Step 5: Commit**

```bash
git add yehub-fe/src/api/cost.ts yehub-fe/src/lib/constants/query-keys.ts yehub-fe/src/lib/constants/routes.ts
git commit -m "feat(fe): add Cost Explorer API layer, query keys, route"
```

---

### Task 7: Cost Explorer hooks

**Files:**
- Create: `yehub-fe/src/pages/cost/CostExplorerPage/use-cost-filter-options.ts`
- Create: `yehub-fe/src/pages/cost/CostExplorerPage/use-cost-explorer.ts`

`use-cost-explorer` owns filter state in the URL (`useSearchParams`) and runs the overview query. Default range is the last 30 days when no params are present.

- [ ] **Step 1: Create the filter-options hook**

```ts
// yehub-fe/src/pages/cost/CostExplorerPage/use-cost-filter-options.ts
import { useQuery } from '@tanstack/react-query'
import { costApi } from '@/api/cost'
import { queryKeys } from '@/lib/constants/query-keys'

export function useCostFilterOptions() {
  return useQuery({
    queryKey: queryKeys.cost.filterOptions,
    queryFn: () => costApi.getFilterOptions(),
    staleTime: 5 * 60 * 1000,
  })
}
```

- [ ] **Step 2: Create the main hook**

```ts
// yehub-fe/src/pages/cost/CostExplorerPage/use-cost-explorer.ts
import { useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { format, subDays } from 'date-fns'
import { costApi, type CostFilters } from '@/api/cost'
import type { Platform } from '@/api/campaigns'
import { queryKeys } from '@/lib/constants/query-keys'

function defaultRange() {
  const today = new Date()
  return {
    from: format(subDays(today, 29), 'yyyy-MM-dd'),
    to: format(today, 'yyyy-MM-dd'),
  }
}

function parseCsv(value: string | null): string[] {
  return value ? value.split(',').filter(Boolean) : []
}

export function useCostExplorer() {
  const [searchParams, setSearchParams] = useSearchParams()
  const fallback = useMemo(defaultRange, [])

  const filters: CostFilters = {
    from: searchParams.get('from') ?? fallback.from,
    to: searchParams.get('to') ?? fallback.to,
    platforms: parseCsv(searchParams.get('platforms')) as Platform[],
    project_ids: parseCsv(searchParams.get('project_ids')),
    campaign_ids: parseCsv(searchParams.get('campaign_ids')),
  }

  // Writes only non-default/non-empty values to the URL.
  const setFilters = (next: CostFilters) => {
    const params = new URLSearchParams()
    params.set('from', next.from)
    params.set('to', next.to)
    if (next.platforms.length) params.set('platforms', next.platforms.join(','))
    if (next.project_ids.length) params.set('project_ids', next.project_ids.join(','))
    if (next.campaign_ids.length) params.set('campaign_ids', next.campaign_ids.join(','))
    setSearchParams(params, { replace: true })
  }

  const query = useQuery({
    queryKey: queryKeys.cost.overview(filters as unknown as Record<string, unknown>),
    queryFn: () => costApi.getOverview(filters),
    enabled: filters.from <= filters.to,
  })

  return { filters, setFilters, ...query }
}
```

- [ ] **Step 3: Verify build**

Run: `cd yehub-fe && pnpm build`
Expected: No errors. (`date-fns` is already a dependency — used by `DatePicker`.)

- [ ] **Step 4: Commit**

```bash
git add yehub-fe/src/pages/cost/CostExplorerPage/use-cost-filter-options.ts yehub-fe/src/pages/cost/CostExplorerPage/use-cost-explorer.ts
git commit -m "feat(fe): add Cost Explorer hooks with URL-synced filters"
```

---

### Task 8: Filter bar component

**Files:**
- Create: `yehub-fe/src/pages/cost/CostExplorerPage/components/CostFilterBar.tsx`

Reuses `DatePicker` (single date, `value`/`onChange` with `yyyy-MM-dd`) and `MultiSelectChecklist` (`label`/`items`/`selectedIds`/`onChange`). Campaign options are filtered to the selected projects (cascading); changing projects prunes now-invalid campaign selections.

- [ ] **Step 1: Write the component**

```tsx
// yehub-fe/src/pages/cost/CostExplorerPage/components/CostFilterBar.tsx
import { DatePicker } from '@/components/common/DatePicker'
import { MultiSelectChecklist } from '@/components/common/MultiSelectChecklist'
import { Label } from '@/components/ui/label'
import type { CostFilters, CostFilterOptions } from '@/api/cost'
import type { Platform } from '@/api/campaigns'

const PLATFORMS: Platform[] = ['FACEBOOK', 'INSTAGRAM', 'TIKTOK', 'YOUTUBE', 'THREADS']
const PLATFORM_ITEMS = PLATFORMS.map((p) => ({ id: p, name: p.charAt(0) + p.slice(1).toLowerCase() }))

interface Props {
  filters: CostFilters
  onChange: (next: CostFilters) => void
  options?: CostFilterOptions
}

export function CostFilterBar({ filters, onChange, options }: Props) {
  const projectItems = options?.projects ?? []
  // Cascading: only campaigns whose project is selected (all if no project chosen).
  const campaignItems = (options?.campaigns ?? []).filter(
    (c) => filters.project_ids.length === 0 || filters.project_ids.includes(c.project_id),
  )

  const handleProjects = (project_ids: string[]) => {
    const validCampaignIds = new Set(
      (options?.campaigns ?? [])
        .filter((c) => project_ids.length === 0 || project_ids.includes(c.project_id))
        .map((c) => c.id),
    )
    onChange({
      ...filters,
      project_ids,
      campaign_ids: filters.campaign_ids.filter((id) => validCampaignIds.has(id)),
    })
  }

  return (
    <div className="grid gap-4 rounded-lg border p-4 md:grid-cols-2 lg:grid-cols-4">
      <div className="space-y-2">
        <Label>From</Label>
        <DatePicker value={filters.from} onChange={(from) => onChange({ ...filters, from })} />
      </div>
      <div className="space-y-2">
        <Label>To</Label>
        <DatePicker value={filters.to} onChange={(to) => onChange({ ...filters, to })} />
      </div>
      <MultiSelectChecklist
        label="Platforms"
        items={PLATFORM_ITEMS}
        selectedIds={filters.platforms}
        onChange={(ids) => onChange({ ...filters, platforms: ids as Platform[] })}
      />
      <MultiSelectChecklist
        label="Projects"
        items={projectItems}
        selectedIds={filters.project_ids}
        onChange={handleProjects}
        emptyMessage="No projects available."
      />
      <div className="lg:col-span-4">
        <MultiSelectChecklist
          label="Campaigns"
          items={campaignItems}
          selectedIds={filters.campaign_ids}
          onChange={(campaign_ids) => onChange({ ...filters, campaign_ids })}
          emptyMessage="No campaigns for the selected projects."
        />
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify build**

Run: `cd yehub-fe && pnpm build`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add yehub-fe/src/pages/cost/CostExplorerPage/components/CostFilterBar.tsx
git commit -m "feat(fe): add Cost Explorer filter bar"
```

---

### Task 9: Section components

**Files:**
- Create: `yehub-fe/src/pages/cost/CostExplorerPage/components/CostSummaryCards.tsx`
- Create: `yehub-fe/src/pages/cost/CostExplorerPage/components/CostOverTimeChart.tsx`
- Create: `yehub-fe/src/pages/cost/CostExplorerPage/components/CostByPlatformChart.tsx`
- Create: `yehub-fe/src/pages/cost/CostExplorerPage/components/CostBreakdownTable.tsx`
- Create: `yehub-fe/src/pages/cost/CostExplorerPage/components/CostByJobTypeCards.tsx`
- Create: `yehub-fe/src/pages/cost/CostExplorerPage/components/RecentRunsTable.tsx`

These mirror `CampaignSpendingTab`'s visual patterns. `UNATTRIBUTED` renders as a muted "Unattributed".

- [ ] **Step 1: Summary cards**

```tsx
// yehub-fe/src/pages/cost/CostExplorerPage/components/CostSummaryCards.tsx
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatNumber, formatUsd } from '@/lib/format'
import type { CostOverview } from '@/api/cost'

export function CostSummaryCards({ summary }: { summary: CostOverview['summary'] }) {
  const cards = [
    { label: 'Total spend', value: formatUsd(summary.total_usd) },
    { label: 'Total runs', value: formatNumber(summary.run_count) },
    { label: 'Cost finalized', value: formatNumber(summary.finalized_count) },
    { label: 'Pending cost', value: formatNumber(summary.pending_count) },
  ]
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {cards.map((c) => (
        <Card key={c.label}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">{c.label}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{c.value}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
```

- [ ] **Step 2: Spend-over-time chart**

```tsx
// yehub-fe/src/pages/cost/CostExplorerPage/components/CostOverTimeChart.tsx
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart'
import { formatUsd } from '@/lib/format'
import type { CostOverview } from '@/api/cost'
import type { CommentVolumeGranularity } from '@/api/campaigns'

const chartConfig: ChartConfig = { usd: { label: 'Spend', color: 'var(--chart-1)' } }

function formatTick(date: string, granularity: CommentVolumeGranularity): string {
  const label = new Date(`${date}T00:00:00.000Z`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  })
  return granularity === 'week' ? `Wk ${label}` : label
}

export function CostOverTimeChart({ series }: { series: CostOverview['series'] }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">Spend over time</CardTitle>
      </CardHeader>
      <CardContent>
        {series.points.length === 0 ? (
          <p className="flex h-[250px] items-center justify-center text-sm text-muted-foreground">No spend yet</p>
        ) : (
          <ChartContainer config={chartConfig} className="h-[250px] w-full">
            <BarChart data={series.points} margin={{ left: 4, right: 12, top: 8 }}>
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey="date"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                minTickGap={24}
                tickFormatter={(value: string) => formatTick(value, series.granularity)}
              />
              <YAxis tickLine={false} axisLine={false} width={48} tickFormatter={(v: number) => formatUsd(v)} />
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    nameKey="usd"
                    labelFormatter={(value) => formatTick(String(value), series.granularity)}
                    formatter={(value) => formatUsd(Number(value))}
                  />
                }
              />
              <Bar dataKey="usd" fill="var(--color-usd)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  )
}
```

- [ ] **Step 3: By-platform chart**

```tsx
// yehub-fe/src/pages/cost/CostExplorerPage/components/CostByPlatformChart.tsx
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart'
import { formatUsd } from '@/lib/format'
import type { CostOverview } from '@/api/cost'

const chartConfig: ChartConfig = { total_usd: { label: 'Spend', color: 'var(--chart-2)' } }

function platformLabel(platform: string): string {
  if (platform === 'UNATTRIBUTED') return 'Unattributed'
  return platform.charAt(0) + platform.slice(1).toLowerCase()
}

export function CostByPlatformChart({ data }: { data: CostOverview['by_platform'] }) {
  const rows = data.map((d) => ({ ...d, label: platformLabel(d.platform) }))
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">Spend by platform</CardTitle>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="flex h-[250px] items-center justify-center text-sm text-muted-foreground">No spend yet</p>
        ) : (
          <ChartContainer config={chartConfig} className="h-[250px] w-full">
            <BarChart data={rows} margin={{ left: 4, right: 12, top: 8 }}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} />
              <YAxis tickLine={false} axisLine={false} width={48} tickFormatter={(v: number) => formatUsd(v)} />
              <ChartTooltip
                content={<ChartTooltipContent nameKey="total_usd" formatter={(value) => formatUsd(Number(value))} />}
              />
              <Bar dataKey="total_usd" fill="var(--color-total_usd)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  )
}
```

- [ ] **Step 4: Breakdown table (project + campaign)**

```tsx
// yehub-fe/src/pages/cost/CostExplorerPage/components/CostBreakdownTable.tsx
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { formatUsd } from '@/lib/format'

interface Row {
  key: string
  primary: string
  secondary?: string
  runCount: number
  totalUsd: number
}

function Muted({ value }: { value: string }) {
  return value === 'UNATTRIBUTED' ? <span className="text-muted-foreground">Unattributed</span> : <>{value}</>
}

export function CostBreakdownTable({
  title,
  primaryHeader,
  secondaryHeader,
  rows,
}: {
  title: string
  primaryHeader: string
  secondaryHeader?: string
  rows: Row[]
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">No data yet</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{primaryHeader}</TableHead>
                {secondaryHeader && <TableHead>{secondaryHeader}</TableHead>}
                <TableHead className="text-right">Runs</TableHead>
                <TableHead className="text-right">Cost</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.key}>
                  <TableCell className="max-w-[220px] truncate">
                    <Muted value={r.primary} />
                  </TableCell>
                  {secondaryHeader && (
                    <TableCell className="max-w-[180px] truncate text-muted-foreground">
                      <Muted value={r.secondary ?? ''} />
                    </TableCell>
                  )}
                  <TableCell className="text-right text-muted-foreground">{r.runCount}</TableCell>
                  <TableCell className="text-right">{formatUsd(r.totalUsd)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  )
}
```

- [ ] **Step 5: By-job-type cards**

```tsx
// yehub-fe/src/pages/cost/CostExplorerPage/components/CostByJobTypeCards.tsx
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatUsd } from '@/lib/format'
import { jobTypeLabel } from '@/lib/apify'
import type { CostOverview } from '@/api/cost'

export function CostByJobTypeCards({ data }: { data: CostOverview['by_job_type'] }) {
  if (data.length === 0) return null
  return (
    <div className="grid gap-4 md:grid-cols-3">
      {data.map((b) => (
        <Card key={b.job_type}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">{jobTypeLabel(b.job_type)}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xl font-bold">{formatUsd(b.total_usd)}</p>
            <p className="text-xs text-muted-foreground">
              {b.run_count} run{b.run_count === 1 ? '' : 's'}
            </p>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
```

- [ ] **Step 6: Recent runs table**

```tsx
// yehub-fe/src/pages/cost/CostExplorerPage/components/RecentRunsTable.tsx
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { formatUsd, formatRelativeTime } from '@/lib/format'
import { jobTypeLabel } from '@/lib/apify'
import { RunStatusBadge } from '@/components/common/RunStatusBadge'
import type { CostOverview } from '@/api/cost'

export function RecentRunsTable({ runs }: { runs: CostOverview['recent_runs'] }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">Recent runs</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Type</TableHead>
              <TableHead>Target</TableHead>
              <TableHead>Project</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>When</TableHead>
              <TableHead className="text-right">Cost</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {runs.map((run) => (
              <TableRow key={run.id}>
                <TableCell>{jobTypeLabel(run.job_type)}</TableCell>
                <TableCell className="max-w-[180px] truncate">{run.label ?? '—'}</TableCell>
                <TableCell className="max-w-[140px] truncate text-muted-foreground">
                  {run.project_name === 'UNATTRIBUTED' ? 'Unattributed' : run.project_name}
                </TableCell>
                <TableCell>
                  <RunStatusBadge status={run.status} />
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {run.started_at ? formatRelativeTime(run.started_at) : '—'}
                </TableCell>
                <TableCell className="text-right">
                  {run.usage_finalized && run.usage_total_usd !== null ? (
                    formatUsd(run.usage_total_usd)
                  ) : (
                    <span className="text-muted-foreground">pending</span>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}
```

- [ ] **Step 7: Verify build**

Run: `cd yehub-fe && pnpm build`
Expected: No errors.

- [ ] **Step 8: Commit**

```bash
git add yehub-fe/src/pages/cost/CostExplorerPage/components/
git commit -m "feat(fe): add Cost Explorer section components"
```

---

### Task 10: Page shell, route, sidebar

**Files:**
- Create: `yehub-fe/src/pages/cost/CostExplorerPage/index.tsx`
- Modify: `yehub-fe/src/router.tsx`
- Modify: `yehub-fe/src/components/app-sidebar.tsx`

- [ ] **Step 1: Write the page**

```tsx
// yehub-fe/src/pages/cost/CostExplorerPage/index.tsx
import { PageWrapper } from '@/components/common/PageWrapper'
import { PageHeader } from '@/components/common/PageHeader'
import { Skeleton } from '@/components/ui/skeleton'
import { useCostExplorer } from './use-cost-explorer'
import { useCostFilterOptions } from './use-cost-filter-options'
import { CostFilterBar } from './components/CostFilterBar'
import { CostSummaryCards } from './components/CostSummaryCards'
import { CostOverTimeChart } from './components/CostOverTimeChart'
import { CostByPlatformChart } from './components/CostByPlatformChart'
import { CostBreakdownTable } from './components/CostBreakdownTable'
import { CostByJobTypeCards } from './components/CostByJobTypeCards'
import { RecentRunsTable } from './components/RecentRunsTable'

export function CostExplorerPage() {
  const { filters, setFilters, data, isPending, isError } = useCostExplorer()
  const { data: options } = useCostFilterOptions()

  return (
    <PageWrapper>
      <PageHeader title="Cost Explorer" description="Apify spend across all projects and campaigns." />
      <CostFilterBar filters={filters} onChange={setFilters} options={options} />

      {isPending ? (
        <div className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-24 w-full" />
            ))}
          </div>
          <Skeleton className="h-[250px] w-full" />
        </div>
      ) : isError || !data ? (
        <p className="py-12 text-center text-sm text-muted-foreground">Failed to load cost data.</p>
      ) : data.summary.run_count === 0 ? (
        <p className="py-12 text-center text-sm text-muted-foreground">No Apify runs in the selected range.</p>
      ) : (
        <div className="space-y-6">
          <CostSummaryCards summary={data.summary} />
          <CostByJobTypeCards data={data.by_job_type} />
          <CostOverTimeChart series={data.series} />
          <CostByPlatformChart data={data.by_platform} />
          <div className="grid gap-4 lg:grid-cols-2">
            <CostBreakdownTable
              title="Spend by project"
              primaryHeader="Project"
              rows={data.by_project.map((p) => ({
                key: p.project_id ?? 'unattributed',
                primary: p.project_name,
                runCount: p.run_count,
                totalUsd: p.total_usd,
              }))}
            />
            <CostBreakdownTable
              title="Spend by campaign"
              primaryHeader="Campaign"
              secondaryHeader="Project"
              rows={data.by_campaign.map((c) => ({
                key: c.campaign_id ?? 'unattributed',
                primary: c.campaign_name,
                secondary: c.project_name,
                runCount: c.run_count,
                totalUsd: c.total_usd,
              }))}
            />
          </div>
          <RecentRunsTable runs={data.recent_runs} />
        </div>
      )}
    </PageWrapper>
  )
}
```

- [ ] **Step 2: Register the lazy route**

In `yehub-fe/src/router.tsx`:
1. Add the lazy import alongside the other admin page imports (near line 27):

```tsx
const CostExplorerPage = lazy(() =>
  import('@/pages/cost/CostExplorerPage').then((m) => ({ default: m.CostExplorerPage })),
)
```

2. Add a route inside the `<AdminRoute>` `children` array (next to the `USERS` route):

```tsx
{
  path: ROUTES.COST,
  element: (
    <SuspenseWrapper>
      <CostExplorerPage />
    </SuspenseWrapper>
  ),
},
```

- [ ] **Step 3: Add the sidebar item**

In `yehub-fe/src/components/app-sidebar.tsx`:
1. Add `WalletIcon` to the existing `lucide-react` import.
2. Inside the `{isAdmin && (...)}` region (next to the Users item), add:

```tsx
<SidebarMenuItem>
  <SidebarMenuButton
    tooltip="Cost Explorer"
    isActive={isActive(ROUTES.COST)}
    render={<NavLink to={ROUTES.COST} />}
    onClick={closeMobileSidebar}
  >
    <WalletIcon />
    <span>Cost Explorer</span>
  </SidebarMenuButton>
</SidebarMenuItem>
```

> If the `isAdmin` block currently wraps only the single Users `SidebarMenuItem`, wrap both items in a fragment (`<>...</>`) so both render under the admin gate.

- [ ] **Step 4: Verify lint + build**

Run: `cd yehub-fe && pnpm lint && pnpm build`
Expected: No errors.

- [ ] **Step 5: Commit**

```bash
git add yehub-fe/src/pages/cost/CostExplorerPage/index.tsx yehub-fe/src/router.tsx yehub-fe/src/components/app-sidebar.tsx
git commit -m "feat(fe): add Cost Explorer page, route, and sidebar entry"
```

---

### Task 11: Final verification

- [ ] **Step 1: Backend tests**

Run: `cd yehub-be && pnpm test`
Expected: All suites pass (including the new `cost.*` specs).

- [ ] **Step 2: Frontend lint, build, format**

Run: `cd yehub-fe && pnpm lint && pnpm build && pnpm exec prettier --check "src/**/*.{ts,tsx}"`
Expected: No errors. (Prettier `--check` matters because CI's Format check is separate from ESLint — per project memory. If it reports issues, run `pnpm exec prettier --write` on the listed files and amend.)

- [ ] **Step 3: Manual smoke test (optional but recommended)**

Start backend (`pnpm start:dev`) + frontend (`pnpm dev`), log in as an admin, open `/cost`. Verify: default range is last 30 days; charts/tables render; changing a project prunes campaign options; filters persist in the URL on refresh; a non-admin cannot see the sidebar item or reach the route.

---

## Notes for the implementer

- **No Prisma schema change** — `ApifyRun` already has every column used. Do not create a migration.
- **Pre-existing backend build/lint failures** from a stale generated Prisma client are documented in project memory; `pnpm test` is the reliable green signal. Regenerate via Node 22.12.0 (`nvm`) + `pnpm prisma:generate` only if a test fails on a missing Prisma type.
- **Enum cast** `::"Platform"` (Task 2) — confirm the exact Postgres enum type name against the schema/migrations before relying on it; adjust if the generated name differs.
- **No new e2e tests** (standing user preference).
