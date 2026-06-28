# Polling Scheduler — 3-Queue Refactor

**Date:** 2026-06-07
**Status:** Approved design, pending implementation plan
**Area:** `yehub-be/src/polling`, `yehub-be/src/queue`

## Problem

Today all polling runs through a single BullMQ queue, `polling-fetch`:

- BullMQ job schedulers keyed `post:{id}:metrics` / `post:{id}:comments` enqueue
  work jobs **onto the same queue** that the single `PollingProcessor` consumes
  (concurrency 1). A slow comment scrape blocks metric polling and vice versa.
- Scheduler removal (`removePostSnapshot`, `removeCampaign`) recomputes
  `resolveIntervals` per post to guess which dimension schedulers exist. If an
  interval changed before removal, the wrong scheduler is targeted — fragile.
- Scheduler IDs are post-scoped, so there is no clean way to remove every
  scheduler for a campaign in one operation.
- Retry uses an exponential-from-60s backoff; the desired behaviour is a fixed
  10-minute retry (still honouring platform rate-limit hints).

## Goals

1. Separate scheduling from scraping, and separate metric scraping from comment
   scraping, into three dedicated queues.
2. Campaign-scoped scheduler IDs so a campaign's schedulers can be removed by
   prefix in one pass — robust against orphans and interval drift.
3. Cron-pattern scheduling (wall-clock aligned, no offset) driven by a fixed,
   shared set of allowed intervals.
4. Fixed 10-minute retry on scrape failures, with 3 attempts, preserving the
   rate-limit-aware override.
5. Preserve the public `PollingSchedulerService` API so callers
   (`posts.service.ts`, `campaigns.service.ts`) are untouched.

Non-goals: migrating existing Redis state (clean replacement — dev/seed only),
new e2e tests, changing scraping/adapter behaviour.

## Queue Topology

Replace the single `polling-fetch` queue with three:

| Queue | Role | Processor (worker) | Concurrency |
|-------|------|--------------------|-------------|
| `job-scheduler` | Hosts repeatable schedulers (one per post-dimension); fires on cron cadence. | `PollingDispatchProcessor` | high (cheap forwarding) |
| `metric-polling` | Actual metric scraping. | `MetricPollingProcessor` | env, default 1 |
| `comment-polling` | Actual comment scraping. | `CommentPollingProcessor` | env, default 1 |

`queue.constants.ts`:

```ts
export const QUEUE_NAMES = {
  DEFAULT: 'default',
  JOB_SCHEDULER: 'job-scheduler',
  METRIC_POLLING: 'metric-polling',
  COMMENT_POLLING: 'comment-polling',
} as const;
```

`POLLING_FETCH` is removed entirely. Job-name constants (`POLL_POST_METRICS`,
`POLL_POST_COMMENTS`) are retained as the work-job names on their respective
queues and as the dimension discriminator.

## Intervals → Cron

Both interval sources are constrained to one shared, fixed set so every
effective interval maps deterministically to a cron pattern.

`polling.constants.ts`:

```ts
export const POLLING_INTERVAL_OPTIONS = [0, 900, 3600, 21600, 43200, 86400];
// 0 = Manual, 900 = 15m, 3600 = 1h, 21600 = 6h, 43200 = 12h, 86400 = 1d

export const INTERVAL_TO_CRON: Record<number, string> = {
  900: '*/15 * * * *',
  3600: '0 * * * *',
  21600: '0 */6 * * *',
  43200: '0 */12 * * *',
  86400: '0 0 * * *',
};
```

- `update-post.dto.ts` already uses `@IsIn([0,900,3600,21600,43200,86400])` —
  switch it to reference the shared `POLLING_INTERVAL_OPTIONS`.
- `create-campaign.dto.ts` (and any update-campaign DTO) change from
  `@IsInt() @Min(60)` to `@IsIn(POLLING_INTERVAL_OPTIONS)`.
- Default interval (86400) is in the set; seed values (3600/21600/86400)
  conform. No data migration.

Cron is wall-clock aligned (the "no offset" requirement). Manual (0) → no
scheduler for that dimension.

## Scheduler IDs & Cadence

Schedulers live on the `job-scheduler` queue with stable, campaign-scoped IDs:

- `campaign:{campaignId}:post:{postId}:metrics`
- `campaign:{campaignId}:post:{postId}:comments`

(BullMQ stores these as `bull:job-scheduler:repeat:{id}`.)

Registration uses a cron pattern and carries routing data in the template:

```ts
await jobSchedulerQueue.upsertJobScheduler(
  schedulerId,                       // campaign:{c}:post:{p}:{dimension}
  { pattern: INTERVAL_TO_CRON[interval] },
  { name: jobName, data: { postId, campaignId, dimension }, opts: {...} },
);
```

**Key simplification:** because the ID no longer encodes the interval, changing
an interval is just an `upsertJobScheduler` that updates the cron pattern in
place. The remove-then-re-add dance and the "recompute old intervals to find
what to remove" logic both disappear. Per dimension on (re)schedule:

- active campaign **and** recurring (non-Manual) interval → `upsert`
- otherwise → `removeJobScheduler(id)` by exact ID (no-op if absent)

This removes the need to thread `previousIntervals` through removal.
`dimensionsToPollOnChange` (deciding whether to fire an *immediate* poll on an
interval change) keeps its prev/next comparison; only scheduler removal stops
depending on prior intervals.

## Dispatcher (`job-scheduler` → work queues)

