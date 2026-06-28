# Immediate Poll on Interval Change & Schedule (Re)activation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fire an immediate one-off poll for a post dimension (metrics/comments) exactly when that dimension transitions into — or changes within — an active recurring schedule, so "last sync" and "next sync" reflect interval edits and (re)activation right away.

**Architecture:** Centralize the logic in `PollingSchedulerService`. A single public predicate `dimensionsToPollOnChange(prev, next)` decides which dimensions to poll; a per-dimension `triggerImmediate` enqueues deduped `{ manual: true }` jobs. All scheduling entry points (post update, post un-pause, campaign activate, campaign interval change) route through these. The recurring schedule stays on BullMQ epoch-aligned `{ every }`; "next sync" remains live-read. No schema changes.

**Tech Stack:** NestJS 11, BullMQ 5, Prisma 7, Jest. Package manager: **pnpm**. All commands run from `yehub-be/`.

**Spec:** `docs/superpowers/specs/2026-06-07-immediate-poll-on-interval-change-design.md`

---

## File Structure

| File | Responsibility | Change |
|------|----------------|--------|
| `src/polling/polling-scheduler.service.ts` | Scheduling + immediate-trigger logic | Modify: per-dimension `triggerImmediate`, new `enqueueManualPoll`, `dimensionsToPollOnChange`, `safeTriggerImmediate`; wire `reschedulePost`, `scheduleCampaign`, `rescheduleCampaignInheritedPosts` |
| `src/polling/polling-scheduler.service.spec.ts` | Scheduler unit tests | Modify: add `getJob` to queue mock; add trigger/predicate/wiring tests |
| `src/posts/posts.service.ts` | Post update / enable / sync endpoints | Modify: `syncNow` new signature; `setPollingEnabled` routes through `reschedulePost` |
| `src/posts/posts.service.spec.ts` | Posts service unit tests | Modify: add `triggerImmediate` to mock; add `setPollingEnabled` tests |
| `src/campaigns/campaigns.service.ts` | Campaign status / interval edits | Modify: activate branch passes `{ triggerImmediate: true }` |
| `src/campaigns/campaigns.service.spec.ts` | Campaigns service unit tests | Modify: assert activate passes the flag |

---

## Task 1: Per-dimension `triggerImmediate` + `enqueueManualPoll`

Refactor the existing both-dimensions `triggerImmediate` into a per-dimension API and update its only caller (`syncNow`).

**Files:**
- Modify: `src/polling/polling-scheduler.service.ts:160-217` (replace `triggerImmediate`, add `enqueueManualPoll`)
- Modify: `src/posts/posts.service.ts:917-932` (`syncNow`)
- Test: `src/polling/polling-scheduler.service.spec.ts`

- [ ] **Step 1: Add `getJob` to the queue mock**

In `src/polling/polling-scheduler.service.spec.ts`, extend the `queue` object (currently `src/polling/polling-scheduler.service.spec.ts:18-23`) so it includes `getJob`:

```ts
const queue = {
  add: jest.fn(),
  upsertJobScheduler: jest.fn(),
  removeJobScheduler: jest.fn(),
  getJobScheduler: jest.fn(),
  getJob: jest.fn(),
};
```

- [ ] **Step 2: Write the failing tests**

Append to `src/polling/polling-scheduler.service.spec.ts` inside the `describe('PollingSchedulerService', ...)` block:

