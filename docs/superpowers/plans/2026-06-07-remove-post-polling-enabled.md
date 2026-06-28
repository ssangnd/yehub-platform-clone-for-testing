# Remove `post.polling_enabled` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the `Post.polling_enabled` field across the full stack so polling is gated solely by campaign status.

**Architecture:** Drop the column via a destructive Prisma migration, regenerate the client, then remove every read/write of the field in the backend (scheduler, processor, posts service/controller/DTOs, seed) and frontend (posts API, settings dialog, campaign-posts hook). The polling gate `canSchedule` collapses from `polling_enabled && campaign ACTIVE` to `campaign ACTIVE`. The dedicated `PUT /posts/:id/polling` endpoint and the `?polling_enabled=` list filter are deleted.

**Tech Stack:** NestJS 11, Prisma 7 (PostgreSQL), Jest + ts-jest (full typecheck on test), React 19 + TanStack Query (frontend).

**Spec:** `docs/superpowers/specs/2026-06-07-remove-post-polling-enabled-design.md`

**Verification note:** `yehub-be` Jest uses ts-jest **with typechecking** (no `isolatedModules`), so any leftover reference to the removed field makes the relevant spec fail to compile. `pnpm test` is therefore the source of truth (project note: `pnpm build`/`lint` are pre-existingly broken by stale generated client). Run all backend commands from `yehub-be/`, frontend from `yehub-fe/`.

**Branch:** Work continues on the current `feature/post-polling-pr` branch.

---

## File Structure

Backend (`yehub-be/`):
- `prisma/schema.prisma` — drop the column (modify)
- `prisma/migrations/<new>/migration.sql` — `DROP COLUMN` (create, via CLI)
- `generated/prisma/**` — regenerated (do not hand-edit)
- `src/polling/polling-scheduler.service.ts` — `PollingPost` type, `canSchedule`, `postSelect`, two `where` filters (modify)
- `src/polling/polling-scheduler.service.spec.ts` — fixtures + pause cases (modify)
- `src/polling/polling-processor.ts` — no-op guard (modify)
- `src/polling/polling-processor.spec.ts` — fixture + no-op test (modify)
- `src/posts/posts.service.ts` — list filter/mappings, `updateSettings`, delete `setPollingEnabled` (modify)
- `src/posts/posts.service.spec.ts` — fixtures, `updateSettings` cases, delete `setPollingEnabled` block (modify)
- `src/posts/posts.controller.ts` — delete `PUT /posts/:id/polling` (modify)
- `src/posts/dto/update-post.dto.ts` — drop field from `UpdatePostSettingsDto` (modify)
- `src/posts/dto/update-post-polling.dto.ts` — delete file
- `src/posts/dto/list-posts-query.dto.ts` — drop `polling_enabled` (modify)
- `prisma/seed.ts` — drop field (modify)

Frontend (`yehub-fe/`):
- `src/api/posts.ts` — types, `listPosts` param, `updatePostSettings` payload, delete `setPostPolling` (modify)
- `src/pages/posts/PostDetailPage/components/PostSettingsDialog.tsx` — `onSave` type + submit value (modify)
- `src/pages/campaigns/CampaignDetailPage/components/use-campaign-posts.ts` — delete `togglePolling` (modify)

---

## Task 1: Schema + migration

**Files:**
- Modify: `prisma/schema.prisma:285`
- Create: `prisma/migrations/<timestamp>_remove_post_polling_enabled/migration.sql` (via CLI)

- [ ] **Step 1: Remove the column from the schema**

In `prisma/schema.prisma`, delete this line from the `Post` model (line 285):

```prisma
  polling_enabled          Boolean   @default(true)
```

- [ ] **Step 2: Create and apply the migration**

Run: `pnpm prisma:migrate --name remove_post_polling_enabled`

Expected: Prisma creates a new migration containing
`ALTER TABLE "posts" DROP COLUMN "polling_enabled";`, applies it to the local DB, and
auto-runs `prisma generate`. Confirm the new folder appears under `prisma/migrations/`.

- [ ] **Step 3: Regenerate the client explicitly (belt-and-suspenders)**

