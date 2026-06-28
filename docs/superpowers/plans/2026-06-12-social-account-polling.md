# Social Account Polling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Auto-poll a social account's public profile (followers, real platform user ID, display name, verified, avatar) whenever an account is created, plus a per-account manual refresh button.

**Architecture:** Extends the existing post-polling pipeline: a new `poll-social-account` job on the existing `scraper` BullMQ queue, a new `fetchAccountProfile()` adapter method backed by Apify profile actors, an enqueue-only `AccountPollingService` (API side) and an `AccountPollingRunner` (worker side). `SocialAccount` gains `last_polled_at`/`last_poll_status` columns. Conflict on real platform user ID → status `conflict`, no updates, no retry.

**Tech Stack:** NestJS 11, Prisma 7, BullMQ, Apify actors, Jest; React 19 + TanStack Query v5 frontend.

**Spec:** `docs/superpowers/specs/2026-06-12-social-account-polling-design.md`

**Conventions that apply to every task:** pnpm only. Backend code style: single quotes, trailing commas. Frontend: no semicolons. Commit messages: NO Co-Authored-By trailer ever. Run commands from `yehub-be/` or `yehub-fe/` as noted.

---

### Task 1: Schema — poll status columns on SocialAccount

**Files:**
- Modify: `yehub-be/prisma/schema.prisma:379-397` (SocialAccount model)
- Modify: `yehub-be/src/profiles/profiles.service.ts:413-450` (formatProfile), `:326-335` (linkAccount return), `:380-389` (moveAccount return)
- Create: migration via CLI (do NOT hand-write the SQL file)

- [ ] **Step 1: Add columns to the Prisma model**

In `yehub-be/prisma/schema.prisma`, inside `model SocialAccount`, after `created_at`:

```prisma
  last_polled_at   DateTime?
  last_poll_status String?
```

- [ ] **Step 2: Create the migration and regenerate the client**

Run (DB must be up — `docker compose up -d` from repo root if not):

```bash
cd yehub-be
pnpm prisma:migrate --name add_social_account_poll_status
pnpm prisma:generate
```

Expected: new folder `prisma/migrations/<timestamp>_add_social_account_poll_status/` and client regenerated without error.

- [ ] **Step 3: Expose the fields in API responses**

In `yehub-be/src/profiles/profiles.service.ts`:

In the `formatProfile` parameter type, extend the `socialAccounts` element type:

```ts
    socialAccounts: {
      id: string;
      platform: Platform;
      platform_user_id: string;
      username: string | null;
      display_name: string | null;
      follower_count: number;
      is_verified: boolean;
      created_at: Date;
      last_polled_at: Date | null;
      last_poll_status: string | null;
    }[];
```

In the `accounts` mapping inside `formatProfile`, add after `createdAt: sa.created_at,`:

```ts
      lastPolledAt: sa.last_polled_at,
      lastPollStatus: sa.last_poll_status,
```

In `linkAccount`'s return object, add after `createdAt: account.created_at,`:

```ts
        lastPolledAt: account.last_polled_at,
        lastPollStatus: account.last_poll_status,
```

In `moveAccount`'s return object, add after `createdAt: updated.created_at,`:

```ts
      lastPolledAt: updated.last_polled_at,
      lastPollStatus: updated.last_poll_status,
```

- [ ] **Step 4: Verify build and existing tests**

```bash
cd yehub-be && pnpm build && pnpm test -- profiles.service.spec
```

Expected: PASS (new fields are additive; mocks return `undefined` for them which serializes fine).

- [ ] **Step 5: Commit**

```bash
git add yehub-be/prisma yehub-be/src/profiles/profiles.service.ts docs/superpowers/specs/2026-06-12-social-account-polling-design.md docs/superpowers/plans/2026-06-12-social-account-polling.md
git commit -m "feat: add poll status columns to social accounts"
```

---

### Task 2: Job constants + job-id utilities

**Files:**
- Modify: `yehub-be/src/queue/queue.constants.ts`
- Modify: `yehub-be/src/polling/polling-job.util.ts`
- Test: `yehub-be/src/polling/polling-job.util.spec.ts`

- [ ] **Step 1: Write failing tests**

Append to `yehub-be/src/polling/polling-job.util.spec.ts` (inside the top-level `describe` if one wraps everything, otherwise at file scope alongside the existing describes):

```ts
describe('accountWorkJobId', () => {
  it('builds a stable per-account job id', () => {
    expect(accountWorkJobId('acc-1')).toBe('account:acc-1');
  });
});

describe('accountWorkJobOptions', () => {
  it('uses the stable job id and platform backoff with removal on terminal states', () => {
    const opts = accountWorkJobOptions('acc-1');
    expect(opts.jobId).toBe('account:acc-1');
    expect(opts.attempts).toBe(POLLING_JOB_ATTEMPTS);
    expect(opts.backoff).toEqual({
      type: 'platform',
      delay: POLLING_JOB_RETRY_DELAY_MS,
    });
    expect(opts.removeOnComplete).toBe(true);
    expect(opts.removeOnFail).toBe(true);
  });
});
```

Add to the imports of the spec file: `accountWorkJobId`, `accountWorkJobOptions` from `./polling-job.util` and `POLLING_JOB_ATTEMPTS`, `POLLING_JOB_RETRY_DELAY_MS` from `./polling.constants` (keep whatever is already imported).

- [ ] **Step 2: Run to verify failure**

```bash
cd yehub-be && pnpm test -- polling-job.util.spec
```

Expected: FAIL — `accountWorkJobId` is not exported.

- [ ] **Step 3: Implement**

In `yehub-be/src/queue/queue.constants.ts`, extend `POLLING_JOB_NAMES`:

```ts
export const POLLING_JOB_NAMES = {
  POLL_POST_METRICS: 'poll-post-metrics',
  POLL_POST_COMMENTS: 'poll-post-comments',
  POLL_SOCIAL_ACCOUNT: 'poll-social-account',
} as const;
```

Append to `yehub-be/src/polling/polling-job.util.ts`:

```ts
export function accountWorkJobId(socialAccountId: string): string {
  return `account:${socialAccountId}`;
}

export function accountWorkJobOptions(socialAccountId: string): JobsOptions {
  return {
    attempts: POLLING_JOB_ATTEMPTS,
    backoff: { type: 'platform', delay: POLLING_JOB_RETRY_DELAY_MS },
    // Same rationale as workJobOptions: the stable id must free up on
    // terminal states or BullMQ silently dedupes future enqueues forever.
    removeOnComplete: true,
    removeOnFail: true,
    jobId: accountWorkJobId(socialAccountId),
  };
}
```

- [ ] **Step 4: Run tests**

```bash
cd yehub-be && pnpm test -- polling-job.util.spec polling.constants.spec
```

