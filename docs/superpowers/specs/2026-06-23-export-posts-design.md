# Export Posts — Design

**Date:** 2026-06-23
**Status:** Approved
**Scope:** `yehub-be/` (export endpoint + import-header change), `yehub-fe/` (export button + API + template files)

## Summary

Add an **Export posts** feature to the campaign Posts tab. A campaign member can download
an Excel (`.xlsx`) file of the posts currently shown (honoring the active search + platform
filter). The file's KPI/target columns and `URL` column reuse the **import** header names, so
an exported file can be re-imported directly — only those columns are read on import, the rest
are ignored.

To make the round-trip headers self-explanatory, the **import contract is updated** at the same
time: the import template + parser switch from bare `Engagement/Buzz/Interaction/View` headers
to `Engagement KPI/Buzz KPI/Interaction KPI/View KPI`. This is a **breaking change** to the
import file format (old files must be re-saved with the new headers) — accepted.

## Decisions

| Decision | Choice |
|---|---|
| Shared import/export headers | `URL`, `Engagement KPI`, `Buzz KPI`, `Interaction KPI`, `View KPI` |
| Export scope | Honor the tab's current search + platform filter; all matching rows (not just current page) |
| File format | Excel `.xlsx` only |
| Achieved cells | `"85%"` (text, rounded whole percent); empty when no target/actual |
| Export visibility | Any campaign member (read-only) — matches the `findAll` guard |
| Row cap | None (campaigns realistically have hundreds; ExcelJS handles this in memory) |

## Export columns (19, in this order)

`Account, Tier, Platform, URL, Posted Date, Achieved Engagement, Achieved Buzz,
Achieved Interaction, Achieved View, Engagement KPI, Buzz KPI, Interaction KPI, View KPI,
Actual Engagement, Actual Buzz, Actual Interaction, Actual View, Actual Comment, Actual Share`

Re-import works because `URL` + the four `… KPI` columns are present; the importer ignores the
other 14 columns.

### Cell sources & formulas (per post)

Per-post metric formulas mirror `yehub-be/src/campaigns/campaign-metrics.ts`:

| Column | Source / formula |
|---|---|
| Account | linked account `display_name` ?? `username` (empty if no linked account) |
| Tier | linked account → profile → tier `name` (empty if none) |
| Platform | `post.platform` |
| URL | `post.url` (empty if null) |
| Posted Date | `post.published_at` formatted `yyyy-MM-dd HH:mm` (empty if null) |
| Actual Engagement | `likes + shares + comment_count + views` |
| Actual Buzz | `comment_count` |
| Actual Interaction | `likes + shares + comment_count` |
| Actual View | `views` |
| Actual Comment | `comment_count` |
| Actual Share | `shares` |
| Engagement/Buzz/Interaction/View KPI | `kpi_targets.{engagement,buzz,interaction,view}` |
| Achieved X | `round(actualX / kpiX * 100) + "%"` |

### "Missing → empty" rules

- **Actuals** empty when the post was never metric-polled (`last_metric_polled_at` is null);
  otherwise the number (0 is a valid polled value).
- **KPI** columns empty when `kpi_targets` is null. (When present, the importer's normalization
  guarantees all four keys exist as integers.)
- **Achieved X** empty when its actual is missing, or its KPI is missing or `0`
  (avoids divide-by-zero).
- **Posted Date** empty when `published_at` is null.
- **Account** empty when there is no linked social account; **Tier** empty when the linked
  account's profile has no tier.

### Cell types

- KPI and Actual columns → **numbers** (KPI must stay numeric so re-import's
  `Number(cell)` integer check passes).
- Achieved columns → **text** (`"85%"`).
- URL, Account, Tier, Platform, Posted Date → text.

## Architecture

### Backend

**Endpoint** — `GET /campaigns/:campaignId/posts/export?q=&platform=`
- `@UseGuards(JwtAuthGuard, CampaignRolesGuard)`, **no** `@Roles` (read-only; same access as
  `GET /campaigns/:campaignId/posts`).
- Responds with the `.xlsx` buffer, headers:
  - `Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`
  - `Content-Disposition: attachment; filename="<campaign-slug>-posts.xlsx"`

