# Profile Linked-Posts List Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a paginated "Posts" list to the Profile detail page showing every post linked to that profile's social accounts.

**Architecture:** Reuse the existing `GET /posts` (`PostsService.findAllPosts`) endpoint by adding an optional, repeatable `social_account_id` filter. The Profile page sends the IDs of the profile's social accounts. No new endpoint, no schema change, no migration. The filter only narrows within what the caller can already see (membership scope unchanged → no auth bypass). Click-through to a post in an inaccessible campaign stays blocked by the existing `PostRolesGuard` on `GET /posts/:id`.

**Tech Stack:** Backend NestJS 11 + Prisma 7 (Jest). Frontend React 19 + Vite + TanStack Query v5 (verified via ESLint + `tsc`/build; the frontend has no unit-test runner).

**Spec:** `docs/superpowers/specs/2026-06-15-profile-posts-list-design.md`

---

## Environment note (this machine)

The Bash tool needs the Node/pnpm toolchain on PATH. Prefix backend/frontend commands with:

```bash
export PATH="/c/Tools/nvm/v24.15.0:$PATH"
```

Backend commands run from `yehub-be/`; frontend commands run from `yehub-fe/`.

---

## File Structure

**Backend**
- `yehub-be/src/posts/dto/list-posts-query.dto.ts` — add the `social_account_id?: string[]` query filter.
- `yehub-be/src/posts/posts.service.ts` — apply the filter inside `findAllPosts`.
- `yehub-be/src/posts/posts.service.spec.ts` — tests for the new filter.

**Frontend**
- `yehub-fe/src/api/posts.ts` — add `social_account_id?: string[]` to `listAllPosts` params.
- `yehub-fe/src/lib/constants/query-keys.ts` — add `profilePosts(profileId, page)` key.
- `yehub-fe/src/pages/profiles/ProfileDetailPage/use-profile-posts.ts` — **new** hook (page state + query).
- `yehub-fe/src/pages/profiles/ProfileDetailPage/index.tsx` — render the "Posts" card.

---

## Task 1: Backend — `social_account_id` filter on `findAllPosts`

**Files:**
- Test: `yehub-be/src/posts/posts.service.spec.ts` (extend `describe('PostsService.findAllPosts')`, ends at line ~1046)
- Modify: `yehub-be/src/posts/dto/list-posts-query.dto.ts:1-12` (imports) and add the field
- Modify: `yehub-be/src/posts/posts.service.ts:656-681` (the `where` in `findAllPosts`)

- [ ] **Step 1: Write the failing tests**

Append these two tests inside the existing `describe('PostsService.findAllPosts', () => { ... })` block, immediately before its closing `});` at line ~1046:

```ts
  it('filters by linked social account ids when provided', async () => {
    prisma.$transaction.mockResolvedValue([[dbPost({})], 1]);

    await service.findAllPosts('u1', { social_account_id: ['sa-1', 'sa-2'] });

    expect(prisma.post.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          socialAccountPosts: {
            some: { social_account_id: { in: ['sa-1', 'sa-2'] } },
          },
        }),
      }),
    );
  });

  it('does not add the social account filter when not provided', async () => {
    prisma.$transaction.mockResolvedValue([[dbPost({})], 1]);

    await service.findAllPosts('u1', {});

    const arg = prisma.post.findMany.mock.calls[0][0] as {
      where: Record<string, unknown>;
    };
    expect(arg.where.socialAccountPosts).toBeUndefined();
  });
```

- [ ] **Step 2: Run the tests to verify the first one fails**

```bash
export PATH="/c/Tools/nvm/v24.15.0:$PATH"
pnpm test -- posts.service
```

Expected: the "filters by linked social account ids" test FAILS (findMany called without `socialAccountPosts`); the "does not add" test passes. (If `social_account_id` is flagged as an unknown property by TS, that is expected until Step 3 adds it to the DTO.)

- [ ] **Step 3: Add the DTO field**

In `yehub-be/src/posts/dto/list-posts-query.dto.ts`, update the imports and add the field.

Change the `class-validator` import (line ~2-10) to include `IsUUID`:

```ts
import {
  IsOptional,
  IsString,
  IsEnum,
  IsInt,
  IsIn,
  IsUUID,
  Min,
  Max,
} from 'class-validator';
```

Change the `class-transformer` import (line ~11) to include `Transform`:

```ts
import { Type, Transform } from 'class-transformer';
```

Add this field inside the `ListPostsQueryDto` class (e.g. right after the `platform` field, before `page`):

```ts
  @ApiPropertyOptional({
    description: 'Filter posts by linked social account id(s)',
    type: [String],
  })
  @IsOptional()
  @Transform(({ value }) => (Array.isArray(value) ? value : [value]))
  @IsUUID('4', { each: true })
  social_account_id?: string[];
```

