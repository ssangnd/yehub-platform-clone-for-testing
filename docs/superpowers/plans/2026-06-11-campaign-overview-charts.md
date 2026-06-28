# Campaign Overview Charts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Comment Volume Trend line chart and a Platform Distribution pie chart to the Campaign Overview tab, below the existing statistic cards, backed by two new analytics endpoints.

**Architecture:** Two new read endpoints on the campaigns module (`comments-by-date`, `comments-by-platform`) compute aggregates with Prisma (`$queryRaw` for date bucketing, `groupBy` for platform). A pure helper (`campaign-analytics.ts`) handles granularity selection and zero-filling and is unit-tested in isolation. On the frontend, two self-contained Recharts components (each owning its own React Query call) render inside the existing shadcn `ChartContainer`.

**Tech Stack:** NestJS 11 + Prisma 7 (backend), React 19 + TanStack Query v5 + Recharts 3.8 + shadcn chart wrapper (frontend). pnpm everywhere.

**Spec:** `docs/superpowers/specs/2026-06-11-campaign-overview-charts-design.md`

---

## File Structure

**Backend (`yehub-be/`):**
- Create: `src/campaigns/campaign-analytics.ts` — pure granularity + zero-fill helpers (no Prisma).
- Create: `src/campaigns/campaign-analytics.spec.ts` — unit tests for the helper.
- Modify: `src/campaigns/campaigns.service.ts` — add `getCommentVolume`, `getCommentsByPlatform`.
- Modify: `src/campaigns/campaigns.controller.ts` — add the two routes.

**Frontend (`yehub-fe/`):**
- Modify: `src/api/campaigns.ts` — add API functions + response types.
- Modify: `src/lib/constants/query-keys.ts` — add two query keys.
- Modify: `src/lib/constants/platforms.ts` — export brand color map for chart slices.
- Create: `src/pages/campaigns/CampaignDetailPage/components/CommentVolumeChart.tsx`.
- Create: `src/pages/campaigns/CampaignDetailPage/components/PlatformDistributionChart.tsx`.
- Modify: `src/pages/campaigns/CampaignDetailPage/components/CampaignOverviewTab.tsx` — render the charts row.

**Note on env:** the backend Prisma client must be generated for builds/tests. Per project notes, `yehub-be` build/lint have a pre-existing failure; `pnpm test` is the reliable signal. Generate the client with Node 22.12.0 (`nvm use 22.12.0` then `pnpm prisma:generate`) if tests complain about a stale client.

---

## Task 1: Pure analytics helper (granularity + zero-fill)

**Files:**
- Create: `yehub-be/src/campaigns/campaign-analytics.ts`
- Test: `yehub-be/src/campaigns/campaign-analytics.spec.ts`

- [ ] **Step 1: Write the failing tests**

Create `yehub-be/src/campaigns/campaign-analytics.spec.ts`:

```ts
import {
  pickGranularity,
  zeroFillBuckets,
  type VolumeBucket,
} from './campaign-analytics';

const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

describe('pickGranularity', () => {
  it('uses day for a span of exactly 90 days', () => {
    expect(pickGranularity(d('2026-01-01'), d('2026-04-01'))).toBe('day'); // 90 days
  });

  it('uses week when the span exceeds 90 days', () => {
    expect(pickGranularity(d('2026-01-01'), d('2026-04-02'))).toBe('week'); // 91 days
  });

  it('uses day for a single-day span', () => {
    expect(pickGranularity(d('2026-01-01'), d('2026-01-01'))).toBe('day');
  });
});

describe('zeroFillBuckets (day)', () => {
  it('fills missing days with zero and keeps existing counts', () => {
    const rows = [{ date: d('2026-01-02'), count: 5 }];
    const result = zeroFillBuckets(rows, d('2026-01-01'), d('2026-01-03'), 'day');
    expect(result).toEqual<VolumeBucket[]>([
      { date: '2026-01-01', count: 0 },
      { date: '2026-01-02', count: 5 },
      { date: '2026-01-03', count: 0 },
    ]);
  });
});

describe('zeroFillBuckets (week)', () => {
  it('aligns buckets to Monday (matching Postgres date_trunc) and zero-fills', () => {
    // 2026-01-05 is a Monday; 2026-01-12 is the next Monday.
    const rows = [{ date: d('2026-01-12'), count: 3 }];
    const result = zeroFillBuckets(rows, d('2026-01-07'), d('2026-01-15'), 'week');
    expect(result).toEqual<VolumeBucket[]>([
      { date: '2026-01-05', count: 0 },
      { date: '2026-01-12', count: 3 },
    ]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd yehub-be && pnpm test -- campaign-analytics`
