# Projects Planned Campaign Column Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Planned Campaigns" column to the Projects list page that shows, per project, the count of campaigns where `status = DRAFT` (and `deleted_at IS NULL`).

**Architecture:** Backend exposes a new `planned_campaign_count: number` on every project response. The list endpoint resolves all counts in a single Prisma `groupBy` query (constant cost per page, no N+1). Single-project endpoints resolve via the same helper called with one ID. Frontend adds the field to the `Project` type and renders one new `<TableHead>` + `<TableCell>` in the existing Projects table — no new query, no new hook.

**Tech Stack:** NestJS 11 + Prisma 7 (backend); React 19 + TypeScript + Tailwind v4 + shadcn/ui table primitive (frontend); Jest for backend tests.

**Spec:** `docs/superpowers/specs/2026-04-09-projects-planned-campaign-column-design.md`

---

## File Structure

### Backend (`yehub-be/`)

| File | Action | Responsibility |
|------|--------|----------------|
| `src/projects/projects.service.ts` | Modify | Add `getPlannedCounts` helper, change `formatProject` signature, thread the count through `create`/`findAll`/`findOne`/`update`. Add `CampaignStatus` import. |
| `src/projects/projects.service.spec.ts` | Modify | Add `campaign.groupBy` mock and `planned_campaign_count` assertions to existing tests; add new tests for the helper. |

### Frontend (`yehub-fe/`)

| File | Action | Responsibility |
|------|--------|----------------|
| `src/api/projects.ts` | Modify | Add `planned_campaign_count: number` to the `Project` interface. |
| `src/pages/projects/ProjectsListPage/components/ProjectsTableHeader.tsx` | Modify | Insert `<TableHead>Planned Campaigns</TableHead>` between Active Campaigns and Last Activity. |
| `src/pages/projects/ProjectsListPage/components/ProjectItem.tsx` | Modify | Insert `<TableCell>{project.planned_campaign_count}</TableCell>` in the same slot. |

No file is created. No prisma schema change. No migration.

---

## Task 1: Backend — add `getPlannedCounts` helper and update `formatProject` signature (test-first)

**Files:**
- Modify: `yehub-be/src/projects/projects.service.ts`
- Modify: `yehub-be/src/projects/projects.service.spec.ts`

This task wires the new field into the simplest path (`findAll`) end-to-end via TDD. Tasks 2 and 3 cover the remaining endpoints.

**Working directory for all backend commands:** `yehub-be/` inside the worktree (`.worktrees/feat-projects-planned-campaign-column/yehub-be`).

- [ ] **Step 1: Update `mockPrisma` in the spec to include `campaign.groupBy`**

Open `src/projects/projects.service.spec.ts`. Find the `mockPrisma` object (around line 27) and add a `campaign` block:

```ts
const mockPrisma = {
  project: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    count: jest.fn(),
  },
  projectMembership: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    count: jest.fn(),
  },
  campaign: {
    groupBy: jest.fn(),
  },
  user: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
  },
  $transaction: jest.fn(),
};
```

- [ ] **Step 2: In the `findAll` describe, add a `beforeEach` that defaults `groupBy` to an empty array**

Inside `describe('findAll', () => { ... })` (starts around line 64), add a `beforeEach` right after `const userId = 'user-1';`:

```ts
  describe('findAll', () => {
    const userId = 'user-1';

    beforeEach(() => {
      mockPrisma.campaign.groupBy.mockResolvedValue([]);
    });
```

This makes every existing `findAll` test default to "no planned campaigns" so they don't break when the service starts calling `groupBy`.

- [ ] **Step 3: Update the existing "returns paginated projects with defaults" test to expect `planned_campaign_count`**

The test currently asserts the formatted project shape (around lines 75-94). Change the expected `data` entry to include `planned_campaign_count: 2` AND set up the `groupBy` mock to return that count for `proj-1`:

```ts
    it('returns paginated projects with defaults (page=1, limit=20)', async () => {
      const project = makeProject();
      mockPrisma.$transaction.mockResolvedValue([[project], 1]);
      mockPrisma.project.findMany.mockReturnValue('findManyCall');
      mockPrisma.project.count.mockReturnValue('countCall');
      mockPrisma.campaign.groupBy.mockResolvedValue([
        { project_id: 'proj-1', _count: { _all: 2 } },
      ]);

      const result = await service.findAll(userId, {});

      expect(result).toEqual({
        data: [
          {
            id: 'proj-1',
            name: 'Alpha',
            description: null,
            client_name: null,
            logo: null,
            categories: [{ id: 'cat-1', name: 'Tech' }],
            active: true,
            created_at: now,
            updated_at: now,
            member_count: 2,
            campaign_count: 3,
            planned_campaign_count: 2,
          },
        ],
        total: 1,
        page: 1,
        totalPages: 1,
      });

      expect(mockPrisma.$transaction).toHaveBeenCalledWith([
        expect.anything(), // findMany promise
        expect.anything(), // count promise
      ]);
    });
```

- [ ] **Step 4: Add a new test asserting `groupBy` is called with the right filter**

Add this test inside the `findAll` describe, right after the existing pagination test:

```ts
    it('queries planned (DRAFT, not deleted) campaign counts for the page', async () => {
      const projectA = makeProject({ id: 'proj-a' });
      const projectB = makeProject({ id: 'proj-b' });
      mockPrisma.$transaction.mockResolvedValue([[projectA, projectB], 2]);
      mockPrisma.project.findMany.mockReturnValue('findManyCall');
      mockPrisma.project.count.mockReturnValue('countCall');
      mockPrisma.campaign.groupBy.mockResolvedValue([
        { project_id: 'proj-a', _count: { _all: 4 } },
        { project_id: 'proj-b', _count: { _all: 0 } },
      ]);

      const result = await service.findAll(userId, {});

      expect(mockPrisma.campaign.groupBy).toHaveBeenCalledWith({
        by: ['project_id'],
        where: {
          project_id: { in: ['proj-a', 'proj-b'] },
          status: 'DRAFT',
          deleted_at: null,
        },
        _count: { _all: true },
      });
      expect(result.data[0].planned_campaign_count).toBe(4);
      expect(result.data[1].planned_campaign_count).toBe(0);
    });
```

- [ ] **Step 5: Add a test that an empty page does not call `groupBy`**

Add after the previous test:

```ts
    it('skips planned-counts query when the page is empty', async () => {
      mockPrisma.$transaction.mockResolvedValue([[], 0]);
      mockPrisma.project.findMany.mockReturnValue('findManyCall');
      mockPrisma.project.count.mockReturnValue('countCall');

      const result = await service.findAll(userId, {});

      expect(mockPrisma.campaign.groupBy).not.toHaveBeenCalled();
      expect(result.data).toEqual([]);
    });
```

- [ ] **Step 6: Run the new and modified tests — expect failures**

Run: `pnpm test projects.service`

Expected: The three tests above (`returns paginated projects...`, `queries planned (DRAFT, not deleted)...`, `skips planned-counts query...`) FAIL because:
- `formatProject` does not yet emit `planned_campaign_count`
- `findAll` does not call `groupBy` at all

Other existing tests should still pass.

- [ ] **Step 7: Implement the helper and rewire `formatProject` and `findAll`**

Open `src/projects/projects.service.ts`.

**Add `CampaignStatus` to the existing prisma import** (line 8):

```ts
import {
  ProjectRole,
  UserStatus,
  CampaignStatus,
} from '../../generated/prisma/client';
```

**Add the helper method** — place it just above `formatProject` (just before line 237):

```ts
  private async getPlannedCounts(
    projectIds: string[],
  ): Promise<Map<string, number>> {
    if (projectIds.length === 0) return new Map();
    const rows = await this.prisma.campaign.groupBy({
      by: ['project_id'],
      where: {
        project_id: { in: projectIds },
        status: CampaignStatus.DRAFT,
        deleted_at: null,
      },
      _count: { _all: true },
    });
    return new Map(rows.map((r) => [r.project_id, r._count._all]));
  }
```

**Change `formatProject` to take a second `plannedCount` parameter and emit it** (lines 237-262 become):