Expected: PASS. Note: `polling.constants.spec.ts` may assert over `POLLING_JOB_TYPES` / job-name maps — if it enumerates `POLLING_JOB_NAMES` exhaustively, update its expectation to include `POLL_SOCIAL_ACCOUNT` (the post-job-type map `POLLING_JOB_TYPE_BY_NAME` intentionally does NOT gain an entry: account jobs are not a post-poll dimension).

- [ ] **Step 5: Commit**

```bash
git add yehub-be/src/queue/queue.constants.ts yehub-be/src/polling/polling-job.util.ts yehub-be/src/polling/polling-job.util.spec.ts yehub-be/src/polling/polling.constants.spec.ts
git commit -m "feat: add poll-social-account job name and job options"
```

---

### Task 3: Adapter interface — `RawAccountProfile` + shared normalizer

**Files:**
- Modify: `yehub-be/src/polling/adapters/platform-adapter.interface.ts`
- Modify: `yehub-be/src/polling/adapters/base-platform.adapter.ts`
- Test: `yehub-be/src/polling/adapters/base-platform.adapter.spec.ts`

- [ ] **Step 1: Write failing tests**

The existing spec instantiates a concrete subclass of `BasePlatformAdapter` — follow the pattern already in `base-platform.adapter.spec.ts` (read it first; it defines a test adapter). Add a describe block exercising the protected normalizer through a small subclass (or via the existing test adapter, casting to `any` to reach the protected method, matching the file's existing style):

```ts
describe('normalizeAccountProfile', () => {
  it('maps common profile keys', () => {
    const record = {
      id: 'user-123',
      username: 'johndoe',
      fullName: 'John Doe',
      followersCount: 1500,
      verified: true,
      profilePicUrlHD: 'https://cdn.example.com/p.jpg',
    };
    const profile = (adapter as any).normalizeAccountProfile(record, record);
    expect(profile).toEqual({
      platformUserId: 'user-123',
      username: 'johndoe',
      displayName: 'John Doe',
      followerCount: 1500,
      isVerified: true,
      avatarUrl: 'https://cdn.example.com/p.jpg',
      raw: record,
    });
  });

  it('handles snake_case and alternate keys with safe defaults', () => {
    const record = {
      pk: '99',
      name: 'janedoe',
      follower_count: '2,000',
      is_verified: false,
    };
    const profile = (adapter as any).normalizeAccountProfile(record, record);
    expect(profile.platformUserId).toBe('99');
    expect(profile.username).toBe('janedoe');
    expect(profile.displayName).toBeNull();
    expect(profile.followerCount).toBe(2000);
    expect(profile.isVerified).toBe(false);
    expect(profile.avatarUrl).toBeNull();
  });
});
```

(`adapter` = whatever concrete test instance the spec file already uses.)

- [ ] **Step 2: Run to verify failure**

```bash
cd yehub-be && pnpm test -- base-platform.adapter.spec
```

Expected: FAIL — `normalizeAccountProfile` is not a function.

- [ ] **Step 3: Implement interface + normalizer**

In `yehub-be/src/polling/adapters/platform-adapter.interface.ts`, add after `RawPostData`:

```ts
export interface RawAccountProfile {
  platformUserId: string;
  username: string | null;
  displayName: string | null;
  followerCount: number;
  isVerified: boolean;
  avatarUrl: string | null;
  raw: unknown;
}
```

and extend the `PlatformAdapter` interface:

```ts
  fetchAccountProfile(username: string): Promise<RawAccountProfile>;
```

In `yehub-be/src/polling/adapters/base-platform.adapter.ts`:

1. Import `RawAccountProfile` from the interface file.
2. Declare the method abstract on the class (each platform must implement it):

```ts
  abstract fetchAccountProfile(username: string): Promise<RawAccountProfile>;
```

3. Add the shared normalizer + a boolean reader near the other protected helpers:

```ts
  protected normalizeAccountProfile(
    record: Record<string, unknown>,
    raw: unknown,
  ): RawAccountProfile {
    return {
      platformUserId: this.readString(record, [
        'platformUserId',
        'platform_user_id',
        'userId',
        'channelId',
        'facebookId',
        'pageId',
        'pk',
        'id',
      ]),
      username: this.readOptionalString(record, [
        'username',
        'uniqueId',
        'channelUsername',
        'name',
      ]),
      displayName: this.readOptionalString(record, [
        'displayName',
        'fullName',
        'full_name',
        'nickName',
        'channelName',
        'pageName',
        'title',
      ]),
      followerCount: this.readNumber(record, [
        'followerCount',
        'followersCount',
        'follower_count',
        'followers',
        'fans',
        'numberOfSubscribers',
        'subscriberCount',
      ]),
      isVerified: this.readBoolean(record, [
        'isVerified',
        'is_verified',
        'verified',
      ]),
      avatarUrl: this.readOptionalString(record, [
        'avatarUrl',
        'avatar',
        'profilePicUrlHD',
        'profilePicUrl',
        'profile_pic_url',
        'profilePictureUrl',
        'channelAvatarUrl',
      ]),
      raw,
    };
  }

  protected readBoolean(
    record: Record<string, unknown>,
    keys: string[],
  ): boolean {
    for (const key of keys) {
      const value = record[key];
      if (typeof value === 'boolean') return value;
    }
    return false;
  }
```

NOTE: making `fetchAccountProfile` abstract breaks compilation of the 5 adapters and the spec's test adapter until Task 4. To keep this task green, give the spec's test adapter a stub:

```ts
  async fetchAccountProfile(): Promise<RawAccountProfile> {
    throw new Error('not implemented in test adapter');
  }
```

and add temporary identical stubs to the 5 platform adapters ONLY IF you intend to commit Task 3 separately. Otherwise implement Task 4 in the same working tree and commit Tasks 3+4 together (preferred — see Task 4 Step 5).

- [ ] **Step 4: Run tests**

```bash
cd yehub-be && pnpm test -- base-platform.adapter.spec
```

Expected: PASS (full `pnpm build` may still fail until Task 4 — that is fine, do not commit yet).

---

### Task 4: Per-platform `fetchAccountProfile` implementations

**Files:**
- Modify: `yehub-be/src/polling/adapters/instagram.adapter.ts`
- Modify: `yehub-be/src/polling/adapters/tiktok.adapter.ts`
- Modify: `yehub-be/src/polling/adapters/youtube.adapter.ts`
- Modify: `yehub-be/src/polling/adapters/facebook.adapter.ts`
- Modify: `yehub-be/src/polling/adapters/threads.adapter.ts`
- Test: `yehub-be/src/polling/adapters/facebook.adapter.spec.ts` (exists), create `yehub-be/src/polling/adapters/instagram.adapter.spec.ts`

All five follow one shape: resolve actor id from config with a default, call `this.apify.runSync`, throw `PlatformError(NOT_FOUND)` on empty result, extract the profile record, return `this.normalizeAccountProfile(record, items[0])`.

- [ ] **Step 1: Write failing tests**

Create `yehub-be/src/polling/adapters/instagram.adapter.spec.ts`:

```ts
import { InstagramAdapter } from './instagram.adapter';
import { PlatformError, PlatformErrorCode } from '../platform-error';

describe('InstagramAdapter.fetchAccountProfile', () => {
  const apify = { runSync: jest.fn() };
  const config = { get: jest.fn().mockReturnValue(undefined) };
  const proxy = { request: jest.fn() };
  let adapter: InstagramAdapter;

  beforeEach(() => {
    jest.clearAllMocks();
    config.get.mockReturnValue(undefined);
    adapter = new InstagramAdapter(proxy as any, apify as any, config as any);
  });

  it('fetches and normalizes a profile by username', async () => {
    apify.runSync.mockResolvedValue([
      {
        id: '321',
        username: 'johndoe',
        fullName: 'John Doe',
        followersCount: 1234,
        verified: true,
        profilePicUrlHD: 'https://cdn.example.com/hd.jpg',
      },
    ]);

    const profile = await adapter.fetchAccountProfile('johndoe');

    expect(apify.runSync).toHaveBeenCalledWith({
      actorId: 'apify~instagram-profile-scraper',
      input: { usernames: ['johndoe'] },
    });
    expect(profile.platformUserId).toBe('321');
    expect(profile.followerCount).toBe(1234);
    expect(profile.isVerified).toBe(true);
    expect(profile.avatarUrl).toBe('https://cdn.example.com/hd.jpg');
  });

  it('throws NOT_FOUND when the actor returns no items', async () => {
    apify.runSync.mockResolvedValue([]);
    await expect(adapter.fetchAccountProfile('ghost')).rejects.toMatchObject({
      code: PlatformErrorCode.NOT_FOUND,
    });
    await expect(adapter.fetchAccountProfile('ghost')).rejects.toBeInstanceOf(
      PlatformError,
    );
  });
});
```

Append to `yehub-be/src/polling/adapters/facebook.adapter.spec.ts` (reuse its existing adapter construction helpers/mocks — read the file first and match its setup style):

```ts
describe('fetchAccountProfile', () => {
  it('fetches a page by url built from the username', async () => {
    apify.runSync.mockResolvedValue([
      {
        facebookId: 'fb-1',
        pageName: 'Some Page',
        followers: 42000,
        profilePictureUrl: 'https://cdn.example.com/page.jpg',
      },
    ]);

    const profile = await adapter.fetchAccountProfile('somepage');

    expect(apify.runSync).toHaveBeenCalledWith({
      actorId: 'apify~facebook-pages-scraper',
      input: { startUrls: [{ url: 'https://www.facebook.com/somepage' }] },
    });
    expect(profile.platformUserId).toBe('fb-1');
    expect(profile.displayName).toBe('Some Page');
    expect(profile.followerCount).toBe(42000);
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
cd yehub-be && pnpm test -- instagram.adapter.spec facebook.adapter.spec
```

Expected: FAIL — `fetchAccountProfile` missing.

- [ ] **Step 3: Implement all five adapters**

`instagram.adapter.ts` — replace the private `fetchProfileAvatar` plumbing with a public method and reuse it (keep `fetchProfileAvatar` behavior by delegating, DRY):

```ts
  async fetchAccountProfile(username: string): Promise<RawAccountProfile> {
    const actorId =
      this.config.get<string>('APIFY_INSTAGRAM_PROFILE_ACTOR_ID') ??
      PROFILE_ACTOR_ID;
    const items = await this.apify.runSync<Record<string, unknown>>({
      actorId,
      input: { usernames: [username] },
    });
    if (items.length === 0) {
      throw new PlatformError(
        PlatformErrorCode.NOT_FOUND,
        `Apify returned no profile for username=${username}`,
      );
    }
    return this.normalizeAccountProfile(items[0], items[0]);
  }

  private async fetchProfileAvatar(username: string): Promise<string | null> {
    try {
      const profile = await this.fetchAccountProfile(username);
      return profile.avatarUrl;
    } catch {
      return null;
    }
  }
```

Import `RawAccountProfile` in each adapter from `./platform-adapter.interface`.

`tiktok.adapter.ts` — the post scraper actor also serves profiles via `profiles` input; author data nests under `authorMeta`:

```ts
const PROFILE_RESULTS_PER_PAGE = 1;

  async fetchAccountProfile(username: string): Promise<RawAccountProfile> {
    const actorId =
      this.config.get<string>('APIFY_TIKTOK_PROFILE_ACTOR_ID') ??
      POSTS_ACTOR_ID;
    const items = await this.apify.runSync<Record<string, unknown>>({
      actorId,
      input: { profiles: [username], resultsPerPage: PROFILE_RESULTS_PER_PAGE },
    });
    if (items.length === 0) {
      throw new PlatformError(
        PlatformErrorCode.NOT_FOUND,
        `Apify returned no profile for username=${username}`,
      );
    }
    const record = this.isRecord(items[0].authorMeta)
      ? items[0].authorMeta
      : items[0];
    return this.normalizeAccountProfile(record, items[0]);
  }
```

`youtube.adapter.ts` — channel scraper, URL from handle (the adapter already declares `CHANNEL_ACTOR_ID = 'streamers~youtube-channel-scraper'`):

```ts
  async fetchAccountProfile(username: string): Promise<RawAccountProfile> {
    const actorId =
      this.config.get<string>('APIFY_YOUTUBE_CHANNEL_ACTOR_ID') ??
      CHANNEL_ACTOR_ID;
    const handle = username.startsWith('@') ? username : `@${username}`;
    const items = await this.apify.runSync<Record<string, unknown>>({
      actorId,
      input: { startUrls: [{ url: `https://www.youtube.com/${handle}` }] },
    });
    if (items.length === 0) {
      throw new PlatformError(
        PlatformErrorCode.NOT_FOUND,
        `Apify returned no channel for username=${username}`,
      );
    }
    return this.normalizeAccountProfile(items[0], items[0]);
  }
