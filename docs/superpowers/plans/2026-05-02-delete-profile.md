# Delete Profile Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow ADMIN and INTERNAL_USER to hard-delete a profile from the profile detail page, blocked when any social accounts are linked.

**Architecture:** Backend adds a precondition to `ProfilesService.remove` (404 if missing, 409 if any social accounts) and loosens the role gate on `DELETE /profiles/:id` from ADMIN-only to ADMIN + INTERNAL_USER. Frontend adds a `delete_profile` permission, a delete mutation, and a "More" dropdown next to the existing Edit button on `ProfileDetailPage` with an AlertDialog confirmation. Cascade behavior on `ProfileTier`, `ProfileCategory`, and `ProfilePost` is unchanged (Prisma `onDelete: Cascade`).

**Tech Stack:** NestJS 11, Prisma 7, PostgreSQL 17, Jest (backend); React 19, TanStack Query v5, shadcn/ui, Sonner toasts, React Router v7 (frontend).

---

## File Structure

| File | Change | Responsibility |
|---|---|---|
| `yehub-be/src/profiles/profiles.service.ts` | Modify `remove()` (lines 315-327) | Apply precondition: 404 if missing, 409 if accounts linked, otherwise hard delete |
| `yehub-be/src/profiles/profiles.service.spec.ts` | Add `describe('remove')` block | Cover the three behaviors above |
| `yehub-be/src/profiles/profiles.controller.ts` | Modify `remove` handler (lines 71-78) | Allow `ADMIN + INTERNAL_USER`; update Swagger summary |
| `yehub-fe/src/hooks/use-can.ts` | Add `'delete_profile'` action | Centralize FE permission |
| `yehub-fe/src/pages/profiles/ProfileDetailPage/use-profile-detail.ts` | Export new `useDeleteProfile` hook | Encapsulate delete mutation, navigation, and toast |
| `yehub-fe/src/pages/profiles/ProfileDetailPage/index.tsx` | Add DropdownMenu + AlertDialog + Tooltip | UI entry point and confirmation flow |

`profilesApi.delete` already exists in `yehub-fe/src/api/profiles.ts:132` — no API-layer change needed.

---

## Task 1: Backend — `remove()` precondition (TDD)

**Files:**
- Modify: `yehub-be/src/profiles/profiles.service.ts:315-327`
- Modify: `yehub-be/src/profiles/profiles.service.spec.ts` (add `describe('remove')` near the end of the outer `describe('ProfilesService')` block)

- [ ] **Step 1: Add the failing tests**

Open `yehub-be/src/profiles/profiles.service.spec.ts`. Update the imports at the top of the file to include `NotFoundException` (the file currently only imports `BadRequestException, ConflictException`):

```ts
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
```

Then append the following `describe` block as the **last** child of the outer `describe('ProfilesService', ...)` block (right before its final closing `});`):

```ts
describe('remove', () => {
  it('throws NotFoundException when the profile does not exist', async () => {
    mockPrisma.profile.findUnique.mockResolvedValue(null);

    await expect(service.remove('missing')).rejects.toBeInstanceOf(NotFoundException);
    expect(mockPrisma.profile.delete).not.toHaveBeenCalled();
  });

  it('throws ConflictException when the profile has linked social accounts', async () => {
    mockPrisma.profile.findUnique.mockResolvedValue({
      id: 'profile-1',
      _count: { socialAccounts: 2 },
    });

    await expect(service.remove('profile-1')).rejects.toBeInstanceOf(ConflictException);
    expect(mockPrisma.profile.delete).not.toHaveBeenCalled();
  });

  it('hard-deletes the profile when it exists and has zero social accounts', async () => {
    mockPrisma.profile.findUnique.mockResolvedValue({
      id: 'profile-1',
      _count: { socialAccounts: 0 },
    });
    mockPrisma.profile.delete.mockResolvedValue({ id: 'profile-1' });

    await service.remove('profile-1');

    expect(mockPrisma.profile.delete).toHaveBeenCalledWith({
      where: { id: 'profile-1' },
    });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd yehub-be && pnpm test -- profiles.service.spec`