```ts
it('enqueues a manual metrics poll only when metrics requested', async () => {
  queue.getJob.mockResolvedValue(undefined);

  const result = await service.triggerImmediate('post-1', { metrics: true });

  expect(result).toEqual({ metrics: true, comments: false });
  expect(queue.add).toHaveBeenCalledTimes(1);
  expect(queue.add).toHaveBeenCalledWith(
    POLLING_JOB_NAMES.POLL_POST_METRICS,
    { postId: 'post-1', manual: true },
    expect.objectContaining({ jobId: 'post:post-1:manual-metrics' }),
  );
});

it('enqueues both manual polls when both requested', async () => {
  queue.getJob.mockResolvedValue(undefined);

  const result = await service.triggerImmediate('post-1', {
    metrics: true,
    comments: true,
  });

  expect(result).toEqual({ metrics: true, comments: true });
  expect(queue.add).toHaveBeenCalledWith(
    POLLING_JOB_NAMES.POLL_POST_COMMENTS,
    { postId: 'post-1', manual: true },
    expect.objectContaining({ jobId: 'post:post-1:manual-comments' }),
  );
});

it('skips a dimension whose manual job is already pending', async () => {
  queue.getJob.mockImplementation((id: string) => {
    if (id === 'post:post-1:manual-metrics') {
      return Promise.resolve({
        isActive: () => Promise.resolve(true),
        isWaiting: () => Promise.resolve(false),
        isDelayed: () => Promise.resolve(false),
      });
    }
    return Promise.resolve(undefined);
  });

  const result = await service.triggerImmediate('post-1', {
    metrics: true,
    comments: true,
  });

  expect(result).toEqual({ metrics: false, comments: true });
  expect(queue.add).toHaveBeenCalledTimes(1);
  expect(queue.add).toHaveBeenCalledWith(
    POLLING_JOB_NAMES.POLL_POST_COMMENTS,
    expect.anything(),
    expect.anything(),
  );
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `pnpm test -- polling-scheduler.service.spec`
Expected: FAIL — `triggerImmediate` returns `{ enqueued }`, not `{ metrics, comments }`; type/shape mismatch.

- [ ] **Step 4: Implement the per-dimension trigger**

In `src/polling/polling-scheduler.service.ts`, replace the entire `triggerImmediate` method (`src/polling/polling-scheduler.service.ts:160-201`) with:

```ts
  async triggerImmediate(
    postId: string,
    dimensions: { metrics?: boolean; comments?: boolean },
  ): Promise<{ metrics: boolean; comments: boolean }> {
    const [metrics, comments] = await Promise.all([
      dimensions.metrics
        ? this.enqueueManualPoll(postId, POLLING_JOB_NAMES.POLL_POST_METRICS)
        : Promise.resolve(false),
      dimensions.comments
        ? this.enqueueManualPoll(postId, POLLING_JOB_NAMES.POLL_POST_COMMENTS)
        : Promise.resolve(false),
    ]);
    if (metrics || comments) {
      this.logger.debug(
        `Queued manual poll postId=${postId} metrics=${metrics} comments=${comments}`,
      );
    }
    return { metrics, comments };
  }

  private async enqueueManualPoll(
    postId: string,
    jobName: string,
  ): Promise<boolean> {
    const jobId = this.manualJobId(jobName, postId);
    const existing = await this.pollingQueue.getJob(jobId);
    if (await this.isJobPending(existing)) {
      return false;
    }
    await this.pollingQueue.add(
      jobName,
      { postId, manual: true },
      {
        attempts: POLLING_JOB_ATTEMPTS,
        backoff: { type: 'platform', delay: POLLING_JOB_BACKOFF_DELAY_MS },
        removeOnComplete: true,
        removeOnFail: true,
        jobId,
      },
    );
    return true;
  }
```

Leave `manualJobId` (`src/polling/polling-scheduler.service.ts:203-207`) and `isJobPending` (`src/polling/polling-scheduler.service.ts:209-217`) unchanged.

- [ ] **Step 5: Update the `syncNow` caller**

In `src/posts/posts.service.ts`, replace the trigger + conflict check in `syncNow` (`src/posts/posts.service.ts:926-931`) with:

```ts
    const result = await this.pollingScheduler.triggerImmediate(postId, {
      metrics: true,
      comments: true,
    });
    if (!result.metrics && !result.comments) {
      throw new ConflictException(
        'A sync is already in progress for this post',
      );
    }
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `pnpm test -- polling-scheduler.service.spec`
Expected: PASS (all, including the three new tests).