```

(If `CHANNEL_ACTOR_ID` was removed or unused-flagged, re-add it; check for an existing `APIFY_YOUTUBE_CHANNEL_ACTOR_ID` config key usage and keep names consistent.)

`facebook.adapter.ts`:

```ts
const PAGES_ACTOR_ID = 'apify~facebook-pages-scraper';

  async fetchAccountProfile(username: string): Promise<RawAccountProfile> {
    const actorId =
      this.config.get<string>('APIFY_FACEBOOK_PAGES_ACTOR_ID') ??
      PAGES_ACTOR_ID;
    const items = await this.apify.runSync<Record<string, unknown>>({
      actorId,
      input: { startUrls: [{ url: `https://www.facebook.com/${username}` }] },
    });
    if (items.length === 0) {
      throw new PlatformError(
        PlatformErrorCode.NOT_FOUND,
        `Apify returned no page for username=${username}`,
      );
    }
    return this.normalizeAccountProfile(items[0], items[0]);
  }
```

`threads.adapter.ts`:

```ts
const PROFILE_ACTOR_ID = 'logical_scrapers~threads-profile-scraper';

  async fetchAccountProfile(username: string): Promise<RawAccountProfile> {
    const actorId =
      this.config.get<string>('APIFY_THREADS_PROFILE_ACTOR_ID') ??
      PROFILE_ACTOR_ID;
    const items = await this.apify.runSync<Record<string, unknown>>({
      actorId,
      input: { usernames: [username] },
    });
    if (items.length === 0) {
      throw new PlatformError(
        PlatformErrorCode.NOT_FOUND,
        `Apify returned no profile for username=${username}`,
      );
    }
    const record = this.isRecord(items[0].profile)
      ? items[0].profile
      : items[0];
    return this.normalizeAccountProfile(record, items[0]);
  }
