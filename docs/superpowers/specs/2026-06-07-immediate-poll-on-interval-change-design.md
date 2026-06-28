# Immediate poll on interval change & schedule (re)activation

**Date:** 2026-06-07
**Status:** Approved (design)
**Area:** `yehub-be` — polling scheduler, posts & campaigns flows

## Problem

When a user changes a polling interval, or (re)activates polling for a post or campaign,
nothing actually polls until the next epoch-aligned schedule boundary — which can be up
to one full interval away. The recorded "last sync" and displayed "next sync" therefore
don't reflect the change right away, which feels unresponsive.

Conversely, when an action does **not** put a dimension into a new active recurring
schedule (e.g. a save that changes nothing, switching to manual, or pausing), no sync
state should be disturbed.

## Goal

Fire an **immediate poll** for a post dimension (metrics or comments) exactly when that
dimension transitions **into**, or **changes within**, an active recurring schedule. When
that poll completes, "last sync" (stored) and "next sync" (live-read) reflect it. In all
other cases, leave sync state untouched.

## Unifying rule

A dimension is **actively scheduled** when its post `polling_enabled` is true, its
campaign is `ACTIVE`, and its effective interval is recurring (`> 0`). An immediate poll
fires for a dimension when, after a change:

- it **is** actively scheduled now, **and**
- it either **was not** actively scheduled before, **or** its effective interval **value
  changed**.

This single predicate covers every case below.

| Event | Metrics | Comments |
|-------|---------|----------|
| Interval value changed (A→B, both >0) | poll | — (unless it also changed) |
| Interval manual→recurring (0→B) | poll | — |
| Interval recurring→manual (X→0) | no poll (schedule removed) | — |
| Post un-paused (`polling_enabled` false→true) | poll recurring dims | poll recurring dims |
| Post paused (`polling_enabled` true→false) | no poll (jobs removed) | no poll (jobs removed) |
| Campaign activated/reactivated (→ ACTIVE) | poll recurring dims of every enabled post | same |
| Campaign paused/completed (leaves ACTIVE) | no poll (jobs removed) | no poll (jobs removed) |
| Campaign interval changed | poll inherited posts whose effective interval changed | same |
| No effective change | no poll | no poll |
| Post created / bulk-uploaded | no poll (out of scope) | no poll (out of scope) |

"Except the Manual trigger" = a dimension whose effective interval is `0` (manual mode)
is never auto-polled; it only polls via the manual "sync now" button.

## Key decisions

1. **Next-sync model: keep epoch-aligned / live-read.** The recurring schedule stays on
   BullMQ `{ every }` (epoch-aligned). The immediate poll is a separate one-off
   `{ manual: true }` job. "Next sync" is still read live from the job scheduler's
   `.next` (`getNextSyncTimes`), already reflecting the rescheduled interval. No stored
   `next_sync` field.
2. **Per-dimension granularity.** Metrics and comments are evaluated independently; a
   dimension that didn't transition keeps its last/next sync untouched.
3. **Campaign activate/reactivate polls all enabled posts**, recurring dimensions only.
   Relies on per-dimension dedup + BullMQ concurrency/backoff to absorb the burst.
4. **Switching to 0 / pausing does not poll.** Removing a schedule never triggers a poll.
5. **Un-pausing a single post polls** its recurring dimensions (symmetric with campaign
   reactivation). This revises an earlier draft decision.
6. **Post creation and bulk upload do not auto-poll** (out of scope — avoids bursts on
   bulk import; the shared `schedulePost`/`scheduleCampaign` calls on those paths stay
   poll-free).

## Current state (reference)

- `last_polled_at`, `last_metric_polled_at`, `last_comment_polled_at` are stored on
  `Post`, written by `PollingProcessor.process` after every poll incl. manual jobs
  (`polling-processor.ts:121-122, 153-156, 160-169`).
- "Next sync" is not stored; `getNextSyncTimes` reads BullMQ scheduler `.next` per
  dimension (`polling-scheduler.service.ts:133-158`).
- Recurring jobs use `upsertJobScheduler(jobId, { every: ms }, ...)` — epoch-aligned,
  first run on the next clock boundary, never immediate
  (`polling-scheduler.service.ts:287-301`).
- `triggerImmediate(postId)` enqueues one-off `{ manual: true }` jobs for **both**
  dimensions, deduped against pending (`polling-scheduler.service.ts:160-217`); wired
  only to "sync now" (`posts.controller.ts:142-144`, `posts.service.ts:917-930`).
- `canSchedule(post)` = `polling_enabled && campaign.status === ACTIVE`
  (`polling-scheduler.service.ts:277-281`); `isRecurringInterval(n)` = `n > 0`.
