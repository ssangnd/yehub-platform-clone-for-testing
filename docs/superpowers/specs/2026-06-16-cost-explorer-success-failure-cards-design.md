# Cost Explorer — Replace "Cost finalized" / "Pending cost" cards with "Success" / "Failure"

Date: 2026-06-16

## Problem

The Cost Explorer summary cards currently show "Cost finalized" and "Pending cost",
derived from `apify_runs.usage_finalized`. These describe cost-settlement state, which
is less actionable than run outcomes. We want the two cards to show how many Apify runs
**succeeded** vs **failed** in the selected range/filters.

## Scope

- Cost Explorer endpoint only (`yehub-be/src/cost/cost.service.ts`).
- The campaign-level cost summary in `campaigns.service.ts` is a separate endpoint and is
  **not** in scope.

## Design

### Backend — `cost.service.ts` summary query (query #1)

Replace the `finalized_count` aggregate with two status-based counts:

- `success_count` = `COUNT(*) FILTER (WHERE r.status = 'SUCCEEDED')`
- `failure_count` = `COUNT(*) FILTER (WHERE r.status IN ('FAILED','TIMED-OUT','ABORTED'))`

Terminal Apify statuses are `SUCCEEDED`, `FAILED`, `TIMED-OUT`, `ABORTED` (see
`polling/apify.client.ts`). In-progress statuses (`RUNNING`/`READY`) are **excluded** from
both counts, so `success_count + failure_count` may be less than `run_count` while runs are
still in flight. This is intentional and accurate.

Drop `finalized_count` / `pending_count` from the returned `summary` object — no other
consumer of the cost endpoint reads them.

### Frontend

- `api/cost.ts`: in `CostOverview['summary']`, replace `finalized_count` / `pending_count`
  with `success_count` / `failure_count`.
- `CostSummaryCards.tsx`: keep "Total spend" and "Total runs"; replace the other two cards
  with "Success" (green value) and "Failure" (red value) for quick scanning.

## Testing

- `cost.service.spec.ts`: update the mocked summary row and assertions to cover a
  mixed-status fixture (a succeeded run, a failed/aborted run, and an in-progress run that is
  counted in neither).
- Frontend: card rendering is presentational; covered by type changes + manual verification.

## Out of scope

- Campaign-level cost summary (`campaigns.service.ts`).
- Any change to how `usage_finalized` is used elsewhere (e.g., recent-runs table).
