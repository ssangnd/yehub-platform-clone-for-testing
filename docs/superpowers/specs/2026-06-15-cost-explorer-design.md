# Cost Explorer — Design

**Date:** 2026-06-15
**Status:** Approved (design)

## Summary

A new admin-only **Cost Explorer** page that aggregates Apify spend (`ApifyRun`
usage) across the whole platform, with a chart-and-summary dashboard the admin
can slice by date range, platform, campaign, and project. Complements the
existing per-campaign Spending tab (`CampaignSpendingTab`) by providing a
global, cross-project view.

## Goals

- One place for admins to see total Apify cost and what is driving it.
- Filter the whole view by: date range, platform(s), project(s), campaign(s).
- Reuse existing spend conventions (USD formatting, granularity switching,
  pending-vs-finalized handling) so numbers reconcile with the per-campaign tab.

## Non-goals

- Per-user / per-project scoped access. The page is admin-only and shows all
  data (Apify spend is an internal ops concern).
- Denormalizing platform/project onto `ApifyRun` (revisit only if query
  performance becomes a real problem — see Alternatives).
- Budgets, alerts, or cost forecasting.
- New e2e tests.

## Access & scope

- **Admin-only**, all data. Gated by the same global-role `ADMIN` guard used by
  the Users endpoints. No per-user membership filtering.

## Data model context (the key constraint)

`ApifyRun` (`apify_runs`) stores `campaign_id`, `post_id`, `social_account_id`
(all nullable, `onDelete: SetNull`) and `usage_total_usd` / `usage_finalized`.
It has **no `platform` and no `project_id` column**. Therefore:

- **Platform** is derived: `COALESCE(post.platform, socialAccount.platform)`.
- **Project** is derived: `campaign.project_id`.
- Runs not linked to a post/account → platform `UNATTRIBUTED`.
- Runs not linked to a campaign → project `UNATTRIBUTED`.

Aggregation therefore uses raw SQL with `LEFT JOIN`s rather than plain Prisma
`groupBy`.

## Backend

New module `src/cost/`: `cost.module.ts`, `cost.controller.ts`,
`cost.service.ts`, `cost.service.spec.ts`. Imported by `AppModule` (read-only;
no BullMQ processors). Admin-guarded.

### Endpoints

**`GET /v1/cost`** — the snapshot. Query DTO (class-validator):

| Param | Type | Notes |
|-------|------|-------|
| `from` | ISO date | required |
| `to` | ISO date | required; reject `from > to` with 400 |
| `platforms` | CSV of `Platform` enum | optional |
| `project_ids` | CSV of UUID | optional |
| `campaign_ids` | CSV of UUID | optional |

**`GET /v1/cost/filter-options`** — returns
`{ projects: [{ id, name }], campaigns: [{ id, name, project_id }] }` for the
cascading multi-selects (pruned/filtered client-side). Platforms come from the
static enum, no fetch.

### Aggregation strategy

All section queries share reusable `Prisma.sql` fragments — one JOIN fragment
and one WHERE fragment — so the filter logic is defined once:

```sql
FROM apify_runs r
LEFT JOIN posts p            ON p.id = r.post_id
LEFT JOIN social_accounts sa ON sa.id = r.social_account_id
LEFT JOIN campaigns c        ON c.id = r.campaign_id
WHERE COALESCE(r.started_at, r.created_at) BETWEEN :from AND :to
  -- + optional: COALESCE(p.platform, sa.platform) IN (:platforms)
  -- + optional: c.project_id IN (:project_ids)
  -- + optional: r.campaign_id IN (:campaign_ids)
```

Reuses existing `pickGranularity` / `zeroFillBuckets` helpers (from
`campaign-analytics`) for the time series.

### Response shape

```ts
{
  currency: 'USD',
  summary: { total_usd, run_count, finalized_count, pending_count },
  series: { granularity: 'day' | 'week', points: [{ date, usd }] },
  by_platform: [{ platform, run_count, total_usd }],            // incl. UNATTRIBUTED
  by_project:  [{ project_id, project_name, run_count, total_usd }],   // top 10 + UNATTRIBUTED
  by_campaign: [{ campaign_id, campaign_name, project_name, run_count, total_usd }], // top 10
  by_job_type: [{ job_type, run_count, total_usd }],
  recent_runs: [{
    id, job_type, status, started_at,
    usage_total_usd, usage_finalized,
    platform, project_name, label
  }],  // last 20
}
```

