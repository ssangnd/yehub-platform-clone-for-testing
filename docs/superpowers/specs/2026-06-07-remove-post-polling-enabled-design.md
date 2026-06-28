# Remove `post.polling_enabled`

**Date:** 2026-06-07
**Status:** Approved (design)
**Area:** `yehub-be` (schema, polling scheduler/processor, posts API) + `yehub-fe` (posts API + post settings UI)

## Problem

`Post.polling_enabled` is a per-post boolean meant to pause polling for a single post
independently of its campaign. In practice the capability is unused and partly dead:

- The frontend exposes **no pause toggle**. `PostSettingsDialog` hardcodes
  `polling_enabled: true` on submit (`PostSettingsDialog.tsx:162`).
- The `togglePolling` mutation (`use-campaign-posts.ts:50`) and its `setPostPolling` API
  function (`api/posts.ts:191`) are defined but **never wired to any UI control**
  (`CampaignPostsTab` consumes the hook but not `togglePolling`).

The field still adds a second condition to every polling gate, an extra DTO, a dedicated
endpoint, and fixtures across the test suite — complexity with no user-facing benefit.

## Goal

Remove `post.polling_enabled` entirely (full stack). Polling is then gated **only** by
campaign status. Per-dimension "manual only" behavior (interval `0`) is unaffected.

## Key decisions

1. **Drop the pause capability entirely.** No replacement field, enum, or status. The
   per-post pause feature goes away; campaign `PAUSED`/`COMPLETED` is the only pause lever.
   (Considered: pause-via-interval-`0`, and a per-post status enum — both rejected as
   adding mechanism for a feature with no demand.)
2. **The polling gate becomes `campaign.status === ACTIVE`.** This is the new
   `canSchedule(post)` predicate, replacing `polling_enabled && status === ACTIVE`.
3. **Destructive migration, no back-fill.** `polling_enabled` is a behavior flag with no
   historical/analytical value, so the migration is a plain `DROP COLUMN`. Soft-deprecating
   the column adds no value once code stops reading it.
4. **Full-stack, consistent change.** The `PUT /posts/:id/polling` endpoint and the
   `?polling_enabled=` list filter are removed (not stubbed); the FE field/types/mutation
   go with them so nothing calls a deleted endpoint.

## Unifying rule

| Polling gate | Before | After |
|--------------|--------|-------|
| Is a post scheduled? | `post.polling_enabled && campaign.status === ACTIVE` | `campaign.status === ACTIVE` |
| Does the processor poll (non-manual job)? | post exists, not deleted, has url, `polling_enabled`, campaign ACTIVE | post exists, not deleted, has url, campaign ACTIVE |
| Manual / "sync now" job | runs regardless of `polling_enabled` | unchanged |

## Current state (reference)

- **Schema:** `Post.polling_enabled Boolean @default(true)` (`schema.prisma:285`).
- **Scheduler** (`polling-scheduler.service.ts`):
  - `PollingPost` type carries `polling_enabled` (`:16`); `postSelect()` selects it (`:405`).
  - `canSchedule` = `polling_enabled && status === ACTIVE` (`:353`).
  - `scheduleCampaign` (`:121`) and `rescheduleCampaignInheritedPosts` (`:159`) `findMany`
    `where` include `polling_enabled: true`.
- **Processor** (`polling-processor.ts:79-81`): no-op guard checks `!post.polling_enabled`.
- **Posts service** (`posts.service.ts`):
  - List filter (`:579-580`), list mapping (`:691`), detail mapping (`:806`), and inline
    `select`s (`:827`, `:890`) reference the field.
  - `updateSettings` writes `polling_enabled` and reschedules on
    `overridesChanged || pollingEnabledChanged` (`:850`, `:860-879`).
  - `setPollingEnabled(postId, enabled)` (`:884-935`) — the dedicated toggle.
- **Controller** (`posts.controller.ts:127-136`): `PUT /posts/:id/polling`.
- **DTOs:** `UpdatePostSettingsDto.polling_enabled` (`update-post.dto.ts:11`),
  `UpdatePostPollingDto` (`update-post-polling.dto.ts`, only used by the endpoint),
  `ListPostsQueryDto.polling_enabled` (`list-posts-query.dto.ts:39`).
- **Seed:** `polling_enabled: true` (`seed.ts:1347`).
- **Frontend:** `PostItem`/`PostListItem` types, `listPosts` param, `updatePostSettings`
  payload, and `setPostPolling` (`api/posts.ts:41,82,173,184,191`); `PostSettingsDialog`
  `onSave` type + hardcoded value (`PostSettingsDialog.tsx:53,162`); `togglePolling`
  (`use-campaign-posts.ts:50,75`).

## Approach

### Backend

1. **Schema + migration.** Remove the column from `schema.prisma`; create a migration
   (`DROP COLUMN polling_enabled`); regenerate the Prisma client.
2. **Scheduler.** Drop `polling_enabled` from the `PollingPost` type and `postSelect()`;
   `canSchedule` → `post.campaign.status === CampaignStatus.ACTIVE`; remove the
   `polling_enabled: true` clause from both `findMany` `where` filters.
3. **Processor.** No-op guard becomes `!manual && post.campaign.status !== ACTIVE`.
4. **Posts service.**
   - Delete `setPollingEnabled`.
   - In `updateSettings`: drop the `polling_enabled` write; reschedule on `overridesChanged`
     only; remove `polling_enabled` from the before/after `PollingPost` snapshots and
     `select`s.
   - Remove the list filter, list/detail output mappings, and inline `select`s.
5. **Controller.** Delete the `PUT /posts/:id/polling` handler and its import.
6. **DTOs.** Delete `update-post-polling.dto.ts`; remove `polling_enabled` from
   `UpdatePostSettingsDto` and `ListPostsQueryDto`.
7. **Seed.** Remove the field.

### Frontend

1. **`api/posts.ts`.** Remove `polling_enabled` from `PostItem`/`PostListItem`, the
   `listPosts` params, and the `updatePostSettings` payload; delete `setPostPolling`.
2. **`PostSettingsDialog.tsx`.** Remove `polling_enabled` from the `onSave` prop type and
   drop the hardcoded `polling_enabled: true` on submit.
3. **`use-campaign-posts.ts`.** Remove the dead `togglePolling` mutation and its export.
   (`use-post-detail.ts` derives the settings payload type via `Parameters<...>`, so it
   updates automatically — verify only.)

## Out of scope

- No renaming of related fields; no change to interval/override resolution.
- No replacement pause mechanism (decision 1).
- No new e2e tests; `yehub-e2e/` untouched.
- No backward-compat stub for the removed endpoint or query param (decision 4).

## Testing (Jest unit tests)

Build and lint are pre-existingly broken in `yehub-be` (stale generated Prisma client);
verification is via `pnpm test`.

- **`PollingSchedulerService` spec:** remove `polling_enabled` from all fixtures; delete the
  pause-specific cases (e.g. `polling_enabled: false` reschedule scenarios at
  `polling-scheduler.service.spec.ts:398,428`); confirm `canSchedule`-driven cases now key
  off campaign status only.
- **`PollingProcessor` spec:** drop the `polling_enabled: false` no-op fixture (`:70`);
  keep the campaign-not-active no-op case.
- **`PostsService` spec:** remove `setPollingEnabled` tests; update `updateSettings` cases
  so reschedule fires on override changes only; drop `polling_enabled` from fixtures and
  list-filter assertions.
- After changes, run `pnpm test` (backend) and `pnpm lint` (frontend) to confirm green.