Expected: FAIL — `Cannot find module './campaign-analytics'`.

- [ ] **Step 3: Write the implementation**

Create `yehub-be/src/campaigns/campaign-analytics.ts`:

```ts
// Pure date-bucketing helpers for campaign comment-volume analytics, kept free of
// Prisma so they are trivially unit-testable (mirrors campaign-metrics.ts).
export type Granularity = 'day' | 'week';

export interface VolumeBucket {
  date: string; // ISO 'YYYY-MM-DD' bucket start (UTC)
  count: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const DAILY_MAX_DAYS = 90;

// Daily buckets up to a 90-day span; weekly beyond that to keep the chart readable.
export function pickGranularity(from: Date, to: Date): Granularity {
  const spanDays = Math.floor((to.getTime() - from.getTime()) / DAY_MS);
  return spanDays > DAILY_MAX_DAYS ? 'week' : 'day';
}

function startOfDayUTC(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
}

// Postgres date_trunc('week', ...) starts weeks on Monday; match that here.
function startOfWeekUTC(date: Date): Date {
  const day = startOfDayUTC(date);
  const mondayOffset = (day.getUTCDay() + 6) % 7;
  day.setUTCDate(day.getUTCDate() - mondayOffset);
  return day;
}

function bucketStart(date: Date, granularity: Granularity): Date {
  return granularity === 'week' ? startOfWeekUTC(date) : startOfDayUTC(date);
}

function toISODate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

// Produces a dense, ordered series across [from, to] with every bucket present.
export function zeroFillBuckets(
  rows: { date: Date; count: number }[],
  from: Date,
  to: Date,
  granularity: Granularity,
): VolumeBucket[] {
  const counts = new Map<string, number>();
  for (const row of rows) {
    counts.set(toISODate(bucketStart(row.date, granularity)), row.count);
  }

  const result: VolumeBucket[] = [];
  const cursor = bucketStart(from, granularity);
  const end = bucketStart(to, granularity);
  while (cursor.getTime() <= end.getTime()) {
    const key = toISODate(cursor);
    result.push({ date: key, count: counts.get(key) ?? 0 });
    if (granularity === 'week') {
      cursor.setUTCDate(cursor.getUTCDate() + 7);
    } else {
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
  }
  return result;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd yehub-be && pnpm test -- campaign-analytics`
Expected: PASS (all 5 tests green).

- [ ] **Step 5: Commit**

```bash
git add yehub-be/src/campaigns/campaign-analytics.ts yehub-be/src/campaigns/campaign-analytics.spec.ts
git commit -m "feat(be): add pure campaign comment-volume analytics helper"
```

---

## Task 2: Service methods (`getCommentVolume`, `getCommentsByPlatform`)

**Files:**
- Modify: `yehub-be/src/campaigns/campaigns.service.ts`

There is no isolated unit test here (the logic depends on `$queryRaw`/`groupBy`); the pure
math is already covered by Task 1, and this task is verified by build + the manual check in
Task 7. Keep the methods thin so all branching lives in the tested helper.

- [ ] **Step 1: Add the imports**

At the top of `campaigns.service.ts`, add to the existing import block:

```ts
import { Prisma } from '../../generated/prisma/client';
import {
  pickGranularity,
  zeroFillBuckets,
  type Granularity,
} from './campaign-analytics';
```

(If `Prisma` is already imported from that path, merge — do not duplicate the import.)