`PollingDispatchProcessor` consumes each fired scheduler job and:

1. Reloads the post (`campaign.status`, `deleted_at`, `url`).
2. Skips (debug log, no-op) if campaign not `ACTIVE`, post deleted, or no URL.
3. Dedups: skips if a work job `post:{postId}` is already active / waiting /
   delayed on the target work queue.
4. Otherwise enqueues `post:{postId}` onto `metric-polling` or `comment-polling`
   based on `data.dimension`.

This centralises the active/deleted guard at dispatch time, so stale schedulers
do no useless scraping work.

## Work Jobs (Scraping)

- jobId `post:{postId}` (stable → natural dedup), data `{ postId, manual? }`.
- **3 attempts**, **fixed 10-minute backoff**, with a rate-limit override: a
  `PlatformError` of code `RATE_LIMITED` carrying `retryAfterMs` still wins.
  `platformBackoffStrategy`'s non-rate-limited branch changes from
  exponential-from-60s to a flat `POLLING_JOB_RETRY_DELAY_MS = 600_000`.
- No TTL. `removeOnComplete` / `removeOnFail` retention unchanged
  (`{ count: 100 }` / `{ count: 500 }`).
- Today's `PollingProcessor.process()` splits by dimension into
  `MetricPollingProcessor` (`@Processor(METRIC_POLLING)`) and
  `CommentPollingProcessor` (`@Processor(COMMENT_POLLING)`).
- Shared logic — post load, success/failure status update, `persistComments`,
  `ensureAuthorLinked`, `saveComment`, the no-op guard, and the in-flight
  (`isJobPending`) check — extracts into a shared `PollingRunner` service
  injected into both work processors and reused by the dispatcher.
- The work processors keep the campaign-active guard **only for `manual` jobs**
  (scheduled jobs were already validated by the dispatcher; manual ones bypass
  the scheduler and must still run even when the campaign isn't active).

## Manual & Immediate Polls

`triggerImmediate` (manual user action) and the activate-time immediate poll
(`scheduleCampaign({ triggerImmediate: true })`) enqueue **directly** onto the
work queues, bypassing the scheduler — same `post:{postId}` jobId for dedup.
Manual jobs carry `manual: true` so the worker guard lets them run regardless of
campaign status, preserving current behaviour.

## Campaign Removal

`removeCampaign(campaignId)`:

```ts
const schedulers = await jobSchedulerQueue.getJobSchedulers(); // paginated
const prefix = `campaign:${campaignId}:`;
await Promise.all(
  schedulers
    .filter((s) => s.id?.startsWith(prefix))
    .map((s) => jobSchedulerQueue.removeJobScheduler(s.id)),
);
```

Robust against orphaned schedulers and independent of current intervals. Uses
only the public BullMQ API. (If scheduler counts ever grow large enough that
enumeration is costly, this is the single place to swap in a Redis `SCAN` on
`bull:job-scheduler:repeat:campaign:{id}:*`.)

`removePost` / `removePostSnapshot` remove the post's two scheduler IDs by exact
ID (no enumeration needed — the post and its campaign are known).

## Public API — Unchanged Signatures

`PollingSchedulerService` keeps the signatures of `scheduleCampaign`,
`removeCampaign`, `rescheduleCampaignInheritedPosts`, `schedulePost`,
`removePost`, `getNextSyncTimes`, `triggerImmediate`, `reschedulePost`, so
`posts.service.ts` and `campaigns.service.ts` are untouched.

- `getNextSyncTimes` reads `.next` from the two scheduler IDs on the
  `job-scheduler` queue (`getJobScheduler(id)`).
- `postSelect` gains `campaign_id` (needed to build campaign-scoped IDs).

## Module Wiring

- `polling.module.ts` (API side, imported by `AppModule`): register all three
  queues as producers (`BullModule.registerQueue` ×3); provide
  `PollingSchedulerService`.
- `polling-processor.module.ts` (worker side, imported by `WorkerModule`): host
  `PollingDispatchProcessor`, `MetricPollingProcessor`,
  `CommentPollingProcessor`, and the shared `PollingRunner`. Queues registered
  here too so processors bind.
- `polling-fetch` removed everywhere. Clean replacement, no migration / startup
  cleanup.

## Testing

- Split `polling-processor.spec.ts` into metric and comment processor specs
  exercising the shared `PollingRunner`.
- Add `PollingDispatchProcessor` spec: forwards when valid; no-ops on inactive /
  deleted / no-URL; dedups against in-flight work jobs.
- Update `polling-scheduler.service.spec.ts` for the new cron-based IDs, the
  interval→cron mapping, direct manual/immediate enqueue onto work queues, and
  prefix-based `removeCampaign`.
- Add a DTO validation test for the tightened campaign interval `@IsIn`.
- No new e2e tests.
- Verify with `pnpm test`. `pnpm build` / `pnpm lint` are pre-existingly broken
  via a stale generated Prisma client — not a regression signal here.

## Risks / Notes

- **Three queues need three sets of worker registrations.** Each processor binds
  to exactly one queue; ensure all three are registered in the worker module.
- **Cron vs `every` semantics change.** Cron fires on wall-clock boundaries
  rather than relative to job creation. This is intended ("no offset") but means
  the first tick after (re)scheduling waits until the next boundary; the
  activate-time immediate poll covers the gap for newly activated campaigns.
- **Tightening campaign interval validation** rejects previously-valid arbitrary
  values. Acceptable given dev/seed-only state and conforming seed data.
