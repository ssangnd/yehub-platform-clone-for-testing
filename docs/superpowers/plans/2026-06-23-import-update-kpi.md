# Import: Update KPI for Existing Posts — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** In bulk import, update an existing post's `kpi_targets` (when the row supplies KPI) instead of failing it, folding existing posts into `success_count`.

**Architecture:** A single change to the `if (toCreate.length > 0)` block in `PostsService.bulkUpload`: the existing-posts lookup also selects `id`; matched existing posts count as success and queue a `post.update` when the row has KPI; new posts go to `createMany`; creates + updates run in one `$transaction`.

**Tech Stack:** NestJS 11, Prisma 7, Jest.

**Spec:** `docs/superpowers/specs/2026-06-23-import-update-kpi-design.md`

## Global Constraints

- Package manager is **pnpm** only. On this Windows machine, prepend `/c/Tools/nvm/v24.15.0` to PATH before `pnpm`/`node` (Bash: `export PATH="/c/Tools/nvm/v24.15.0:$PATH"`), or run via PowerShell.
- Backend style: single quotes, trailing commas, strict TS, semicolons.
- Avoid lint pollution: do NOT run repo-wide `pnpm lint` (it auto-fixes unrelated files). Lint only the touched files: `cd yehub-be && npx eslint --fix src/posts/posts.service.ts src/posts/posts.service.spec.ts`. Before committing, `git status --porcelain` must show only those two files; restore anything else with `git checkout -- <file>`.
- `kpi_targets` JSON keys stay `engagement/buzz/interaction/view`.
- `BulkUploadResult` shape is unchanged — no frontend, API-type, or template changes.
- The first validation loop (bad URL, platform-not-allowed, file-internal duplicate, invalid KPI value) is unchanged; those stay failures.

---

### Task 1: Update existing posts' KPI on bulk import

**Files:**
- Modify: `yehub-be/src/posts/posts.service.ts` (the `if (toCreate.length > 0)` block, currently lines ~374-416)
- Test: `yehub-be/src/posts/posts.service.spec.ts` (`describe('PostsService.bulkUpload')`, mock setup at lines ~33-56)

**Interfaces:**
- Consumes: existing `toCreate: Prisma.PostCreateManyInput[]` (each item has `kpi_targets` present only when the row supplied KPI), `results` accumulator, `campaign.status`, `this.prisma`, `this.pollingScheduler.scheduleCampaign`.
- Produces: no new exported symbols. Behavior change only: existing posts → `success_count` (+ optional `post.update`), never `failures`.

- [ ] **Step 1: Extend the test mocks for `post.update` + `$transaction`**

In `yehub-be/src/posts/posts.service.spec.ts`, update the `mockPrisma` literal (currently `post: { findMany: jest.fn(), createMany: jest.fn() }, $transaction: jest.fn()`) to add `update`:

```ts
const mockPrisma = {
  campaign: { findUnique: jest.fn() },
  post: { findMany: jest.fn(), createMany: jest.fn(), update: jest.fn() },
  $transaction: jest.fn(),
};
```

Then in the `beforeEach` of `describe('PostsService.bulkUpload')`, after the existing `mockPrisma.post.createMany.mockResolvedValue({ count: 0 });` line, add default resolutions:

```ts
mockPrisma.post.update.mockResolvedValue({});
mockPrisma.$transaction.mockImplementation((ops) => Promise.all(ops));
```

- [ ] **Step 2: Write the failing tests**

Add these tests inside `describe('PostsService.bulkUpload')` (e.g. right after the existing KPI tests). They rely on the existing `csvFile` helper and the default `campaign` mock. The Instagram URL `https://www.instagram.com/p/ABC123/` detects to `platform: INSTAGRAM`, `platform_post_id: 'ABC123'`.