Expected:
- "throws NotFoundException when the profile does not exist" — FAILS (current `remove` calls `prisma.profile.delete` directly without a `findUnique`, so `mockPrisma.profile.delete` is invoked).
- "throws ConflictException when the profile has linked social accounts" — FAILS for the same reason.
- "hard-deletes the profile when it exists and has zero social accounts" — likely PASSES already because the existing implementation also calls `prisma.profile.delete`. That's fine; we keep it as a regression test.

- [ ] **Step 3: Update `remove()` to satisfy the new contract**

Replace the current `remove` method in `yehub-be/src/profiles/profiles.service.ts` (currently lines 315-327) with:

```ts
async remove(id: string) {
  const profile = await this.prisma.profile.findUnique({
    where: { id },
    select: {
      id: true,
      _count: { select: { socialAccounts: true } },
    },
  });

  if (!profile) {
    throw new NotFoundException('Profile not found');
  }

  if (profile._count.socialAccounts > 0) {
    throw new ConflictException(
      'Cannot delete a profile with linked social accounts. Unlink them first.',
    );
  }

  await this.prisma.profile.delete({ where: { id } });
}
```

Verify the imports at the top of `profiles.service.ts` already include `NotFoundException` and `ConflictException` (they do — search for `from '@nestjs/common'` near the top). The previous `try/catch` for `Prisma.PrismaClientKnownRequestError` is no longer needed because the explicit `findUnique` makes "missing" an unambiguous case.

- [ ] **Step 4: Run the tests and verify they all pass**

Run: `cd yehub-be && pnpm test -- profiles.service.spec`
Expected: all three new `remove` cases pass. The full file should pass with no regressions.

- [ ] **Step 5: Run the full backend suite**

Run: `cd yehub-be && pnpm test`
Expected: 222 tests passing (was 219 + 3 new). 0 failures.

- [ ] **Step 6: Commit**

```bash
git add yehub-be/src/profiles/profiles.service.ts yehub-be/src/profiles/profiles.service.spec.ts
git commit -m "feat(be): block profile delete when social accounts linked"
```

---

## Task 2: Backend — Allow INTERNAL_USER + Swagger summary

**Files:**
- Modify: `yehub-be/src/profiles/profiles.controller.ts:71-78`

- [ ] **Step 1: Update the handler decorators**

Replace the current `remove` handler block (lines 71-78) with:

```ts
@Delete(':id')
@UseGuards(GlobalRolesGuard)
@GlobalRoles(GlobalRole.ADMIN, GlobalRole.INTERNAL_USER)
@HttpCode(HttpStatus.NO_CONTENT)
@ApiOperation({ summary: 'Delete a profile' })
remove(@Param('id', ParseUUIDPipe) id: string) {
  return this.profilesService.remove(id);
}
```

The only edits compared to the existing block are:
- `@GlobalRoles(GlobalRole.ADMIN)` → `@GlobalRoles(GlobalRole.ADMIN, GlobalRole.INTERNAL_USER)`
- `summary: 'Delete a profile (admin only)'` → `summary: 'Delete a profile'`

- [ ] **Step 2: Verify lint passes**

Run: `cd yehub-be && pnpm lint`
Expected: 0 errors. Pre-existing warnings (in `campaigns.service.spec.ts`, `projects.service.spec.ts`) are unrelated to this change.

- [ ] **Step 3: Verify tests still pass**

Run: `cd yehub-be && pnpm test`
Expected: 222 tests passing, 0 failures (controller change has no test impact).

- [ ] **Step 4: Commit**

```bash
git add yehub-be/src/profiles/profiles.controller.ts
git commit -m "feat(be): allow INTERNAL_USER to delete profiles"
```

---

## Task 3: Frontend — Add `delete_profile` permission

**Files:**
- Modify: `yehub-fe/src/hooks/use-can.ts`

- [ ] **Step 1: Add the action to the union and the map**

In `yehub-fe/src/hooks/use-can.ts`:

