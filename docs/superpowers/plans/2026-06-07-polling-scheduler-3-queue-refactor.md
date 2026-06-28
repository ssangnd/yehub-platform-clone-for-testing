# Polling Scheduler 3-Queue Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the single `polling-fetch` queue into three dedicated BullMQ queues — `job-scheduler` (cron schedulers + a re-validating dispatcher), `metric-polling`, and `comment-polling` — with campaign-scoped scheduler IDs, cron-pattern cadence, and a fixed 10-minute retry.

**Architecture:** Repeatable job schedulers live on `job-scheduler` with IDs `campaign:{campaignId}:post:{postId}:{metrics|comments}` and fire on a cron pattern derived from a fixed interval set. A `PollingDispatchProcessor` consumes each fired job, re-validates the post (campaign ACTIVE, not deleted, has URL, no in-flight dupe), and forwards a work job onto `metric-polling` / `comment-polling`. Two thin work processors delegate to a shared `PollingRunner` (the old processor logic, moved verbatim). Manual/immediate polls enqueue directly onto the work queues. Campaign removal deletes all schedulers whose ID is prefixed with the campaign.

**Tech Stack:** NestJS 11, `@nestjs/bullmq` + BullMQ, Prisma 7, Jest. Package manager: **pnpm**.

**Conventions for this repo:**
- Run a single spec with `pnpm test -- <file-stem>` (e.g. `pnpm test -- polling-backoff`).
- `pnpm build` / `pnpm lint` are pre-existingly broken via a stale generated Prisma client — **do not** treat them as a gate. Verify with `pnpm test`.
- Backend style: single quotes, trailing commas, 2-space indent.
- All `cd` into `yehub-be` before running commands.

---

## File Structure

**Create:**
- `yehub-be/src/polling/polling-job.util.ts` — pure helpers: `schedulerId`, `workJobId`, `isJobPending`, `workJobOptions`.
- `yehub-be/src/polling/polling-backoff.ts` — `platformBackoffStrategy` (fixed 10-min default + rate-limit override).
- `yehub-be/src/polling/polling-runner.service.ts` — `PollingRunner` (scraping/persist/guard logic moved out of the old processor).
- `yehub-be/src/polling/metric-polling.processor.ts` — `MetricPollingProcessor` (thin, binds `metric-polling`).
- `yehub-be/src/polling/comment-polling.processor.ts` — `CommentPollingProcessor` (thin, binds `comment-polling`).
- `yehub-be/src/polling/polling-dispatch.processor.ts` — `PollingDispatchProcessor` (binds `job-scheduler`, re-validates + forwards).
- Specs: `polling-job.util.spec.ts`, `polling-backoff.spec.ts`, `polling-runner.service.spec.ts`, `metric-polling.processor.spec.ts`, `polling-dispatch.processor.spec.ts`.

**Modify:**
- `yehub-be/src/queue/queue.constants.ts` — new `QUEUE_NAMES`.
- `yehub-be/src/polling/polling.constants.ts` — interval set, cron map, retry delay, template opts.
- `yehub-be/src/posts/dto/update-post.dto.ts` — import shared interval set.
- `yehub-be/src/campaigns/dto/create-campaign.dto.ts` — `@IsIn` interval set (propagates to `UpdateCampaignDto`).
- `yehub-be/src/polling/polling-scheduler.service.ts` — full rewrite (3 queues, cron, campaign IDs, prefix removal, direct manual).
- `yehub-be/src/polling/polling-scheduler.service.spec.ts` — rewrite for new behavior.
- `yehub-be/src/posts/posts.service.ts` — add `campaign_id` to the updateSettings select; thread it into `reschedulePost`.
- `yehub-be/src/posts/posts.service.spec.ts` — add `campaign_id` to the updateSettings fixture.
- `yehub-be/src/polling/polling.module.ts` — register 3 queues.
- `yehub-be/src/polling/polling-processor.module.ts` — host 3 processors + runner.

**Delete:**
- `yehub-be/src/polling/polling-processor.ts` and `yehub-be/src/polling/polling-processor.spec.ts` (replaced by runner + processors + their specs).

---

## Task 1: Queue & polling constants

**Files:**
- Modify: `yehub-be/src/queue/queue.constants.ts`
- Modify: `yehub-be/src/polling/polling.constants.ts`
- Test: `yehub-be/src/polling/polling.constants.spec.ts` (create)

- [ ] **Step 1: Write the failing test**

Create `yehub-be/src/polling/polling.constants.spec.ts`:

```ts
import {
  INTERVAL_TO_CRON,
  POLLING_INTERVAL_OPTIONS,
  POLLING_JOB_RETRY_DELAY_MS,
} from './polling.constants';

describe('polling constants', () => {
  it('maps every non-manual interval option to a cron pattern', () => {
    for (const seconds of POLLING_INTERVAL_OPTIONS) {
      if (seconds === 0) continue;
      expect(INTERVAL_TO_CRON[seconds]).toBeDefined();
    }
  });

  it('uses the documented cron patterns', () => {
    expect(INTERVAL_TO_CRON).toEqual({
      900: '*/15 * * * *',
      3600: '0 * * * *',
      21600: '0 */6 * * *',
      43200: '0 */12 * * *',
      86400: '0 0 * * *',
    });
  });

  it('retries failed work jobs after 10 minutes', () => {
    expect(POLLING_JOB_RETRY_DELAY_MS).toBe(600_000);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd yehub-be && pnpm test -- polling.constants`
Expected: FAIL — `INTERVAL_TO_CRON` / `POLLING_INTERVAL_OPTIONS` / `POLLING_JOB_RETRY_DELAY_MS` not exported.

- [ ] **Step 3: Update `queue.constants.ts`**

Replace the `QUEUE_NAMES` block (keep `POLLING_JOB_NAMES` and the type exports below it unchanged):

```ts
export const QUEUE_NAMES = {
  DEFAULT: 'default',
  JOB_SCHEDULER: 'job-scheduler',
  METRIC_POLLING: 'metric-polling',
  COMMENT_POLLING: 'comment-polling',
} as const;
```

- [ ] **Step 4: Rewrite `polling.constants.ts`**

```ts
import type { JobsOptions } from 'bullmq';
import { POLLING_JOB_NAMES } from '../queue/queue.constants';

export const DEFAULT_METRIC_POLLING_INTERVAL_SECONDS = 86400;
export const DEFAULT_COMMENT_POLLING_INTERVAL_SECONDS = 86400;

// Manual (0) plus the recurring options shared by post overrides and campaigns.
export const POLLING_INTERVAL_OPTIONS = [0, 900, 3600, 21600, 43200, 86400];

// Wall-clock-aligned cron pattern per recurring interval (seconds). No offset.
export const INTERVAL_TO_CRON: Record<number, string> = {
  900: '*/15 * * * *',
  3600: '0 * * * *',
  21600: '0 */6 * * *',
  43200: '0 */12 * * *',
  86400: '0 0 * * *',
};

export const POLLING_JOB_ATTEMPTS = 3;
export const POLLING_JOB_RETRY_DELAY_MS = 600_000; // 10 minutes

// Options for the lightweight dispatch jobs produced by the job-scheduler queue.
// A failed dispatch is recovered by the next cron tick, so it does not retry.
export const SCHEDULER_TEMPLATE_OPTIONS: JobsOptions = {
  attempts: 1,
  removeOnComplete: true,
  removeOnFail: { count: 100 },
};

export type PollingJobType = 'metrics' | 'comments';

export const POLLING_JOB_TYPE_BY_NAME = {
  [POLLING_JOB_NAMES.POLL_POST_METRICS]: 'metrics',
  [POLLING_JOB_NAMES.POLL_POST_COMMENTS]: 'comments',
} as const;

export const POLLING_JOB_TYPES: Record<string, PollingJobType> =
  POLLING_JOB_TYPE_BY_NAME;
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd yehub-be && pnpm test -- polling.constants`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add yehub-be/src/queue/queue.constants.ts yehub-be/src/polling/polling.constants.ts yehub-be/src/polling/polling.constants.spec.ts
git commit -m "refactor: 3-queue names + interval-to-cron constants"
```

---

## Task 2: Pure ID & job-options helpers

**Files:**
- Create: `yehub-be/src/polling/polling-job.util.ts`
- Test: `yehub-be/src/polling/polling-job.util.spec.ts`

- [ ] **Step 1: Write the failing test**

Create `yehub-be/src/polling/polling-job.util.spec.ts`:

```ts
import type { Job } from 'bullmq';
import {
  isJobPending,
  schedulerId,
  workJobId,
  workJobOptions,
} from './polling-job.util';

