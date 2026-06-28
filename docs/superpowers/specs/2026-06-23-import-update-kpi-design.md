# Import: Update KPI for Existing Posts — Design

**Date:** 2026-06-23
**Status:** Approved
**Scope:** `yehub-be/` only — `src/posts/posts.service.ts` (`bulkUpload`) + tests. No frontend, API-type, or template changes.

## Summary

Today, bulk import (`PostsService.bulkUpload`) treats a row matching an existing post
(same `platform` + `platform_post_id`) as a **failure** ("This post URL is already in the
campaign."). This change makes an existing post **update its `kpi_targets`** when the row
provides KPI values, instead of failing.

Existing posts are no longer failures. They are folded into `success_count`:
- Existing post + KPI present in the row → update `kpi_targets`; count as success.
- Existing post + no KPI in the row → leave unchanged (no-op); still count as success.

The `BulkUploadResult` shape is unchanged, so the frontend, API types, and the import
template files are untouched.

## Decisions

| Decision | Choice |
|---|---|
| Existing post + KPI present | Update `kpi_targets`, count in `success_count` |
| Existing post + no KPI in row | Leave unchanged (no-op), still count in `success_count` |
| Reporting | Folded into `success_count` — no new result field, no frontend change |
| Partial KPI on update | Replace the whole `kpi_targets` object (blank cells → 0), matching create/import normalization |
| Atomicity | Run creates + updates in a single `$transaction` (today's `createMany` is non-transactional — small improvement) |
| URL on existing post | Not changed — only `kpi_targets` is updated |
| Polling | KPI changes do not affect polling; scheduling fires only for newly created posts (unchanged) |
| Completed campaign | Whole upload still rejected up front (unchanged) |

## Definition of "KPI present"

Reuse the parser's existing normalization: `row.kpi_targets` is `null` when every KPI cell in
the row is blank, and otherwise an object `{ engagement, buzz, interaction, view }` with blank
cells already defaulted to `0`. So:
- "KPI present" ⇔ `row.kpi_targets !== null`.
- When present, the object already has all four keys → updating with it is a whole-object
  replace with blanks as `0` (the "Partial KPI" decision, for free).

## Behavior

`bulkUpload` keeps its existing structure; only the existing-post branch changes.

1. **Parse + first validation loop** — unchanged. Rows that fail here stay in `failures` /
   `failed_count`:
   - parse errors (from `parseCsvRows` / `parseXlsxRows` / `normalizeRows`, incl. invalid KPI value),
   - unrecognized URL,
   - platform not enabled for the campaign,
   - URL appearing more than once **within the file**.

2. **Existing-posts lookup** — the query that finds already-present posts now also selects `id`
   (currently selects only `platform` + `platform_post_id`). Build a `Map<"platform:postId", id>`.

3. **Split surviving candidates:**
   - **Existing (key in map):** `success_count++`. If the row's `kpi_targets !== null`, queue a
     `post.update({ where: { id }, data: { kpi_targets } })`.
   - **New (not in map):** add to `finalCreate` (the `createMany` payload, unchanged shape).

4. **Persist** — run `finalCreate` (`createMany`, `skipDuplicates: true`) together with the queued
   updates in a single `$transaction`. Then `success_count += finalCreate.length`. If
   `finalCreate.length > 0` and the campaign is `ACTIVE`, schedule the campaign (unchanged).

### Result accounting

- `success_count` = newly created + all existing (updated or no-op).
- `failed_count` / `failures` = parse + validation errors only (existing posts no longer appear).
- They still sum to `total` (`rows + rowErrors`): every surviving candidate counts as success;
  every other row is a failure.

## Architecture

Single method change in `PostsService.bulkUpload`. The replaced block is the existing
`if (toCreate.length > 0) { ... }` section (lines ~374-405 today) that splits `toCreate` into
`finalCreate` vs. existing-as-failures.

New shape of that block:
- `existingPosts` query: add `id` to the `select`.
- `existingIdByKey: Map<string, string>` from the query result.
- Iterate the candidates: existing → success (+ optional update op); new → `finalCreate`.
- `const ops: Prisma.PrismaPromise<unknown>[] = []`; push `this.prisma.post.update(...)` per
  existing-with-KPI; push `this.prisma.post.createMany(...)` if `finalCreate.length > 0`.
- `if (ops.length > 0) await this.prisma.$transaction(ops);`
- `success_count += finalCreate.length` (existing already counted during iteration).

Rationale for individual `post.update` calls: each existing post needs a different
`kpi_targets`, so `updateMany` (single shared `data`) does not fit; `upsert` is unnecessary
because existence is already known from the lookup.

## Testing

All in `yehub-be/src/posts/posts.service.spec.ts`, `describe('PostsService.bulkUpload')`.
The `mockPrisma` gains a `post.update` jest mock and a `$transaction` mock that resolves the
passed operations (the block runs the queued ops). Tests assert on the queued operations /
`post.update` calls and `success_count` / `failed_count`.

- **Existing + KPI present updates kpi_targets:** `findMany` returns the matching post with an
  `id`; assert `post.update` called once with `{ where: { id }, data: { kpi_targets: {...} } }`,
  `success_count === 1`, `failed_count === 0`, `failures` empty.
- **Existing + no KPI is a no-op success:** row has blank KPI cells; assert `post.update` not
  called, `success_count === 1`, no failure.
- **Partial KPI on update writes blanks as 0:** row has some KPI cells filled; assert the
  `kpi_targets` in the `post.update` data has the unfilled dimensions set to `0`.
- **Mixed file (one new + one existing-with-KPI):** assert one `createMany` (with the new post)
  and one `post.update` (for the existing), both counted in `success_count` (=== 2).
- **Existing post is not reported as a failure:** assert no `failures` entry contains
  "already in the campaign".

## Out of scope

- Frontend / `BulkUploadResult` type / import dialog — unchanged.
- Updating any field other than `kpi_targets` on existing posts (e.g. URL).
- Single-post `addPost` behavior — still rejects duplicates with a conflict (unchanged).
</content>