1. Update the `GlobalAction` type (currently line 16):

```ts
type GlobalAction = 'create_project' | 'manage_users' | 'delete_profile'
```

2. Update the `globalPermissions` map (currently lines 31-34):

```ts
const globalPermissions: Record<GlobalAction, GlobalRole[]> = {
  create_project: ['ADMIN', 'INTERNAL_USER'],
  manage_users: ['ADMIN'],
  delete_profile: ['ADMIN', 'INTERNAL_USER'],
}
```

- [ ] **Step 2: Verify lint passes**

Run: `cd yehub-fe && pnpm lint`
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add yehub-fe/src/hooks/use-can.ts
git commit -m "feat(fe): add delete_profile permission"
```

---

## Task 4: Frontend — `useDeleteProfile` mutation hook

**Files:**
- Modify: `yehub-fe/src/pages/profiles/ProfileDetailPage/use-profile-detail.ts`

- [ ] **Step 1: Add the new exported hook**

Replace the entire contents of `yehub-fe/src/pages/profiles/ProfileDetailPage/use-profile-detail.ts` with:

```ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { queryKeys } from '@/lib/constants/query-keys'
import { profilesApi } from '@/api/profiles'
import { kolCategoriesApi } from '@/api/kol-categories'
import { kolTiersApi } from '@/api/kol-tiers'
import { showApiError } from '@/lib/errors'

export function useProfileDetail() {
  const { id: routeId } = useParams<{ id: string }>()
  const id = routeId ?? ''
  const queryClient = useQueryClient()

  const profileQuery = useQuery({
    queryKey: queryKeys.profile(id),
    queryFn: () => profilesApi.get(id),
    enabled: !!id,
  })

  const categoriesQuery = useQuery({
    queryKey: queryKeys.kolCategories,
    queryFn: kolCategoriesApi.list,
  })

  const tiersQuery = useQuery({
    queryKey: queryKeys.kolTiers,
    queryFn: kolTiersApi.list,
  })

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.profile(id) })
    queryClient.invalidateQueries({ queryKey: queryKeys.profiles.all })
  }

  return {
    id,
    profile: profileQuery.data,
    isLoading: profileQuery.isLoading,
    categories: categoriesQuery.data ?? [],
    tiers: tiersQuery.data ?? [],
    invalidate,
  }
}

export function useDeleteProfile(profileId: string) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: () => profilesApi.delete(profileId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.profiles.all })
      queryClient.removeQueries({ queryKey: queryKeys.profile(profileId) })
      toast.success('Profile deleted')
      navigate('/profiles')
    },
    onError: (error) => showApiError(error, { fallback: 'Failed to delete profile' }),
  })
}
```

The only meaningful additions vs. the original file are: extra imports (`useMutation`, `useNavigate`, `toast`, `showApiError`), and the new `useDeleteProfile` hook at the bottom. The existing `useProfileDetail` hook is unchanged.

- [ ] **Step 2: Verify lint passes**

Run: `cd yehub-fe && pnpm lint`
Expected: 0 errors.

- [ ] **Step 3: Verify build passes (catches typing issues)**

Run: `cd yehub-fe && pnpm build`
Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
git add yehub-fe/src/pages/profiles/ProfileDetailPage/use-profile-detail.ts
git commit -m "feat(fe): add useDeleteProfile mutation"
```

---

## Task 5: Frontend — Delete UI on ProfileDetailPage

**Files:**
- Modify: `yehub-fe/src/pages/profiles/ProfileDetailPage/index.tsx`

This task wires up the dropdown trigger, the disabled-with-tooltip state when accounts exist, and the AlertDialog confirmation.

- [ ] **Step 1: Update imports**

In `yehub-fe/src/pages/profiles/ProfileDetailPage/index.tsx`, replace the existing imports block (lines 1-22) with:

```tsx
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ArrowLeft, MoreHorizontal, Plus, Pencil, Mail, Phone, Trash2 } from 'lucide-react'
import { PageWrapper } from '@/components/common/PageWrapper'
import { MetricCard } from '@/components/common/MetricCard'
import { PostsTable } from '@/components/common/PostsTable'
import { PresignedAvatar } from '@/components/common/PresignedAvatar'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { COLOR_PRESETS, type ColorKey } from '@/lib/constants/colors'
import { formatNumber, formatDate } from '@/lib/format'
import { showApiError } from '@/lib/errors'
import { profilesApi, type LinkAccountPayload, type UpdateProfilePayload } from '@/api/profiles'
import { useCanGlobal } from '@/hooks/use-can'
import { useAuthStore } from '@/store/auth.store'
import { useDeleteProfile, useProfileDetail } from './use-profile-detail'
import { SocialAccountRow } from './components/SocialAccountRow'
import { EditProfileDialog } from './components/EditProfileDialog'
import { LinkAccountDialog } from './components/LinkAccountDialog'
import { LinkPostDialog } from './components/LinkPostDialog'
import { UnlinkPostButton } from './components/UnlinkPostButton'
```

- [ ] **Step 2: Add permission, state, and mutation wiring inside the component**

Inside `ProfileDetailPage`, just below the existing `const [linkPostOpen, setLinkPostOpen] = useState(false)` line (currently line 30), add:

```tsx
const [deleteOpen, setDeleteOpen] = useState(false)
const user = useAuthStore((s) => s.user)
const canDelete = useCanGlobal('delete_profile', user?.role ?? null)
const deleteMutation = useDeleteProfile(id)
```

This sits alongside the existing `updateMutation`, `linkAccountMutation`, `linkPostMutation`. Keep those untouched.

- [ ] **Step 3: Replace the inline Edit button with an Edit + DropdownMenu cluster**

Find the existing Edit button (currently lines 166-169):

```tsx
<Button variant="outline" size="sm" onClick={() => setEditOpen(true)} className="shrink-0 cursor-pointer">
  <Pencil className="mr-1 h-3 w-3" />
  Edit
</Button>
```

Replace it with the following cluster:

```tsx
<div className="flex shrink-0 items-center gap-2">
  <Button variant="outline" size="sm" onClick={() => setEditOpen(true)} className="cursor-pointer">
    <Pencil className="mr-1 h-3 w-3" />
    Edit
  </Button>
  {canDelete && (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="icon" aria-label="More actions" className="cursor-pointer">
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {profile.accounts.length > 0 ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <div>
                <DropdownMenuItem
                  disabled
                  variant="destructive"
                  onSelect={(e) => e.preventDefault()}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete profile
                </DropdownMenuItem>
              </div>
            </TooltipTrigger>
            <TooltipContent side="left">
              Cannot delete a profile with linked social accounts. Unlink them first.
            </TooltipContent>
          </Tooltip>
        ) : (
          <DropdownMenuItem
            variant="destructive"
            onSelect={(e) => {
              e.preventDefault()
              setDeleteOpen(true)
            }}
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Delete profile
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )}
</div>
```

Notes:
- The `<div>` wrapper inside `<TooltipTrigger asChild>` is required because disabled buttons/items don't fire pointer events; the wrapper picks them up so the tooltip still appears on hover.
- `onSelect={(e) => e.preventDefault()}` prevents the dropdown from closing the focus on the trigger before the AlertDialog opens, which would cause focus to land on the wrong element.
- `variant="destructive"` on `DropdownMenuItem` is supported by the shadcn primitive (verified in `src/components/ui/dropdown-menu.tsx:75-87`).

- [ ] **Step 4: Add the AlertDialog at the bottom of the JSX (alongside the other page-level dialogs)**

Find the existing `</PageWrapper>` closing tag at the bottom (currently line 270). Just before it, after the `<LinkPostDialog ... />` JSX (currently lines 264-269), insert:

```tsx
<AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
  <AlertDialogContent>
    <AlertDialogHeader>
      <AlertDialogTitle>Delete profile?</AlertDialogTitle>
      <AlertDialogDescription>
        This permanently removes the profile and all its tier, category, and post links. This cannot be undone.
      </AlertDialogDescription>
    </AlertDialogHeader>
    <AlertDialogFooter>
      <AlertDialogCancel disabled={deleteMutation.isPending}>Cancel</AlertDialogCancel>
      <AlertDialogAction
        disabled={deleteMutation.isPending}
        onClick={(e) => {
          e.preventDefault()
          deleteMutation.mutate()
        }}
        className="bg-destructive text-white hover:bg-destructive/90"
      >
        {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
      </AlertDialogAction>
    </AlertDialogFooter>
  </AlertDialogContent>
</AlertDialog>
```

`e.preventDefault()` keeps the dialog open until the mutation resolves; `useDeleteProfile.onSuccess` then navigates away (so the dialog unmounts naturally), and `onError` keeps it open with the toast surfaced.

- [ ] **Step 5: Run the dev server and smoke-test the flow manually**

Run: `cd yehub-fe && pnpm dev`

Then in a browser:
1. Log in as ADMIN. Open a profile that has **at least one social account**. Confirm the "..." button appears next to Edit, the Delete item is rendered but visibly disabled, and hovering it shows the tooltip "Cannot delete a profile with linked social accounts...".
2. On the same profile, unlink all accounts (existing UI). Reopen the menu; the Delete item is now enabled. Click it → the AlertDialog opens. Click Cancel → the dialog closes, profile is unchanged.
3. Open the menu again, click Delete → Confirm. The page navigates to `/profiles`, a "Profile deleted" toast appears, and the profile is gone from the list.
4. Log in as a non-ADMIN, non-INTERNAL_USER (regular project user). The "..." dropdown does not render at all.

Stop the dev server when done.

- [ ] **Step 6: Verify lint and build**

Run: `cd yehub-fe && pnpm lint && pnpm build`
Expected: lint clean, build succeeds.

- [ ] **Step 7: Commit**

```bash
git add yehub-fe/src/pages/profiles/ProfileDetailPage/index.tsx
git commit -m "feat(fe): delete profile from detail page"
```

---

## Task 6: Final verification

- [ ] **Step 1: Run all backend checks**

Run: `cd yehub-be && pnpm lint && pnpm test`
Expected: lint clean (apart from the same pre-existing warnings unrelated to this branch), 222 tests passing.

- [ ] **Step 2: Run all frontend checks**

Run: `cd yehub-fe && pnpm lint && pnpm build`
Expected: lint clean, build succeeds.

- [ ] **Step 3: Confirm acceptance criteria from the spec**

Walk through each acceptance bullet from `docs/superpowers/specs/2026-05-02-delete-profile-design.md` and confirm coverage by code or tests:
- ADMIN/INTERNAL_USER + 0 accounts → delete works → covered by Task 1 test #3 + Task 5 step 5 #3.
- ADMIN/INTERNAL_USER + ≥1 account → disabled with tooltip + 409 backend → covered by Task 1 test #2 + Task 5 step 5 #1.
- Other roles → trigger hidden → covered by Task 5 step 5 #4.
- Cascade tier/category/post → unchanged Prisma schema, still hard-deletes via `prisma.profile.delete`.
- 404 on missing → covered by Task 1 test #1.

- [ ] **Step 4: No commit needed** (verification step only).

---

## Self-review notes

Reviewed against the spec — all sections covered:

- Permissions section → Tasks 2, 3.
- Backend `remove()` precondition → Task 1.
- Backend controller role/summary update → Task 2.
- Backend tests → Task 1 (all three cases).
- FE API call (`profilesApi.delete`) → already exists; noted in File Structure.
- FE `useCanGlobal` action → Task 3.
- FE delete mutation → Task 4.
- FE Detail Page UI (dropdown + disabled tooltip + AlertDialog) → Task 5.
- Acceptance criteria → Task 6.

No placeholders, no "fill in details", every step has the actual code. Type names match across tasks (`useDeleteProfile` exported in Task 4, imported in Task 5; `delete_profile` action defined in Task 3, consumed in Task 5).