const fakeJob = (states: {
  active?: boolean;
  waiting?: boolean;
  delayed?: boolean;
}): Job =>
  ({
    isActive: () => Promise.resolve(states.active ?? false),
    isWaiting: () => Promise.resolve(states.waiting ?? false),
    isDelayed: () => Promise.resolve(states.delayed ?? false),
  }) as unknown as Job;

describe('polling-job.util', () => {
  it('builds campaign-scoped scheduler ids', () => {
    expect(schedulerId('camp-1', 'post-1', 'metrics')).toBe(
      'campaign:camp-1:post:post-1:metrics',
    );
    expect(schedulerId('camp-1', 'post-1', 'comments')).toBe(
      'campaign:camp-1:post:post-1:comments',
    );
  });

  it('builds stable work job ids', () => {
    expect(workJobId('post-1')).toBe('post:post-1');
  });

  it('treats missing jobs as not pending', async () => {
    await expect(isJobPending(undefined)).resolves.toBe(false);
    await expect(isJobPending(null)).resolves.toBe(false);
  });

  it('treats active/waiting/delayed jobs as pending', async () => {
    await expect(isJobPending(fakeJob({ active: true }))).resolves.toBe(true);
    await expect(isJobPending(fakeJob({ waiting: true }))).resolves.toBe(true);
    await expect(isJobPending(fakeJob({ delayed: true }))).resolves.toBe(true);
    await expect(isJobPending(fakeJob({}))).resolves.toBe(false);
  });

  it('builds work job options with a 10-minute platform backoff and stable id', () => {
    expect(workJobOptions('post-1')).toEqual({
      attempts: 3,
      backoff: { type: 'platform', delay: 600_000 },
      removeOnComplete: { count: 100 },
      removeOnFail: { count: 500 },
      jobId: 'post:post-1',
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd yehub-be && pnpm test -- polling-job.util`
Expected: FAIL — module `./polling-job.util` not found.

- [ ] **Step 3: Create `yehub-be/src/polling/polling-job.util.ts`**

```ts
import type { Job, JobsOptions } from 'bullmq';
import {
  POLLING_JOB_ATTEMPTS,
  POLLING_JOB_RETRY_DELAY_MS,
  type PollingJobType,
} from './polling.constants';

export function schedulerId(
  campaignId: string,
  postId: string,
  dimension: PollingJobType,
): string {
  return `campaign:${campaignId}:post:${postId}:${dimension}`;
}

export function workJobId(postId: string): string {
  return `post:${postId}`;
}

export async function isJobPending(
  job: Job | undefined | null,
): Promise<boolean> {
  if (!job) return false;
  const [active, waiting, delayed] = await Promise.all([
    job.isActive(),
    job.isWaiting(),
    job.isDelayed(),
  ]);
  return active || waiting || delayed;
}

export function workJobOptions(postId: string): JobsOptions {
  return {
    attempts: POLLING_JOB_ATTEMPTS,
    backoff: { type: 'platform', delay: POLLING_JOB_RETRY_DELAY_MS },
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 500 },
    jobId: workJobId(postId),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd yehub-be && pnpm test -- polling-job.util`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add yehub-be/src/polling/polling-job.util.ts yehub-be/src/polling/polling-job.util.spec.ts
git commit -m "feat: polling job id and options helpers"
```

---

## Task 3: Backoff strategy (fixed 10-min + rate-limit override)

**Files:**
- Create: `yehub-be/src/polling/polling-backoff.ts`
- Test: `yehub-be/src/polling/polling-backoff.spec.ts`

- [ ] **Step 1: Write the failing test**

Create `yehub-be/src/polling/polling-backoff.spec.ts`:

```ts
import { platformBackoffStrategy } from './polling-backoff';
import { PlatformError, PlatformErrorCode } from './platform-error';

describe('platformBackoffStrategy', () => {
  it('returns a flat 10 minutes for ordinary failures', () => {
    expect(platformBackoffStrategy(1, 'platform', new Error('boom'))).toBe(
      600_000,
    );
    expect(platformBackoffStrategy(3, 'platform', new Error('boom'))).toBe(
      600_000,
    );
  });

  it('honors a platform rate-limit retryAfterMs', () => {
    const err = new PlatformError(
      PlatformErrorCode.RATE_LIMITED,
      'slow down',
      { retryAfterMs: 42_000 },
    );
    expect(platformBackoffStrategy(1, 'platform', err)).toBe(42_000);
  });

  it('falls back to 10 minutes when rate-limited without retryAfterMs', () => {
    const err = new PlatformError(PlatformErrorCode.RATE_LIMITED, 'slow down');
    expect(platformBackoffStrategy(1, 'platform', err)).toBe(600_000);
  });
});
```

> Before writing the implementation, open `yehub-be/src/polling/platform-error.ts` and confirm the `PlatformError` constructor signature `(code, message, opts?)` and that `retryAfterMs` is read from the third argument. Match the test's construction to the real signature; adjust the test if the constructor differs.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd yehub-be && pnpm test -- polling-backoff`
Expected: FAIL — module `./polling-backoff` not found.

- [ ] **Step 3: Create `yehub-be/src/polling/polling-backoff.ts`**

```ts
import { POLLING_JOB_RETRY_DELAY_MS } from './polling.constants';
import { PlatformError, PlatformErrorCode } from './platform-error';

/**
 * Work-job backoff: a flat 10-minute delay between attempts, except when a
 * platform reports a rate limit with an explicit retry-after, which wins.
 */
export function platformBackoffStrategy(
  _attemptsMade: number,
  type?: string,
  err?: Error,
): number {
  if (
    type === 'platform' &&
    err instanceof PlatformError &&
    err.code === PlatformErrorCode.RATE_LIMITED &&
    err.retryAfterMs !== undefined
  ) {
    return err.retryAfterMs;
  }
  return POLLING_JOB_RETRY_DELAY_MS;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd yehub-be && pnpm test -- polling-backoff`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add yehub-be/src/polling/polling-backoff.ts yehub-be/src/polling/polling-backoff.spec.ts
git commit -m "feat: fixed 10-minute polling backoff strategy"
```

---

## Task 4: Constrain campaign intervals to the shared enum

**Files:**
- Modify: `yehub-be/src/posts/dto/update-post.dto.ts`
- Modify: `yehub-be/src/campaigns/dto/create-campaign.dto.ts`
- Test: `yehub-be/src/campaigns/dto/create-campaign.dto.spec.ts` (create)

- [ ] **Step 1: Write the failing test**

Create `yehub-be/src/campaigns/dto/create-campaign.dto.spec.ts`:

```ts
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { CreateCampaignDto } from './create-campaign.dto';

const base = {
  name: 'Camp',
  project_id: '11111111-1111-1111-1111-111111111111',
  start_date: '2026-01-01',
  end_date: '2026-12-31',
};

const errorsFor = (overrides: Record<string, unknown>) =>
  validateSync(plainToInstance(CreateCampaignDto, { ...base, ...overrides }));

describe('CreateCampaignDto polling intervals', () => {
  it('accepts an allowed interval', () => {
    const errs = errorsFor({ metric_polling_interval: 3600 });
    expect(
      errs.find((e) => e.property === 'metric_polling_interval'),
    ).toBeUndefined();
  });

  it('accepts 0 (manual)', () => {
    const errs = errorsFor({ comments_polling_interval: 0 });
    expect(
      errs.find((e) => e.property === 'comments_polling_interval'),
    ).toBeUndefined();
  });

  it('rejects an off-enum interval', () => {
    const errs = errorsFor({ metric_polling_interval: 5000 });
    expect(
      errs.find((e) => e.property === 'metric_polling_interval'),
    ).toBeDefined();
  });
});
```

> The `base` object only needs the fields required by the other validators to compile; if `CreateCampaignDto` requires additional non-optional fields, add minimal valid values so that the *only* potential error under test is on the interval properties. Inspect the DTO before running.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd yehub-be && pnpm test -- create-campaign.dto`
Expected: FAIL — `5000` currently passes `@IsInt() @Min(60)`, so the "rejects" assertion fails.

- [ ] **Step 3: Update `update-post.dto.ts` to export the shared set**

Replace the local constant (line 4) and reference it, so there is one source of truth:

```ts
import { POLLING_INTERVAL_OPTIONS } from '../../polling/polling.constants';
```

Delete the local `const POST_POLLING_INTERVAL_OPTIONS = [...]` and replace both `@IsIn(POST_POLLING_INTERVAL_OPTIONS)` usages and both `enum: POST_POLLING_INTERVAL_OPTIONS` usages with `POLLING_INTERVAL_OPTIONS`.

- [ ] **Step 4: Update `create-campaign.dto.ts`**

Add the import near the other imports:

```ts
import { POLLING_INTERVAL_OPTIONS } from '../../polling/polling.constants';
```

Add `IsIn` to the `class-validator` import list, and replace the two interval field decorator blocks (currently `@IsOptional() @IsInt() @Min(60)`) with:

```ts
  @ApiPropertyOptional({
    example: 3600,
    description: 'Metric polling interval in seconds. Use 0 for manual.',
    enum: POLLING_INTERVAL_OPTIONS,
  })
  @IsOptional()
  @IsIn(POLLING_INTERVAL_OPTIONS)
  metric_polling_interval?: number;

  @ApiPropertyOptional({
    example: 21600,
    description: 'Comments polling interval in seconds. Use 0 for manual.',
    enum: POLLING_INTERVAL_OPTIONS,
  })
  @IsOptional()
  @IsIn(POLLING_INTERVAL_OPTIONS)
  comments_polling_interval?: number;
```

Remove the now-unused `Min` import if nothing else in the file uses it (grep first: `grep -n "Min(" yehub-be/src/campaigns/dto/create-campaign.dto.ts`). `UpdateCampaignDto` extends `CreateCampaignDto`, so it inherits the constraint automatically.

- [ ] **Step 5: Run test to verify it passes**

Run: `cd yehub-be && pnpm test -- create-campaign.dto`
Expected: PASS (3 tests).

- [ ] **Step 6: Guard the post DTO still compiles in tests**

Run: `cd yehub-be && pnpm test -- update-post.dto` (if a spec exists; otherwise skip). Then run the campaigns service spec to ensure DTO change didn't break it: `pnpm test -- campaigns.service`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add yehub-be/src/posts/dto/update-post.dto.ts yehub-be/src/campaigns/dto/create-campaign.dto.ts yehub-be/src/campaigns/dto/create-campaign.dto.spec.ts
git commit -m "refactor: constrain campaign polling intervals to shared enum"
```

---

## Task 5: Extract `PollingRunner` from the processor

This moves the existing `PollingProcessor` scraping/persist/guard logic into an injectable service with no queue binding. The work processors (Task 6) and dispatcher (Task 7) build on it.

**Files:**
- Create: `yehub-be/src/polling/polling-runner.service.ts`
- Create: `yehub-be/src/polling/polling-runner.service.spec.ts`
- Reference (do not delete yet): `yehub-be/src/polling/polling-processor.ts`

- [ ] **Step 1: Create `polling-runner.service.ts` by moving the processor body**

Copy the **entire** current contents of `yehub-be/src/polling/polling-processor.ts` into the new file `yehub-be/src/polling/polling-runner.service.ts`, then apply exactly these changes:

1. Remove the `Processor`, `WorkerHost` import from `@nestjs/bullmq` and remove the `QUEUE_NAMES` import (no longer referenced here).
2. Remove the exported `platformBackoffStrategy` function entirely (it now lives in `polling-backoff.ts` from Task 3).
3. Remove the `POLLING_JOB_BACKOFF_DELAY_MS` import from `./polling.constants` (only `POLLING_JOB_TYPES` is still needed from there).
4. Change the class declaration from:
   ```ts
   @Injectable()
   @Processor(QUEUE_NAMES.POLLING_FETCH, {
     concurrency: Number(process.env.POLLING_PROCESSOR_CONCURRENCY) || 1,
     settings: { backoffStrategy: platformBackoffStrategy },
   })
   export class PollingProcessor extends WorkerHost {
   ```
   to:
   ```ts
   @Injectable()
   export class PollingRunner {
   ```
5. Remove `extends WorkerHost` and the `super();` call in the constructor (keep the constructor params `prisma`, `adapters`, `uploads`).
6. Keep `async process(job: Job<PollingJobData>): Promise<void>` and **all** private helpers (`persistComments`, `flatten`, `ensureAuthorLinked`, `findCommentId`, `saveComment`) and the `PollingJobData` type **unchanged**.
7. Update the `Logger` context name to `PollingRunner`.

The retained imports at the top should be:

```ts
import { Injectable, Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import {
  CampaignStatus,
  LinkedBy,
  Platform,
  Prisma,
} from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UploadsService } from '../uploads/uploads.service';
import { PlatformAdapterRegistry } from './adapters/platform-adapter.registry';
import { RawComment, RawPostData } from './adapters/platform-adapter.interface';
import { POLLING_JOB_TYPES } from './polling.constants';
import { PlatformError } from './platform-error';
```

- [ ] **Step 2: Create the runner spec by porting the processor spec**

Copy `yehub-be/src/polling/polling-processor.spec.ts` to `yehub-be/src/polling/polling-runner.service.spec.ts` and apply:

1. Change the import line from
   `import { platformBackoffStrategy, PollingProcessor } from './polling-processor';`
   to
   `import { PollingRunner } from './polling-runner.service';`
2. Remove the `import { PlatformErrorCode } ...` only if it was used solely by backoff tests; keep `PlatformError`/`PlatformErrorCode` if other tests use them.
3. Rename `describe('PollingProcessor', ...)` → `describe('PollingRunner', ...)`.
4. Replace every `new PollingProcessor(...)` with `new PollingRunner(...)` and rename the `processor` variable to `runner` throughout (calls become `runner.process(job(...))`).
5. **Delete** any `describe`/`it` block that tests `platformBackoffStrategy` (now covered by `polling-backoff.spec.ts`).

- [ ] **Step 3: Run the runner spec to verify it passes**

Run: `cd yehub-be && pnpm test -- polling-runner.service`
Expected: PASS — same behavioral tests as the old processor (minus backoff).

- [ ] **Step 4: Commit**

```bash
git add yehub-be/src/polling/polling-runner.service.ts yehub-be/src/polling/polling-runner.service.spec.ts
git commit -m "refactor: extract PollingRunner from PollingProcessor"
```

---

## Task 6: Thin work processors (metric + comment)

**Files:**
- Create: `yehub-be/src/polling/metric-polling.processor.ts`
- Create: `yehub-be/src/polling/comment-polling.processor.ts`
- Test: `yehub-be/src/polling/metric-polling.processor.spec.ts`

- [ ] **Step 1: Write the failing test**

Create `yehub-be/src/polling/metric-polling.processor.spec.ts`:

```ts
import type { Job } from 'bullmq';
import { POLLING_JOB_NAMES } from '../queue/queue.constants';
import { MetricPollingProcessor } from './metric-polling.processor';

describe('MetricPollingProcessor', () => {
  it('delegates to the runner', async () => {
    const runner = { process: jest.fn().mockResolvedValue(undefined) };
    const processor = new MetricPollingProcessor(runner as any);
    const job = {
      name: POLLING_JOB_NAMES.POLL_POST_METRICS,
      data: { postId: 'post-1' },
    } as Job;

    await processor.process(job);

    expect(runner.process).toHaveBeenCalledWith(job);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd yehub-be && pnpm test -- metric-polling.processor`
Expected: FAIL — module not found.

- [ ] **Step 3: Create `metric-polling.processor.ts`**

```ts
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { Job } from 'bullmq';
import { QUEUE_NAMES } from '../queue/queue.constants';
import { platformBackoffStrategy } from './polling-backoff';
import { PollingRunner } from './polling-runner.service';

@Injectable()
@Processor(QUEUE_NAMES.METRIC_POLLING, {
  concurrency: Number(process.env.POLLING_PROCESSOR_CONCURRENCY) || 1,
  settings: { backoffStrategy: platformBackoffStrategy },
})
export class MetricPollingProcessor extends WorkerHost {
  constructor(private readonly runner: PollingRunner) {
    super();
  }

  async process(job: Job): Promise<void> {
    await this.runner.process(job);
  }
}
```

- [ ] **Step 4: Create `comment-polling.processor.ts`**

```ts
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { Job } from 'bullmq';
import { QUEUE_NAMES } from '../queue/queue.constants';
import { platformBackoffStrategy } from './polling-backoff';
import { PollingRunner } from './polling-runner.service';

@Injectable()
@Processor(QUEUE_NAMES.COMMENT_POLLING, {
  concurrency: Number(process.env.POLLING_PROCESSOR_CONCURRENCY) || 1,
  settings: { backoffStrategy: platformBackoffStrategy },
})
export class CommentPollingProcessor extends WorkerHost {
  constructor(private readonly runner: PollingRunner) {
    super();
  }

  async process(job: Job): Promise<void> {
    await this.runner.process(job);
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd yehub-be && pnpm test -- metric-polling.processor`
Expected: PASS (1 test). (The comment processor is structurally identical and exercised the same way; a dedicated spec is optional.)

- [ ] **Step 6: Commit**

```bash
git add yehub-be/src/polling/metric-polling.processor.ts yehub-be/src/polling/comment-polling.processor.ts yehub-be/src/polling/metric-polling.processor.spec.ts
git commit -m "feat: metric and comment polling work processors"
```

---

## Task 7: Dispatch processor (`job-scheduler` → work queues)

**Files:**
- Create: `yehub-be/src/polling/polling-dispatch.processor.ts`
- Test: `yehub-be/src/polling/polling-dispatch.processor.spec.ts`

- [ ] **Step 1: Write the failing test**

Create `yehub-be/src/polling/polling-dispatch.processor.spec.ts`:

```ts
import type { Job } from 'bullmq';
import { CampaignStatus } from '../../generated/prisma/client';
import { POLLING_JOB_NAMES } from '../queue/queue.constants';
import { PollingDispatchProcessor } from './polling-dispatch.processor';

describe('PollingDispatchProcessor', () => {
  const metricQueue = { add: jest.fn(), getJob: jest.fn() };
  const commentQueue = { add: jest.fn(), getJob: jest.fn() };
  const prisma = { post: { findUnique: jest.fn() } };
  let processor: PollingDispatchProcessor;

  const activePost = {
    id: 'post-1',
    url: 'https://x/y',
    deleted_at: null,
    campaign: { status: CampaignStatus.ACTIVE },
  };

  const job = (name: string): Job =>
    ({ name, data: { postId: 'post-1' } }) as Job;

  beforeEach(() => {
    jest.clearAllMocks();
    metricQueue.getJob.mockResolvedValue(undefined);
    commentQueue.getJob.mockResolvedValue(undefined);
    processor = new PollingDispatchProcessor(
      metricQueue as any,
      commentQueue as any,
      prisma as any,
    );
  });

  it('forwards a metrics dispatch to the metric queue', async () => {
    prisma.post.findUnique.mockResolvedValue(activePost);

    await processor.process(job(POLLING_JOB_NAMES.POLL_POST_METRICS));

    expect(metricQueue.add).toHaveBeenCalledWith(
      POLLING_JOB_NAMES.POLL_POST_METRICS,
      { postId: 'post-1' },
      expect.objectContaining({ jobId: 'post:post-1' }),
    );
    expect(commentQueue.add).not.toHaveBeenCalled();
  });

  it('forwards a comments dispatch to the comment queue', async () => {
    prisma.post.findUnique.mockResolvedValue(activePost);

    await processor.process(job(POLLING_JOB_NAMES.POLL_POST_COMMENTS));

    expect(commentQueue.add).toHaveBeenCalledWith(
      POLLING_JOB_NAMES.POLL_POST_COMMENTS,
      { postId: 'post-1' },
      expect.objectContaining({ jobId: 'post:post-1' }),
    );
  });

  it('no-ops when the campaign is not active', async () => {
    prisma.post.findUnique.mockResolvedValue({
      ...activePost,
      campaign: { status: CampaignStatus.PAUSED },
    });

    await processor.process(job(POLLING_JOB_NAMES.POLL_POST_METRICS));

    expect(metricQueue.add).not.toHaveBeenCalled();
  });

  it('no-ops when the post is deleted or has no url', async () => {
    prisma.post.findUnique.mockResolvedValue({
      ...activePost,
      deleted_at: new Date(),
    });
    await processor.process(job(POLLING_JOB_NAMES.POLL_POST_METRICS));

    prisma.post.findUnique.mockResolvedValue({ ...activePost, url: null });
    await processor.process(job(POLLING_JOB_NAMES.POLL_POST_METRICS));

    expect(metricQueue.add).not.toHaveBeenCalled();
  });

  it('skips when a work job for the post is already pending', async () => {
    prisma.post.findUnique.mockResolvedValue(activePost);
    metricQueue.getJob.mockResolvedValue({
      isActive: () => Promise.resolve(true),
      isWaiting: () => Promise.resolve(false),
      isDelayed: () => Promise.resolve(false),
    });

    await processor.process(job(POLLING_JOB_NAMES.POLL_POST_METRICS));

    expect(metricQueue.add).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd yehub-be && pnpm test -- polling-dispatch.processor`
Expected: FAIL — module not found.

- [ ] **Step 3: Create `polling-dispatch.processor.ts`**

```ts
import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { Job, Queue } from 'bullmq';
import { CampaignStatus } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { QUEUE_NAMES } from '../queue/queue.constants';
import { isJobPending, workJobId, workJobOptions } from './polling-job.util';
import { POLLING_JOB_TYPES } from './polling.constants';

type DispatchJobData = { postId: string };

@Injectable()
@Processor(QUEUE_NAMES.JOB_SCHEDULER)
export class PollingDispatchProcessor extends WorkerHost {
  private readonly logger = new Logger(PollingDispatchProcessor.name);

  constructor(
    @InjectQueue(QUEUE_NAMES.METRIC_POLLING)
    private readonly metricQueue: Queue,
    @InjectQueue(QUEUE_NAMES.COMMENT_POLLING)
    private readonly commentQueue: Queue,
    private readonly prisma: PrismaService,
  ) {
    super();
  }

  async process(job: Job<DispatchJobData>): Promise<void> {
    const jobType = POLLING_JOB_TYPES[job.name];
    if (!jobType) {
      this.logger.warn(`Ignoring unknown dispatch job jobName=${job.name}`);
      return;
    }

    const { postId } = job.data;
    const post = await this.prisma.post.findUnique({
      where: { id: postId },
      select: {
        url: true,
        deleted_at: true,
        campaign: { select: { status: true } },
      },
    });

    if (
      !post ||
      post.deleted_at ||
      !post.url ||
      post.campaign.status !== CampaignStatus.ACTIVE
    ) {
      this.logger.debug(`Dispatch skipped postId=${postId} jobType=${jobType}`);
      return;
    }

    const targetQueue =
      jobType === 'metrics' ? this.metricQueue : this.commentQueue;

    const existing = await targetQueue.getJob(workJobId(postId));
    if (await isJobPending(existing)) {
      this.logger.debug(
        `Dispatch deduped postId=${postId} jobType=${jobType}`,
      );
      return;
    }

    await targetQueue.add(job.name, { postId }, workJobOptions(postId));
    this.logger.debug(`Dispatched postId=${postId} jobType=${jobType}`);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd yehub-be && pnpm test -- polling-dispatch.processor`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add yehub-be/src/polling/polling-dispatch.processor.ts yehub-be/src/polling/polling-dispatch.processor.spec.ts
git commit -m "feat: polling dispatch processor re-validates and forwards"
```

---

## Task 8: Rewrite `PollingSchedulerService`

This is the core change: three injected queues, cron-pattern campaign-scoped schedulers, direct manual/immediate enqueue onto work queues, and prefix-based campaign removal.

**Files:**
- Modify: `yehub-be/src/polling/polling-scheduler.service.ts`
- Modify: `yehub-be/src/polling/polling-scheduler.service.spec.ts`

- [ ] **Step 1: Replace the spec with the new behavior**

Replace the entire contents of `yehub-be/src/polling/polling-scheduler.service.spec.ts` with:

```ts
import { CampaignStatus } from '../../generated/prisma/client';
import { POLLING_JOB_NAMES } from '../queue/queue.constants';
import { PollingSchedulerService } from './polling-scheduler.service';

const activePost = {
  id: 'post-1',
  campaign_id: 'camp-1',
  polling_metric_override: null,
  polling_comment_override: 3600,
  campaign: {
    status: CampaignStatus.ACTIVE,
    metric_polling_interval: 900,
    comments_polling_interval: 21600,
  },
};

describe('PollingSchedulerService', () => {
  const scheduler = {
    upsertJobScheduler: jest.fn(),
    removeJobScheduler: jest.fn(),
    getJobScheduler: jest.fn(),
    getJobSchedulers: jest.fn(),
  };
  const metricQueue = { add: jest.fn(), getJob: jest.fn() };
  const commentQueue = { add: jest.fn(), getJob: jest.fn() };
  const prisma = {
    post: { findMany: jest.fn(), findUnique: jest.fn() },
  };
  let service: PollingSchedulerService;

  beforeEach(() => {
    jest.clearAllMocks();
    metricQueue.getJob.mockResolvedValue(undefined);
    commentQueue.getJob.mockResolvedValue(undefined);
    service = new PollingSchedulerService(
      scheduler as any,
      metricQueue as any,
      commentQueue as any,
      prisma as any,
    );
  });

  it('resolves post override, campaign default, and fallback intervals', () => {
    expect(service.resolveIntervals(activePost)).toEqual({
      metricIntervalSeconds: 900,
      commentIntervalSeconds: 3600,
    });
    expect(
      service.resolveIntervals({
        ...activePost,
        polling_comment_override: null,
        campaign: {
          status: CampaignStatus.ACTIVE,
          metric_polling_interval: null,
          comments_polling_interval: null,
        },
      }),
    ).toEqual({ metricIntervalSeconds: 86400, commentIntervalSeconds: 86400 });
  });

  it('upserts cron schedulers with campaign-scoped ids', async () => {
    prisma.post.findUnique.mockResolvedValue(activePost);
    await service.schedulePost('post-1');

    expect(scheduler.upsertJobScheduler).toHaveBeenCalledWith(
      'campaign:camp-1:post:post-1:metrics',
      { pattern: '*/15 * * * *' },
      expect.objectContaining({
        name: POLLING_JOB_NAMES.POLL_POST_METRICS,
        data: { postId: 'post-1' },
      }),
    );
    expect(scheduler.upsertJobScheduler).toHaveBeenCalledWith(
      'campaign:camp-1:post:post-1:comments',
      { pattern: '0 * * * *' },
      expect.objectContaining({
        name: POLLING_JOB_NAMES.POLL_POST_COMMENTS,
        data: { postId: 'post-1' },
      }),
    );
  });

  it('removes the dimension scheduler when an interval is manual', async () => {
    prisma.post.findUnique.mockResolvedValue({
      ...activePost,
      polling_metric_override: 0,
    });

    await service.schedulePost('post-1');

    expect(scheduler.upsertJobScheduler).not.toHaveBeenCalledWith(
      'campaign:camp-1:post:post-1:metrics',
      expect.anything(),
      expect.anything(),
    );
    expect(scheduler.removeJobScheduler).toHaveBeenCalledWith(
      'campaign:camp-1:post:post-1:metrics',
    );
    expect(scheduler.upsertJobScheduler).toHaveBeenCalledWith(
      'campaign:camp-1:post:post-1:comments',
      { pattern: '0 * * * *' },
      expect.anything(),
    );
  });

  it('removes a post by exact scheduler ids', async () => {
    prisma.post.findUnique.mockResolvedValue(activePost);

    await service.removePost('post-1');

    expect(scheduler.removeJobScheduler).toHaveBeenCalledWith(
      'campaign:camp-1:post:post-1:metrics',
    );
    expect(scheduler.removeJobScheduler).toHaveBeenCalledWith(
      'campaign:camp-1:post:post-1:comments',
    );
  });

  it('removes every scheduler for a campaign by id prefix', async () => {
    scheduler.getJobSchedulers.mockResolvedValue([
      { key: 'campaign:camp-1:post:post-1:metrics' },
      { key: 'campaign:camp-1:post:post-2:comments' },
      { key: 'campaign:camp-2:post:post-9:metrics' },
    ]);

    await service.removeCampaign('camp-1');

    expect(scheduler.removeJobScheduler).toHaveBeenCalledWith(
      'campaign:camp-1:post:post-1:metrics',
    );
    expect(scheduler.removeJobScheduler).toHaveBeenCalledWith(
      'campaign:camp-1:post:post-2:comments',
    );
    expect(scheduler.removeJobScheduler).not.toHaveBeenCalledWith(
      'campaign:camp-2:post:post-9:metrics',
    );
  });

  it('reads next sync times from the scheduler queue', async () => {
    prisma.post.findUnique.mockResolvedValue(activePost);
    scheduler.getJobScheduler.mockImplementation((id: string) => {
      if (id === 'campaign:camp-1:post:post-1:metrics') {
        return Promise.resolve({ key: id, next: 1_800_000 });
      }
      if (id === 'campaign:camp-1:post:post-1:comments') {
        return Promise.resolve({ key: id, next: 3_600_000 });
      }
      return Promise.resolve(undefined);
    });

    await expect(service.getNextSyncTimes('post-1')).resolves.toEqual({
      next_metric_sync_at: new Date(1_800_000),
      next_comment_sync_at: new Date(3_600_000),
    });
  });

  it('enqueues manual polls directly onto the work queues', async () => {
    const result = await service.triggerImmediate('post-1', {
      metrics: true,
      comments: true,
    });

    expect(result).toEqual({ metrics: true, comments: true });
    expect(metricQueue.add).toHaveBeenCalledWith(
      POLLING_JOB_NAMES.POLL_POST_METRICS,
      { postId: 'post-1', manual: true },
      expect.objectContaining({ jobId: 'post:post-1' }),
    );
    expect(commentQueue.add).toHaveBeenCalledWith(
      POLLING_JOB_NAMES.POLL_POST_COMMENTS,
      { postId: 'post-1', manual: true },
      expect.objectContaining({ jobId: 'post:post-1' }),
    );
  });

  it('skips a manual dimension whose work job is already pending', async () => {
    metricQueue.getJob.mockResolvedValue({
      isActive: () => Promise.resolve(true),
      isWaiting: () => Promise.resolve(false),
      isDelayed: () => Promise.resolve(false),
    });

    const result = await service.triggerImmediate('post-1', {
      metrics: true,
      comments: true,
    });

    expect(result).toEqual({ metrics: false, comments: true });
    expect(metricQueue.add).not.toHaveBeenCalled();
    expect(commentQueue.add).toHaveBeenCalledTimes(1);
  });

  describe('reschedulePost immediate poll', () => {
    const base = {
      id: 'post-1',
      campaign_id: 'camp-1',
      polling_metric_override: 900,
      polling_comment_override: 3600,
      campaign: {
        status: CampaignStatus.ACTIVE,
        metric_polling_interval: null,
        comments_polling_interval: null,
      },
    };

    it('triggers an immediate poll only for the changed dimension', async () => {
      const next = { ...base, polling_metric_override: 3600 };

      await service.reschedulePost(base, next);

      expect(metricQueue.add).toHaveBeenCalledTimes(1);
      expect(commentQueue.add).not.toHaveBeenCalled();
    });

    it('triggers no immediate poll when switching a dimension to manual', async () => {
      const next = { ...base, polling_metric_override: 0 };

      await service.reschedulePost(base, next);

      expect(metricQueue.add).not.toHaveBeenCalled();
    });

    it('triggers no immediate poll when nothing changed', async () => {
      await service.reschedulePost(base, base);

      expect(metricQueue.add).not.toHaveBeenCalled();
      expect(commentQueue.add).not.toHaveBeenCalled();
    });
  });

  describe('scheduleCampaign immediate poll', () => {
    it('triggers immediate polls for recurring dimensions when requested', async () => {
      prisma.post.findMany.mockResolvedValue([
        {
          id: 'post-1',
          campaign_id: 'camp-1',
          polling_metric_override: 900,
          polling_comment_override: 0,
          campaign: {
            status: CampaignStatus.ACTIVE,
            metric_polling_interval: null,
            comments_polling_interval: null,
          },
        },
      ]);

      await service.scheduleCampaign('camp-1', { triggerImmediate: true });

      expect(metricQueue.add).toHaveBeenCalledTimes(1);
      expect(commentQueue.add).not.toHaveBeenCalled();
    });
  });
});
```

- [ ] **Step 2: Run the spec to verify it fails**

Run: `cd yehub-be && pnpm test -- polling-scheduler.service`
Expected: FAIL — constructor arity (4 args) and new methods/IDs don't match the current implementation.

- [ ] **Step 3: Rewrite `polling-scheduler.service.ts`**

Replace the entire file with:

```ts
import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { Queue } from 'bullmq';
import { CampaignStatus } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { POLLING_JOB_NAMES, QUEUE_NAMES } from '../queue/queue.constants';
import {
  DEFAULT_COMMENT_POLLING_INTERVAL_SECONDS,
  DEFAULT_METRIC_POLLING_INTERVAL_SECONDS,
  INTERVAL_TO_CRON,
  SCHEDULER_TEMPLATE_OPTIONS,
  type PollingJobType,
} from './polling.constants';
import {
  isJobPending,
  schedulerId,
  workJobId,
  workJobOptions,
} from './polling-job.util';

type PollingPost = {
  id: string;
  campaign_id: string;
  polling_metric_override: number | null;
  polling_comment_override: number | null;
  campaign: {
    status: CampaignStatus;
    metric_polling_interval: number | null;
    comments_polling_interval: number | null;
  };
};

export type EffectivePollingIntervals = {
  metricIntervalSeconds: number;
  commentIntervalSeconds: number;
};

export type CampaignPollingIntervals = {
  metric_polling_interval: number | null;
  comments_polling_interval: number | null;
};

export type NextPostSyncTimes = {
  next_metric_sync_at: Date | null;
  next_comment_sync_at: Date | null;
};

const JOB_NAME_BY_DIMENSION: Record<PollingJobType, string> = {
  metrics: POLLING_JOB_NAMES.POLL_POST_METRICS,
  comments: POLLING_JOB_NAMES.POLL_POST_COMMENTS,
};

@Injectable()
export class PollingSchedulerService {
  private readonly logger = new Logger(PollingSchedulerService.name);

  constructor(
    @InjectQueue(QUEUE_NAMES.JOB_SCHEDULER)
    private readonly schedulerQueue: Queue,
    @InjectQueue(QUEUE_NAMES.METRIC_POLLING)
    private readonly metricQueue: Queue,
    @InjectQueue(QUEUE_NAMES.COMMENT_POLLING)
    private readonly commentQueue: Queue,
    private readonly prisma: PrismaService,
  ) {}

  resolveIntervals(post: PollingPost): EffectivePollingIntervals {
    return {
      metricIntervalSeconds:
        post.polling_metric_override ??
        post.campaign.metric_polling_interval ??
        DEFAULT_METRIC_POLLING_INTERVAL_SECONDS,
      commentIntervalSeconds:
        post.polling_comment_override ??
        post.campaign.comments_polling_interval ??
        DEFAULT_COMMENT_POLLING_INTERVAL_SECONDS,
    };
  }

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

  async scheduleCampaign(
    campaignId: string,
    opts: { triggerImmediate?: boolean } = {},
  ): Promise<void> {
    const posts = await this.prisma.post.findMany({
      where: { campaign_id: campaignId, deleted_at: null },
      select: this.postSelect(),
    });

    await Promise.all(
      posts.map(async (post) => {
        await this.applyPostSchedules(post);
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

  async removeCampaign(campaignId: string): Promise<void> {
    const prefix = `campaign:${campaignId}:`;
    const schedulers = await this.schedulerQueue.getJobSchedulers();
    await Promise.all(
      schedulers
        .filter((s) => s.key?.startsWith(prefix))
        .map((s) => this.schedulerQueue.removeJobScheduler(s.key)),
    );
    this.logger.debug(`Removed schedulers for campaignId=${campaignId}`);
  }

  async rescheduleCampaignInheritedPosts(
    campaignId: string,
    previousIntervals: CampaignPollingIntervals,
  ): Promise<void> {
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
        await this.applyPostSchedules(post);
        if (this.canSchedule(post)) {
          await this.safeTriggerImmediate(
            post.id,
            this.dimensionsToPollOnChange(previousPost, post),
          );
        }
      }),
    );
  }

  async schedulePost(postId: string): Promise<void> {
    const post = await this.loadPost(postId);
    if (!post) return;
    await this.applyPostSchedules(post);
  }

  async removePost(postId: string): Promise<void> {
    const post = await this.loadPost(postId);
    if (!post) return;
    await Promise.all([
      this.schedulerQueue.removeJobScheduler(
        schedulerId(post.campaign_id, post.id, 'metrics'),
      ),
      this.schedulerQueue.removeJobScheduler(
        schedulerId(post.campaign_id, post.id, 'comments'),
      ),
    ]);
  }

  async reschedulePost(
    previousPost: PollingPost,
    nextPost: PollingPost,
  ): Promise<void> {
    await this.applyPostSchedules(nextPost);
    await this.safeTriggerImmediate(
      nextPost.id,
      this.dimensionsToPollOnChange(previousPost, nextPost),
    );
  }

  async getNextSyncTimes(postId: string): Promise<NextPostSyncTimes> {
    const empty = { next_metric_sync_at: null, next_comment_sync_at: null };
    const post = await this.loadPost(postId);
    if (!post || !this.canSchedule(post)) return empty;

    const [metricScheduler, commentScheduler] = await Promise.all([
      this.schedulerQueue.getJobScheduler(
        schedulerId(post.campaign_id, post.id, 'metrics'),
      ),
      this.schedulerQueue.getJobScheduler(
        schedulerId(post.campaign_id, post.id, 'comments'),
      ),
    ]);

    return {
      next_metric_sync_at: metricScheduler?.next
        ? new Date(metricScheduler.next)
        : null,
      next_comment_sync_at: commentScheduler?.next
        ? new Date(commentScheduler.next)
        : null,
    };
  }

  async triggerImmediate(
    postId: string,
    dimensions: { metrics?: boolean; comments?: boolean },
  ): Promise<{ metrics: boolean; comments: boolean }> {
    const [metrics, comments] = await Promise.all([
      dimensions.metrics
        ? this.enqueueManualPoll(postId, 'metrics')
        : Promise.resolve(false),
      dimensions.comments
        ? this.enqueueManualPoll(postId, 'comments')
        : Promise.resolve(false),
    ]);
    if (metrics || comments) {
      this.logger.debug(
        `Queued manual poll postId=${postId} metrics=${metrics} comments=${comments}`,
      );
    }
    return { metrics, comments };
  }

  private async applyPostSchedules(post: PollingPost): Promise<void> {
    const intervals = this.resolveIntervals(post);
    await Promise.all([
      this.applyDimension(post, 'metrics', intervals.metricIntervalSeconds),
      this.applyDimension(post, 'comments', intervals.commentIntervalSeconds),
    ]);
  }

  private async applyDimension(
    post: PollingPost,
    dimension: PollingJobType,
    intervalSeconds: number,
  ): Promise<void> {
    const id = schedulerId(post.campaign_id, post.id, dimension);
    if (this.canSchedule(post) && this.isRecurringInterval(intervalSeconds)) {
      await this.schedulerQueue.upsertJobScheduler(
        id,
        { pattern: INTERVAL_TO_CRON[intervalSeconds] },
        {
          name: JOB_NAME_BY_DIMENSION[dimension],
          data: { postId: post.id },
          opts: SCHEDULER_TEMPLATE_OPTIONS,
        },
      );
    } else {
      await this.schedulerQueue.removeJobScheduler(id);
    }
  }

  private async enqueueManualPoll(
    postId: string,
    dimension: PollingJobType,
  ): Promise<boolean> {
    const queue = dimension === 'metrics' ? this.metricQueue : this.commentQueue;
    const existing = await queue.getJob(workJobId(postId));
    if (await isJobPending(existing)) {
      return false;
    }
    await queue.add(
      JOB_NAME_BY_DIMENSION[dimension],
      { postId, manual: true },
      workJobOptions(postId),
    );
    return true;
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

  private async loadPost(postId: string): Promise<PollingPost | null> {
    return this.prisma.post.findUnique({
      where: { id: postId },
      select: this.postSelect(),
    });
  }

  private canSchedule(post: PollingPost): boolean {
    return post.campaign.status === CampaignStatus.ACTIVE;
  }

  private isRecurringInterval(intervalSeconds: number): boolean {
    return intervalSeconds > 0;
  }

  private postSelect() {
    return {
      id: true,
      campaign_id: true,
      polling_metric_override: true,
      polling_comment_override: true,
      campaign: {
        select: {
          status: true,
          metric_polling_interval: true,
          comments_polling_interval: true,
        },
      },
    } as const;
  }
}
```

- [ ] **Step 4: Run the spec to verify it passes**

Run: `cd yehub-be && pnpm test -- polling-scheduler.service`
Expected: PASS (all tests).

- [ ] **Step 5: Commit**

```bash
git add yehub-be/src/polling/polling-scheduler.service.ts yehub-be/src/polling/polling-scheduler.service.spec.ts
git commit -m "refactor: scheduler uses 3 queues, cron, campaign-scoped ids"
```

---

## Task 9: Thread `campaign_id` through `posts.service`

`reschedulePost` now needs `campaign_id` on the `PollingPost` objects it receives.

**Files:**
- Modify: `yehub-be/src/posts/posts.service.ts` (the `updateSettings` select ~lines 818-831 and the `reschedulePost` call ~lines 854-867)
- Modify: `yehub-be/src/posts/posts.service.spec.ts` (the `updateSettings` fixture ~line 747)

- [ ] **Step 1: Update the `updateSettings` select and reschedule call**

In `posts.service.ts`, in `updateSettings`, add `campaign_id: true` to the `select` (alongside `id`, `deleted_at`, the overrides, and `campaign`):

```ts
      select: {
        id: true,
        campaign_id: true,
        deleted_at: true,
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
```

Then add `campaign_id: post.campaign_id` to **both** objects passed to `reschedulePost`:

```ts
      await this.pollingScheduler.reschedulePost(
        {
          id: post.id,
          campaign_id: post.campaign_id,
          polling_metric_override: post.polling_metric_override,
          polling_comment_override: post.polling_comment_override,
          campaign: post.campaign,
        },
        {
          id: updated.id,
          campaign_id: post.campaign_id,
          polling_metric_override: updated.polling_metric_override,
          polling_comment_override: updated.polling_comment_override,
          campaign: post.campaign,
        },
      );
```

- [ ] **Step 2: Update the spec fixture**

In `posts.service.spec.ts`, in the `PostsService.updateSettings` block, add `campaign_id: 'camp-1'` to the `prisma.post.findUnique.mockResolvedValue({...})` object (~line 747) so the threaded value is realistic:

```ts
    prisma.post.findUnique.mockResolvedValue({
      id: 'post-1',
      campaign_id: 'camp-1',
      deleted_at: null,
      polling_metric_override: 3600,
      polling_comment_override: 21600,
      campaign: {
        status: CampaignStatus.ACTIVE,
        metric_polling_interval: 86400,
        comments_polling_interval: 86400,
      },
    });
```

- [ ] **Step 3: Run the posts service spec**

Run: `cd yehub-be && pnpm test -- posts.service`
Expected: PASS (existing `reschedulePost` assertions use `objectContaining`, so they still match; the new `campaign_id` is present).

- [ ] **Step 4: Commit**

```bash
git add yehub-be/src/posts/posts.service.ts yehub-be/src/posts/posts.service.spec.ts
git commit -m "refactor: thread campaign_id into reschedulePost"
```

---

## Task 10: Wire modules and remove the old processor

**Files:**
- Modify: `yehub-be/src/polling/polling.module.ts`
- Modify: `yehub-be/src/polling/polling-processor.module.ts`
- Delete: `yehub-be/src/polling/polling-processor.ts`, `yehub-be/src/polling/polling-processor.spec.ts`

- [ ] **Step 1: Update `polling.module.ts` to register all three queues**

Replace the `imports` array's `BullModule.registerQueue` line with three registrations, and add `PollingRunner` to providers/exports is **not** needed here (the runner lives in the worker module). Keep `PollingSchedulerService` as the API-side provider:

```ts
import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { QueueModule } from '../queue/queue.module';
import { QUEUE_NAMES } from '../queue/queue.constants';
import { UploadsCoreModule } from '../uploads/uploads-core.module';
import { FacebookAdapter } from './adapters/facebook.adapter';
import { InstagramAdapter } from './adapters/instagram.adapter';
import { TikTokAdapter } from './adapters/tiktok.adapter';
import { YouTubeAdapter } from './adapters/youtube.adapter';
import { ThreadsAdapter } from './adapters/threads.adapter';
import { PlatformAdapterRegistry } from './adapters/platform-adapter.registry';
import { PollingSchedulerService } from './polling-scheduler.service';
import { ScraperProxyClient } from './scraper-proxy.client';
import { ApifyClient } from './apify.client';

@Module({
  imports: [
    QueueModule,
    BullModule.registerQueue(
      { name: QUEUE_NAMES.JOB_SCHEDULER },
      { name: QUEUE_NAMES.METRIC_POLLING },
      { name: QUEUE_NAMES.COMMENT_POLLING },
    ),
    UploadsCoreModule,
  ],
  providers: [
    ScraperProxyClient,
    ApifyClient,
    FacebookAdapter,
    InstagramAdapter,
    TikTokAdapter,
    YouTubeAdapter,
    ThreadsAdapter,
    PlatformAdapterRegistry,
    PollingSchedulerService,
  ],
  exports: [
    PollingSchedulerService,
    PlatformAdapterRegistry,
    BullModule,
    UploadsCoreModule,
  ],
})
export class PollingModule {}
```

- [ ] **Step 2: Update `polling-processor.module.ts` to host the three processors + runner**

```ts
import { Module } from '@nestjs/common';
import { PollingModule } from './polling.module';
import { PollingRunner } from './polling-runner.service';
import { MetricPollingProcessor } from './metric-polling.processor';
import { CommentPollingProcessor } from './comment-polling.processor';
import { PollingDispatchProcessor } from './polling-dispatch.processor';

@Module({
  imports: [PollingModule],
  providers: [
    PollingRunner,
    MetricPollingProcessor,
    CommentPollingProcessor,
    PollingDispatchProcessor,
  ],
})
export class PollingProcessorModule {}
```

- [ ] **Step 3: Delete the old processor and its spec**

```bash
git rm yehub-be/src/polling/polling-processor.ts yehub-be/src/polling/polling-processor.spec.ts
```

- [ ] **Step 4: Verify no stale references remain**

Run: `cd yehub-be && grep -rn "POLLING_FETCH\|polling-fetch\|PollingProcessor\b\|polling-processor'" src --include="*.ts"`
Expected: **no output** (the only `PollingProcessor` references should be gone; `PollingProcessorModule` is a different symbol and is fine — confirm any hit is the module, not the deleted class).

If `grep` finds the module import in `worker.module.ts`, that's expected and correct (it imports `PollingProcessorModule`, unchanged).

- [ ] **Step 5: Commit**

```bash
git add yehub-be/src/polling/polling.module.ts yehub-be/src/polling/polling-processor.module.ts
git commit -m "refactor: wire 3 polling queues and processors; drop old processor"
```

---

## Task 11: Full-suite verification

**Files:** none (verification only)

- [ ] **Step 1: Run the entire backend test suite**

Run: `cd yehub-be && pnpm test`
Expected: PASS. Pay attention to `polling`, `posts`, and `campaigns` suites.

- [ ] **Step 2: Fix any cross-file fallout**

If other specs constructed `PollingSchedulerService` or imported `polling-processor`/`POLLING_FETCH`, update them to the new constructor (4 queues) / new module paths. Re-run `pnpm test` until green.

- [ ] **Step 3: Sanity-check the worker boots (optional, requires Docker)**

If Redis is available (`docker compose up -d`), run `cd yehub-be && pnpm start:worker:dev` briefly and confirm it logs the three processors registering without error, then stop it.

- [ ] **Step 4: Final commit (if Step 2 changed anything)**

```bash
git add -A
git commit -m "test: fix fallout from 3-queue polling refactor"
```

---

## Self-Review Notes (for the implementer)

- **Spec coverage:** 3 queues (Tasks 1,10), dispatcher re-validate+forward (Task 7), campaign-scoped cron IDs (Tasks 2,8), interval→cron with shared enum + campaign DTO constraint (Tasks 1,4), fixed 10-min/3-attempt retry with rate-limit override (Tasks 2,3), no TTL (nothing added — confirm `workJobOptions` has no `ttl`), manual/immediate direct enqueue (Task 8), prefix-based `removeCampaign` (Task 8), unchanged public API + `campaign_id` plumbing (Tasks 8,9), clean replacement/no migration (Task 10).
- **`getJobSchedulers` field name:** the code filters on `s.key`. Before running Task 8, confirm your installed BullMQ version returns `key` on `getJobSchedulers()` entries (it does in BullMQ v5). If it returns `id` instead, change the filter/removal to `s.id` and update the spec mock accordingly.
- **`PlatformError` constructor:** Task 3's test assumes `new PlatformError(code, message, { retryAfterMs })`. Verify against `platform-error.ts` and adjust the test if the real shape differs.
