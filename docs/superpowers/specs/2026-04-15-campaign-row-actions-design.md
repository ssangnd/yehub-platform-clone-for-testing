# Campaign Row Actions — Design

**Date:** 2026-04-15
**Branch:** `feature/campaign-row-actions`

## Goal

Add a per-row "..." dropdown to the campaign list on the Project Detail page with actions:
**View / Edit / Launch / Duplicate / Delete** — where only DRAFT campaigns can be deleted.

## Scope

- **In scope:** `ProjectCampaignsTab` rendering via `CampaignsTable`.
- **Out of scope:** The global `CampaignsListPage` — actions column is *not* rendered there. It uses the same `CampaignsTable`, so the actions column is gated behind a per-row permissions prop passed only from the project tab.
- **Out of scope:** Backend changes. Duplicate is FE-only prefill.

## Action Matrix

| Action | Visible when | Behavior |
|---|---|---|
| View | always | navigate to `/projects/:projectId/campaigns/:id` |
| Edit | `canEditCampaign` | navigate to `/projects/:projectId/campaigns/:id/edit` |
| Launch | `canEditCampaign` AND `status === 'DRAFT'` | AlertDialog confirm, then `updateCampaign({ status: 'ACTIVE' })` |
| Duplicate | `canCreateCampaign` | navigate to `/projects/:projectId/campaigns/new?from=:id` |
| Delete | `canDeleteCampaign` AND `status === 'DRAFT'` | AlertDialog confirm, then `deleteCampaign(id)` |

## Permissions

- Add `delete_campaign: ['MANAGER']` to `yehub-fe/src/hooks/use-can.ts` (mirrors backend `@Roles(MANAGER)` on `DELETE /campaigns/:id`).
- Reuse existing: `edit_campaign` (MANAGER, EXECUTIVE) for Edit + Launch, `create_campaign` (MANAGER, EXECUTIVE) for Duplicate.
- `isAdmin` overrides all, matching the existing pattern.
- Permissions are computed once in `ProjectCampaignsTab` from `myRole` + admin status and passed as booleans to `CampaignsTable`.

## Changes

### 1. `yehub-fe/src/hooks/use-can.ts`
Add `'delete_campaign'` to `ProjectAction` union and to `projectPermissions` map.

### 2. `yehub-fe/src/pages/campaigns/components/CampaignActionsCell.tsx` (new)
Contains dropdown trigger (`MoreVertical` button), menu items gated by props, the two `AlertDialog`s (launch & delete), and the mutations.

Props:
```ts
{
  campaign: Campaign
  projectId: string
  canEdit: boolean
  canDelete: boolean
  canCreate: boolean
}
```

Follows the `ActionsCell` pattern in `ProjectsListPage/index.tsx` — stopPropagation on row clicks, cursor-pointer, destructive variant for Delete.

### 3. `yehub-fe/src/pages/campaigns/components/CampaignsTable.tsx`
Accept new props: `canEditCampaign?`, `canDeleteCampaign?`, `canCreateCampaign?`. When `projectId` is set AND any of the three is true, render an actions column whose cell is `<CampaignActionsCell />`. Column width `w-[50px]`, header empty.

### 4. `yehub-fe/src/pages/projects/ProjectDetailPage/components/ProjectCampaignsTab.tsx`
Compute `canEditCampaign`, `canDeleteCampaign`, `canCreateCampaign` from `useCan` + admin and pass to `CampaignsTable`. The existing `canCreate` variable stays; we just rename the passed prop.

### 5. `yehub-fe/src/pages/campaigns/CampaignFormPage/index.tsx`
Read `?from=<id>` via `useSearchParams`. When present and not in edit mode, fetch that campaign with `getCampaign` and prefill form values. Name becomes `"{name} (copy)"`. Submit still creates new (unchanged `isEdit` logic).

## Non-goals

- No duplicate backend endpoint. (FE-only prefill is sufficient — user selected this.)
- No global `CampaignsListPage` action menu. (User confirmed not needed.)
- No change to the campaign detail page's existing Edit/Activate/Pause/Complete buttons.

## Acceptance

- Project detail → Campaigns tab: each row has a `⋮` button opening the menu.
- Row click still navigates to detail (dropdown clicks stopPropagate).
- Delete option only visible for DRAFT campaigns; Launch only visible for DRAFT.
- Delete & Launch both show confirmation dialogs.
- Duplicate opens the new-campaign form with fields prefilled and `(copy)` appended to the name.
- `ProjectsListPage` and global `CampaignsListPage` unchanged in behavior.
- `pnpm lint` and `pnpm build` pass in `yehub-fe/`.