- Entry points:
  - Post update → `reschedulePost(prev, next)` (`posts.service.ts:857-879`).
  - Post un-pause/pause → `setPollingEnabled` → `schedulePost`/`removePost`
    (`posts.service.ts:884-915`).
  - Campaign status → ACTIVE → `scheduleCampaign(id)`; leaves ACTIVE → `removeCampaign`
    (`campaigns.service.ts:323-327`).
  - Campaign interval change → `rescheduleCampaignInheritedPosts(id, prevIntervals)`
    (`campaigns.service.ts:277-287`).
  - **Shared, must stay poll-free:** post create → `schedulePost` (`posts.service.ts:137`);
    bulk upload → `scheduleCampaign` (`posts.service.ts:396`).

## Approach (centralize in `PollingSchedulerService`)

### 1. Per-dimension immediate trigger

Refactor `triggerImmediate` to fire one or both dimensions:

```ts
triggerImmediate(
  postId: string,
  dimensions: { metrics?: boolean; comments?: boolean },
): Promise<{ metrics: boolean; comments: boolean }>
```

- Extract private `enqueueManualPoll(postId, jobName)` holding the existing per-dimension
  pending-dedup (`isJobPending`) + `pollingQueue.add(..., { manual: true })`, returning
  whether it enqueued.
- `triggerImmediate` calls it only for requested dimensions.
- Private `safeTriggerImmediate(postId, dims)` wraps it in try/catch + `logger.warn` so an
  enqueue failure never breaks the user's save.
- **`syncNow` unchanged**: calls `triggerImmediate(postId, { metrics: true, comments: true })`
  and still throws `ConflictException` when neither enqueued.

No processor change: manual jobs already write `last_*_polled_at` on completion; "next
sync" is the live `scheduler.next`.

### 2. The predicate

```ts
// dimensions that transitioned into / changed within an active recurring schedule
dimensionsToPollOnChange(prev: PollingPost, next: PollingPost):
  { metrics: boolean; comments: boolean }
```

Per dimension, using `resolveIntervals()` and `canSchedule()`:

```
prevActive = canSchedule(prev) && prevInterval > 0
nextActive = canSchedule(next) && nextInterval > 0
fire = nextActive && (!prevActive || prevInterval !== nextInterval)
```

Because `resolveIntervals` already applies override → campaign → default, this predicate
correctly handles overrides, inheritance, enable/disable, manual↔recurring, and campaign
status transitions — all by constructing the right `prev`/`next` snapshots.

### 3. Wiring each entry point

- **`reschedulePost(prev, next)`** (post update): after remove + conditional schedule,
  `safeTriggerImmediate(next.id, dimensionsToPollOnChange(prev, next))`. `updateSettings`
  is unchanged — it already passes before/after snapshots.

- **`setPollingEnabled`**: expand its `findUnique` select to a full `PollingPost`, then
  delegate to `reschedulePost(prev, next)` (prev = old `polling_enabled`, next = new).
  Un-pause → predicate polls recurring dims; pause → `next` not schedulable → jobs
  removed, no poll. Replaces the direct `schedulePost`/`removePost` calls here.

- **`scheduleCampaign(campaignId, opts?: { triggerImmediate?: boolean })`**: default
  `false` keeps bulk-upload (`posts.service.ts:396`) poll-free. The campaign-activate
  branch (`campaigns.service.ts:324`) passes `{ triggerImmediate: true }`; for each
  enabled post, after scheduling, `safeTriggerImmediate` for its recurring dimensions
  (`resolveIntervals(post)` `> 0`).

- **`rescheduleCampaignInheritedPosts`**: inside the existing per-post loop, after
  scheduling, `safeTriggerImmediate(post.id, dimensionsToPollOnChange(prev, next))` where
  `prev` carries the previous campaign intervals and `next` the current ones. Posts with
  an override for a dimension naturally yield "no change" for that dimension.

- **`schedulePost`** (post create path, `posts.service.ts:137`): unchanged, poll-free.

## Out of scope

- Post creation / bulk upload do not auto-poll (decision 6) — possible future follow-up.
- No schema/DB changes, no new endpoints, no stored `next_sync`.
- No throttling/staggering of the campaign-activation burst (revisit if campaigns grow to
  hundreds of posts).
- No new e2e tests.

## Testing (Jest unit tests)

- `PollingSchedulerService`:
  - `triggerImmediate` per-dimension + both; per-dimension dedup against pending.
  - `dimensionsToPollOnChange`: covers each row of the table above.
  - `reschedulePost`: polls only transitioning dimension(s); nothing on switch-to-0 or
    no-op.
  - `scheduleCampaign`: with `triggerImmediate` polls each enabled post's recurring dims,
    skips manual (0) dims; default (no opt) polls nothing (bulk-upload path).
  - `rescheduleCampaignInheritedPosts`: polls inherited+changed+recurring dims; skips
    override-set dims and non-ACTIVE/disabled posts.
- `PostsService`:
  - `setPollingEnabled(true)` polls recurring dims; `setPollingEnabled(false)` removes
    jobs and polls nothing.
  - `updateSettings` interval-change cases.
  - `syncNow` still triggers both dimensions / throws `ConflictException`.
- `CampaignsService.changeStatus(→ACTIVE)` requests immediate polls; leaving ACTIVE does
  not.
- Update existing specs for the new `triggerImmediate` / `scheduleCampaign` signatures.
