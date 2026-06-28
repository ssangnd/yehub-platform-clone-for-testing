# Projects: Planned Campaigns Column

**Date:** 2026-04-09
**Branch:** `feat/projects-planned-campaign-column`
**Status:** Approved

## Goal

Add a "Planned Campaigns" column to the Projects list page (`/projects`) that displays, per project, the number of campaigns currently in `DRAFT` status.

## Background

The Projects list page currently shows columns:

| Project | Total Campaigns | Active Campaigns | Last Activity | (actions) |

The `Active Campaigns` column is a placeholder — its cell renders `—` and is not wired to any data. This work does **not** touch that placeholder; it only adds a new column.

The `CampaignStatus` enum is `DRAFT | ACTIVE | PAUSED | STOPPED | COMPLETED`. There is no `PLANNED` status. For this feature, "planned" is defined as **`status = DRAFT`**. No new enum value is introduced. (The Campaign model has no `deleted_at` field on `main`.)

## Definition

A campaign counts as "planned" iff:

- `campaign.status = 'DRAFT'`
- `campaign.project_id = <this project>`

## Backend changes (`yehub-be`)

### Response shape

`Project` response objects gain one new field:

```ts
planned_campaign_count: number
```

It is added to the output of all four endpoints that return projects:

- `POST /v1/projects` (create)
- `GET  /v1/projects` (list)
- `GET  /v1/projects/:id` (findOne)
- `PATCH /v1/projects/:id` (update)

For freshly created projects the value will always be `0`.

### Service implementation

The constraint: Prisma's `_count.select` cannot include the same relation twice with different filters, so we cannot tack a second filtered `campaigns` count onto the existing `PROJECT_INCLUDE`. We need a separate query.

Add a private helper in `ProjectsService`:

```ts
private async getPlannedCounts(projectIds: string[]): Promise<Map<string, number>> {
  if (projectIds.length === 0) return new Map();
  const rows = await this.prisma.campaign.groupBy({
    by: ['project_id'],
    where: {
      project_id: { in: projectIds },
      status: CampaignStatus.DRAFT,
    },
    _count: { _all: true },
  });
  return new Map(rows.map((r) => [r.project_id, r._count._all]));
}
```

Update `formatProject` to take a `plannedCount: number` parameter and emit `planned_campaign_count: plannedCount` on the returned object. Each caller is responsible for resolving the count:

- `findAll`: after `findMany` returns the page, call `getPlannedCounts(projects.map(p => p.id))` once, then map each project through `formatProject(p, plannedMap.get(p.id) ?? 0)`.
- `findOne`: call `getPlannedCounts([projectId])` and pass the resolved count to `formatProject`.
- `create`: pass `0` directly — a brand-new project has zero campaigns.
- `update`: call `getPlannedCounts([projectId])` after the update and pass the resolved count.

This keeps the list endpoint at one extra query (constant, not N+1) and the single-project endpoints at one extra query each.

### Test updates

`yehub-be/src/projects/projects.service.spec.ts`:

- Add `campaign.groupBy: jest.fn()` to the `mockPrisma` shape.
- For each test that exercises `findAll`, `findOne`, `create`, or `update`, set `mockPrisma.campaign.groupBy.mockResolvedValue([...])` returning whatever planned-count rows the test expects.
- Update the expected formatted-project assertions to include `planned_campaign_count` with the expected value (e.g., `1` where the test plants one DRAFT campaign, `0` where none are planted).

## Frontend changes (`yehub-fe`)

### API type

`yehub-fe/src/api/projects.ts`:

```ts
export interface Project {
  // ...existing fields
  campaign_count: number
  planned_campaign_count: number   // NEW
}
```

### Projects list column

The Projects list table is split across two files on `main`:

- `yehub-fe/src/pages/projects/ProjectsListPage/components/ProjectsTableHeader.tsx` — column headers
- `yehub-fe/src/pages/projects/ProjectsListPage/components/ProjectItem.tsx` — row cells

**`ProjectsTableHeader.tsx`** — insert a new `<TableHead>` after the existing `Active Campaigns` header and before `Last Activity`:

```tsx
<TableHead className="text-center">Planned Campaigns</TableHead>
```

**`ProjectItem.tsx`** — insert a new `<TableCell>` in the same position:

```tsx
<TableCell className="text-center font-mono font-bold">{project.planned_campaign_count}</TableCell>
```

The resulting column order:

| Project | Total Campaigns | Active Campaigns (—) | Planned Campaigns | Last Activity | (actions) |

No new query, no new hook, no Zustand store, no schema change. The column rides on the existing `listProjects` call.

## Out of scope

- Wiring up the `Active Campaigns` placeholder column.
- Adding a `PLANNED` value to the `CampaignStatus` enum.
- E2E test additions in `yehub-e2e/`.
- Filtering, sorting, or clicking the new column.
- Showing the planned count anywhere outside the projects list (e.g., project detail header, cards).

## Risks and mitigations

- **Risk:** Prisma `groupBy` with empty `projectIds` array throws or returns oddly. **Mitigation:** the helper short-circuits on empty input and returns an empty `Map`.
- **Risk:** Existing callers of `formatProject` break when its signature changes. **Mitigation:** `formatProject` is private; only the four service methods listed above call it, and all four are updated in the same commit. Tests catch any miss.
- **Risk:** Frontend renders `undefined` if backend deploy lags. **Mitigation:** ship backend and frontend in the same PR; no defensive `?? 0` in the cell render — trust the contract.

## Verification

Before requesting review:

1. `pnpm test projects.service` in `yehub-be/` — all 18+ existing tests still pass plus updated assertions.
2. `pnpm lint` in `yehub-be/` — clean.
3. `pnpm lint` in `yehub-fe/` — clean.
4. `pnpm build` in `yehub-fe/` — clean (catches TS type drift).
5. Manual smoke (optional): start backend + frontend, log in, visit `/projects`, confirm the new column appears with sensible numbers for seeded data.