- [ ] **Step 7: Build to confirm the caller compiles**

Run: `pnpm build`
Expected: succeeds with no TypeScript errors.

- [ ] **Step 8: Commit**

```bash
git add src/polling/polling-scheduler.service.ts src/polling/polling-scheduler.service.spec.ts src/posts/posts.service.ts
git commit -m "refactor: make triggerImmediate per-dimension"
```

---

## Task 2: `dimensionsToPollOnChange` predicate + `safeTriggerImmediate`

The single source of truth for "should this dimension poll now?" `dimensionsToPollOnChange` is public (unit-tested directly, like `resolveIntervals`); `safeTriggerImmediate` is private (tested via Task 3).

**Files:**
- Modify: `src/polling/polling-scheduler.service.ts` (add two methods near `resolveIntervals`)
- Test: `src/polling/polling-scheduler.service.spec.ts`

- [ ] **Step 1: Write the failing tests**

Append to `src/polling/polling-scheduler.service.spec.ts` inside the `describe('PollingSchedulerService', ...)` block. These reuse the existing `activePost` fixture (`src/polling/polling-scheduler.service.spec.ts:5-15`):

```ts
describe('dimensionsToPollOnChange', () => {
  const enabledActive = {
    id: 'post-1',
    polling_enabled: true,
    polling_metric_override: 120,
    polling_comment_override: 240,
    campaign: {
      status: CampaignStatus.ACTIVE,
      metric_polling_interval: null,
      comments_polling_interval: null,
    },
  };

  it('polls a dimension whose interval value changed', () => {
    const next = { ...enabledActive, polling_metric_override: 300 };
    expect(service.dimensionsToPollOnChange(enabledActive, next)).toEqual({
      metrics: true,
      comments: false,
    });
  });

  it('polls a dimension that became schedulable (un-paused)', () => {
    const prev = { ...enabledActive, polling_enabled: false };
    expect(service.dimensionsToPollOnChange(prev, enabledActive)).toEqual({
      metrics: true,
      comments: true,
    });
  });

  it('polls a dimension switched from manual to recurring', () => {
    const prev = { ...enabledActive, polling_metric_override: 0 };
    expect(service.dimensionsToPollOnChange(prev, enabledActive)).toEqual({
      metrics: true,
      comments: false,
    });
  });

  it('does not poll a dimension switched to manual (0)', () => {
    const next = { ...enabledActive, polling_metric_override: 0 };
    expect(service.dimensionsToPollOnChange(enabledActive, next)).toEqual({
      metrics: false,
      comments: false,
    });
  });

  it('does not poll when nothing changed', () => {
    expect(
      service.dimensionsToPollOnChange(enabledActive, enabledActive),
    ).toEqual({ metrics: false, comments: false });
  });

  it('does not poll when the post is disabled or campaign inactive', () => {
    const prev = { ...enabledActive, polling_enabled: false };
    const next = {
      ...enabledActive,
      polling_enabled: false,
      polling_metric_override: 300,
    };
    expect(service.dimensionsToPollOnChange(prev, next)).toEqual({
      metrics: false,
      comments: false,
    });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test -- polling-scheduler.service.spec`
Expected: FAIL — `service.dimensionsToPollOnChange is not a function`.

- [ ] **Step 3: Implement the predicate and the safe wrapper**

In `src/polling/polling-scheduler.service.ts`, add immediately after the `resolveIntervals` method (after `src/polling/polling-scheduler.service.ts:62`):