- `by_project` / `by_campaign` sorted by `total_usd` desc, capped at top 10; the
  remainder is implicitly folded into `summary.total_usd` (not shown as rows).
- Pending (non-finalized) runs contribute `0` to USD but count toward
  `run_count` / `pending_count` — consistent with `CampaignsService.getSpending`.

## Frontend

### Routing & navigation

- New route `ROUTES.COST = '/cost'` under `<AdminRoute>` in `router.tsx`.
- Sidebar item gated by `isAdmin` (next to Users), label **"Cost Explorer"**,
  Lucide icon (`WalletIcon` / `ReceiptIcon`).

### Page structure (`pages/cost/CostExplorerPage/`)

```
index.tsx                     ← page shell: filter bar + sections
use-cost-explorer.ts          ← filter state (URL-synced) + snapshot query
use-cost-filter-options.ts    ← projects/campaigns for the dropdowns
components/
  CostFilterBar.tsx           ← date range + platform/project/campaign multi-selects
  CostSummaryCards.tsx        ← total spend / runs / finalized / pending
  CostOverTimeChart.tsx       ← bar chart (recharts, ChartContainer)
  CostByPlatformChart.tsx     ← platform breakdown (pie or bar)
  CostBreakdownTable.tsx      ← by-project and by-campaign tables (sortable by cost)
  CostByJobTypeCards.tsx      ← per-job-type cost cards
  RecentRunsTable.tsx         ← last 20 runs
```

### Filter state

- Lives in the **URL** (`useSearchParams`), per the convention to prefer URL
  state over new Zustand stores — makes a filtered view shareable/bookmarkable.
- Default when no params present: **last 30 days**.
- `use-cost-explorer.ts` reads/writes params and owns the React Query, keyed on
  the full filter set.

### Cascading multi-select

- Project multi-select drives campaign options: the campaign dropdown lists only
  campaigns whose `project_id` is in the selected projects (all if none
  selected). Changing project selection prunes now-invalid campaign selections.
- Platform multi-select is the static `Platform` enum.

### Shared-code lifts (targeted refactor)

Both `CampaignSpendingTab` and the Cost Explorer need these, so lift them out of
`CampaignSpendingTab`'s local definitions:

- `JOB_TYPE_LABELS` + `jobTypeLabel` → `src/lib/apify.ts`
- `StatusBadge` → `src/components/common/RunStatusBadge.tsx`

`CampaignSpendingTab` is updated to import the shared versions.

### Component dependencies to verify during planning

- **Date-range picker** — if none exists, add via shadcn `Calendar` (range mode)
  inside a `Popover`.
- **Multi-select** — shadcn has no default; build a small `Popover` +
  checkbox-list `MultiSelect` in `components/common/`.

## Edge cases & states

- **Empty range** (no matching runs) → friendly empty state, not an error; each
  section also handles its own empty data.
- **Invalid range** (`from > to`) → 400 from the DTO; the picker also guards
  against submitting an inverted range.
- **Long ranges** → `pickGranularity` switches the series to weekly buckets.
- **Unattributed buckets** → shown explicitly as `UNATTRIBUTED` (muted
  "Unattributed" label) so breakdown totals reconcile with the summary.
- **Pending costs** → contribute `0` USD but count in `run_count` /
  `pending_count`; the pending card keeps this visible.
- **Loading** → per-section skeletons (mirrors `CampaignSpendingTab`).

## Testing

- **Backend:** `cost.service.spec.ts` covering date filtering, each filter
  dimension, cascading combinations, unattributed bucketing, granularity switch,
  and totals reconciling across sections. Verify with `pnpm test` (BE build/lint
  can fail pre-existingly from a stale Prisma client; tests are the reliable
  signal).
- **Frontend:** no new automated tests (matches current FE test culture);
  validate via `pnpm lint`, `pnpm build`, and a Prettier `--check` pass (CI
  Format check is separate from lint).
- **No new e2e tests.**

## Alternatives considered

- **Endpoint per section** (mirror `getMetric`): rejected — all sections share
  identical filters, so 5–6 requests per filter change is needless wiring and
  risks out-of-sync sections.
- **Denormalize `platform` / `project_id` onto `ApifyRun`**: rejected for now —
  requires a migration, backfill, and write-path sync with bug risk. YAGNI until
  cost-data volume makes the joins a measured bottleneck.
