# Polling Module — Logic Reference

Reference for the post-polling subsystem under `src/polling/`. It periodically fetches public metrics and comments for every active campaign post via an external scraper proxy, then writes the results back into Postgres.

## 1. Scope & responsibilities

The module owns three concerns and nothing else:

1. **Scheduling** — translating campaign/post state into BullMQ repeatable jobs (`PollingSchedulerService`).
2. **Execution** — pulling work off the queue, calling the right platform adapter, and persisting results (`PollingProcessor`).
3. **Platform abstraction** — converting heterogeneous scraper-proxy payloads into a canonical shape (`adapters/`, `ScraperProxyClient`).

Module wiring lives in `src/polling/polling.module.ts:15`. It registers the `polling-fetch` queue and exports `PollingSchedulerService` + `PlatformAdapterRegistry` for callers (campaign/post services) to invoke when domain state changes.

## 2. Data-model touchpoints

The module only reads/writes columns already on `Campaign`, `Post`, and `Comment` (see `prisma/schema.prisma`):

| Column | Owner | Used for |
|---|---|---|
| `Campaign.status` | campaign | Gates scheduling — only `ACTIVE` campaigns poll. |
| `Campaign.metric_polling_interval` (seconds) | campaign | Per-campaign default metric cadence. Nullable → falls back to module default. |
| `Campaign.comments_polling_interval` (seconds) | campaign | Per-campaign default comment cadence. Nullable → falls back to module default. |
| `Post.polling_enabled` | post | Master switch per post. |
| `Post.polling_metric_override` (seconds) | post | Optional per-post metric cadence; takes precedence over campaign default. |
| `Post.polling_comment_override` (seconds) | post | Optional per-post comment cadence; takes precedence over campaign default. |
| `Post.last_polled_at`, `Post.last_poll_status` | post (written by processor) | Health/observability stamps; `last_poll_status` is `'success'` or `'failed'`. |
| `Post.metrics_snapshot` (Json) | post (written by processor) | Full raw metrics payload, kept for analytics. |
| `Post.likes` / `shares` / `views` / `comment_count` / `published_at` / `content` / `author_name` / `author_avatar` / `platform_post_id` | post | Denormalised fields refreshed by metric jobs. |
| `Comment.*` | comment (written by processor) | Upserted from scraped comment threads. |

Defaults if both campaign and post values are null (`src/polling/polling.constants.ts:3`):

- `DEFAULT_METRIC_POLLING_INTERVAL_SECONDS = 86400` (1 day)
- `DEFAULT_COMMENT_POLLING_INTERVAL_SECONDS = 86400` (1 day)

## 3. Interval resolution

`PollingSchedulerService.resolveIntervals` (`src/polling/polling-scheduler.service.ts:46`) implements a three-tier precedence:

```
post override  →  campaign default  →  module default
```

Both metric and comment intervals resolve independently. Behaviour is covered by `polling-scheduler.service.spec.ts:35`.

## 4. Scheduling API

All scheduling is repeatable-job based; nothing runs without a previous `add`. Job IDs are deterministic so removal is idempotent.

### Public methods (`PollingSchedulerService`)

| Method | Trigger | Behaviour |
|---|---|---|
| `schedulePost(postId)` | post created or polling re-enabled | Loads post; schedules iff `polling_enabled && campaign.status === ACTIVE`. |
| `removePost(postId)` | post deleted / polling disabled | Loads post and removes both repeatable jobs using its current intervals. |
| `reschedulePost(previous, next)` | post override or `polling_enabled` changed | Removes jobs keyed by `previous` snapshot, then schedules from `next`. **The caller must capture the pre-update snapshot** because BullMQ keys repeatable jobs by their `repeat.every`. |
| `scheduleCampaign(campaignId)` | campaign activated | Schedules every enabled, non-deleted post under the campaign. |
| `removeCampaign(campaignId)` | campaign archived/deleted | Removes jobs for every non-deleted post under the campaign. |
| `rescheduleCampaignInheritedPosts(campaignId, previousIntervals)` | campaign default interval changed | For posts that *inherit* (no override), removes jobs using `previousIntervals` then re-adds using current intervals; skips posts whose campaign is not ACTIVE. |

`canSchedule` (`polling-scheduler.service.ts:180`) is the single gate: `polling_enabled && campaign.status === ACTIVE`. It is checked at both schedule time and inside the processor.

### Job shape

`addRepeatableJob` (`polling-scheduler.service.ts:184`) emits:

```ts
{
  name:     'poll-post-metrics' | 'poll-post-comments',
  data:     { postId },
  options:  {
    jobId:   `post:${postId}:metrics` | `post:${postId}:comments`,
    attempts: 3,
    backoff:  { type: 'platform', delay: 60_000 },
    removeOnComplete: { count: 100 },
    removeOnFail:     { count: 500 },
    repeat:   { every: intervalSeconds * 1000 },
  }
}
```

Deterministic `jobId` + `repeat.every` means the same call produces the same scheduler entry, so duplicate `add` calls are no-ops and removals don't need state. Removal is verified in `polling-scheduler.service.spec.ts:77`.

