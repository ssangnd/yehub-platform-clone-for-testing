# Campaign Overview Charts — Design

**Date:** 2026-06-11
**Branch:** `worktree-campaign-dashboard`
**Status:** Approved (pending spec review)

## Goal

Add two charts to the Campaign **Overview** tab, rendered **below** the existing
statistic cards:

1. **Comment Volume Trend** — a line chart of total comments over time.
2. **Platform Distribution** — a pie chart of comments broken down by platform.

## Decisions (confirmed)

| Decision | Choice |
|----------|--------|
| Scope | Full-stack (new backend endpoints + frontend charts) |
| Trend chart shape | Single total line (not split by platform) |
| Trend time range | Campaign duration |
| Pie chart metric | Comments by platform |
| API shape | **Two separate endpoints** (not combined) |
| Granularity | **Auto**: daily buckets, switching to weekly when the range exceeds 90 days |
| Layout | Trend spans 2 columns, pie spans 1, on desktop (stacked on mobile) |

## Existing foundations

- **Recharts v3.8.1** is already installed in `yehub-fe`.
- A shadcn `chart.tsx` wrapper already exists at `yehub-fe/src/components/ui/chart.tsx`
  (`ChartContainer`, `ChartTooltip`, `ChartTooltipContent`, `ChartLegend`,
  `ChartLegendContent`) — currently unused.
- The Overview tab is `yehub-fe/src/pages/campaigns/CampaignDetailPage/components/CampaignOverviewTab.tsx`.
  Cards are fetched one-metric-per-request via `GET /campaigns/:id/metrics/:metric`.
- `Comment` has a `platform` enum field and an indexed `platform_created_at` timestamp.
  `Post` has `campaign_id` and `platform`. No analytics endpoints exist yet.
- `Platform` enum values: `FACEBOOK`, `INSTAGRAM`, `TIKTOK`, `YOUTUBE`, `THREADS`.

---

## Backend (`yehub-be/`)

### Routes

Both added to `campaigns.controller.ts`, guarded by `CampaignRolesGuard` (same as the
existing metric route — any campaign member can view, no extra `@Roles`).

```
GET /v1/campaigns/:id/analytics/comments-by-date
GET /v1/campaigns/:id/analytics/comments-by-platform
```

`:id` validated with `ParseUUIDPipe`, consistent with sibling routes.

### Response shapes

```ts
// comments-by-date
{
  granularity: 'day' | 'week',
  points: { date: string; count: number }[]   // date = ISO 'YYYY-MM-DD' bucket start, zero-filled
}

// comments-by-platform
{
  distribution: { platform: Platform; count: number }[]   // only platforms with count > 0
}
```

### Service methods (`campaigns.service.ts`)

Both first re-use the existing existence/`deleted_at` guard pattern from `getMetric`.

**`getCommentVolume(id)`**
- Time range = `[campaign.start_date ?? campaign.created_at, campaign.end_date ?? now]`.
- Granularity is chosen by the pure helper: `day` when the range is ≤ 90 days, otherwise `week`.
- A `$queryRaw` (Prisma can't truncate dates in `groupBy`) selects
  `date_trunc(<bucket>, COALESCE(c.platform_created_at, c.created_at))` and `count(*)`,
  joining `Comment c → Post p ON c.post_id = p.id`, filtered by
  `p.campaign_id = :id AND p.deleted_at IS NULL`, grouped + ordered by the truncated date.
- The pure helper then **zero-fills** every missing bucket across the range so the line is
  continuous, and formats each bucket start as `YYYY-MM-DD`.

**`getCommentsByPlatform(id)`**
- `prisma.comment.groupBy({ by: ['platform'], _count: { _all: true }, where: { post: { campaign_id: id, deleted_at: null } } })`.
- Map to `{ platform, count }`, drop zero counts, sort descending by count.

### Pure helper (`campaigns/campaign-analytics.ts`)

New file mirroring how `campaign-metrics.ts` keeps logic out of Prisma so it is trivially
testable. Exposes:

- `pickGranularity(from: Date, to: Date): 'day' | 'week'` — `week` when span > 90 days.
- `zeroFillBuckets(rows, from, to, granularity): { date: string; count: number }[]` —
  takes the raw `{ date, count }` rows from SQL and produces a dense, ordered, zero-filled
  series covering the full range.

No DTOs/query params are needed — the range is derived from the campaign itself.

---

## Frontend (`yehub-fe/`)

### API layer (`src/api/campaigns.ts`)

```ts
getCommentVolume: (id) =>
  apiClient.get<CampaignCommentVolume>(`/campaigns/${id}/analytics/comments-by-date`).then(r => r.data),
getCommentsByPlatform: (id) =>
  apiClient.get<CampaignPlatformDistribution>(`/campaigns/${id}/analytics/comments-by-platform`).then(r => r.data),
```

with exported types `CampaignCommentVolume` and `CampaignPlatformDistribution`.

### Query keys (`src/lib/constants/query-keys.ts`)

```ts
campaignCommentVolume: (id: string) => ['campaign-comment-volume', id] as const,
campaignPlatformDistribution: (id: string) => ['campaign-platform-distribution', id] as const,
```

### Components

Two new **page-only** components under
`pages/campaigns/CampaignDetailPage/components/` (per the project's colocation rules —
used by exactly one page):

- **`CommentVolumeChart.tsx`** — owns its own `useQuery` (key `campaignCommentVolume`).
  Recharts `LineChart` inside the shadcn `ChartContainer`/`ChartTooltip`. X-axis labels
  adapt to `granularity` (`MMM d` for day, `'Wk of' MMM d` for week).
- **`PlatformDistributionChart.tsx`** — owns its own `useQuery`
  (key `campaignPlatformDistribution`). Recharts `PieChart`. Slices colored from
  `--chart-1..5` via a `Platform → { label, color }` map; legend via `ChartLegendContent`.

Each chart is self-contained (its own fetch + states), consistent with the two-endpoint
decision. `useQuery` lives directly in the component since each is small and single-purpose;
extract to a co-located hook only if a component grows past the project's ~150-line guideline.

### Layout (`CampaignOverviewTab.tsx`)

Below the existing cards grid, add a charts row:

```tsx
<div className="grid gap-4 lg:grid-cols-3">
  <CommentVolumeChart campaignId={campaign.id} className="lg:col-span-2" />
  <PlatformDistributionChart campaignId={campaign.id} className="lg:col-span-1" />
</div>
```

Stacks vertically on mobile. Each chart is wrapped in a `Card` with a `CardHeader` title,
matching the statistic cards above.

### States (match `MetricCard` conventions)

- **Loading:** `Skeleton` sized to the chart area.
- **Error:** muted "—" / short error text inside the card.
- **Empty:** "No comments yet" message when the series/distribution is empty.

---

## Testing & verification

- **Backend:** unit test `campaign-analytics.ts` (`pickGranularity` boundary at 90 days;
  `zeroFillBuckets` fills gaps, preserves counts, orders correctly for both granularities),
  following the `computeCampaignMetric` test precedent. Verify with `pnpm test` — note the
  `yehub-be` build/lint has a pre-existing failure, so unit tests are the signal of correctness.
- **Frontend:** `pnpm lint` + `pnpm build`, plus manual verification in the dev server.
- **No new e2e tests.**

## Out of scope

- Splitting the trend line by platform (the pie already shows the per-platform split).
- A user-selectable date-range picker.
- Caching/polling tuning beyond React Query defaults.
- Sentiment or engagement charts.