- [ ] **Step 4: Apply the filter in the service**

In `yehub-be/src/posts/posts.service.ts`, inside `findAllPosts`, add to the `where` object (the `Prisma.PostWhereInput` starting at line ~656). Insert this entry after the `...(query.q && { ... })` block and before the closing `}` of the `where` object:

```ts
      ...(query.social_account_id?.length && {
        socialAccountPosts: {
          some: { social_account_id: { in: query.social_account_id } },
        },
      }),
```

- [ ] **Step 5: Run the tests to verify they pass**

```bash
export PATH="/c/Tools/nvm/v24.15.0:$PATH"
pnpm test -- posts.service
```

Expected: PASS (all `PostsService.findAllPosts` tests green, no regressions in the file).

- [ ] **Step 6: Lint**

```bash
export PATH="/c/Tools/nvm/v24.15.0:$PATH"
pnpm lint
```

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add yehub-be/src/posts/dto/list-posts-query.dto.ts yehub-be/src/posts/posts.service.ts yehub-be/src/posts/posts.service.spec.ts
git commit -m "feat(be): filter posts by linked social account id"
```

---

## Task 2: Frontend — extend `listAllPosts` API params

**Files:**
- Modify: `yehub-fe/src/api/posts.ts:145-152` (the `listAllPosts` function)

- [ ] **Step 1: Add the param**

In `yehub-fe/src/api/posts.ts`, update `listAllPosts` to accept `social_account_id`:

```ts
  listAllPosts: (params?: {
    q?: string
    platform?: Platform
    social_account_id?: string[]
    page?: number
    limit?: number
    sort_by?: string
    order?: 'asc' | 'desc'
  }) => apiClient.get<AllPostsPage>('/posts', { params }).then((r) => r.data),
```

Axios serializes a string array to repeated query params (`?social_account_id=a&social_account_id=b`), matching the backend DTO's `@Transform`.

- [ ] **Step 2: Verify it type-checks**

```bash
export PATH="/c/Tools/nvm/v24.15.0:$PATH"
pnpm build
```

Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
git add yehub-fe/src/api/posts.ts
git commit -m "feat(fe): accept social_account_id filter in listAllPosts"
```

---

## Task 3: Frontend — add the `profilePosts` query key

**Files:**
- Modify: `yehub-fe/src/lib/constants/query-keys.ts:107` (after the `profile` key)

- [ ] **Step 1: Add the key**

In `yehub-fe/src/lib/constants/query-keys.ts`, add this entry immediately after the `profile: (id: string) => ['profile', id] as const,` line (line ~107):

```ts
  profilePosts: (profileId: string, page: number) => ['profile-posts', profileId, page] as const,
```

- [ ] **Step 2: Verify it type-checks**

```bash
export PATH="/c/Tools/nvm/v24.15.0:$PATH"
pnpm build
```

Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
git add yehub-fe/src/lib/constants/query-keys.ts
git commit -m "feat(fe): add profilePosts query key"
```

---

## Task 4: Frontend — `useProfilePosts` hook

**Files:**
- Create: `yehub-fe/src/pages/profiles/ProfileDetailPage/use-profile-posts.ts`

- [ ] **Step 1: Create the hook**

Create `yehub-fe/src/pages/profiles/ProfileDetailPage/use-profile-posts.ts` with this exact content:

```ts
import { useQuery } from '@tanstack/react-query'
import { postsApi } from '@/api/posts'
import { queryKeys } from '@/lib/constants/query-keys'
import { useUrlState } from '@/hooks/use-url-state'

const PAGE_LIMIT = 20

export function useProfilePosts(profileId: string, accountIds: string[]) {
  const { page, setPage } = useUrlState()

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.profilePosts(profileId, page),
    queryFn: () => postsApi.listAllPosts({ social_account_id: accountIds, page, limit: PAGE_LIMIT }),
    enabled: accountIds.length > 0,
  })

  return {
    posts: data?.data ?? [],
    totalPages: data?.totalPages ?? 0,
    isLoading,
    page,
    setPage,
  }
}
```

Notes: pagination-only (no search/platform/sort). The query is disabled when the profile has no accounts. The endpoint already orders `created_at desc` (latest first).

- [ ] **Step 2: Verify it type-checks**

```bash
export PATH="/c/Tools/nvm/v24.15.0:$PATH"
pnpm build
```

Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
git add yehub-fe/src/pages/profiles/ProfileDetailPage/use-profile-posts.ts
git commit -m "feat(fe): add useProfilePosts hook"
```

---

## Task 5: Frontend — render the "Posts" card on the Profile detail page

**Files:**
- Modify: `yehub-fe/src/pages/profiles/ProfileDetailPage/index.tsx`