- [ ] **Step 2: Add `getCommentVolume` after `getMetric`**

Insert this method directly after the existing `getMetric` method (around line 237):

```ts
  // Daily (or weekly, for long campaigns) total comment counts across the
  // campaign's active window, zero-filled so the trend line is continuous.
  async getCommentVolume(id: string) {
    const campaign = await this.prisma.campaign.findUnique({
      where: { id },
      select: {
        id: true,
        deleted_at: true,
        start_date: true,
        end_date: true,
        created_at: true,
      },
    });
    if (!campaign || campaign.deleted_at) {
      throw new NotFoundException('Campaign not found');
    }

    const from = campaign.start_date ?? campaign.created_at;
    const to = campaign.end_date ?? new Date();
    const granularity: Granularity = pickGranularity(from, to);

    // bucket keyword is from our own enum, never user input — safe to inline.
    const rows = await this.prisma.$queryRaw<
      { bucket: Date; count: bigint }[]
    >(Prisma.sql`
      SELECT date_trunc(${Prisma.raw(`'${granularity}'`)}, COALESCE(c.platform_created_at, c.created_at)) AS bucket,
             count(*)::bigint AS count
      FROM "Comment" c
      JOIN "Post" p ON p.id = c.post_id
      WHERE p.campaign_id = ${id}::uuid
        AND p.deleted_at IS NULL
        AND COALESCE(c.platform_created_at, c.created_at) BETWEEN ${from} AND ${to}
      GROUP BY bucket
      ORDER BY bucket ASC
    `);

    const points = zeroFillBuckets(
      rows.map((r) => ({ date: r.bucket, count: Number(r.count) })),
      from,
      to,
      granularity,
    );

    return { granularity, points };
  }
```

> Verify the actual table names (`"Comment"`, `"Post"`) and column names
> (`platform_created_at`, `created_at`, `post_id`, `campaign_id`, `deleted_at`) against
> `prisma/schema.prisma` `@@map`/`@map` directives before running. The models in this repo
> are PascalCase with snake_case columns; adjust the raw SQL if a `@@map` renames them.

- [ ] **Step 3: Add `getCommentsByPlatform` after `getCommentVolume`**

```ts
  // Comment counts grouped by platform for the distribution pie chart.
  async getCommentsByPlatform(id: string) {
    const campaign = await this.prisma.campaign.findUnique({
      where: { id },
      select: { id: true, deleted_at: true },
    });
    if (!campaign || campaign.deleted_at) {
      throw new NotFoundException('Campaign not found');
    }

    const grouped = await this.prisma.comment.groupBy({
      by: ['platform'],
      _count: { _all: true },
      where: { post: { campaign_id: id, deleted_at: null } },
    });

    const distribution = grouped
      .map((g) => ({ platform: g.platform, count: g._count._all }))
      .filter((d) => d.count > 0)
      .sort((a, b) => b.count - a.count);

    return { distribution };
  }
```

- [ ] **Step 4: Verify it compiles**

Run: `cd yehub-be && pnpm build`
Expected: TypeScript compiles. (If the build fails only with the known pre-existing error
unrelated to these files, that is acceptable — confirm the error is not in
`campaigns.service.ts`.)

- [ ] **Step 5: Commit**

```bash
git add yehub-be/src/campaigns/campaigns.service.ts
git commit -m "feat(be): add campaign comment-volume and platform-distribution queries"
```

---

## Task 3: Controller routes

**Files:**
- Modify: `yehub-be/src/campaigns/campaigns.controller.ts`

- [ ] **Step 1: Add the two routes after `getMetric`**

Insert directly after the existing `getMetric` handler (after line 89):

```ts
  @Get('campaigns/:id/analytics/comments-by-date')
  @UseGuards(CampaignRolesGuard)
  @ApiOperation({ summary: 'Comment volume over the campaign window (time series)' })
  getCommentVolume(@Param('id', ParseUUIDPipe) id: string) {
    return this.campaignsService.getCommentVolume(id);
  }

  @Get('campaigns/:id/analytics/comments-by-platform')
  @UseGuards(CampaignRolesGuard)
  @ApiOperation({ summary: 'Comment counts grouped by platform' })
  getCommentsByPlatform(@Param('id', ParseUUIDPipe) id: string) {
    return this.campaignsService.getCommentsByPlatform(id);
  }
```

