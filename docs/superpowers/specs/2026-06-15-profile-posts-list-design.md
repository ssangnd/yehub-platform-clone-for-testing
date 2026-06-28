# Profile detail — linked Posts list

**Date:** 2026-06-15
**Status:** Approved (design)

## Goal

On the Profile detail page (`/profiles/:id`), show a paginated list of the posts
linked to that profile's social accounts. Latest post first. Clicking a row opens
the post detail page.

## Background / data model

There is **no direct relationship** between `Profile` and `Post`. A post reaches a
profile through two hops:

```
Profile ──< SocialAccount ──< SocialAccountPost >── Post
         (profile_id)      (social_account_id / post_id)
```

- `SocialAccountPost` has `@@unique([post_id])` — a post links to at most one social
  account (hence one profile), so a post appears at most once in the list (no
  fan-out / de-dup needed).
- Relevant indexes already exist: `social_accounts.profile_id`,
  `social_account_posts.social_account_id`. No schema change / migration required.

## Approach

Reuse the existing "list all posts" API (`GET /posts` →
`PostsService.findAllPosts`) by adding an optional `social_account_id` filter. The
Profile page sends the IDs of the profile's social accounts (already available on
`profile.accounts`).

### Why this approach

- `findAllPosts` already returns the exact `PostListItem` shape we want (campaign +
  project + linked account), so the frontend reuses `PostsTable` and the existing
  `AllPostsPage` / `PostListItem` types directly.
- The filter only ever **narrows within** what the caller is already authorized to
  see — `findAllPosts` keeps its membership scope (`OR: [project membership,
  campaign membership]`; ADMIN sees all). Adding the filter introduces **no**
  access-control bypass.

### Accepted behavioral consequence

Because the membership scope stays in place:

- **ADMIN** sees every post linked to the profile's accounts ("show all").
- An **INTERNAL_USER** who is not a member of the relevant campaigns sees only the
  subset of linked posts in campaigns they can access — not necessarily the full
  set.

This is an accepted trade-off (no security risk; just a completeness difference for
non-admin viewers). Click-through to a post in a campaign the viewer cannot access
is blocked by the existing `PostRolesGuard` on `GET /posts/:id`.

## Backend changes

### `yehub-be/src/posts/dto/list-posts-query.dto.ts`

Add an optional, repeatable UUID filter:

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

`@Transform` coerces a single `?social_account_id=<uuid>` into an array so both
single and repeated query params work.

### `yehub-be/src/posts/posts.service.ts` — `findAllPosts`

When `query.social_account_id` is present and non-empty, AND-in to the existing
`where`:

```ts
...(query.social_account_id?.length && {
  socialAccountPosts: {
    some: { social_account_id: { in: query.social_account_id } },
  },
}),
```

Everything else (membership scope, `postInclude`, projection, pagination,
`orderBy` default `created_at desc`) is unchanged.

### Tests

Add a `posts.service.spec` case: `findAllPosts` with `social_account_id` applies the
nested `socialAccountPosts.some.social_account_id.in` filter (and that an empty /
absent value does not add the filter).

## Frontend changes

### `yehub-fe/src/api/posts.ts`

Extend `listAllPosts` params with `social_account_id?: string[]`. Axios serializes
an array to repeated query params, matching the DTO transform.

### `yehub-fe/src/lib/constants/query-keys.ts`

Add a key for the profile's posts list, e.g.
`profilePosts(profileId, page)` (scoped so it invalidates independently of the
global posts list).

### `yehub-fe/src/pages/profiles/ProfileDetailPage/use-profile-posts.ts` (new)

A small hook:

- Accepts the profile's `accounts` (or account IDs).
- Manages `page` via `useUrlState` (consistent with `usePostsList` /
  `useCampaignPosts`). Pagination only — no search / platform / sort state.
- `useQuery` calling `postsApi.listAllPosts({ social_account_id: ids, page, limit: 20 })`.
- Disabled (`enabled: ids.length > 0`) when the profile has no accounts.
- Returns `{ posts, totalPages, isLoading, page, setPage }`.

### `yehub-fe/src/pages/profiles/ProfileDetailPage/index.tsx`

Add a **"Posts" `Card`** below the existing Social Accounts card:

- `<PostsTable showAccount renderCampaign={(p) => p.campaign_name} ... />` — reuse
  the shared component.
- `onRowClick` → `navigate(\`/projects/${p.project_id}/campaigns/${p.campaign_id}/posts/${p.id}\`)`.
- `<PaginationBar page={page} setPage={setPage} totalPages={totalPages} />`.
- Loading state mirrors the page's existing pattern; empty state: "No posts linked
  to this profile's accounts yet."

## Out of scope

- Search / platform filter / sortable columns on this list (pagination only).
- Denormalizing a `profile_id` onto `Post` (the two-hop indexed filter is
  sufficient).
- Changing the membership-scope semantics of `findAllPosts`.

## Files touched

**Backend**
- `yehub-be/src/posts/dto/list-posts-query.dto.ts`
- `yehub-be/src/posts/posts.service.ts`
- `yehub-be/src/posts/posts.service.spec.ts`

**Frontend**
- `yehub-fe/src/api/posts.ts`
- `yehub-fe/src/lib/constants/query-keys.ts`
- `yehub-fe/src/pages/profiles/ProfileDetailPage/use-profile-posts.ts` (new)
- `yehub-fe/src/pages/profiles/ProfileDetailPage/index.tsx`