```ts
it('updates kpi_targets of an existing post instead of failing it', async () => {
  mockPrisma.post.findMany.mockResolvedValueOnce([
    { id: 'post-1', platform: Platform.INSTAGRAM, platform_post_id: 'ABC123' },
  ]);
  const csv =
    'url,engagement kpi,buzz kpi,interaction kpi,view kpi\n' +
    'https://www.instagram.com/p/ABC123/,1000,500,800,5000\n';

  const result = await service.bulkUpload('camp-1', csvFile(csv));

  expect(mockPrisma.post.update).toHaveBeenCalledWith({
    where: { id: 'post-1' },
    data: { kpi_targets: { engagement: 1000, buzz: 500, interaction: 800, view: 5000 } },
  });
  expect(mockPrisma.post.createMany).not.toHaveBeenCalled();
  expect(result.success_count).toBe(1);
  expect(result.failed_count).toBe(0);
  expect(result.failures).toEqual([]);
});

it('leaves an existing post untouched (no update) when the row has no KPI, still counting it as success', async () => {
  mockPrisma.post.findMany.mockResolvedValueOnce([
    { id: 'post-1', platform: Platform.INSTAGRAM, platform_post_id: 'ABC123' },
  ]);
  const csv =
    'url,engagement kpi,buzz kpi,interaction kpi,view kpi\n' +
    'https://www.instagram.com/p/ABC123/,,,,\n';

  const result = await service.bulkUpload('camp-1', csvFile(csv));

  expect(mockPrisma.post.update).not.toHaveBeenCalled();
  expect(result.success_count).toBe(1);
  expect(result.failed_count).toBe(0);
  expect(result.failures).toEqual([]);
});

it('writes blanks as 0 when updating an existing post from a partially-filled row', async () => {
  mockPrisma.post.findMany.mockResolvedValueOnce([
    { id: 'post-1', platform: Platform.INSTAGRAM, platform_post_id: 'ABC123' },
  ]);
  const csv =
    'url,engagement kpi,buzz kpi,interaction kpi,view kpi\n' +
    'https://www.instagram.com/p/ABC123/,1000,,,\n';

  await service.bulkUpload('camp-1', csvFile(csv));

  expect(mockPrisma.post.update).toHaveBeenCalledWith({
    where: { id: 'post-1' },
    data: { kpi_targets: { engagement: 1000, buzz: 0, interaction: 0, view: 0 } },
  });
});

it('creates new posts and updates existing ones in the same file', async () => {
  // existing matches the instagram URL; the tiktok URL is new
  mockPrisma.post.findMany.mockResolvedValueOnce([
    { id: 'post-1', platform: Platform.INSTAGRAM, platform_post_id: 'ABC123' },
  ]);
  const csv =
    'url,engagement kpi,buzz kpi,interaction kpi,view kpi\n' +
    'https://www.instagram.com/p/ABC123/,10,20,30,40\n' +
    'https://www.tiktok.com/@u/video/123,,,,\n';

  const result = await service.bulkUpload('camp-1', csvFile(csv));

  expect(mockPrisma.post.update).toHaveBeenCalledTimes(1);
  expect(mockPrisma.post.update).toHaveBeenCalledWith({
    where: { id: 'post-1' },
    data: { kpi_targets: { engagement: 10, buzz: 20, interaction: 30, view: 40 } },
  });
  expect(mockPrisma.post.createMany).toHaveBeenCalledWith({
    data: [expect.objectContaining({ platform: Platform.TIKTOK })],
    skipDuplicates: true,
  });
  expect(result.success_count).toBe(2);
  expect(result.failed_count).toBe(0);
});

it('does not report an existing post as a failure', async () => {
  mockPrisma.post.findMany.mockResolvedValueOnce([
    { id: 'post-1', platform: Platform.INSTAGRAM, platform_post_id: 'ABC123' },
  ]);
  const csv =
    'url,engagement kpi,buzz kpi,interaction kpi,view kpi\n' +
    'https://www.instagram.com/p/ABC123/,1,2,3,4\n';

  const result = await service.bulkUpload('camp-1', csvFile(csv));

  expect(result.failures.some((f) => /already in the campaign/.test(f.reason))).toBe(false);
});
```

- [ ] **Step 3: Run the new tests to verify they fail**

Run: `cd yehub-be && pnpm test -- posts.service.spec`
Expected: FAIL — existing posts currently go to `failures` (so `success_count` is 0 / failures contains "already in the campaign"), and `post.update` is never called.

- [ ] **Step 4: Implement the behavior change**