(`@Get`, `@UseGuards`, `@Param`, `ParseUUIDPipe`, `@ApiOperation`, and `CampaignRolesGuard`
are already imported in this file.)

- [ ] **Step 2: Verify it compiles**

Run: `cd yehub-be && pnpm build`
Expected: compiles (modulo the known pre-existing error, if any — confirm it is not in this file).

- [ ] **Step 3: Commit**

```bash
git add yehub-be/src/campaigns/campaigns.controller.ts
git commit -m "feat(be): expose campaign analytics routes for charts"
```

---

## Task 4: Frontend API, types, query keys, platform colors

**Files:**
- Modify: `yehub-fe/src/api/campaigns.ts`
- Modify: `yehub-fe/src/lib/constants/query-keys.ts`
- Modify: `yehub-fe/src/lib/constants/platforms.ts`

- [ ] **Step 1: Add response types + API functions in `campaigns.ts`**

Near the other exported types in `src/api/campaigns.ts`, add:

```ts
export type Platform = 'FACEBOOK' | 'INSTAGRAM' | 'TIKTOK' | 'YOUTUBE' | 'THREADS'

export type CommentVolumeGranularity = 'day' | 'week'

export type CampaignCommentVolume = {
  granularity: CommentVolumeGranularity
  points: { date: string; count: number }[]
}

export type CampaignPlatformDistribution = {
  distribution: { platform: Platform; count: number }[]
}
```

> If `Platform` is already declared/imported in this file, reuse it instead of redeclaring.

Then inside the `campaignsApi` object, directly after the existing `getMetric` entry:

```ts
  getCommentVolume: (id: string) =>
    apiClient
      .get<CampaignCommentVolume>(`/campaigns/${id}/analytics/comments-by-date`)
      .then((r) => r.data),

  getCommentsByPlatform: (id: string) =>
    apiClient
      .get<CampaignPlatformDistribution>(`/campaigns/${id}/analytics/comments-by-platform`)
      .then((r) => r.data),
```

- [ ] **Step 2: Add query keys in `query-keys.ts`**

After the `campaignMetric` entry (line 50):

```ts
  campaignCommentVolume: (campaignId: string) => ['campaign-comment-volume', campaignId] as const,

  campaignPlatformDistribution: (campaignId: string) =>
    ['campaign-platform-distribution', campaignId] as const,
```

- [ ] **Step 3: Add the brand color map in `platforms.ts`**

Append to `src/lib/constants/platforms.ts` (brand hex values mirror those in
`components/common/PlatformBadge.tsx`):

```ts
export const PLATFORM_BRAND: Record<string, { label: string; color: string }> = {
  FACEBOOK: { label: 'Facebook', color: '#1877F2' },
  INSTAGRAM: { label: 'Instagram', color: '#C13584' },
  TIKTOK: { label: 'TikTok', color: '#69C9D0' },
  YOUTUBE: { label: 'YouTube', color: '#FF0000' },
  THREADS: { label: 'Threads', color: '#000000' },
}
```

- [ ] **Step 4: Verify it compiles**

Run: `cd yehub-fe && pnpm build`
Expected: builds cleanly.

- [ ] **Step 5: Commit**

```bash
git add yehub-fe/src/api/campaigns.ts yehub-fe/src/lib/constants/query-keys.ts yehub-fe/src/lib/constants/platforms.ts
git commit -m "feat(fe): add campaign analytics api, query keys, platform colors"
```

---

## Task 5: Platform Distribution pie chart

**Files:**
- Create: `yehub-fe/src/pages/campaigns/CampaignDetailPage/components/PlatformDistributionChart.tsx`

- [ ] **Step 1: Create the component**

