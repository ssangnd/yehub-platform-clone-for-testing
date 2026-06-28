# Social Account Polling — Design

**Date:** 2026-06-12
**Status:** Approved

## Goal

Automatically poll a social account's public profile when the account is added
(manually or auto-linked), retrieving its follower count, real platform user ID,
display name, and verified flag. Provide a per-account button to manually
re-trigger the poll.

## Requirements

- Poll updates everything available: `follower_count`, real `platform_user_id`
  (replacing the synthetic `<platform>_<username>` placeholder), `username`,
  `display_name`, `is_verified`, and mirrors the avatar onto the linked
  `Profile` only when the profile has no avatar yet.
- If the fetched real platform user ID is already owned by a **different**
  `SocialAccount`, the poll fails with status `conflict` and updates nothing.
  Both accounts are kept; the user resolves manually (move/unlink).
- Auto-poll triggers on all account creation paths:
  1. `ProfilesService.linkAccount` (ProfileDetailPage link flow)
  2. `ProfilesService.create` — inline accounts on AddProfilePage
  3. `PollingRunner.ensureAuthorLinked` — only when a *new* auto-linked account
     is created (not when an existing one is reused).
- Manual trigger: refresh button per account row on ProfileDetailPage.
- Result visibility: `last_polled_at` + `last_poll_status` columns on
  `SocialAccount` (`success | failed | conflict`), shown on the row.

## Architecture

Extends the existing post-polling pipeline (approach chosen over synchronous
fetch and over scheduler-based recurring polling — YAGNI).

### Schema

`SocialAccount` gains `last_polled_at DateTime?` and
`last_poll_status String?` (same free-text convention as `Post`).

### Adapter layer

- New `RawAccountProfile` type:
  `{ platformUserId, username, displayName, followerCount, isVerified, avatarUrl, raw }`.
- `PlatformAdapter.fetchAccountProfile(username): Promise<RawAccountProfile>`
  implemented in all 5 adapters via Apify profile actors (env-overridable like
  existing actor IDs):
  - Instagram: `apify~instagram-profile-scraper`
  - YouTube: `streamers~youtube-channel-scraper`
  - TikTok: `clockworks~tiktok-scraper` (profiles input)
  - Facebook: `apify~facebook-pages-scraper`
  - Threads: profile-scraper actor, same pattern
- Empty actor result → `PlatformError(NOT_FOUND)` → poll status `failed`.

### Worker

- New job name `POLL_SOCIAL_ACCOUNT = 'poll-social-account'` on the existing
  `scraper` queue; payload `{ socialAccountId, manual? }`.
- New `AccountPollingRunner` service; `ScraperProcessor` routes by job name.
- Success: update account fields + status `success`; mirror avatar via
  `UploadsService.mirrorRemoteImage` when profile lacks one.
- Conflict: status `conflict`, no other updates, **no throw** (retries can't
  fix it).
- Other errors: status `failed` + rethrow so BullMQ retries (3 attempts,
  10 min delay — existing defaults).

### API

- `POST /v1/profiles/:profileId/accounts/:accountId/poll` — enqueues with
  `manual: true`; dedupes if a job for the account is already waiting/active;
  returns an acknowledgement.
- Enqueue failures on creation paths are logged, never fail the request.

### Frontend (`yehub-fe`)

- `pollSocialAccount(profileId, accountId)` in `src/api/profiles.ts`; account
  type gains `lastPolledAt` / `lastPollStatus`.
- `SocialAccountRow`: refresh icon button with spinner; after triggering,
  refetch the profile query periodically (~1 min or until `lastPolledAt`
  changes).
- Status display: "Updated X ago"; `conflict` → warning icon + tooltip ("Real
  platform ID already linked to another account"); `failed` → error tint.

## Testing

Jest unit tests mirroring existing specs: `AccountPollingRunner`
success/conflict/failed, adapter `fetchAccountProfile` normalization,
`ProfilesService` enqueue calls, controller endpoint. Frontend: lint + build.