In `yehub-be/src/posts/posts.service.ts`, replace the entire `if (toCreate.length > 0) { ... }` block (currently lines ~374-416) with:

```ts
    if (toCreate.length > 0) {
      const existingPosts = await this.prisma.post.findMany({
        where: {
          campaign_id: campaignId,
          deleted_at: null,
          OR: toCreate.map((p) => ({
            platform: p.platform,
            platform_post_id: p.platform_post_id,
          })),
        },
        select: { id: true, platform: true, platform_post_id: true },
      });

      const existingIdByKey = new Map(
        existingPosts.map((p) => [`${p.platform}:${p.platform_post_id}`, p.id]),
      );

      const finalCreate: typeof toCreate = [];
      const updateOps: Prisma.PrismaPromise<unknown>[] = [];
      for (const item of toCreate) {
        const key = `${item.platform}:${item.platform_post_id}`;
        const existingId = existingIdByKey.get(key);
        if (existingId !== undefined) {
          // Existing post: refresh KPI targets when the row supplies them,
          // otherwise leave it untouched. Either way it counts as success.
          results.success_count++;
          if (item.kpi_targets !== undefined) {
            updateOps.push(
              this.prisma.post.update({
                where: { id: existingId },
                data: { kpi_targets: item.kpi_targets },
              }),
            );
          }
        } else {
          finalCreate.push(item);
        }
      }

      const ops: Prisma.PrismaPromise<unknown>[] = [...updateOps];
      if (finalCreate.length > 0) {
        ops.push(
          this.prisma.post.createMany({
            data: finalCreate,
            skipDuplicates: true,
          }),
        );
      }
      if (ops.length > 0) {
        await this.prisma.$transaction(ops);
      }

      results.success_count += finalCreate.length;
      if (finalCreate.length > 0 && campaign.status === CampaignStatus.ACTIVE) {
        await this.pollingScheduler.scheduleCampaign(campaignId);
      }
    }
```

Notes:
- `item.kpi_targets` is `undefined` exactly when the row had no KPI (the `toCreate.push` uses a conditional spread that omits the key in that case), so `!== undefined` is the "KPI present" check.
- `Prisma` is already imported in this file. `Prisma.PrismaPromise<unknown>` is the union-friendly type for mixing `post.update` and `post.createMany` operations in `$transaction`.

- [ ] **Step 5: Run the full bulkUpload suite to verify pass**

Run: `cd yehub-be && pnpm test -- posts.service.spec`
Expected: PASS — the 5 new tests plus all pre-existing bulkUpload tests (the create-path tests still see `createMany` called with the same args; `$transaction` now wraps it).

- [ ] **Step 6: Build, lint, verify clean status, commit**

```bash
cd yehub-be && pnpm build
cd yehub-be && npx eslint --fix src/posts/posts.service.ts src/posts/posts.service.spec.ts
git status --porcelain   # expect ONLY the two posts files
```
Then:
```bash
git add yehub-be/src/posts/posts.service.ts yehub-be/src/posts/posts.service.spec.ts
git commit -m "feat(be): update existing posts' KPI on bulk import instead of failing"
```

---

## Self-Review

**Spec coverage:**
- Existing + KPI present → update + success → Task 1 Step 4 (update branch) + test 1. ✓
- Existing + no KPI → no-op success → Step 4 (no update op) + test 2. ✓
- Partial KPI replace-whole-object blanks=0 → relies on parser normalization; test 3. ✓
- Folded into success_count, no result-shape change → Step 4 accounting; tests assert counts; `BulkUploadResult` untouched. ✓
- `$transaction` for creates+updates → Step 4. ✓
- Scheduling only for new creates → Step 4 (`finalCreate.length > 0 && ACTIVE`). ✓
- Existing post not a failure → test 5. ✓
- Validation failures unchanged → first loop untouched (not modified by this task). ✓

**Placeholder scan:** No TBD/TODO; all steps contain complete code and exact commands. ✓

**Type consistency:** `existingIdByKey: Map<string,string>`, `updateOps`/`ops: Prisma.PrismaPromise<unknown>[]`, `item.kpi_targets !== undefined`, `results.success_count` used consistently. `kpi_targets` JSON keys unchanged. ✓
</content>