```ts
  private formatProject(
    project: {
      id: string;
      name: string;
      description: string | null;
      client_name: string | null;
      logo: string | null;
      active: boolean;
      created_at: Date;
      updated_at: Date;
      _count: { memberships: number; campaigns: number };
      categories: { id: string; name: string }[];
    },
    plannedCount: number,
  ) {
    return {
      id: project.id,
      name: project.name,
      description: project.description,
      client_name: project.client_name,
      logo: project.logo,
      categories: project.categories,
      active: project.active,
      created_at: project.created_at,
      updated_at: project.updated_at,
      member_count: project._count.memberships,
      campaign_count: project._count.campaigns,
      planned_campaign_count: plannedCount,
    };
  }
```

**Rewire `findAll`** (lines 47-80 — replace the `return` block at the end):

```ts
  async findAll(userId: string, query: ListProjectsQueryDto, isAdmin = false) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where = {
      ...(!isAdmin && { memberships: { some: { user_id: userId } } }),
      ...(query.active !== undefined && { active: query.active }),
      ...(query.q && {
        OR: [
          { name: { contains: query.q, mode: 'insensitive' as const } },
          { client_name: { contains: query.q, mode: 'insensitive' as const } },
        ],
      }),
    };

    const [projects, total] = await this.prisma.$transaction([
      this.prisma.project.findMany({
        where,
        include: PROJECT_INCLUDE,
        orderBy: { created_at: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.project.count({ where }),
    ]);

    const plannedCounts = await this.getPlannedCounts(
      projects.map((p) => p.id),
    );

    return {
      data: projects.map((p) =>
        this.formatProject(p, plannedCounts.get(p.id) ?? 0),
      ),
      total,
      page,
      totalPages: total === 0 ? 0 : Math.ceil(total / limit),
    };
  }
```

**Temporarily fix the other three callers of `formatProject`** so the file compiles. The proper wiring for these comes in Tasks 2 and 3 — for now just pass `0`:

In `create` (line 44): `return this.formatProject(project, 0);`
In `findOne` (line 88): `return this.formatProject(project, 0);`
In `update` (line 104): `return this.formatProject(project, 0);`

- [ ] **Step 8: Run the tests — expect them to pass now**

Run: `pnpm test projects.service`

Expected: All projects.service tests PASS, including the three new/modified ones.

If any other test that asserts on the project shape now fails because of the new field, add `planned_campaign_count: 0` (or whatever the test mocked) to its expected object.

- [ ] **Step 9: Run lint**

Run: `pnpm lint`

Expected: clean (no errors, no warnings beyond pre-existing ones).

- [ ] **Step 10: Commit**

```bash
git add src/projects/projects.service.ts src/projects/projects.service.spec.ts
git commit -m "feat(projects): add planned_campaign_count via groupBy helper

Adds a getPlannedCounts(projectIds) helper that issues one Prisma
groupBy for DRAFT (and not soft-deleted) campaigns, then threads
the result into formatProject. Wires findAll end-to-end; create,
findOne, and update temporarily pass 0 and will be wired in the
next commit."
```

---

## Task 2: Backend — wire `findOne` and `update` to the helper

**Files:**
- Modify: `yehub-be/src/projects/projects.service.ts`
- Modify: `yehub-be/src/projects/projects.service.spec.ts`

`findOne` and `update` both currently pass `0`. They should call `getPlannedCounts([projectId])`.

- [ ] **Step 1: Add tests for `findOne` returning `planned_campaign_count`**

In `projects.service.spec.ts`, add a new `describe('findOne', () => { ... })` block right after the `describe('findAll', ...)` block closes:

```ts
  describe('findOne', () => {
    it('returns the project with planned_campaign_count from groupBy', async () => {
      const project = makeProject({ id: 'proj-x' });
      mockPrisma.project.findUnique.mockResolvedValue(project);
      mockPrisma.campaign.groupBy.mockResolvedValue([
        { project_id: 'proj-x', _count: { _all: 5 } },
      ]);

      const result = await service.findOne('proj-x');

      expect(result.planned_campaign_count).toBe(5);
      expect(mockPrisma.campaign.groupBy).toHaveBeenCalledWith({
        by: ['project_id'],
        where: {
          project_id: { in: ['proj-x'] },
          status: 'DRAFT',
          deleted_at: null,
        },
        _count: { _all: true },
      });
    });

    it('returns planned_campaign_count = 0 when there are no DRAFT campaigns', async () => {
      const project = makeProject({ id: 'proj-y' });
      mockPrisma.project.findUnique.mockResolvedValue(project);
      mockPrisma.campaign.groupBy.mockResolvedValue([]);

      const result = await service.findOne('proj-y');

      expect(result.planned_campaign_count).toBe(0);
    });

    it('throws NotFoundException when project does not exist', async () => {
      mockPrisma.project.findUnique.mockResolvedValue(null);
      await expect(service.findOne('missing')).rejects.toThrow(
        'Project not found',
      );
    });
  });
```

- [ ] **Step 2: Add tests for `update` returning `planned_campaign_count`**

Add right after the `findOne` describe:

```ts
  describe('update', () => {
    it('returns the updated project with planned_campaign_count from groupBy', async () => {
      const before = makeProject({ id: 'proj-u' });
      const after = { ...before, name: 'Renamed' };
      mockPrisma.project.findUnique.mockResolvedValue(before);
      mockPrisma.project.update.mockResolvedValue(after);
      mockPrisma.campaign.groupBy.mockResolvedValue([
        { project_id: 'proj-u', _count: { _all: 3 } },
      ]);

      const result = await service.update('proj-u', { name: 'Renamed' });

      expect(result.name).toBe('Renamed');
      expect(result.planned_campaign_count).toBe(3);
    });
  });
```

- [ ] **Step 3: Run tests — expect the new ones to fail**

Run: `pnpm test projects.service`

Expected: The new tests asserting `planned_campaign_count` matches the mocked groupBy values FAIL because `findOne` and `update` still pass `0` to `formatProject`. The "throws NotFoundException" test should pass.

- [ ] **Step 4: Wire `findOne` to the helper**

In `src/projects/projects.service.ts`, replace the body of `findOne`:

```ts
  async findOne(projectId: string) {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      include: PROJECT_INCLUDE,
    });
    if (!project) throw new NotFoundException('Project not found');
    const plannedCounts = await this.getPlannedCounts([projectId]);
    return this.formatProject(project, plannedCounts.get(projectId) ?? 0);
  }
```

- [ ] **Step 5: Wire `update` to the helper**

Replace the body of `update`:

```ts
  async update(projectId: string, dto: UpdateProjectDto) {
    await this.findOne(projectId);
    const { category_ids, ...projectData } = dto;
    const project = await this.prisma.project.update({
      where: { id: projectId },
      data: {
        ...projectData,
        ...(category_ids !== undefined && {
          categories: { set: category_ids.map((id) => ({ id })) },
        }),
      },
      include: PROJECT_INCLUDE,
    });
    const plannedCounts = await this.getPlannedCounts([projectId]);
    return this.formatProject(project, plannedCounts.get(projectId) ?? 0);
  }
```

Note: `update` calls `await this.findOne(projectId)` first for the existence check, which also hits `getPlannedCounts`. So `update` issues two groupBy calls per request — acceptable for a low-frequency endpoint. The test uses `mockResolvedValue` (not `mockResolvedValueOnce`), so both calls receive the same resolution and the test passes cleanly.

- [ ] **Step 6: Run tests — expect them to pass**

Run: `pnpm test projects.service`

Expected: All tests PASS.

- [ ] **Step 7: Run lint**

Run: `pnpm lint`

Expected: clean.

- [ ] **Step 8: Commit**

```bash
git add src/projects/projects.service.ts src/projects/projects.service.spec.ts
git commit -m "feat(projects): wire findOne and update to planned-count helper"
```

---

## Task 3: Backend — wire `create` to return `planned_campaign_count: 0`

**Files:**
- Modify: `yehub-be/src/projects/projects.service.ts`
- Modify: `yehub-be/src/projects/projects.service.spec.ts`

