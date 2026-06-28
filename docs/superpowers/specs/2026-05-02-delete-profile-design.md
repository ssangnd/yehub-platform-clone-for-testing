# Delete Profile — Design

**Date:** 2026-05-02
**Branch:** `feature/delete-profile`

## Goal

Allow ADMINs and INTERNAL_USERs to permanently delete a profile from the profile
detail page. Deletion is blocked when the profile has any linked social
accounts; otherwise it is a hard delete that cascades to the profile's tier,
category, and post links.

## Scope

- **In scope (backend):** Add precondition to `ProfilesService.remove` that
  rejects with `409 Conflict` when the profile has at least one linked social
  account. Loosen the controller role gate from `ADMIN` to
  `ADMIN + INTERNAL_USER`. Update the Swagger summary. Add unit tests.
- **In scope (frontend):** `deleteProfile` API call, `useDeleteProfile`
  mutation, "More" dropdown + confirmation `AlertDialog` on `ProfileDetailPage`.
- **Out of scope:** Removing from profiles list rows, bulk delete, soft-delete,
  audit log entry, undo/restore.

## Permissions

| Role | Can delete |
|---|---|
| `GlobalRole.ADMIN` | Yes |
| `GlobalRole.INTERNAL_USER` | Yes |
| Others | No |

The frontend mirrors this with a new `delete_profile` action in `useCanGlobal`.

## Backend changes

### `yehub-be/src/profiles/profiles.service.ts` — `remove()`

Replace the current body with:

1. Look up the profile via `prisma.profile.findUnique({ where: { id }, select: { id: true, _count: { select: { socialAccounts: true } } } })`.
2. If not found → `NotFoundException('Profile not found')`.
3. If `_count.socialAccounts > 0` → `ConflictException('Cannot delete a profile with linked social accounts. Unlink them first.')`.
4. Otherwise call `prisma.profile.delete({ where: { id } })`.

Cascading is automatic via Prisma schema for the still-allowed relations:
- `ProfileTier.profile_id` has `onDelete: Cascade` → tier link removed.
- `ProfileCategory.profile_id` has `onDelete: Cascade` → category links removed.
- `ProfilePost.profile_id` has `onDelete: Cascade` → post links removed.

The `SocialAccount` cascade no longer matters because the precondition
guarantees the count is zero.

### `yehub-be/src/profiles/profiles.controller.ts`

- Change `@GlobalRoles(GlobalRole.ADMIN)` on the `DELETE /profiles/:id` handler
  to `@GlobalRoles(GlobalRole.ADMIN, GlobalRole.INTERNAL_USER)`.
- Update `@ApiOperation({ summary })` from `'Delete a profile (admin only)'`
  to `'Delete a profile'`. Status code stays `204`.

### `yehub-be/src/profiles/profiles.service.spec.ts`

Add a `describe('remove')` block with three cases:

- Throws `NotFoundException` when `findUnique` returns `null`.
- Throws `ConflictException` when `_count.socialAccounts > 0`; does not call
  `prisma.profile.delete`.
- Calls `prisma.profile.delete({ where: { id } })` when the profile exists with
  zero social accounts.

## Frontend changes

### 1. `yehub-fe/src/api/profiles.ts`

Add `deleteProfile(id: string): Promise<void>` calling `DELETE /profiles/:id`.

### 2. `yehub-fe/src/hooks/use-can.ts`

Add `'delete_profile'` to the `GlobalAction` union and to `globalPermissions`
with value `['ADMIN', 'INTERNAL_USER']`.

### 3. `yehub-fe/src/pages/profiles/ProfileDetailPage/use-profile-detail.ts`

Extend the existing hook with a `useDeleteProfile` mutation that:
- Calls `deleteProfile(profileId)`.
- On success: invalidates `['profiles']` and `['profile', profileId]`,
  shows a success toast, navigates to `/profiles`.
- On error: surfaces the API error message in a destructive toast (covers the
  `409` "linked accounts" case for users who hit the endpoint despite the
  disabled UI state).

### 4. `yehub-fe/src/pages/profiles/ProfileDetailPage/index.tsx`

The page header currently shows an inline "Edit" button and other inline
action buttons. Add a shadcn `<DropdownMenu>` next to the existing "Edit"
button whose trigger is a `MoreHorizontal` icon button, containing a single
"Delete profile" item with destructive styling, gated as follows:

- **Trigger visibility:** render the dropdown trigger only if
  `useCanGlobal('delete_profile', myGlobalRole)` is true. Otherwise the
  dropdown does not appear at all.
- **Item disabled state:** when `profile.socialAccounts.length > 0`, the
  "Delete profile" item is rendered but disabled with a tooltip "Cannot delete
  a profile with linked social accounts. Unlink them first."
- **On click:** opens an `AlertDialog` ("Delete profile? This permanently
  removes the profile and all its tier, category, and post links. This cannot
  be undone."). Confirm calls the mutation; cancel closes the dialog.

## Acceptance

- Backend `pnpm test` passes (219 → 222, with three new `remove()` tests).
- Backend `pnpm lint` passes.
- Frontend `pnpm lint` and `pnpm build` pass.
- As ADMIN or INTERNAL_USER on a profile with **0 social accounts**: dropdown
  shows Delete; confirming removes the profile and its tier, category, and
  post links from the database.
- As ADMIN or INTERNAL_USER on a profile with **≥1 social account**: Delete
  item is visible but disabled with the explanatory tooltip; backend still
  rejects with `409` if the endpoint is called directly.
- As any other role: Delete item is not rendered (trigger hidden if dropdown
  ends up empty).
- After deletion: user is redirected to `/profiles`, success toast shown.
- Tier, category, and post links for the deleted profile no longer exist in
  the database.

## Non-goals

- Profile list-row delete action.
- Bulk delete.
- Soft-delete / undo / restore.
- Audit log entry for the deletion.
- Removing the cascade on `SocialAccount` itself (it stays in the schema as a
  defense-in-depth measure even though the precondition makes it unreachable).