- [ ] **Step 1: Add imports**

In `yehub-fe/src/pages/profiles/ProfileDetailPage/index.tsx`, add these imports alongside the existing ones:

```ts
import { PostsTable } from '@/components/common/PostsTable'
import { PaginationBar } from '@/components/common/PaginationBar'
import type { PostListItem } from '@/api/posts'
import { useProfilePosts } from './use-profile-posts'
```

- [ ] **Step 2: Call the hook**

Inside `ProfileDetailPage`, immediately after the existing `const { id, profile, isLoading, categories, tiers, invalidate } = useProfileDetail()` line, add:

```ts
  const {
    posts,
    totalPages,
    isLoading: postsLoading,
    page,
    setPage,
  } = useProfilePosts(id, profile?.accounts.map((a) => a.id) ?? [])
```

This hook is called before the `if (isLoading)` / `if (!profile)` early returns (consistent with the other hooks in this component). While `profile` is undefined the account list is empty and the query stays disabled.

- [ ] **Step 3: Render the Posts card**

In the JSX, add this `Card` immediately after the closing `</Card>` of the "Social Accounts" card (the one ending just before the `{/* Page-level dialogs ... */}` comment):

```tsx
      {/* Posts */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Posts</CardTitle>
        </CardHeader>
        <CardContent>
          {postsLoading ? (
            <p className="text-sm text-muted-foreground text-center py-6">Loading posts…</p>
          ) : posts.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              No posts linked to this profile's accounts yet.
            </p>
          ) : (
            <div className="space-y-4">
              <PostsTable
                posts={posts}
                showAccount
                renderCampaign={(post: PostListItem) => (
                  <p className="text-sm font-medium truncate max-w-40">{post.campaign_name}</p>
                )}
                onRowClick={(p) => navigate(`/projects/${p.project_id}/campaigns/${p.campaign_id}/posts/${p.id}`)}
              />
              <PaginationBar page={page} setPage={setPage} totalPages={totalPages} />
            </div>
          )}
        </CardContent>
      </Card>
```

(`navigate`, `Card`, `CardContent`, `CardHeader`, `CardTitle` are already imported in this file.)

- [ ] **Step 4: Verify build + lint**

```bash
export PATH="/c/Tools/nvm/v24.15.0:$PATH"
pnpm build && pnpm lint
```

Expected: build succeeds, no lint errors.

- [ ] **Step 5: Commit**

```bash
git add yehub-fe/src/pages/profiles/ProfileDetailPage/index.tsx
git commit -m "feat(fe): show linked posts list on profile detail page"
```

---

## Task 6: Final verification

- [ ] **Step 1: Backend — full lint + targeted tests**

```bash
export PATH="/c/Tools/nvm/v24.15.0:$PATH"
cd yehub-be && pnpm lint && pnpm test -- posts.service && pnpm build
```

Expected: all green.

- [ ] **Step 2: Frontend — lint + build**

```bash
export PATH="/c/Tools/nvm/v24.15.0:$PATH"
cd yehub-fe && pnpm lint && pnpm build
```

Expected: all green.

- [ ] **Step 3: Manual smoke test (optional but recommended)**

Start backend (`pnpm start:dev` in `yehub-be`) and frontend (`pnpm dev` in `yehub-fe`). As an ADMIN, open a profile that has social accounts with linked posts at `/profiles/:id`. Verify:
- The "Posts" card lists the linked posts, latest first.
- Pagination works (if >20 posts) and the page survives a refresh (URL `?page=` param).
- A profile with no accounts shows the empty-state message.
- Clicking a row opens the post detail page.

---

## Self-Review

**Spec coverage:**
- `social_account_id` filter on `findAllPosts` → Task 1. ✓
- DTO repeatable UUID param with transform → Task 1, Step 3. ✓
- Frontend API param → Task 2. ✓
- Query key → Task 3. ✓
- `use-profile-posts.ts` hook (pagination-only, disabled when no accounts) → Task 4. ✓
- "Posts" card with `PostsTable` + `PaginationBar`, row click → post detail, empty/loading states → Task 5. ✓
- Membership scope unchanged / no migration → no task needed (nothing changed there). ✓
- Click-through enforcement via existing `PostRolesGuard` → no change required. ✓

**Placeholder scan:** No TBD/TODO; every code step contains complete code. ✓

**Type consistency:** `useProfilePosts(profileId, accountIds)` defined in Task 4 and called with `(id, profile?.accounts.map((a) => a.id) ?? [])` in Task 5. `queryKeys.profilePosts(profileId, page)` defined in Task 3, used in Task 4. `listAllPosts({ social_account_id })` defined in Task 2, used in Task 4. `social_account_id?: string[]` consistent across DTO (Task 1), API (Task 2), and hook call (Task 4). ✓