**Pure module** — `yehub-be/src/posts/posts-export.ts` (mirrors the pure/testable style of
`campaign-metrics.ts`):
- `EXPORT_COLUMNS`: ordered list of `{ header, key }`.
- `computeAchieved(actual: number | null, kpi: number | null): string` → `""` or `"NN%"`.
- `buildExportRow(post)`: takes a normalized post shape and returns the row object keyed by
  export column. Contains all the "missing → empty" logic. **Pure** — no Prisma.

**Service** — `PostsService.exportPosts(campaignId, query)`:
- Validates the campaign exists (reuse the existing not-found pattern).
- Queries **all** matching posts with the same `where` as `findAll` (campaign_id, `deleted_at: null`,
  optional `platform`, optional `q`) — **no pagination**.
- `include` socialAccountPosts → socialAccount (username, display_name) → profile → tier (name);
  also `select` `last_metric_polled_at` and the metric columns.
- Map each post through `buildExportRow`, write rows into an ExcelJS workbook (single sheet,
  header row from `EXPORT_COLUMNS`), return the `Buffer` + filename.

### Frontend

**API** — `postsApi.exportPosts(campaignId, { q?, platform? })`:
- `apiClient.get(`/campaigns/${campaignId}/posts/export`, { params, responseType: 'blob' })`.
- Returns the blob (+ filename parsed from `Content-Disposition`, fallback `posts.xlsx`).

**UI** — `CampaignPostsTab`:
- Add an **Export** button to the toolbar, visible to all viewers (read-only). Import + Add Post
  stay gated behind `canManage`.
- Button uses a `useMutation` for the download with a loading state; on success it triggers a
  browser download (anchor + object URL, same approach as `downloadTemplate` in
  `ImportPostsDialog`); on error shows a toast.
- Passes the hook's current `search` (→ `q`) and `platformFilter` (→ `platform`) so the export
  matches what the user sees.

## Import-contract change (headers)

The import currently uses `KPI_COLUMNS = ['engagement','buzz','interaction','view']` as **both**
the `kpi_targets` JSON keys **and** the expected file headers. Decouple them:

- Keep the JSON keys (`engagement/buzz/interaction/view`) — used across the app
  (`KpiTargets`, `KpiCell`, `update-post.dto`, `campaign-metrics`).
- Add a header→key map:
  ```ts
  const KPI_COLUMN_HEADERS: Record<KpiColumn, string> = {
    engagement: 'engagement kpi',
    buzz: 'buzz kpi',
    interaction: 'interaction kpi',
    view: 'view kpi',
  }
  ```
  (Headers are lowercased by `transformHeader` (CSV) and `.toLowerCase()` (xlsx), so matching is
  against the lowercased form.)
- `REQUIRED_COLUMNS` becomes `['url', 'engagement kpi', 'buzz kpi', 'interaction kpi', 'view kpi']`.
- In `parseCsvRows` / `parseXlsxRows`, read cells via `KPI_COLUMN_HEADERS[col]` instead of the
  bare key.

**Template files** — regenerate `yehub-fe/public/templates/posts-template.csv` and
`posts-template.xlsx` with the new header row:
`URL, Engagement KPI, Buzz KPI, Interaction KPI, View KPI`. The `.xlsx` is binary and must be
regenerated (small ExcelJS script).

## Testing

- **Backend (new)** — unit-test the pure `posts-export.ts`:
  - `buildExportRow` for a fully-populated post (account, tier, all metrics, KPI).
  - Missing cases: no linked account → Account/Tier empty; null `kpi_targets` → KPI + Achieved
    empty; never-polled (`last_metric_polled_at` null) → Actuals + Achieved empty; KPI `0` →
    Achieved empty (no divide-by-zero); null `published_at` → Posted Date empty.
  - `computeAchieved` rounding + `"%"`.
- **Backend (update)** — `posts.service.spec.ts` import tests switch to the new headers; add a
  case asserting old bare headers are rejected with `ERROR_INVALID_STRUCTURE`.
- Optionally a controller/e2e check that the endpoint returns a non-empty `.xlsx` with the
  expected header row (parse the buffer back with ExcelJS).

## Out of scope

- `yehub-demo` (mocked app) — its template/mocks are not updated unless requested separately.
- CSV export format (Excel-only per decision).
</content>
</invoke>