```

(Threads default actor id is a best guess; the env override `APIFY_THREADS_PROFILE_ACTOR_ID` is the escape hatch. Note this in the PR description.)

- [ ] **Step 4: Run tests + build**

```bash
cd yehub-be && pnpm test -- adapters && pnpm build
```

Expected: all adapter specs PASS, build clean (abstract method now satisfied everywhere).

- [ ] **Step 5: Commit (Tasks 3+4 together)**

```bash
git add yehub-be/src/polling/adapters
git commit -m "feat: add account profile fetching to platform adapters"
```

---

### Task 5: `AccountPollingService` (enqueue-only, API side)

**Files:**
- Create: `yehub-be/src/polling/account-polling.service.ts`
- Test: `yehub-be/src/polling/account-polling.service.spec.ts`
- Modify: `yehub-be/src/polling/polling.module.ts`

- [ ] **Step 1: Write failing tests**

Create `yehub-be/src/polling/account-polling.service.spec.ts`:

```ts
import { AccountPollingService } from './account-polling.service';
import { POLLING_JOB_NAMES } from '../queue/queue.constants';

describe('AccountPollingService', () => {
  const scraperQueue = { getJob: jest.fn(), add: jest.fn() };
  let service: AccountPollingService;

  beforeEach(() => {
    jest.clearAllMocks();
    scraperQueue.getJob.mockResolvedValue(null);
    scraperQueue.add.mockResolvedValue({});
    service = new AccountPollingService(scraperQueue as any);
  });

  it('enqueues a poll job with the stable account job id', async () => {
    const queued = await service.enqueue('acc-1', { manual: true });

    expect(queued).toBe(true);
    expect(scraperQueue.add).toHaveBeenCalledWith(
      POLLING_JOB_NAMES.POLL_SOCIAL_ACCOUNT,
      { socialAccountId: 'acc-1', manual: true },
      expect.objectContaining({ jobId: 'account:acc-1' }),
    );
  });

  it('skips when a job for the account is already pending', async () => {
    scraperQueue.getJob.mockResolvedValue({
      isActive: jest.fn().mockResolvedValue(false),
      isWaiting: jest.fn().mockResolvedValue(true),
      isDelayed: jest.fn().mockResolvedValue(false),
    });

    const queued = await service.enqueue('acc-1');

    expect(queued).toBe(false);
    expect(scraperQueue.add).not.toHaveBeenCalled();
  });

  it('enqueueSafe swallows queue errors and returns false', async () => {
    scraperQueue.add.mockRejectedValue(new Error('redis down'));
    await expect(service.enqueueSafe('acc-1')).resolves.toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
cd yehub-be && pnpm test -- account-polling.service.spec
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `yehub-be/src/polling/account-polling.service.ts`:

```ts
import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { Queue } from 'bullmq';
import { POLLING_JOB_NAMES, QUEUE_NAMES } from '../queue/queue.constants';
import {
  accountWorkJobId,
  accountWorkJobOptions,
  isJobPending,
} from './polling-job.util';

export type AccountPollingJobData = {
  socialAccountId: string;
  manual?: boolean;
};

// Enqueue-only surface for social-account profile polls. Lives in
// PollingModule so both the API (profiles endpoints) and the worker
// (auto-link in PollingRunner) can queue account polls.
@Injectable()
export class AccountPollingService {
  private readonly logger = new Logger(AccountPollingService.name);

  constructor(
    @InjectQueue(QUEUE_NAMES.SCRAPER)
    private readonly scraperQueue: Queue,
  ) {}

  async enqueue(
    socialAccountId: string,
    opts?: { manual?: boolean },
  ): Promise<boolean> {
    const existing = await this.scraperQueue.getJob(
      accountWorkJobId(socialAccountId),
    );
    if (await isJobPending(existing)) return false;

    await this.scraperQueue.add(
      POLLING_JOB_NAMES.POLL_SOCIAL_ACCOUNT,
      { socialAccountId, manual: opts?.manual === true },
      accountWorkJobOptions(socialAccountId),
    );
    this.logger.debug(`Queued account poll socialAccountId=${socialAccountId}`);
    return true;
  }

  // For creation paths: a failed enqueue must never fail the request.
  async enqueueSafe(socialAccountId: string): Promise<boolean> {
    try {
      return await this.enqueue(socialAccountId);
    } catch (error) {
      this.logger.warn(
        `Failed to queue account poll socialAccountId=${socialAccountId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return false;
    }
  }
}
```

Register in `yehub-be/src/polling/polling.module.ts`:

```ts
import { AccountPollingService } from './account-polling.service';
// ...
  providers: [PollingSchedulerService, AccountPollingService],
  exports: [PollingSchedulerService, AccountPollingService, BullModule],
```

- [ ] **Step 4: Run tests**

```bash
cd yehub-be && pnpm test -- account-polling.service.spec
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add yehub-be/src/polling/account-polling.service.ts yehub-be/src/polling/account-polling.service.spec.ts yehub-be/src/polling/polling.module.ts
git commit -m "feat: add enqueue service for social account polls"
```

---

### Task 6: `AccountPollingRunner` (worker) + processor routing

**Files:**
- Create: `yehub-be/src/polling/account-polling-runner.service.ts`
- Test: `yehub-be/src/polling/account-polling-runner.service.spec.ts`
- Modify: `yehub-be/src/polling/scraper.processor.ts`
- Modify: `yehub-be/src/polling/polling-processor.module.ts`

- [ ] **Step 1: Write failing tests**

Create `yehub-be/src/polling/account-polling-runner.service.spec.ts`:

```ts
import { Job } from 'bullmq';
import { Platform } from '../../generated/prisma/client';
import { AccountPollingRunner } from './account-polling-runner.service';
import { PlatformError, PlatformErrorCode } from './platform-error';

describe('AccountPollingRunner', () => {
  const adapter = { fetchAccountProfile: jest.fn() };
  const adapters = { get: jest.fn(() => adapter) };
  const prisma = {
    socialAccount: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    profile: {
      update: jest.fn(),
    },
  };
  const uploads = { mirrorRemoteImage: jest.fn().mockResolvedValue(null) };
  let runner: AccountPollingRunner;

  const account = {
    id: 'acc-1',
    profile_id: 'profile-1',
    platform: Platform.INSTAGRAM,
    platform_user_id: 'instagram_johndoe',
    username: 'johndoe',
    display_name: null,
    profile: { id: 'profile-1', avatar: null },
  };

  const rawProfile = {
    platformUserId: 'real-321',
    username: 'johndoe',
    displayName: 'John Doe',
    followerCount: 5000,
    isVerified: true,
    avatarUrl: 'https://cdn.example.com/a.jpg',
    raw: {},
  };

  const job = { data: { socialAccountId: 'acc-1' } } as Job<{
    socialAccountId: string;
  }>;

  beforeEach(() => {
    jest.clearAllMocks();
    uploads.mirrorRemoteImage.mockResolvedValue(null);
    prisma.socialAccount.findUnique.mockResolvedValue({ ...account });
    prisma.socialAccount.findFirst.mockResolvedValue(null);
    prisma.socialAccount.update.mockResolvedValue({});
    adapter.fetchAccountProfile.mockResolvedValue({ ...rawProfile });
    runner = new AccountPollingRunner(
      prisma as any,
      adapters as any,
      uploads as any,
    );
  });

  it('updates account fields and claims the real platform user id', async () => {
    await runner.process(job);

    expect(adapter.fetchAccountProfile).toHaveBeenCalledWith('johndoe');
    expect(prisma.socialAccount.update).toHaveBeenCalledWith({
      where: { id: 'acc-1' },
      data: expect.objectContaining({
        platform_user_id: 'real-321',
        username: 'johndoe',
        display_name: 'John Doe',
        follower_count: 5000,
        is_verified: true,
        last_poll_status: 'success',
        last_polled_at: expect.any(Date),
      }),
    });
  });

  it('mirrors the avatar onto the profile only when the profile has none', async () => {
    uploads.mirrorRemoteImage.mockResolvedValue('https://s3/avatar.jpg');

    await runner.process(job);

    expect(uploads.mirrorRemoteImage).toHaveBeenCalledWith(
      'https://cdn.example.com/a.jpg',
      'avatars/profiles/profile-1',
    );
    expect(prisma.profile.update).toHaveBeenCalledWith({
      where: { id: 'profile-1' },
      data: { avatar: 'https://s3/avatar.jpg' },
    });
  });

  it('skips avatar mirroring when the profile already has one', async () => {
    prisma.socialAccount.findUnique.mockResolvedValue({
      ...account,
      profile: { id: 'profile-1', avatar: 'existing.jpg' },
    });

    await runner.process(job);

    expect(uploads.mirrorRemoteImage).not.toHaveBeenCalled();
    expect(prisma.profile.update).not.toHaveBeenCalled();
  });

  it('marks conflict and updates nothing else when the real id belongs to another account', async () => {
    prisma.socialAccount.findFirst.mockResolvedValue({ id: 'acc-other' });

    await expect(runner.process(job)).resolves.toBeUndefined();

    expect(prisma.socialAccount.update).toHaveBeenCalledWith({
      where: { id: 'acc-1' },
      data: {
        last_polled_at: expect.any(Date),
        last_poll_status: 'conflict',
      },
    });
  });

  it('marks failed and rethrows on adapter errors so BullMQ retries', async () => {
    adapter.fetchAccountProfile.mockRejectedValue(
      new PlatformError(PlatformErrorCode.RATE_LIMITED, 'slow down'),
    );

    await expect(runner.process(job)).rejects.toBeInstanceOf(PlatformError);

    expect(prisma.socialAccount.update).toHaveBeenCalledWith({
      where: { id: 'acc-1' },
      data: {
        last_polled_at: expect.any(Date),
        last_poll_status: 'failed',
      },
    });
  });

  it('marks failed without throwing when the account has no username', async () => {
    prisma.socialAccount.findUnique.mockResolvedValue({
      ...account,
      username: null,
    });

    await expect(runner.process(job)).resolves.toBeUndefined();

    expect(adapter.fetchAccountProfile).not.toHaveBeenCalled();
    expect(prisma.socialAccount.update).toHaveBeenCalledWith({
      where: { id: 'acc-1' },
      data: {
        last_polled_at: expect.any(Date),
        last_poll_status: 'failed',
      },
    });
  });

  it('no-ops when the account no longer exists', async () => {
    prisma.socialAccount.findUnique.mockResolvedValue(null);

    await expect(runner.process(job)).resolves.toBeUndefined();

    expect(prisma.socialAccount.update).not.toHaveBeenCalled();
  });

  it('keeps the existing platform user id when the adapter returns none', async () => {
    adapter.fetchAccountProfile.mockResolvedValue({
      ...rawProfile,
      platformUserId: '',
    });

    await runner.process(job);

    expect(prisma.socialAccount.update).toHaveBeenCalledWith({
      where: { id: 'acc-1' },
      data: expect.objectContaining({
        platform_user_id: 'instagram_johndoe',
      }),
    });
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
cd yehub-be && pnpm test -- account-polling-runner.service.spec
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement runner**

Create `yehub-be/src/polling/account-polling-runner.service.ts`:

```ts
import { Injectable, Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { UploadsService } from '../uploads/uploads.service';
import { PlatformAdapterRegistry } from './adapters/platform-adapter.registry';
import { PlatformError } from './platform-error';
import type { AccountPollingJobData } from './account-polling.service';

@Injectable()
export class AccountPollingRunner {
  private readonly logger = new Logger(AccountPollingRunner.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly adapters: PlatformAdapterRegistry,
    private readonly uploads: UploadsService,
  ) {}

  async process(job: Job<AccountPollingJobData>): Promise<void> {
    const account = await this.prisma.socialAccount.findUnique({
      where: { id: job.data.socialAccountId },
      include: { profile: { select: { id: true, avatar: true } } },
    });
    if (!account) {
      this.logger.debug(
        `Account poll no-op, account missing socialAccountId=${job.data.socialAccountId}`,
      );
      return;
    }

    if (!account.username) {
      // No handle to scrape by; retrying cannot fix this.
      this.logger.warn(
        `Account poll failed, no username socialAccountId=${account.id}`,
      );
      await this.markStatus(account.id, 'failed');
      return;
    }

    try {
      const adapter = this.adapters.get(account.platform);
      const data = await adapter.fetchAccountProfile(account.username);

      if (
        data.platformUserId &&
        data.platformUserId !== account.platform_user_id
      ) {
        const owner = await this.prisma.socialAccount.findFirst({
          where: {
            platform: account.platform,
            platform_user_id: data.platformUserId,
            id: { not: account.id },
          },
          select: { id: true },
        });
        if (owner) {
          // The real platform id already belongs to another account. Leave
          // both untouched; the user resolves via move/unlink. No throw —
          // BullMQ retries cannot resolve a data conflict.
          this.logger.warn(
            `Account poll conflict socialAccountId=${account.id} platformUserId=${data.platformUserId} ownerId=${owner.id}`,
          );
          await this.markStatus(account.id, 'conflict');
          return;
        }
      }

      await this.prisma.socialAccount.update({
        where: { id: account.id },
        data: {
          platform_user_id: data.platformUserId || account.platform_user_id,
          username: data.username ?? account.username,
          display_name: data.displayName ?? account.display_name,
          follower_count: data.followerCount,
          is_verified: data.isVerified,
          last_polled_at: new Date(),
          last_poll_status: 'success',
        },
      });

      if (data.avatarUrl && !account.profile.avatar) {
        const mirrored = await this.uploads.mirrorRemoteImage(
          data.avatarUrl,
          `avatars/profiles/${account.profile.id}`,
        );
        if (mirrored) {
          await this.prisma.profile.update({
            where: { id: account.profile.id },
            data: { avatar: mirrored },
          });
        }
      }
    } catch (err) {
      await this.markStatus(account.id, 'failed');
      this.logger.error(
        `Account poll failed socialAccountId=${account.id} code=${
          err instanceof PlatformError ? err.code : 'UNKNOWN'
        }: ${err instanceof Error ? err.message : 'Unknown error'}`,
      );
      throw err;
    }
  }

  private async markStatus(accountId: string, status: string): Promise<void> {
    await this.prisma.socialAccount.update({
      where: { id: accountId },
      data: { last_polled_at: new Date(), last_poll_status: status },
    });
  }
}
```

- [ ] **Step 4: Route account jobs in the processor**

Replace `yehub-be/src/polling/scraper.processor.ts` content:

```ts
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { Job } from 'bullmq';
import { POLLING_JOB_NAMES, QUEUE_NAMES } from '../queue/queue.constants';
import { platformBackoffStrategy } from './polling-backoff';
import { PollingRunner, type PollingJobData } from './polling-runner.service';
import { AccountPollingRunner } from './account-polling-runner.service';
import type { AccountPollingJobData } from './account-polling.service';

@Injectable()
@Processor(QUEUE_NAMES.SCRAPER, {
  concurrency: Number(process.env.POLLING_PROCESSOR_CONCURRENCY) || 1,
  settings: { backoffStrategy: platformBackoffStrategy },
})
export class ScraperProcessor extends WorkerHost {
  constructor(
    private readonly runner: PollingRunner,
    private readonly accountRunner: AccountPollingRunner,
  ) {
    super();
  }

  async process(job: Job): Promise<void> {
    if (job.name === POLLING_JOB_NAMES.POLL_SOCIAL_ACCOUNT) {
      return this.accountRunner.process(job as Job<AccountPollingJobData>);
    }
    return this.runner.process(job as Job<PollingJobData>);
  }
}
```

Add `AccountPollingRunner` to `yehub-be/src/polling/polling-processor.module.ts` providers:

```ts
import { AccountPollingRunner } from './account-polling-runner.service';
// ... in providers array, after PollingRunner:
    AccountPollingRunner,
```

Check `yehub-be/src/polling/scraper.processor.spec.ts` — it constructs the processor; add a mock second constructor arg and a test that `poll-social-account` jobs route to the account runner:

```ts
it('routes poll-social-account jobs to the account runner', async () => {
  const job = {
    name: POLLING_JOB_NAMES.POLL_SOCIAL_ACCOUNT,
    data: { socialAccountId: 'acc-1' },
  } as Job;
  await processor.process(job);
  expect(accountRunner.process).toHaveBeenCalledWith(job);
  expect(runner.process).not.toHaveBeenCalled();
});
```

- [ ] **Step 5: Run tests**

```bash
cd yehub-be && pnpm test -- account-polling-runner.service.spec scraper.processor.spec && pnpm build
```

Expected: PASS, clean build.

- [ ] **Step 6: Commit**

```bash
git add yehub-be/src/polling
git commit -m "feat: add social account polling worker runner"
```

---

### Task 7: Auto-poll on manual creation + manual trigger endpoint

**Files:**
- Modify: `yehub-be/src/profiles/profiles.service.ts`
- Modify: `yehub-be/src/profiles/profiles.controller.ts`
- Modify: `yehub-be/src/profiles/profiles.module.ts`
- Test: `yehub-be/src/profiles/profiles.service.spec.ts`

- [ ] **Step 1: Write failing tests**

In `yehub-be/src/profiles/profiles.service.spec.ts`:

Add a mock service near `mockPrisma`:

```ts
const mockAccountPolling = {
  enqueue: jest.fn().mockResolvedValue(true),
  enqueueSafe: jest.fn().mockResolvedValue(true),
};
```

Register it in the testing module providers:

```ts
        { provide: AccountPollingService, useValue: mockAccountPolling },
```

with import `import { AccountPollingService } from '../polling/account-polling.service';`.

Add tests (locate the existing `linkAccount` / `create` describes and extend them):

```ts
it('queues an account poll after linking', async () => {
  mockPrisma.profile.findUnique.mockResolvedValue(baseProfileResponse);
  mockPrisma.socialAccount.findFirst.mockResolvedValue(null);
  mockPrisma.socialAccount.create.mockResolvedValue({
    id: 'acc-1',
    platform: Platform.TIKTOK,
    platform_user_id: 'tiktok_johndoe',
    username: 'johndoe',
    display_name: null,
    follower_count: 0,
    is_verified: false,
    created_at: new Date(),
    last_polled_at: null,
    last_poll_status: null,
  });

  await service.linkAccount('profile-1', {
    platform: Platform.TIKTOK,
    username: 'johndoe',
  } as any);

  expect(mockAccountPolling.enqueueSafe).toHaveBeenCalledWith('acc-1');
});

it('queues an account poll per inline account on create', async () => {
  mockPrisma.socialAccount.findMany.mockResolvedValue([]);
  mockPrisma.profile.create.mockResolvedValue({
    ...baseProfileResponse,
    profileTier: null,
    socialAccounts: [
      { id: 'acc-1', platform: Platform.TIKTOK, platform_user_id: 'tiktok_a', username: 'a', display_name: null, follower_count: 0, is_verified: false, created_at: new Date(), last_polled_at: null, last_poll_status: null },
      { id: 'acc-2', platform: Platform.INSTAGRAM, platform_user_id: 'instagram_b', username: 'b', display_name: null, follower_count: 0, is_verified: false, created_at: new Date(), last_polled_at: null, last_poll_status: null },
    ],
  });

  await service.create({
    name: 'John',
    tierId: 'tier-1',
    socialAccounts: [
      { platform: Platform.TIKTOK, url: 'https://www.tiktok.com/@a' },
      { platform: Platform.INSTAGRAM, url: 'https://www.instagram.com/b' },
    ],
  } as any);

  expect(mockAccountPolling.enqueueSafe).toHaveBeenCalledWith('acc-1');
  expect(mockAccountPolling.enqueueSafe).toHaveBeenCalledWith('acc-2');
});

describe('pollAccount', () => {
  it('queues a manual poll for an account on the profile', async () => {
    mockPrisma.socialAccount.findFirst.mockResolvedValue({ id: 'acc-1' });

    const result = await service.pollAccount('profile-1', 'acc-1');

    expect(mockAccountPolling.enqueue).toHaveBeenCalledWith('acc-1', {
      manual: true,
    });
    expect(result).toEqual({ queued: true });
  });

  it('throws when the account is not on the profile', async () => {
    mockPrisma.socialAccount.findFirst.mockResolvedValue(null);
    await expect(service.pollAccount('profile-1', 'acc-x')).rejects.toThrow(
      NotFoundException,
    );
  });
});
```

NOTE: match the existing spec's mock-shaping style — `baseProfileResponse` etc. If existing `create`/`linkAccount` tests now fail because the service calls `enqueueSafe`, the mock above already covers it.

- [ ] **Step 2: Run to verify failure**

```bash
cd yehub-be && pnpm test -- profiles.service.spec
```

Expected: FAIL — `AccountPollingService` not injectable / `pollAccount` missing.

- [ ] **Step 3: Implement**

`yehub-be/src/profiles/profiles.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PollingModule } from '../polling/polling.module';
import { ProfilesController } from './profiles.controller';
import { ProfilesService } from './profiles.service';

@Module({
  imports: [AuthModule, PollingModule],
  controllers: [ProfilesController],
  providers: [ProfilesService],
  exports: [ProfilesService],
})
export class ProfilesModule {}
```

`yehub-be/src/profiles/profiles.service.ts`:

Constructor:

```ts
import { AccountPollingService } from '../polling/account-polling.service';
// ...
  constructor(
    private readonly prisma: PrismaService,
    private readonly accountPolling: AccountPollingService,
  ) {}
```

In `create`, after the profile is created successfully (inside the `try`, before `return this.formatProfile(profile)`):

```ts
      for (const account of profile.socialAccounts) {
        await this.accountPolling.enqueueSafe(account.id);
      }
```

In `linkAccount`, after `const account = await this.prisma.socialAccount.create(...)` (inside the `try`, before the `return`):

```ts
      await this.accountPolling.enqueueSafe(account.id);
```

New method after `moveAccount`:

```ts
  async pollAccount(profileId: string, accountId: string) {
    const account = await this.prisma.socialAccount.findFirst({
      where: { id: accountId, profile_id: profileId },
      select: { id: true },
    });
    if (!account) {
      throw new NotFoundException('Social account not found on this profile');
    }

    const queued = await this.accountPolling.enqueue(accountId, {
      manual: true,
    });
    return { queued };
  }
```

`yehub-be/src/profiles/profiles.controller.ts` — add after `moveAccount`:

```ts
  @Post(':id/accounts/:accountId/poll')
  @UseGuards(GlobalRolesGuard)
  @GlobalRoles(GlobalRole.ADMIN, GlobalRole.INTERNAL_USER)
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Trigger a refresh poll of a social account' })
  pollAccount(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('accountId', ParseUUIDPipe) accountId: string,
  ) {
    return this.profilesService.pollAccount(id, accountId);
  }
```

- [ ] **Step 4: Run tests + build**

```bash
cd yehub-be && pnpm test -- profiles.service.spec && pnpm build && pnpm lint
```

Expected: PASS, clean.

- [ ] **Step 5: Commit**

```bash
git add yehub-be/src/profiles
git commit -m "feat: auto-poll social accounts on creation and add manual poll endpoint"
```

---

### Task 8: Auto-poll newly auto-linked accounts (worker path)

**Files:**
- Modify: `yehub-be/src/polling/polling-runner.service.ts`
- Test: `yehub-be/src/polling/polling-runner.service.spec.ts`

- [ ] **Step 1: Write failing tests**

In `yehub-be/src/polling/polling-runner.service.spec.ts`, the runner is constructed as `new PollingRunner(prisma as any, adapters as any, uploads as any)` — it gains a 4th argument. Add near the other mocks:

```ts
const accountPolling = { enqueueSafe: jest.fn().mockResolvedValue(true) };
```

Update construction:

```ts
    runner = new PollingRunner(
      prisma as any,
      adapters as any,
      uploads as any,
      accountPolling as any,
    );
```

Add tests inside the existing auto-link describe (find the tests covering `ensureAuthorLinked` behavior — they exist from commit 0fe3e67):

```ts
it('queues an account poll when auto-link creates a new account', async () => {
  prisma.socialAccountPost.findUnique.mockResolvedValue(null);
  prisma.socialAccount.findFirst.mockResolvedValue(null);
  prisma.socialAccount.create.mockResolvedValue({ id: 'acc-new' });
  prisma.post.findUnique.mockResolvedValue(activePost);
  adapter.fetchPostData.mockResolvedValue(metricsData); // reuse the fixture the existing auto-link tests use

  await runner.process(job(POLLING_JOB_NAMES.POLL_POST_METRICS));

  expect(accountPolling.enqueueSafe).toHaveBeenCalledWith('acc-new');
});

it('does not queue an account poll when auto-link reuses an existing account', async () => {
  prisma.socialAccountPost.findUnique.mockResolvedValue(null);
  prisma.socialAccount.findFirst.mockResolvedValue({ id: 'acc-existing' });
  prisma.post.findUnique.mockResolvedValue(activePost);
  adapter.fetchPostData.mockResolvedValue(metricsData);

  await runner.process(job(POLLING_JOB_NAMES.POLL_POST_METRICS));

  expect(accountPolling.enqueueSafe).not.toHaveBeenCalled();
});
```

(Adapt fixture names — `metricsData` stands for whatever `RawPostData` fixture with `platformUserId` + `authorUsername` the existing auto-link tests already define. Read the spec before editing.)

- [ ] **Step 2: Run to verify failure**

```bash
cd yehub-be && pnpm test -- polling-runner.service.spec
```

Expected: new tests FAIL (enqueueSafe never called).

- [ ] **Step 3: Implement**

In `yehub-be/src/polling/polling-runner.service.ts`:

```ts
import { AccountPollingService } from './account-polling.service';
// constructor gains:
    private readonly accountPolling: AccountPollingService,
```

In `ensureAuthorLinked`, track creation and enqueue. Change the `if (existingAccount)` block region to:

```ts
    let accountId: string;
    let createdNewAccount = false;
    const existingAccount = await this.prisma.socialAccount.findFirst({
      where: { platform, platform_user_id: data.platformUserId },
      select: { id: true },
    });

    if (existingAccount) {
      accountId = existingAccount.id;
    } else {
      try {
        const created = await this.prisma.socialAccount.create({
          data: {
            platform,
            platform_user_id: data.platformUserId,
            username,
            display_name: data.authorDisplayName,
            profile: { create: { name, avatar: data.authorAvatarUrl } },
          },
          select: { id: true },
        });
        accountId = created.id;
        createdNewAccount = true;
      } catch (error) {
        // ... existing P2002 refetch handling unchanged ...
      }
    }

    if (createdNewAccount) {
      await this.accountPolling.enqueueSafe(accountId);
    }
```

(The P2002 branch keeps `createdNewAccount = false` — a concurrent creator already enqueued the poll.)

`PollingProcessorModule` already imports `PollingModule` which exports `AccountPollingService` — no module change needed. Verify `WorkerModule` boots: `cd yehub-be && pnpm build`.

- [ ] **Step 4: Run tests**

```bash
cd yehub-be && pnpm test -- polling-runner.service.spec && pnpm build
```

Expected: PASS.

- [ ] **Step 5: Run the full backend suite + lint**

```bash
cd yehub-be && pnpm test && pnpm lint
```

Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add yehub-be/src/polling
git commit -m "feat: poll newly auto-linked social accounts"
```

---

### Task 9: Frontend — API types + poll call

**Files:**
- Modify: `yehub-fe/src/api/profiles.ts`

- [ ] **Step 1: Extend types and API**

In `yehub-fe/src/api/profiles.ts` (frontend style: no semicolons):

Add to `ProfileAccount` after `createdAt: string`:

```ts
  lastPolledAt: string | null
  lastPollStatus: 'success' | 'failed' | 'conflict' | null
```

Add to `profilesApi` after `moveAccount`:

```ts
  pollAccount: (profileId: string, accountId: string) =>
    apiClient.post<{ queued: boolean }>(`/profiles/${profileId}/accounts/${accountId}/poll`).then((r) => r.data),
```

- [ ] **Step 2: Verify**

```bash
cd yehub-fe && pnpm build
```

Expected: clean build.

- [ ] **Step 3: Commit**

```bash
git add yehub-fe/src/api/profiles.ts
git commit -m "feat: add social account poll API to frontend client"
```

---

### Task 10: Frontend — refresh button + poll status on SocialAccountRow

**Files:**
- Modify: `yehub-fe/src/pages/profiles/ProfileDetailPage/components/SocialAccountRow.tsx`

- [ ] **Step 1: Implement the refresh flow**

Changes to `SocialAccountRow.tsx`:

1. Imports — add `useEffect` to the react import, add `RefreshCw` and `AlertTriangle` to the lucide import.

2. State + mutation + auto-refetch loop (after the existing mutations):

```tsx
  const [refreshStartedAt, setRefreshStartedAt] = useState<number | null>(() => {
    // A freshly linked account has an auto-poll in flight: watch for its result.
    const isAwaitingFirstPoll =
      account.lastPollStatus === null && Date.now() - new Date(account.createdAt).getTime() < 2 * 60_000
    return isAwaitingFirstPoll ? Date.now() : null
  })

  const pollMutation = useMutation({
    mutationFn: () => profilesApi.pollAccount(profileId, account.id),
    onSuccess: ({ queued }) => {
      setRefreshStartedAt(Date.now())
      toast.success(queued ? 'Account refresh queued' : 'A refresh is already in progress')
    },
    onError: (error) => showApiError(error, { fallback: 'Failed to refresh account' }),
  })

  const lastPolledAtMs = account.lastPolledAt ? new Date(account.lastPolledAt).getTime() : null

  useEffect(() => {
    if (refreshStartedAt === null) return
    if (lastPolledAtMs !== null && lastPolledAtMs >= refreshStartedAt) {
      setRefreshStartedAt(null)
      return
    }
    if (Date.now() - refreshStartedAt > 90_000) {
      setRefreshStartedAt(null)
      return
    }
    const timer = setInterval(() => {
      queryClient.invalidateQueries({ queryKey: queryKeys.profile(profileId) })
    }, 5000)
    return () => clearInterval(timer)
  }, [refreshStartedAt, lastPolledAtMs, profileId, queryClient])

  const isRefreshing = pollMutation.isPending || refreshStartedAt !== null
```

3. Follower line — replace the existing `<p className="text-xs ...">` with status-aware rendering:

```tsx
            <div className="flex items-center gap-1.5">
              <p
                className="text-xs text-muted-foreground"
                title={account.lastPolledAt ? `Updated ${new Date(account.lastPolledAt).toLocaleString()}` : 'Not updated yet'}
              >
                {formatNumber(account.followerCount)} followers
              </p>
              {account.lastPollStatus === 'conflict' && (
                <AlertTriangle
                  className="h-3.5 w-3.5 shrink-0 text-amber-500"
                  aria-label="Refresh conflict"
                />
              )}
              {account.lastPollStatus === 'failed' && (
                <span className="text-xs text-destructive">update failed</span>
              )}
            </div>
```

For the conflict icon, wrap with the project's Tooltip primitive if `src/components/ui/tooltip.tsx` exists (check first), tooltip text: `This account's platform ID is already linked to another account`. If no tooltip primitive exists, use `title="This account's platform ID is already linked to another account"` on the icon.

4. Refresh button — inside the actions `<div className="flex items-center gap-2 shrink-0">`, BEFORE the `<DropdownMenu>`:

```tsx
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0 cursor-pointer"
            aria-label="Refresh account info"
            disabled={isRefreshing}
            onClick={() => pollMutation.mutate()}
          >
            <RefreshCw className={cn('h-4 w-4', isRefreshing && 'animate-spin')} />
          </Button>
```

with `import { cn } from '@/lib/utils'` added.

- [ ] **Step 2: Verify lint + build**

```bash
cd yehub-fe && pnpm lint && pnpm build
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add yehub-fe/src/pages/profiles/ProfileDetailPage/components/SocialAccountRow.tsx
git commit -m "feat: add manual refresh button and poll status to social account rows"
```

---

### Task 11: Final verification

- [ ] **Step 1: Full backend suite**

```bash
cd yehub-be && pnpm lint && pnpm build && pnpm test
```

Expected: all green.

- [ ] **Step 2: Full frontend checks**

```bash
cd yehub-fe && pnpm lint && pnpm build
```

Expected: clean.

- [ ] **Step 3: GitNexus change detection (per repo CLAUDE.md)**

Run `gitnexus_detect_changes()` (MCP) or `npx gitnexus analyze` if the index is stale; confirm affected symbols are only the polling/profiles/social-account surfaces touched above.

- [ ] **Step 4: Manual smoke (optional, requires Docker + APIFY_TOKEN)**

```bash
docker compose up -d
cd yehub-be && pnpm start:dev          # terminal 1
cd yehub-be && pnpm start:worker:dev   # terminal 2
cd yehub-fe && pnpm dev                # terminal 3
```

Link an account on a profile detail page → row should show a spinner-ish pending refresh; click the refresh icon → 202, worker logs the poll, followers update after the queue drains.
