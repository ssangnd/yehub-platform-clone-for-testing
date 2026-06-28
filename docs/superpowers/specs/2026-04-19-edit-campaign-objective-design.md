# Edit Campaign Objective — Design

## Summary

Allow admins to rename a global `Objective` record. Today admins can create and delete objectives from `Admin › Settings › Campaign Objectives`, but there is no rename. Because `Objective` is a shared lookup table joined to campaigns via `CampaignObjective`, renaming propagates to every linked campaign automatically through Prisma — only the display name changes.

Scope is limited to the rename capability. The campaign↔objective association is already editable in the existing `CampaignFormPage`.

## Non-goals

- Editing a campaign's set of objectives from the Campaign Detail page (use existing Edit Campaign form).
- Changes to `ProjectCategoriesTab`, which shares the same `TagListPanel` component.
- New e2e tests.

## Backend (`yehub-be/`)

### Route
- `PATCH /objectives/:id` — admin-only, guarded by `JwtAuthGuard` + `GlobalRolesGuard` with `@GlobalRoles(GlobalRole.ADMIN)` (mirrors existing create/delete).
- Path param `id` validated with `ParseUUIDPipe`.
- Request body: `UpdateObjectiveDto { name: string }` — `@IsString`, `@MinLength(1)`, `@MaxLength(100)` (identical constraints to `CreateObjectiveDto`).
- Response body: the updated objective (`{ id, name, created_at }`).

### Service
`ObjectivesService.rename(id: string, name: string)`:
- Calls `prisma.objective.update({ where: { id }, data: { name } })`.
- Maps Prisma errors:
  - `P2025` → `NotFoundException('Objective not found')`
  - `P2002` → `ConflictException('An objective with that name already exists')`
- All other errors re-thrown.

### Tests (`objectives.service.spec.ts`)
Add cases:
1. Rename happy path — returns updated record and calls `update` with `{ where: { id }, data: { name } }`.
2. `P2002` → `ConflictException`.
3. `P2025` → `NotFoundException`.

## Frontend (`yehub-fe/`)

### API client (`src/api/objectives.ts`)
Add:
```ts
update: (id: string, name: string): Promise<Objective> =>
  apiClient.patch<Objective>(`/objectives/${id}`, { name }).then((r) => r.data),
```

### Shared `TagListPanel` (`src/pages/admin/SettingsPage/components/TagListPanel.tsx`)
Extend the component with optional edit props so the same component keeps working for `ProjectCategoriesTab`:
- `onEdit?: (id: string, name: string) => void`
- `isEditing?: boolean`

Behavior:
- When `onEdit` is provided, render a pencil icon button next to the existing trash button on each row. Clicking it opens an `EditTagDialog`.
- When `onEdit` is omitted, the row renders exactly as today (no pencil button, no dialog). `ProjectCategoriesTab` passes nothing → unchanged.

### New `EditTagDialog` (`src/pages/admin/SettingsPage/components/EditTagDialog.tsx`)
Mirrors `AddTagDialog` (plain `useState` controlled input, no RHF/Zod):
- Props: `open`, `onOpenChange`, `entityLabel`, `isSubmitting`, `currentName`, `onSubmit(name)`.
- Initial input value = `currentName`; resets to `currentName` whenever `currentName` changes and whenever the dialog reopens.
- Validation (matches Add dialog): trimmed length > 0 and ≤ 100; `<Input maxLength={100}>`.
- Save button disabled when invalid, when `trimmed === currentName.trim()` (no-op), or while `isSubmitting`.
- Button label: `isSubmitting ? 'Saving…' : 'Save'`.

### Objectives admin hook (`src/pages/admin/SettingsPage/use-objectives-tab.ts`)
Add `updateMutation`:
- `mutationFn: ({ id, name }) => objectivesApi.update(id, name)`
- `onSuccess`: invalidate `queryKeys.objectives`, plus `queryKeys.campaigns.all` and `['campaign']` (same set the existing `deleteMutation` invalidates, because campaign payloads embed objective names).
- `onError`: axios-aware toast (same pattern as `createMutation`).

### `CampaignObjectivesTab` (`src/pages/admin/SettingsPage/components/CampaignObjectivesTab.tsx`)
Wire the new props:
```tsx
<TagListPanel
  ...existing props
  onEdit={(id, name) => updateMutation.mutate({ id, name })}
  isEditing={updateMutation.isPending}
/>
```

## Data flow (rename)

1. Admin clicks pencil on an objective row → `EditTagDialog` opens with current name.
2. Admin edits the name and submits → `updateMutation.mutate({ id, name })`.
3. Frontend sends `PATCH /objectives/:id` → backend updates the row.
4. On success: dialog closes, toast "Objective updated", React Query invalidates objectives + campaign caches. All visible campaign lists/detail pages pick up the new name on their next fetch.

## Error handling

| Case | Where caught | User feedback |
|------|--------------|---------------|
| Empty / whitespace-only name | Client (disabled Save button) | Save disabled |
| Name > 100 chars | Server (`class-validator` 400) | Toast with server message |
| Duplicate name | Server (`P2002` → 409) | Toast: "An objective with that name already exists" |
| Objective deleted concurrently | Server (`P2025` → 404) | Toast + query invalidation removes the row on next fetch |
| Non-admin caller | `GlobalRolesGuard` 403 | Toast with server message (shouldn't reach the UI — the tab is admin-only) |

## Testing

- **Backend unit:** three new cases in `objectives.service.spec.ts` covering rename happy path, duplicate, not-found.
- **Frontend unit/integration:** none added (the repo has no existing FE unit tests for this tab; keep scope tight).
- **E2E:** none (per standing preference).

Manual verification:
1. Start all services, log in as admin.
2. Go to `Admin › Settings › Campaign Objectives`. Confirm pencil icons appear; trash still works.
3. Click pencil, rename an objective, submit. Confirm toast + updated row.
4. Try renaming to an existing name → 409 toast.
5. Navigate to a campaign linked to the renamed objective → name reflects the change.
6. Confirm `ProjectCategoriesTab` shows no pencil icon and behaves as before.