> **Correctness invariant** — `removeRepeatable` requires the same `repeat.every` that was used to add the job. Whenever an interval changes, you must remove with the *old* interval before scheduling with the *new* one. `rescheduleCampaignInheritedPosts` and the expected callers of `reschedulePost` are the only places that perform this dance safely.

## 5. Job execution (`PollingProcessor`)

Worker concurrency = 5 (`polling-processor.ts:40`). Each job runs `process`:

1. Map `job.name` → job type (`metrics` | `comments`) via `POLLING_JOB_TYPE_BY_NAME`. Unknown names are logged and ignored.
2. Re-load the post + `campaign.status`. The processor **re-checks** `deleted_at`, `polling_enabled`, presence of `url`, and `campaign.status === ACTIVE`. If any fails, the job is a no-op (it stays scheduled — domain code should call `removePost`/`removeCampaign` to actually stop polling).
3. Look up the adapter for `post.platform` from `PlatformAdapterRegistry`.
4. Branch by job type (below).
5. On any throw: update `last_polled_at`/`last_poll_status='failed'`, log with `PlatformError` code + retry-after, then rethrow so BullMQ can retry.
6. On success: update `last_polled_at`/`last_poll_status='success'` as part of the same write.

### 5.1 Metrics branch (`polling-processor.ts:82`)

- Calls `adapter.fetchPostData(post.url)`.
- Writes back denormalised fields plus a `metrics_snapshot` JSON blob containing every metric the adapter exposed and the raw payload.
- `likes` falls back to `reactionCount` (Facebook-style reactions instead of pure likes).
- `platform_post_id` is updated only if the adapter returned a non-empty value — preserves existing IDs for adapters that don't echo it back.

### 5.2 Comments branch (`polling-processor.ts:109`)

- Finds the newest `platform_created_at` already stored for this post and passes it to `adapter.fetchComments(url, since)`. The adapter uses it both as a cursor hint to the proxy and as a client-side filter (`base-platform.adapter.ts:99`).
- `persistComments` (`polling-processor.ts:151`) flattens nested replies, upserts top-level comments first, then replies. Reply parent IDs are resolved by:
  1. The in-memory `idByPlatformCommentId` map populated in this run, or
  2. A DB lookup (`findCommentId`) for parents stored in earlier runs.
- Upsert keys on `(post_id, platform_comment_id)`. Existing rows update content/likes/replies/timestamps; new rows insert with `platform`.
- After persisting, `Post.comment_count` is refreshed from `prisma.comment.count`.

### 5.3 Backoff strategy

`platformBackoffStrategy` (`polling-processor.ts:19`) is registered as the worker's `backoffStrategy: 'platform'`:

- If the failure is a `PlatformError` with `code === RATE_LIMITED` and `retryAfterMs` set → wait exactly that long (parsed from the upstream `Retry-After` header).
- Otherwise → exponential backoff `60s × 2^(attempt-1)` clamped at attempt ≥ 1.

Combined with `attempts: 3`, a job retries at most twice before being parked in the failed set.

## 6. Platform adapters

### Interface (`adapters/platform-adapter.interface.ts`)

```ts
interface PlatformAdapter {
  readonly platform: Platform;
  fetchPostData(url): Promise<RawPostData>;
  fetchComments(url, since?): Promise<RawComment[]>;
  detectPostId(url): string | null;
}
```

Canonical shapes `RawPostData` / `RawPostMetrics` / `RawComment` are the contract between adapter and processor — anything platform-specific belongs *behind* the adapter.

### Base adapter (`adapters/base-platform.adapter.ts`)

`BasePlatformAdapter` does all the work; per-platform classes only set `platform`. It provides:

- `fetchPostData` — one proxy call, normalised via `normalizePost`.
- `fetchComments` — **paginates** until `nextCursor` is null, sending `since` (if provided) on every request and concatenating normalised pages. Client-side filtering by `since` happens too, so adapters whose proxies ignore `since` still behave correctly.
- `detectPostId` — wraps `posts/platform-detect.utils.ts` and only returns an ID if the URL maps to this adapter's platform.
- `normalize*` helpers — tolerant readers (`readString`, `readNumber`, `readDate`, `readStringArray`) that try multiple key aliases (`like_count` / `likes` / `likeCount`, `published_at` / `created_at` / `timestamp`, etc.) so a single base implementation handles every platform's payload variations. Coverage in `adapters/base-platform.adapter.spec.ts`.
- `firstRecord` — unwraps `{ post: … }`, `{ video: … }`, `{ thread: … }` envelopes or first-element arrays so platform-specific wrappings don't leak.

### Per-platform classes

`FacebookAdapter`, `InstagramAdapter`, `TikTokAdapter`, `YouTubeAdapter`, `ThreadsAdapter` are five-line subclasses that only declare their `Platform` enum value (`adapters/facebook.adapter.ts`). Adding a new platform = new subclass + register in `PlatformAdapterRegistry` (`adapters/platform-adapter.registry.ts:16`).

### Registry

`PlatformAdapterRegistry.get(platform)` (`adapters/platform-adapter.registry.ts:30`) throws `PlatformError(UNKNOWN)` if no adapter is registered. The processor catches this through the generic error path, marking the job failed.

