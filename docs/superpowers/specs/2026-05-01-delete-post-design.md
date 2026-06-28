# Delete Post — Design

**Date:** 2026-05-01
**Branch:** `feature/delete-post`

## Goal

Allow ADMINs and project MANAGERs to permanently delete a post from two entry points:
the post detail page and the campaign detail page's posts list. Deletion is a hard
delete that cascades to all of the post's comments and profile-post links.

## Scope

- **In scope (backend):** Switch `PostsService.remove` from soft-delete to hard-delete.
- **In scope (frontend):** Delete UI on `PostDetailPage` (under "More") and on the
  campaign-detail posts list (per-row action menu).
- **Out of scope:** No changes to the global `PostsPage` (`/posts`).
- **Out of scope:** No new e2e tests.
- **Out of scope:** Removing the now-vestigial `Post.deleted_at` column or the many
  `deleted_at: null` filters elsewhere — separate cleanup.

## Permissions

| Role | Can delete |
|---|---|
| `GlobalRole.ADMIN` | Yes — short-circuited in `PostRolesGuard` |
| `ProjectRole.MANAGER` | Yes — `@Roles(ProjectRole.MANAGER)` on the controller |
| `ProjectRole.EXECUTIVE` / `ANALYST` / others | No |

The frontend mirrors this with a new `delete_post` action in `useCanProject`.

## Backend changes

### `yehub-be/src/posts/posts.service.ts` — `remove()`

Switch from `prisma.post.update({ data: { deleted_at: new Date() }})` to
`prisma.post.delete({ where: { id: postId }})`. Keep the existing pre-checks:

- 404 if the post does not exist (or is already soft-deleted from legacy data).
- 400 if the campaign is `CampaignStatus.COMPLETED`.

Cascading is automatic via Prisma schema:
- `Comment.post_id` has `onDelete: Cascade` → all comments removed.
- `ProfilePost.post_id` has `onDelete: Cascade` → profile↔post links removed.

Per-post metrics live inline on the `Post` row (`metrics_snapshot`, `kpi_currents`,
`likes`, `shares`, `views`, etc.) — they vanish with the row.

### `yehub-be/src/posts/posts.controller.ts`

No signature change. Update `@ApiOperation({ summary })` from
`'Soft-delete a post'` to `'Delete a post'`. Status code stays `204`.

### `yehub-be/src/posts/posts.service.spec.ts`

Update the existing `remove()` tests:
- Replace assertion on `prisma.post.update` with `prisma.post.delete`.
- Keep the "rejects when campaign is COMPLETED" test (it asserts the
  `BadRequestException`, not the underlying call).
- Keep the 404-when-missing test.

## Frontend changes

### 1. `yehub-fe/src/api/posts.ts`

Add `deletePost(id: string): Promise<void>` calling `DELETE /posts/:id`.

### 2. `yehub-fe/src/hooks/use-can.ts`

Add `'delete_post'` to the `ProjectAction` union and to `projectPermissions` with
value `['MANAGER']`.

### 3. `yehub-fe/src/pages/posts/PostDetailPage/use-post-detail.ts`

Extend the existing hook with a `deletePost` mutation that:
- Calls `deletePost(postId)`.
- On success: invalidates `['campaign-posts', campaignId]` and `['posts']`,
  shows a success toast, navigates to the campaign posts route.
- On error: surfaces the API error message in a destructive toast.

### 4. `yehub-fe/src/pages/posts/PostDetailPage/index.tsx`

Replace the placeholder "More" `<Button>` with a shadcn `<DropdownMenu>` whose
trigger is the same `MoreHorizontal` icon button. The menu contains a single
"Delete post" item, gated as follows:

- Visibility: render only if `isAdmin || canDeletePost` (where
  `canDeletePost = useCanProject('delete_post', myRole)` for the post's project).
- Disabled state: when `post.campaign.status === 'COMPLETED'`, the item is
  rendered but disabled with a tooltip "Cannot delete posts in a completed campaign".
- On click: opens an `AlertDialog` ("Delete post? This permanently removes the
  post and all its comments and metrics. This cannot be undone."). Confirm calls
  the mutation; cancel closes the dialog.

If neither `isAdmin` nor `canDeletePost` is true and there are no other items in
the menu, the trigger button is hidden entirely.

### 5. Campaign-detail posts list

The campaign posts list is rendered by `CampaignDetailPage/components/CampaignPostsTab.tsx`,
which uses the shared `src/components/common/PostsTable.tsx`. `PostsTable`
already has one optional render slot, `renderTrailing`, used here for the
per-row KPI cell — so we cannot reuse it for actions.

**`PostsTable` change:** Add a second optional render slot
`renderActions?: (post: T) => React.ReactNode` plus `actionsHeader?: string`,
appended as a final column after the trailing one when supplied. This change is
opt-in; the global posts page (`pages/posts/PostsPage.tsx`) does not pass it
and therefore renders no actions column. (Confirmed out-of-scope for this
feature.)

**`CampaignPostsTab` change:** Compute `canDeletePost` (admin OR project
MANAGER for the campaign's project) and pass `renderActions={(post) =>
<PostRowActions post={post} canDelete={canDeletePost} campaignStatus={campaign.status} />}`
plus `actionsHeader=""` to `PostsTable`.

**New file `CampaignDetailPage/components/PostRowActions.tsx`:** owns its own
dialog open state and `useDeletePost` mutation. Follows the
`CampaignActionsCell` pattern from `pages/campaigns/components/CampaignActionsCell.tsx`:
- `MoreVertical` icon button trigger inside a `DropdownMenu`.
- All click handlers `e.stopPropagation()` so clicks don't trigger the row's
  navigation handler.
- Single menu item "Delete post" with destructive styling, gated on
  `canDelete`. Disabled with tooltip when `campaignStatus === 'COMPLETED'`.
- `AlertDialog` confirmation matches the detail-page version.
- Mutation invalidates `['campaign-posts', campaignId]`; no navigation.

## Acceptance

- Backend `pnpm test` passes (215 → still 215, with `remove()` tests updated).
- Backend `pnpm lint` passes.
- Frontend `pnpm lint` and `pnpm build` pass.
- As an ADMIN: dropdown shows Delete on detail page and per row; confirming
  removes the post and its comments from the database.
- As a project MANAGER on the post's project: same as ADMIN.
- As a project EXECUTIVE/ANALYST: dropdown does not show Delete (or trigger is
  hidden if no other items exist).
- For a post whose campaign is COMPLETED: Delete item is visible to permitted
  roles but disabled with the explanatory tooltip; backend still rejects with
  400 if called directly.
- After deletion from the detail page: user is redirected to the campaign posts
  list, success toast shown.
- After deletion from a list row: row disappears, success toast shown, no
  navigation.
- Comments and profile-post links for the deleted post no longer exist in the
  database.

## Non-goals

- Undo / trash / restore — hard delete is final.
- Removing `Post.deleted_at` from the schema and the many filters that read it.
- Bulk delete.
- Audit log entry for the deletion.