```tsx
import { useQuery } from '@tanstack/react-query'
import { Cell, Pie, PieChart } from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart'
import { campaignsApi } from '@/api/campaigns'
import { queryKeys } from '@/lib/constants/query-keys'
import { PLATFORM_BRAND } from '@/lib/constants/platforms'
import { cn } from '@/lib/utils'

export function PlatformDistributionChart({
  campaignId,
  className,
}: {
  campaignId: string
  className?: string
}) {
  const { data, isPending, isError } = useQuery({
    queryKey: queryKeys.campaignPlatformDistribution(campaignId),
    queryFn: () => campaignsApi.getCommentsByPlatform(campaignId),
  })

  const distribution = data?.distribution ?? []

  const chartConfig: ChartConfig = Object.fromEntries(
    distribution.map((d) => [
      d.platform,
      {
        label: PLATFORM_BRAND[d.platform]?.label ?? d.platform,
        color: PLATFORM_BRAND[d.platform]?.color ?? 'var(--chart-1)',
      },
    ]),
  )

  return (
    <Card className={cn(className)}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          Comments by platform
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isPending ? (
          <Skeleton className="h-[250px] w-full" />
        ) : isError ? (
          <p className="flex h-[250px] items-center justify-center text-sm text-muted-foreground">
            Failed to load
          </p>
        ) : distribution.length === 0 ? (
          <p className="flex h-[250px] items-center justify-center text-sm text-muted-foreground">
            No comments yet
          </p>
        ) : (
          <ChartContainer config={chartConfig} className="mx-auto aspect-square max-h-[250px]">
            <PieChart>
              <ChartTooltip content={<ChartTooltipContent nameKey="platform" />} />
              <Pie data={distribution} dataKey="count" nameKey="platform" innerRadius={50}>
                {distribution.map((d) => (
                  <Cell
                    key={d.platform}
                    fill={PLATFORM_BRAND[d.platform]?.color ?? 'var(--chart-1)'}
                  />
                ))}
              </Pie>
              <ChartLegend content={<ChartLegendContent nameKey="platform" />} />
            </PieChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  )
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cd yehub-fe && pnpm build`
Expected: builds cleanly. (The component isn't rendered yet — this only checks types/imports.)

- [ ] **Step 3: Commit**

```bash
git add yehub-fe/src/pages/campaigns/CampaignDetailPage/components/PlatformDistributionChart.tsx
git commit -m "feat(fe): add platform distribution pie chart"
```

---

## Task 6: Comment Volume trend chart

**Files:**
- Create: `yehub-fe/src/pages/campaigns/CampaignDetailPage/components/CommentVolumeChart.tsx`

- [ ] **Step 1: Create the component**

```tsx
import { useQuery } from '@tanstack/react-query'
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart'
import { campaignsApi, type CommentVolumeGranularity } from '@/api/campaigns'
import { queryKeys } from '@/lib/constants/query-keys'
import { cn } from '@/lib/utils'

const chartConfig: ChartConfig = {
  count: { label: 'Comments', color: 'var(--chart-1)' },
}

function formatTick(date: string, granularity: CommentVolumeGranularity): string {
  const label = new Date(`${date}T00:00:00.000Z`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  })
  return granularity === 'week' ? `Wk ${label}` : label
}

export function CommentVolumeChart({
  campaignId,
  className,
}: {
  campaignId: string
  className?: string
}) {
  const { data, isPending, isError } = useQuery({
    queryKey: queryKeys.campaignCommentVolume(campaignId),
    queryFn: () => campaignsApi.getCommentVolume(campaignId),
  })

  const points = data?.points ?? []
  const granularity = data?.granularity ?? 'day'

  return (
    <Card className={cn(className)}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          Comment volume trend
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isPending ? (
          <Skeleton className="h-[250px] w-full" />
        ) : isError ? (
          <p className="flex h-[250px] items-center justify-center text-sm text-muted-foreground">
            Failed to load
          </p>
        ) : points.length === 0 ? (
          <p className="flex h-[250px] items-center justify-center text-sm text-muted-foreground">
            No comments yet
          </p>
        ) : (
          <ChartContainer config={chartConfig} className="h-[250px] w-full">
            <LineChart data={points} margin={{ left: 4, right: 12, top: 8 }}>
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey="date"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                minTickGap={24}
                tickFormatter={(value: string) => formatTick(value, granularity)}
              />
              <YAxis tickLine={false} axisLine={false} width={32} allowDecimals={false} />
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    nameKey="count"
                    labelFormatter={(value) => formatTick(String(value), granularity)}
                  />
                }
              />
              <Line
                dataKey="count"
                type="monotone"
                stroke="var(--color-count)"
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  )
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cd yehub-fe && pnpm build`
Expected: builds cleanly.

- [ ] **Step 3: Commit**

```bash
git add yehub-fe/src/pages/campaigns/CampaignDetailPage/components/CommentVolumeChart.tsx
git commit -m "feat(fe): add comment volume trend line chart"
```

---

## Task 7: Wire charts into the Overview tab

**Files:**
- Modify: `yehub-fe/src/pages/campaigns/CampaignDetailPage/components/CampaignOverviewTab.tsx`

- [ ] **Step 1: Add the imports**

At the top of `CampaignOverviewTab.tsx`, after the existing imports:

```tsx
import { CommentVolumeChart } from './CommentVolumeChart'
import { PlatformDistributionChart } from './PlatformDistributionChart'
```

- [ ] **Step 2: Render the charts row**

Replace the existing `return (...)` block of `CampaignOverviewTab` with:

```tsx
  return (
    <div className="space-y-6">
      {metrics.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {metrics.map((metric) => (
            <MetricCard key={metric} campaignId={campaign.id} metric={metric} />
          ))}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <CommentVolumeChart campaignId={campaign.id} className="lg:col-span-2" />
        <PlatformDistributionChart campaignId={campaign.id} className="lg:col-span-1" />
      </div>
    </div>
  )
```

- [ ] **Step 3: Lint and build**

Run: `cd yehub-fe && pnpm lint && pnpm build`
Expected: no lint errors, build succeeds.

- [ ] **Step 4: Manual verification in the dev server**

Start backend + frontend (`pnpm start:dev` in `yehub-be`, `pnpm dev` in `yehub-fe`; ensure
`docker compose up -d` is running). Open a campaign's Overview tab and confirm:
- Both charts render below the statistic cards.
- On a wide viewport the trend chart spans two columns and the pie spans one; they stack on mobile.
- A campaign with no comments shows the "No comments yet" empty state in both charts.
- The trend line is continuous (no gaps) across the campaign window; tooltip dates read correctly.
- Pie slices use brand colors with a platform legend.

- [ ] **Step 5: Commit**

```bash
git add yehub-fe/src/pages/campaigns/CampaignDetailPage/components/CampaignOverviewTab.tsx
git commit -m "feat(fe): render analytics charts on campaign overview tab"
```

---

## Self-Review Notes

- **Spec coverage:** comments-by-date endpoint (Tasks 2–3), comments-by-platform endpoint
  (Tasks 2–3), granularity auto-switch (Task 1 `pickGranularity`), zero-fill (Task 1),
  range fallback `start_date ?? created_at` → `end_date ?? now` (Task 2), two FE query keys
  (Task 4), two self-contained chart components with loading/error/empty states (Tasks 5–6),
  2-col/1-col layout (Task 7), no new e2e tests. All covered.
- **Type consistency:** `{ granularity, points }` / `{ distribution }` shapes match between
  backend service returns (Task 2), FE types `CampaignCommentVolume` / `CampaignPlatformDistribution`
  (Task 4), and component usage (Tasks 5–6). `pickGranularity`/`zeroFillBuckets`/`VolumeBucket`
  names are consistent between helper, tests, and service.
- **Known environment caveat:** `yehub-be` build/lint may fail on a pre-existing issue
  unrelated to these files; rely on `pnpm test` for the helper and confirm any build error is
  not in the files this plan touches.
```