## 7. Scraper proxy client (`ScraperProxyClient`)

All outbound HTTP goes through `ScraperProxyClient.request` (`scraper-proxy.client.ts:26`). Responsibilities:

- **Configuration** — reads `SCRAPER_PROXY_BASE_URL`, `SCRAPER_PROXY_API_KEY` from `ConfigService`. Missing config → `PlatformError(AUTHENTICATION_FAILED)`.
- **URL composition** — `${baseUrl}/${platform.toLowerCase()}/${operation}` where `operation` is `'post'` or `'comments'`.
- **Auth & tracing** — `Authorization: Bearer ${apiKey}` + `x-request-id: ${uuid}` for correlation.
- **Timeouts** — per-platform override `SCRAPER_PROXY_TIMEOUT_${PLATFORM}_MS`, fallback `SCRAPER_PROXY_TIMEOUT_MS`, default `30_000ms`. Implemented with `AbortController`; aborts surface as `PlatformError(TIMEOUT)`.
- **Response handling** — parses JSON, unwraps a `data` envelope if present, and extracts `nextCursor` from any of `nextCursor`, `next_cursor`, `cursor`, or `pagination.next_cursor` (`scraper-proxy.client.ts:175`).
- **Error mapping** (`scraper-proxy.client.ts:123`):
  - `401`/`403` → `AUTHENTICATION_FAILED`
  - `404` → `NOT_FOUND`
  - `429` → `RATE_LIMITED` with `retryAfterMs` parsed from `Retry-After` (seconds or HTTP date)
  - `>=500` → `PROXY_ERROR`
  - other non-OK → `BAD_RESPONSE`
  - invalid JSON → `BAD_RESPONSE`
  - network / abort → `TIMEOUT` or `PROXY_ERROR`

## 8. Error model (`PlatformError`)

`PlatformError` (`platform-error.ts:11`) carries a code, optional `retryAfterMs`, and optional upstream `statusCode`. Codes:

| Code | Meaning | Backoff |
|---|---|---|
| `AUTHENTICATION_FAILED` | Bad/missing proxy creds | Exponential — retries unlikely to help, surfaces failure quickly within 3 attempts. |
| `RATE_LIMITED` | 429 from proxy | Honours `Retry-After`. |
| `NOT_FOUND` | 404 — content removed | Exponential. (Operationally, this often means the post should be marked dead.) |
| `TIMEOUT` | Abort fired | Exponential. |
| `BAD_RESPONSE` | Non-JSON / non-2xx <500 | Exponential. |
| `PROXY_ERROR` | 5xx / transport failure | Exponential. |
| `UNKNOWN` | Catch-all (e.g. missing adapter) | Exponential. |

Only `RATE_LIMITED` with `retryAfterMs` short-circuits the exponential schedule.

## 9. Configuration

Required env vars consumed by this module (read via `ConfigService`):

```
SCRAPER_PROXY_BASE_URL
SCRAPER_PROXY_API_KEY
SCRAPER_PROXY_TIMEOUT_MS                 # optional, default 30000
SCRAPER_PROXY_TIMEOUT_FACEBOOK_MS        # optional, platform override
SCRAPER_PROXY_TIMEOUT_INSTAGRAM_MS       # optional
SCRAPER_PROXY_TIMEOUT_TIKTOK_MS          # optional
SCRAPER_PROXY_TIMEOUT_YOUTUBE_MS         # optional
SCRAPER_PROXY_TIMEOUT_THREADS_MS         # optional
```

Redis (BullMQ) and Postgres come from the existing global modules — no extra config needed.

## 10. Integration contract (where to call from)

`PollingModule` exports `PollingSchedulerService`. Domain services should call:

- **Posts service** —
  - on create with `polling_enabled=true` and active campaign → `schedulePost(postId)`
  - on `polling_enabled` flip → `schedulePost` / `removePost`, or `reschedulePost(previous, next)` if changed together with interval settings
  - on `polling_*_override` change → load the previous snapshot first, then call `reschedulePost(previous, next)`
  - on hard/soft delete → `removePost(postId)`
- **Campaigns service** —
  - on transition into `ACTIVE` → `scheduleCampaign(campaignId)`
  - on transition out of `ACTIVE` (including delete) → `removeCampaign(campaignId)`
  - on `metric_polling_interval` / `comments_polling_interval` change → capture the previous values first, then call `rescheduleCampaignInheritedPosts(campaignId, previousIntervals)`

As of this module's introduction, `PollingModule` is not yet imported by `app.module.ts` — wiring it in plus the callers above is the integration work that remains.

## 11. Test surface

- `polling-scheduler.service.spec.ts` — interval resolution precedence, job IDs, `repeat.every`, inherited-rescheduling flow.
- `polling-processor.spec.ts` — no-op when post inactive, metrics happy path, comment polling with `since`, rate-limit backoff honours `retryAfterMs`.
- `adapters/base-platform.adapter.spec.ts` — pagination, `since` filter, metric alias normalisation.

Run with `pnpm test -- polling`.