A freshly created project has zero campaigns by definition, so `create` does not need to query. It just passes `0` (which it already does from Task 1's temporary fix). This task adds an assertion to lock that contract in.

- [ ] **Step 1: Add a test for `create` returning `planned_campaign_count: 0`**

Add a new describe block after the `update` describe:

```ts
  describe('create', () => {
    it('returns the new project with planned_campaign_count = 0', async () => {
      const project = makeProject({ id: 'new-1' });
      mockPrisma.project.create.mockResolvedValue(project);

      const result = await service.create('user-1', { name: 'Alpha' });

      expect(result.planned_campaign_count).toBe(0);
      expect(mockPrisma.campaign.groupBy).not.toHaveBeenCalled();
    });
  });
```

- [ ] **Step 2: Run the test**

Run: `pnpm test projects.service`

Expected: The new test PASSES on the first run because Task 1 already left `create` passing `0` to `formatProject` and `create` does not call `groupBy`.

- [ ] **Step 3: Commit**

```bash
git add src/projects/projects.service.spec.ts
git commit -m "test(projects): lock contract that create returns planned_campaign_count=0"
```

---

## Task 4: Backend — full test suite + lint sanity check

**Files:** none (verification only)

- [ ] **Step 1: Run the full backend test suite**

Run: `pnpm test`

Expected: all tests pass. If any test in another file (e.g. `projects.controller.spec.ts` or anywhere that compares against a serialized Project object) fails because of the new field, add `planned_campaign_count: 0` (or the appropriate value) to its expected fixture and re-run.

- [ ] **Step 2: Run lint across the whole backend**

Run: `pnpm lint`

Expected: clean.

- [ ] **Step 3: If any incidental fixes were made, commit them**

```bash
git status
# If there are changes:
git add <files>
git commit -m "test: update fixtures for planned_campaign_count field"
```

If there are no changes, skip the commit.

---

## Task 5: Frontend — add `planned_campaign_count` to `Project` type

**Files:**
- Modify: `yehub-fe/src/api/projects.ts`

**Working directory for all frontend commands:** `yehub-fe/` inside the worktree.

- [ ] **Step 1: Add the field to the `Project` interface**

Open `src/api/projects.ts`. Find the `Project` interface (around lines 6-18). Add `planned_campaign_count: number` immediately after `campaign_count: number`:

```ts
export interface Project {
  id: string
  name: string
  description: string | null
  client_name: string | null
  logo: string | null
  categories: Category[]
  active: boolean
  created_at: string
  updated_at: string
  member_count: number
  campaign_count: number
  planned_campaign_count: number
}
```

- [ ] **Step 2: Run typecheck via build**

Run: `pnpm build`

Expected: `tsc` compiles cleanly. Vite produces a build. Any consumer of `Project` that doesn't reference `planned_campaign_count` is unaffected because we are only adding a field, not removing one.

If `pnpm build` errors with "Property `planned_campaign_count` is missing in type" anywhere (e.g., test fixtures or mock builders that build full `Project` objects), add the field to those fixtures with a value of `0` and re-run.

- [ ] **Step 3: Commit**

```bash
git add src/api/projects.ts
git commit -m "feat(projects): add planned_campaign_count to Project type"
```

---

## Task 6: Frontend — add Planned Campaigns header

**Files:**
- Modify: `yehub-fe/src/pages/projects/ProjectsListPage/components/ProjectsTableHeader.tsx`

- [ ] **Step 1: Insert the new header column**

Open the file. The current body is:

```tsx
import { TableHead, TableHeader, TableRow } from '@/components/ui/table'

export function ProjectsTableHeader() {
  return (
    <TableHeader>
      <TableRow>
        <TableHead className="w-[300px]">Project</TableHead>
        <TableHead className="text-center">Total Campaigns</TableHead>
        <TableHead className="text-center">Active Campaigns</TableHead>
        <TableHead className="text-right">Last Activity</TableHead>
        <TableHead className="w-[50px]" />
      </TableRow>
    </TableHeader>
  )
}
```

Insert a new `<TableHead>` between `Active Campaigns` and `Last Activity`:

```tsx
import { TableHead, TableHeader, TableRow } from '@/components/ui/table'

export function ProjectsTableHeader() {
  return (
    <TableHeader>
      <TableRow>
        <TableHead className="w-[300px]">Project</TableHead>
        <TableHead className="text-center">Total Campaigns</TableHead>
        <TableHead className="text-center">Active Campaigns</TableHead>
        <TableHead className="text-center">Planned Campaigns</TableHead>
        <TableHead className="text-right">Last Activity</TableHead>
        <TableHead className="w-[50px]" />
      </TableRow>
    </TableHeader>
  )
}
```

- [ ] **Step 2: Do not commit yet**

The header alone, without a matching cell, would render a misaligned row. Move on to Task 7 and commit them together.

---

## Task 7: Frontend — add Planned Campaigns cell

**Files:**
- Modify: `yehub-fe/src/pages/projects/ProjectsListPage/components/ProjectItem.tsx`

- [ ] **Step 1: Insert the matching `<TableCell>`**

Find the row in `ProjectItem.tsx` that contains the existing campaign cells (around lines 44-48):

```tsx
        <TableCell className="text-center font-mono font-bold">{project.campaign_count}</TableCell>
        <TableCell className="text-center font-mono font-bold">—</TableCell>
        <TableCell className="text-right text-xs text-muted-foreground">
          {formatRelativeTime(project.updated_at)}
        </TableCell>
```

Insert a new `<TableCell>` between the `—` placeholder cell and the `Last Activity` cell:

```tsx
        <TableCell className="text-center font-mono font-bold">{project.campaign_count}</TableCell>
        <TableCell className="text-center font-mono font-bold">—</TableCell>
        <TableCell className="text-center font-mono font-bold">{project.planned_campaign_count}</TableCell>
        <TableCell className="text-right text-xs text-muted-foreground">
          {formatRelativeTime(project.updated_at)}
        </TableCell>
```

- [ ] **Step 2: Run frontend lint**

Run: `pnpm lint`

Expected: clean.

- [ ] **Step 3: Run frontend build**

Run: `pnpm build`

Expected: clean — TypeScript compiles, Vite emits a bundle. Catches type drift if Task 5 didn't land.

- [ ] **Step 4: Commit header + cell together**

```bash
git add src/pages/projects/ProjectsListPage/components/ProjectsTableHeader.tsx src/pages/projects/ProjectsListPage/components/ProjectItem.tsx
git commit -m "feat(projects): add Planned Campaigns column to projects list"
```

---

## Task 8: Final verification

**Files:** none (verification only)

- [ ] **Step 1: Backend — full test suite**

From `yehub-be/`:

```bash
pnpm test
pnpm lint
```

Expected: both clean.

- [ ] **Step 2: Frontend — lint and build**

From `yehub-fe/`:

```bash
pnpm lint
pnpm build
```

Expected: both clean.

- [ ] **Step 3: Verify git log shows the expected commits**

From the worktree root:

```bash
git log --oneline main..HEAD
```

Expected commits (in order):

```
<sha> feat(projects): add Planned Campaigns column to projects list
<sha> feat(projects): add planned_campaign_count to Project type
<sha> test(projects): lock contract that create returns planned_campaign_count=0
<sha> feat(projects): wire findOne and update to planned-count helper
<sha> feat(projects): add planned_campaign_count via groupBy helper
<sha> docs: correct Projects spec to reference main's table file split
<sha> docs: add design spec for Projects planned campaign column
```

(Plus possibly one more `test:` commit from Task 4 if any other backend tests needed fixture updates.)

- [ ] **Step 4: Optional manual smoke test**

If the user wants to verify visually:

```bash
docker compose up -d
# In yehub-be/:
pnpm prisma:migrate && pnpm prisma:seed && pnpm start:dev
# In yehub-fe/ (separate terminal):
pnpm dev
```

Open http://localhost:5173, log in, navigate to `/projects`. Confirm the new "Planned Campaigns" column appears between "Active Campaigns" and "Last Activity" and shows numeric values for seeded projects.

This step is optional — the unit tests and type system already cover the contract.

---

## Out of scope reminders

- Do **not** wire the `Active Campaigns —` placeholder.
- Do **not** add a `PLANNED` value to the `CampaignStatus` enum.
- Do **not** add Playwright tests in `yehub-e2e/`.
- Do **not** add filtering, sorting, or click handlers to the new column.