Run: `pnpm prisma:generate`
Expected: "Generated Prisma Client". After this, `generated/prisma` no longer types
`polling_enabled` on `Post` — backend files referencing it will not compile until fixed in
the following tasks.

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations generated/prisma
git commit -m "feat: drop post.polling_enabled column"
```

---

## Task 2: Polling scheduler

**Files:**
- Modify: `src/polling/polling-scheduler.service.ts` (lines 14-24, 113-124, 151-166, 351-355, 402-416)
- Test: `src/polling/polling-scheduler.service.spec.ts`

- [ ] **Step 1: Update the spec fixtures and pause cases first**

In `polling-scheduler.service.spec.ts`:

Remove `polling_enabled: true,` from every fixture object — the module-level `activePost`
(line 7), `base` (line 249), `enabledActive` (line 379), and each inline `findMany` mock
object (lines 300, 325, 351).

Rewrite the two cases in the `dimensionsToPollOnChange` block that used `polling_enabled`
to express schedulability through **campaign status** instead.

Replace the "polls a dimension that became schedulable (un-paused)" case (lines 397-403)
with:

```ts
    it('polls a dimension that became schedulable (campaign activated)', () => {
      const prev = {
        ...enabledActive,
        campaign: { ...enabledActive.campaign, status: CampaignStatus.PAUSED },
      };
      expect(service.dimensionsToPollOnChange(prev, enabledActive)).toEqual({
        metrics: true,
        comments: true,
      });
    });
```

Replace the "does not poll when the post is disabled or campaign inactive" case
(lines 427-438) with:

```ts
    it('does not poll when the campaign is inactive', () => {
      const inactive = {
        ...enabledActive,
        campaign: { ...enabledActive.campaign, status: CampaignStatus.PAUSED },
      };
      const next = { ...inactive, polling_metric_override: 300 };
      expect(service.dimensionsToPollOnChange(inactive, next)).toEqual({
        metrics: false,
        comments: false,
      });
    });
```

- [ ] **Step 2: Run the spec to confirm it fails to compile**

Run: `pnpm test -- polling-scheduler.service`
Expected: FAIL — ts-jest type errors because `polling-scheduler.service.ts` still references
the now-removed `polling_enabled` (e.g. in `PollingPost` and `canSchedule`).

- [ ] **Step 3: Remove the field from the service**

In `src/polling/polling-scheduler.service.ts`:

Drop `polling_enabled` from the `PollingPost` type (delete line 16: `polling_enabled: boolean;`).

Change `canSchedule` (lines 351-355) to:

```ts
  private canSchedule(post: PollingPost): boolean {
    return post.campaign.status === CampaignStatus.ACTIVE;
  }
```

In `postSelect()` (lines 402-416), delete the `polling_enabled: true,` line.

In `scheduleCampaign` (around line 117-124), remove `polling_enabled: true,` from the
`findMany` `where`, leaving:

```ts
    const posts = await this.prisma.post.findMany({
      where: {
        campaign_id: campaignId,
        deleted_at: null,
      },
      select: this.postSelect(),
    });
```

In `rescheduleCampaignInheritedPosts` (around line 155-166), remove `polling_enabled: true,`
from the `findMany` `where`, leaving:

```ts
    const posts = await this.prisma.post.findMany({
      where: {
        campaign_id: campaignId,
        deleted_at: null,
        OR: [
          { polling_metric_override: null },
          { polling_comment_override: null },
        ],
      },
      select: this.postSelect(),
    });
```

> Note: `scheduleCampaign` previously only scheduled `polling_enabled` posts; it now
> schedules every non-deleted post in the campaign, and `schedulePostSnapshot` already
> no-ops for non-ACTIVE campaigns via `canSchedule`. This is the intended behavior change.

- [ ] **Step 4: Run the spec to confirm it passes**

Run: `pnpm test -- polling-scheduler.service`
Expected: PASS (all `PollingSchedulerService` cases green).

- [ ] **Step 5: Commit**

```bash
git add src/polling/polling-scheduler.service.ts src/polling/polling-scheduler.service.spec.ts
git commit -m "refactor: gate scheduler on campaign status only"
```

---

## Task 3: Polling processor

**Files:**
- Modify: `src/polling/polling-processor.ts:74-87`
- Test: `src/polling/polling-processor.spec.ts:54-77`

- [ ] **Step 1: Update the spec fixture and no-op test first**

In `polling-processor.spec.ts`:

Remove `polling_enabled: true,` from the `activePost` fixture (line 60).

Replace the "no-ops when the post is disabled or inactive" test (lines 67-77) with a
campaign-status-driven version:

```ts
  it('no-ops when the campaign is not active', async () => {
    prisma.post.findUnique.mockResolvedValue({
      ...activePost,
      campaign: { status: CampaignStatus.PAUSED },
    });

    await processor.process(job(POLLING_JOB_NAMES.POLL_POST_METRICS));

    expect(adapters.get).not.toHaveBeenCalled();
    expect(prisma.post.update).not.toHaveBeenCalled();
  });