```ts
  dimensionsToPollOnChange(
    prev: PollingPost,
    next: PollingPost,
  ): { metrics: boolean; comments: boolean } {
    const prevIntervals = this.resolveIntervals(prev);
    const nextIntervals = this.resolveIntervals(next);
    const prevSchedulable = this.canSchedule(prev);
    const nextSchedulable = this.canSchedule(next);

    const shouldPoll = (
      prevInterval: number,
      nextInterval: number,
    ): boolean => {
      const nextActive =
        nextSchedulable && this.isRecurringInterval(nextInterval);
      if (!nextActive) return false;
      const prevActive =
        prevSchedulable && this.isRecurringInterval(prevInterval);
      return !prevActive || prevInterval !== nextInterval;
    };

    return {
      metrics: shouldPoll(
        prevIntervals.metricIntervalSeconds,
        nextIntervals.metricIntervalSeconds,
      ),
      comments: shouldPoll(
        prevIntervals.commentIntervalSeconds,
        nextIntervals.commentIntervalSeconds,
      ),
    };
  }

  private async safeTriggerImmediate(
    postId: string,
    dimensions: { metrics?: boolean; comments?: boolean },
  ): Promise<void> {
    if (!dimensions.metrics && !dimensions.comments) return;
    try {
      await this.triggerImmediate(postId, dimensions);
    } catch (error) {
      this.logger.warn(
        `Immediate poll enqueue failed postId=${postId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test -- polling-scheduler.service.spec`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/polling/polling-scheduler.service.ts src/polling/polling-scheduler.service.spec.ts
git commit -m "feat: add dimensionsToPollOnChange predicate"
```

---

## Task 3: Wire `reschedulePost` to fire immediate polls

**Files:**
- Modify: `src/polling/polling-scheduler.service.ts:219-227` (`reschedulePost`)
- Test: `src/polling/polling-scheduler.service.spec.ts`

- [ ] **Step 1: Write the failing tests**

Append to `src/polling/polling-scheduler.service.spec.ts` inside the `describe('PollingSchedulerService', ...)` block:

```ts
describe('reschedulePost immediate poll', () => {
  const base = {
    id: 'post-1',
    polling_enabled: true,
    polling_metric_override: 120,
    polling_comment_override: 240,
    campaign: {
      status: CampaignStatus.ACTIVE,
      metric_polling_interval: null,
      comments_polling_interval: null,
    },
  };

  beforeEach(() => {
    queue.getJob.mockResolvedValue(undefined);
  });

  it('triggers an immediate poll only for the changed dimension', async () => {
    const next = { ...base, polling_metric_override: 300 };

    await service.reschedulePost(base, next);

    expect(queue.add).toHaveBeenCalledTimes(1);
    expect(queue.add).toHaveBeenCalledWith(
      POLLING_JOB_NAMES.POLL_POST_METRICS,
      { postId: 'post-1', manual: true },
      expect.objectContaining({ jobId: 'post:post-1:manual-metrics' }),
    );
  });

  it('triggers no immediate poll when switching a dimension to manual', async () => {
    const next = { ...base, polling_metric_override: 0 };

    await service.reschedulePost(base, next);

    expect(queue.add).not.toHaveBeenCalled();
  });

  it('triggers no immediate poll when nothing changed', async () => {
    await service.reschedulePost(base, base);

    expect(queue.add).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test -- polling-scheduler.service.spec`
Expected: FAIL — `queue.add` is not called (current `reschedulePost` never triggers).

- [ ] **Step 3: Implement the wiring**

In `src/polling/polling-scheduler.service.ts`, replace the `reschedulePost` body (`src/polling/polling-scheduler.service.ts:219-227`) with:

```ts
  async reschedulePost(
    previousPost: PollingPost,
    nextPost: PollingPost,
  ): Promise<void> {
    await this.removePostSnapshot(previousPost);
    if (this.canSchedule(nextPost)) {
      await this.schedulePostSnapshot(nextPost);
      await this.safeTriggerImmediate(
        nextPost.id,
        this.dimensionsToPollOnChange(previousPost, nextPost),
      );
    }
  }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test -- polling-scheduler.service.spec`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/polling/polling-scheduler.service.ts src/polling/polling-scheduler.service.spec.ts
git commit -m "feat: trigger immediate poll on post interval change"
```

---

## Task 4: Route `setPollingEnabled` through `reschedulePost`

So un-pausing a post immediately polls its recurring dimensions, and pausing just removes jobs.

**Files:**
- Modify: `src/posts/posts.service.ts:884-915` (`setPollingEnabled`)
- Test: `src/posts/posts.service.spec.ts`

- [ ] **Step 1: Add `triggerImmediate` to the posts service polling mock**

In `src/posts/posts.service.spec.ts`, extend `pollingSchedulerMock` (`src/posts/posts.service.spec.ts:8-16`) with `triggerImmediate`:

```ts
const pollingSchedulerMock = {
  schedulePost: jest.fn(),
  removePost: jest.fn(),
  reschedulePost: jest.fn(),
  scheduleCampaign: jest.fn(),
  removeCampaign: jest.fn(),
  rescheduleCampaignInheritedPosts: jest.fn(),
  getNextSyncTimes: jest.fn(),
  triggerImmediate: jest.fn(),
};
```

- [ ] **Step 2: Write the failing tests**

Append a new describe block to `src/posts/posts.service.spec.ts` (after the `PostsService.updateSettings` block ends at `src/posts/posts.service.spec.ts:833`):

```ts
describe('PostsService.setPollingEnabled', () => {
  let service: PostsService;

  const prisma = {
    post: { findUnique: jest.fn(), update: jest.fn() },
  };

  const existingPost = {
    id: 'post-1',
    deleted_at: null,
    polling_enabled: false,
    polling_metric_override: 120,
    polling_comment_override: 240,
    campaign: {
      status: CampaignStatus.ACTIVE,
      metric_polling_interval: null,
      comments_polling_interval: null,
    },
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PostsService,
        { provide: PrismaService, useValue: prisma },
        { provide: PollingSchedulerService, useValue: pollingSchedulerMock },
      ],
    }).compile();
    service = module.get(PostsService);
  });

  it('reschedules with enabled transition when un-pausing', async () => {
    prisma.post.findUnique.mockResolvedValue(existingPost);
    prisma.post.update.mockResolvedValue({
      id: 'post-1',
      polling_enabled: true,
    });

    await service.setPollingEnabled('post-1', true);

    expect(pollingSchedulerMock.reschedulePost).toHaveBeenCalledWith(
      expect.objectContaining({ polling_enabled: false }),
      expect.objectContaining({ polling_enabled: true }),
    );
  });

  it('reschedules with disabled transition when pausing', async () => {
    prisma.post.findUnique.mockResolvedValue({
      ...existingPost,
      polling_enabled: true,
    });
    prisma.post.update.mockResolvedValue({
      id: 'post-1',
      polling_enabled: false,
    });

    await service.setPollingEnabled('post-1', false);

    expect(pollingSchedulerMock.reschedulePost).toHaveBeenCalledWith(
      expect.objectContaining({ polling_enabled: true }),
      expect.objectContaining({ polling_enabled: false }),
    );
  });

  it('does not reschedule when the enabled flag is unchanged', async () => {
    prisma.post.findUnique.mockResolvedValue({
      ...existingPost,
      polling_enabled: true,
    });
    prisma.post.update.mockResolvedValue({
      id: 'post-1',
      polling_enabled: true,
    });

    await service.setPollingEnabled('post-1', true);

    expect(pollingSchedulerMock.reschedulePost).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `pnpm test -- posts.service.spec`
Expected: FAIL — `setPollingEnabled` currently calls `schedulePost`/`removePost`, not `reschedulePost`.

- [ ] **Step 4: Implement the rerouting**

In `src/posts/posts.service.ts`, replace the entire `setPollingEnabled` method (`src/posts/posts.service.ts:884-915`) with:

```ts
  async setPollingEnabled(postId: string, enabled: boolean) {
    const post = await this.prisma.post.findUnique({
      where: { id: postId },
      select: {
        id: true,
        deleted_at: true,
        polling_enabled: true,
        polling_metric_override: true,
        polling_comment_override: true,
        campaign: {
          select: {
            status: true,
            metric_polling_interval: true,
            comments_polling_interval: true,
          },
        },
      },
    });
    if (!post || post.deleted_at) throw new NotFoundException('Post not found');

    if (post.campaign?.status === CampaignStatus.COMPLETED) {
      throw new BadRequestException(
        'Cannot edit a post in a completed campaign',
      );
    }

    const updated = await this.prisma.post.update({
      where: { id: postId },
      data: { polling_enabled: enabled },
    });

    if (post.polling_enabled !== enabled) {
      await this.pollingScheduler.reschedulePost(
        {
          id: post.id,
          polling_enabled: post.polling_enabled,
          polling_metric_override: post.polling_metric_override,
          polling_comment_override: post.polling_comment_override,
          campaign: post.campaign,
        },
        {
          id: post.id,
          polling_enabled: enabled,
          polling_metric_override: post.polling_metric_override,
          polling_comment_override: post.polling_comment_override,
          campaign: post.campaign,
        },
      );
    }

    return updated;
  }
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm test -- posts.service.spec`
Expected: PASS.

- [ ] **Step 6: Build to confirm types**

Run: `pnpm build`
Expected: succeeds.

- [ ] **Step 7: Commit**

```bash
git add src/posts/posts.service.ts src/posts/posts.service.spec.ts
git commit -m "feat: immediate poll when un-pausing a post"
```

---

## Task 5: `scheduleCampaign` immediate-poll option + campaign activate wiring

Campaign activate/reactivate polls every enabled post's recurring dimensions. Bulk upload and any other `scheduleCampaign` caller stay poll-free via the default.

**Files:**
- Modify: `src/polling/polling-scheduler.service.ts:64-75` (`scheduleCampaign`)
- Modify: `src/campaigns/campaigns.service.ts:323-324` (activate branch)
- Test: `src/polling/polling-scheduler.service.spec.ts`, `src/campaigns/campaigns.service.spec.ts`

- [ ] **Step 1: Write the failing scheduler tests**

Append to `src/polling/polling-scheduler.service.spec.ts` inside the `describe('PollingSchedulerService', ...)` block:

```ts
describe('scheduleCampaign immediate poll', () => {
  beforeEach(() => {
    queue.getJob.mockResolvedValue(undefined);
  });

  it('triggers immediate polls for recurring dimensions when requested', async () => {
    prisma.post.findMany.mockResolvedValue([
      {
        id: 'post-1',
        polling_enabled: true,
        polling_metric_override: 120,
        polling_comment_override: 0,
        campaign: {
          status: CampaignStatus.ACTIVE,
          metric_polling_interval: null,
          comments_polling_interval: null,
        },
      },
    ]);

    await service.scheduleCampaign('camp-1', { triggerImmediate: true });

    expect(queue.add).toHaveBeenCalledTimes(1);
    expect(queue.add).toHaveBeenCalledWith(
      POLLING_JOB_NAMES.POLL_POST_METRICS,
      { postId: 'post-1', manual: true },
      expect.objectContaining({ jobId: 'post:post-1:manual-metrics' }),
    );
  });

  it('does not trigger immediate polls by default', async () => {
    prisma.post.findMany.mockResolvedValue([
      {
        id: 'post-1',
        polling_enabled: true,
        polling_metric_override: 120,
        polling_comment_override: 240,
        campaign: {
          status: CampaignStatus.ACTIVE,
          metric_polling_interval: null,
          comments_polling_interval: null,
        },
      },
    ]);

    await service.scheduleCampaign('camp-1');

    expect(queue.add).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test -- polling-scheduler.service.spec`
Expected: FAIL — `scheduleCampaign` ignores the second arg and never calls `queue.add`.

- [ ] **Step 3: Implement the option**

In `src/polling/polling-scheduler.service.ts`, replace the `scheduleCampaign` method (`src/polling/polling-scheduler.service.ts:64-75`) with:

```ts
  async scheduleCampaign(
    campaignId: string,
    opts: { triggerImmediate?: boolean } = {},
  ): Promise<void> {
    const posts = await this.prisma.post.findMany({
      where: {
        campaign_id: campaignId,
        deleted_at: null,
        polling_enabled: true,
      },
      select: this.postSelect(),
    });

    await Promise.all(
      posts.map(async (post) => {
        await this.schedulePostSnapshot(post);
        if (opts.triggerImmediate && this.canSchedule(post)) {
          const intervals = this.resolveIntervals(post);
          await this.safeTriggerImmediate(post.id, {
            metrics: this.isRecurringInterval(intervals.metricIntervalSeconds),
            comments: this.isRecurringInterval(
              intervals.commentIntervalSeconds,
            ),
          });
        }
      }),
    );
  }
```

- [ ] **Step 4: Run the scheduler tests to verify they pass**

Run: `pnpm test -- polling-scheduler.service.spec`
Expected: PASS.

- [ ] **Step 5: Wire the campaign activate branch**

In `src/campaigns/campaigns.service.ts`, change the activate branch (`src/campaigns/campaigns.service.ts:323-324`) from:

```ts
    if (status === CampaignStatus.ACTIVE) {
      await this.pollingScheduler.scheduleCampaign(id);
```

to:

```ts
    if (status === CampaignStatus.ACTIVE) {
      await this.pollingScheduler.scheduleCampaign(id, {
        triggerImmediate: true,
      });
```

Leave the bulk-upload caller (`src/posts/posts.service.ts:396`) calling `scheduleCampaign(campaignId)` unchanged.

- [ ] **Step 6: Write the failing campaigns service test**

In `src/campaigns/campaigns.service.spec.ts`, add `triggerImmediate: jest.fn()` to `pollingSchedulerMock` (`src/campaigns/campaigns.service.spec.ts:7-14`), then append a new describe block at the end of the file:

```ts
describe('CampaignsService.changeStatus — activation triggers immediate polling', () => {
  let service: CampaignsService;

  const localMockPrisma = {
    project: { findUnique: jest.fn() },
    objective: { count: jest.fn() },
    campaign: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CampaignsService,
        { provide: PrismaService, useValue: localMockPrisma },
        { provide: PollingSchedulerService, useValue: pollingSchedulerMock },
      ],
    }).compile();
    service = module.get<CampaignsService>(CampaignsService);
    jest.clearAllMocks();
  });

  it('requests an immediate poll when a campaign becomes ACTIVE', async () => {
    localMockPrisma.campaign.findUnique.mockResolvedValue({
      status: 'DRAFT',
      deleted_at: null,
    });
    localMockPrisma.campaign.update.mockResolvedValue({
      id: 'c1',
      project_id: 'p1',
      name: 'Summer 2026',
      description: null,
      status: 'ACTIVE',
      platforms: [],
      start_date: new Date('2026-01-01'),
      end_date: new Date('2026-06-01'),
      metric_polling_interval: null,
      comments_polling_interval: null,
      display_metrics: [],
      deleted_at: null,
      created_at: new Date(),
      updated_at: new Date(),
      _count: { posts: 0 },
      project: { id: 'p1', name: 'Project' },
      posts: [],
      objectives: [],
    });

    await service.changeStatus('c1', 'ACTIVE' as any);

    expect(pollingSchedulerMock.scheduleCampaign).toHaveBeenCalledWith('c1', {
      triggerImmediate: true,
    });
  });
});
```

- [ ] **Step 7: Run the campaigns tests to verify they pass**

Run: `pnpm test -- campaigns.service.spec`
Expected: PASS (the new test fails first if Step 5 was skipped; with Step 5 done it passes).

- [ ] **Step 8: Build and commit**

Run: `pnpm build`
Expected: succeeds.

```bash
git add src/polling/polling-scheduler.service.ts src/polling/polling-scheduler.service.spec.ts src/campaigns/campaigns.service.ts src/campaigns/campaigns.service.spec.ts
git commit -m "feat: immediate poll on campaign activation"
```

---

## Task 6: Wire `rescheduleCampaignInheritedPosts` immediate polls

Campaign interval edits immediately poll inherited posts whose effective interval changed (per dimension), skipping override-set dimensions and non-ACTIVE posts.

**Files:**
- Modify: `src/polling/polling-scheduler.service.ts:86-119` (`rescheduleCampaignInheritedPosts`)
- Test: `src/polling/polling-scheduler.service.spec.ts`

- [ ] **Step 1: Write the failing test**

Append to `src/polling/polling-scheduler.service.spec.ts` inside the `describe('PollingSchedulerService', ...)` block:

```ts
describe('rescheduleCampaignInheritedPosts immediate poll', () => {
  beforeEach(() => {
    queue.getJob.mockResolvedValue(undefined);
  });

  it('polls only the inherited dimension whose interval changed', async () => {
    prisma.post.findMany.mockResolvedValue([
      {
        id: 'post-1',
        polling_enabled: true,
        polling_metric_override: null, // inherits metric
        polling_comment_override: 600, // overrides comment
        campaign: {
          status: CampaignStatus.ACTIVE,
          metric_polling_interval: 120, // current (new) value
          comments_polling_interval: 240,
        },
      },
    ]);

    await service.rescheduleCampaignInheritedPosts('camp-1', {
      metric_polling_interval: 300, // previous value (changed)
      comments_polling_interval: 240, // unchanged
    });

    expect(queue.add).toHaveBeenCalledTimes(1);
    expect(queue.add).toHaveBeenCalledWith(
      POLLING_JOB_NAMES.POLL_POST_METRICS,
      { postId: 'post-1', manual: true },
      expect.objectContaining({ jobId: 'post:post-1:manual-metrics' }),
    );
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test -- polling-scheduler.service.spec`
Expected: FAIL — `queue.add` not called (current method only removes + reschedules).

- [ ] **Step 3: Implement the wiring**

In `src/polling/polling-scheduler.service.ts`, replace the `Promise.all(...)` body inside `rescheduleCampaignInheritedPosts` (`src/polling/polling-scheduler.service.ts:103-118`) with:

```ts
    await Promise.all(
      posts.map(async (post) => {
        const previousPost = {
          ...post,
          campaign: {
            ...post.campaign,
            metric_polling_interval: previousIntervals.metric_polling_interval,
            comments_polling_interval:
              previousIntervals.comments_polling_interval,
          },
        };
        await this.removePostSnapshot(previousPost);
        if (post.campaign.status === CampaignStatus.ACTIVE) {
          await this.schedulePostSnapshot(post);
          await this.safeTriggerImmediate(
            post.id,
            this.dimensionsToPollOnChange(previousPost, post),
          );
        }
      }),
    );
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test -- polling-scheduler.service.spec`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/polling/polling-scheduler.service.ts src/polling/polling-scheduler.service.spec.ts
git commit -m "feat: immediate poll on campaign interval change"
```

---

## Task 7: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full backend test suite**

Run: `pnpm test`
Expected: all suites PASS.

- [ ] **Step 2: Lint**

Run: `pnpm lint`
Expected: no errors.

- [ ] **Step 3: Build**

Run: `pnpm build`
Expected: succeeds.

- [ ] **Step 4: Final commit (only if lint auto-fixed anything)**

```bash
git add -A
git commit -m "chore: lint fixes for immediate-poll feature"
```

---

## Notes

- **No schema/migration changes.** `last_*_polled_at` are written by the existing processor; "next sync" remains live-read from the BullMQ scheduler.
- **Out of scope (per spec):** post creation / bulk upload do not auto-poll; no throttling of the campaign-activation burst; no new e2e tests.
- **Behavior note:** `syncNow` now enqueues whichever dimension is free and only raises `ConflictException` when *neither* enqueues (previously all-or-nothing). This matches the spec.