```

- [ ] **Step 2: Run the spec to confirm it fails**

Run: `pnpm test -- polling-processor`
Expected: FAIL — ts-jest type error because `polling-processor.ts` still reads
`post.polling_enabled` in the no-op guard.

- [ ] **Step 3: Update the no-op guard**

In `src/polling/polling-processor.ts`, change the guard (lines 75-82) so the manual/active
check no longer references `polling_enabled`:

```ts
    const manual = job.data.manual === true;
    if (
      !post ||
      post.deleted_at ||
      !post.url ||
      (!manual && post.campaign.status !== CampaignStatus.ACTIVE)
    ) {
```

- [ ] **Step 4: Run the spec to confirm it passes**

Run: `pnpm test -- polling-processor`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/polling/polling-processor.ts src/polling/polling-processor.spec.ts
git commit -m "refactor: processor no-op guard keys off campaign status"
```

---

## Task 4: Posts service, controller, DTOs

**Files:**
- Modify: `src/posts/posts.service.ts` (lines 579-581, 691, 806, 821-882, delete 884-935)
- Modify: `src/posts/posts.controller.ts` (delete lines 127-136 + the import)
- Modify: `src/posts/dto/update-post.dto.ts:7-11`
- Delete: `src/posts/dto/update-post-polling.dto.ts`
- Modify: `src/posts/dto/list-posts-query.dto.ts:37-40`
- Test: `src/posts/posts.service.spec.ts`

- [ ] **Step 1: Update the posts service spec first**

In `posts.service.spec.ts`:

Remove `polling_enabled: true,` from the `updateSettings` `findUnique` mock (line 750) and
the `findOne` mock (line 956).

Rewrite the first `updateSettings` test (lines 761-797) so it no longer sends or asserts
`polling_enabled` (the DTO no longer has it):

```ts
  it('clears overrides and reschedules when settings are saved as manual', async () => {
    prisma.post.update.mockResolvedValue({
      id: 'post-1',
      polling_metric_override: null,
      polling_comment_override: null,
    });

    await service.updateSettings('post-1', {
      polling_metric_override: null,
      polling_comment_override: null,
      kpi_targets: { engagement: 0, buzz: 0, interaction: 0, view: 0 },
    });

    expect(prisma.post.update).toHaveBeenCalledWith({
      where: { id: 'post-1' },
      data: {
        polling_metric_override: null,
        polling_comment_override: null,
        kpi_targets: { engagement: 0, buzz: 0, interaction: 0, view: 0 },
      },
    });
    expect(pollingSchedulerMock.reschedulePost).toHaveBeenCalledWith(
      expect.objectContaining({
        polling_metric_override: 3600,
        polling_comment_override: 21600,
      }),
      expect.objectContaining({
        polling_metric_override: null,
        polling_comment_override: null,
      }),
    );
  });
```

In the second `updateSettings` test (lines 799-833), remove the `polling_enabled` keys from
the `prisma.post.update` mock return (line 802), the DTO passed to `updateSettings`
(line 808), and the `data` assertion (line 817).

Delete the entire `describe('PostsService.setPollingEnabled', ...)` block (lines 836-915).

- [ ] **Step 2: Run the spec to confirm it fails**

Run: `pnpm test -- posts.service`
Expected: FAIL — ts-jest type errors (`posts.service.ts` still references `polling_enabled`
and `setPollingEnabled` is still present / referenced).

- [ ] **Step 3: Remove the list filter and output mappings**

In `src/posts/posts.service.ts`:

Delete the list filter (lines 579-581):

```ts
      ...(query.polling_enabled !== undefined && {
        polling_enabled: query.polling_enabled,
      }),
```

Delete the list-mapping line (691): `polling_enabled: p.polling_enabled,`
Delete the detail-mapping line (806): `polling_enabled: post.polling_enabled,`

- [ ] **Step 4: Update `updateSettings`**

In `updateSettings` (lines 821-882): remove `polling_enabled: true,` from the `findUnique`
`select` (line 827); remove `polling_enabled: dto.polling_enabled,` from the `update` `data`
(line 850); and replace the change-detection block (lines 857-879) with:

```ts
    const overridesChanged =
      post.polling_metric_override !== updated.polling_metric_override ||
      post.polling_comment_override !== updated.polling_comment_override;
    if (overridesChanged) {
      await this.pollingScheduler.reschedulePost(
        {
          id: post.id,
          polling_metric_override: post.polling_metric_override,
          polling_comment_override: post.polling_comment_override,
          campaign: post.campaign,
        },
        {
          id: updated.id,
          polling_metric_override: updated.polling_metric_override,
          polling_comment_override: updated.polling_comment_override,
          campaign: post.campaign,
        },
      );
    }
```

- [ ] **Step 5: Delete `setPollingEnabled`**

In `src/posts/posts.service.ts`, delete the entire `setPollingEnabled` method (lines
884-935).

- [ ] **Step 6: Delete the controller endpoint and its DTO import**

In `src/posts/posts.controller.ts`, delete the handler (lines 127-136):

```ts
  @Put('posts/:id/polling')
  @UseGuards(PostRolesGuard)
  @Roles(ProjectRole.MANAGER, ProjectRole.EXECUTIVE)
  @ApiOperation({ summary: 'Enable or disable polling for a post' })
  setPollingEnabled(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePostPollingDto,
  ) {
    return this.postsService.setPollingEnabled(id, dto.enabled);
  }
```

Then delete its now-unused import (line 37):
`import { UpdatePostPollingDto } from './dto/update-post-polling.dto';`

- [ ] **Step 7: Update the DTOs**

In `src/posts/dto/update-post.dto.ts`, delete the `polling_enabled` property and its
decorators (lines 7-11):

```ts
  @ApiProperty({
    description: 'Whether automatic polling is enabled for this post',
  })
  @IsBoolean()
  polling_enabled!: boolean;
```

If `IsBoolean` is now unused in that file, remove it from the `class-validator` import.

Delete the file `src/posts/dto/update-post-polling.dto.ts`.

In `src/posts/dto/list-posts-query.dto.ts`, delete the `polling_enabled` query property
(lines 37-40):

```ts
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  polling_enabled?: boolean;
```

If `Transform` is now unused in that file, remove it from the `class-transformer` import
(keep `Type`, which is still used).

- [ ] **Step 8: Run the spec to confirm it passes**

Run: `pnpm test -- posts.service`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/posts
git rm src/posts/dto/update-post-polling.dto.ts
git commit -m "refactor: remove polling_enabled from posts API"
```

---

## Task 5: Seed + backend full sweep

**Files:**
- Modify: `prisma/seed.ts:1347`

- [ ] **Step 1: Remove the field from the seed**

In `prisma/seed.ts`, delete the `polling_enabled: true,` line (1347) from the post seed data.

- [ ] **Step 2: Confirm no stray references remain in backend source**

Run: `grep -rn "polling_enabled\|setPollingEnabled\|UpdatePostPollingDto\|togglePolling" src prisma`
Expected: no output (empty). If anything prints, remove it before continuing.

- [ ] **Step 3: Run the full backend test suite**

Run: `pnpm test`
Expected: PASS — all suites green (ts-jest typechecks the whole graph; any leftover
reference would fail here).

- [ ] **Step 4: Commit**

```bash
git add prisma/seed.ts
git commit -m "chore: drop polling_enabled from seed"
```

---

## Task 6: Frontend

**Files:**
- Modify: `src/api/posts.ts` (lines 41, 82, 173, 184, delete 191-192)
- Modify: `src/pages/posts/PostDetailPage/components/PostSettingsDialog.tsx` (lines 52-58, 160-168)
- Modify: `src/pages/campaigns/CampaignDetailPage/components/use-campaign-posts.ts` (lines 50-75)

- [ ] **Step 1: Update the posts API module**

In `yehub-fe/src/api/posts.ts`:

Delete `polling_enabled: boolean` from the `PostItem` interface (line 41) and the
`PostListItem` interface (line 82).

Delete the `polling_enabled?: boolean` entry from the `listPosts` params object (line 173).

Delete `polling_enabled: boolean` from the `updatePostSettings` payload type (line 184),
leaving:

```ts
  updatePostSettings: (
    postId: string,
    data: {
      polling_metric_override: number | null
      polling_comment_override: number | null
      kpi_targets: KpiTargets
    },
  ) => apiClient.put<PostItem>(`/posts/${postId}/settings`, data),
```

Delete the `setPostPolling` function (lines 191-192):

```ts
  setPostPolling: (postId: string, enabled: boolean) =>
    apiClient.put<PostItem>(`/posts/${postId}/polling`, { enabled }),
```

> Note: if `PostDetail` (imported by the settings dialog) is a distinct interface that also
> declares `polling_enabled`, remove it there too. Step 4's grep will catch it.

- [ ] **Step 2: Update the settings dialog**

In `PostSettingsDialog.tsx`, remove `polling_enabled: boolean` from the `onSave` prop type
(line 53), leaving:

```ts
  onSave: (data: {
    polling_metric_override: number | null
    polling_comment_override: number | null
    kpi_targets: KpiTargets
  }) => void
```

In `onSubmit` (lines 160-168), drop the hardcoded `polling_enabled: true,` so it becomes:

```tsx
  const onSubmit = (values: FormValues) => {
    onSave({
      polling_metric_override: values.polling_metric_override,
      polling_comment_override: values.polling_comment_override,
      kpi_targets: values.kpi_targets,
    })
    onOpenChange(false)
  }
```

- [ ] **Step 3: Remove the dead `togglePolling` mutation**

In `use-campaign-posts.ts`, delete the `togglePolling` `useMutation` definition (around
line 50) and remove `togglePolling` from the hook's returned object (line 75). If this
leaves `postsApi` imported only for other uses, leave the import; if it becomes unused,
remove it.

- [ ] **Step 4: Confirm no stray references remain in frontend source**

Run: `grep -rn "polling_enabled\|setPostPolling\|togglePolling" src`
Expected: no output (empty). Remove any straggler it reports.

- [ ] **Step 5: Lint + typecheck the frontend**

Run: `pnpm build`
Expected: `tsc` + Vite build succeed with no type errors. (If the build surfaces an
unrelated pre-existing failure, isolate by running `pnpm lint` and confirm the only changed
files are clean.)

- [ ] **Step 6: Commit**

```bash
git add src/api/posts.ts src/pages/posts/PostDetailPage/components/PostSettingsDialog.tsx src/pages/campaigns/CampaignDetailPage/components/use-campaign-posts.ts
git commit -m "refactor: remove polling_enabled from frontend"
```

---

## Self-Review

**Spec coverage:**
- Schema + destructive migration → Task 1 ✓
- Scheduler (`PollingPost`, `canSchedule`, `postSelect`, two `where` filters) → Task 2 ✓
- Processor no-op guard → Task 3 ✓
- Posts service (list filter, mappings, `updateSettings`, delete `setPollingEnabled`) → Task 4 ✓
- Controller endpoint + DTOs (`UpdatePostSettingsDto`, `UpdatePostPollingDto`, `ListPostsQueryDto`) → Task 4 ✓
- Seed → Task 5 ✓
- Frontend (api types/param/payload, `setPostPolling`, dialog, `togglePolling`) → Task 6 ✓
- Test updates (scheduler/processor/posts specs; reframed pause cases) → Tasks 2/3/4 ✓
- `yehub-e2e/` untouched ✓ (not referenced in any task)

**Placeholder scan:** No TBD/TODO; every code step shows concrete code. The two
"if X becomes unused, remove the import" notes are conditional cleanups, not placeholders —
the grep steps (5.2, 6.4) and the test/build steps are the backstop.

**Type consistency:** `PollingPost` loses `polling_enabled` in Task 2; the `updateSettings`
reschedule snapshots in Task 4 construct objects matching the reduced `PollingPost` shape
(only `id`, `polling_metric_override`, `polling_comment_override`, `campaign`). The
`updatePostSettings` payload type (FE, Task 6) and `UpdatePostSettingsDto` (BE, Task 4) both
drop the same field and stay in sync. `canSchedule` signature unchanged.
