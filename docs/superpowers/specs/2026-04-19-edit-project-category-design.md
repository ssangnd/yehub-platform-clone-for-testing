# Edit Project Category — Design

## Summary

Allow admins to rename a global `Category` record. Today admins can create and delete categories from `Admin › Settings › Project Categories`, but there is no rename. Because `Category` is a shared lookup table joined to projects via `ProjectCategory`, renaming propagates to every linked project automatically through Prisma — only the display name changes.

Scope is limited to the rename capability. The project↔category association is already editable in the existing project form.

This feature mirrors the Edit Campaign Objective feature delivered in the same branch: the shared `TagListPanel` and `EditTagDialog` components already expose optional `onEdit` / `isEditing` props, so only entity-specific wiring is needed here.

## Non-goals

- Editing a project's set of categories from the Project Detail page (use existing edit-project form).
- Changes to `CampaignObjectivesTab` or the shared `TagListPanel` / `EditTagDialog` components (already generic).
- Retrofitting `CategoriesService.create` to map `P2002` to `ConflictException` — pre-existing behavior, outside this feature's scope.
- New e2e tests.

## Backend (`yehub-be/`)

### Route
- `PATCH /categories/:id` — admin-only, guarded by `JwtAuthGuard` + `GlobalRolesGuard` with `@GlobalRoles(GlobalRole.ADMIN)` (mirrors existing create/delete).
- Path param `id` validated with `ParseUUIDPipe`.
- Request body: `UpdateCategoryDto { name: string }` — `@IsString`, `@MinLength(1)`, `@MaxLength(100)` (identical constraints to `CreateCategoryDto`).
- Response body: the updated category (`{ id, name, created_at }`).

### Service
`CategoriesService.rename(id: string, name: string)`:
- Calls `prisma.category.update({ where: { id }, data: { name } })`.
- Maps Prisma errors:
  - `P2025` → `NotFoundException('Category not found')`
  - `P2002` → `ConflictException('A category with that name already exists')`
- All other errors re-thrown.

### Tests (`categories.service.spec.ts`)
Add cases:
1. Rename happy path — returns updated record and calls `update` with `{ where: { id }, data: { name } }`.
2. `P2002` → `ConflictException`.
3. `P2025` → `NotFoundException`.

## Frontend (`yehub-fe/`)

### API client (`src/api/categories.ts`)
Add:
```ts
update: (id: string, name: string): Promise<Category> =>
  apiClient.patch<Category>(`/categories/${id}`, { name }).then((r) => r.data),
```

### Categories admin hook (`src/pages/admin/SettingsPage/use-categories-tab.ts`)
Add `updateMutation`:
- `mutationFn: ({ id, name }) => categoriesApi.update(id, name)`
- `onSuccess`: invalidate `queryKeys.categories`, plus `queryKeys.projects.all` and `['project']` (same set the existing `deleteMutation` invalidates, because project payloads embed category names).
- `onError`: axios-aware toast (same inline pattern used by the neighbor `createMutation` in this file — preserve local style rather than introducing the shared helpers used by `use-objectives-tab.ts`).

### `ProjectCategoriesTab` (`src/pages/admin/SettingsPage/components/ProjectCategoriesTab.tsx`)
Destructure `updateMutation` from `useCategoriesTab()` and wire the shared panel's edit props:
```tsx
<TagListPanel
  ...existing props
  onEdit={(id, name) => updateMutation.mutate({ id, name })}
  isEditing={updateMutation.isPending}
/>
```

## Data flow (rename)

1. Admin clicks pencil on a category row → `EditTagDialog` opens with current name.
2. Admin edits the name and submits → `updateMutation.mutate({ id, name })`.
3. Frontend sends `PATCH /categories/:id` → backend updates the row.
4. On success: dialog closes, toast "Category updated", React Query invalidates categories + project caches. All visible project lists/detail pages pick up the new name on their next fetch.

## Error handling

| Case | Where caught | User feedback |
|------|--------------|---------------|
| Empty / whitespace-only name | Client (disabled Save button in shared `EditTagDialog`) | Save disabled |
| Name > 100 chars | Server (`class-validator` 400) | Toast with server message |
| Duplicate name | Server (`P2002` → 409) | Toast: "A category with that name already exists" |
| Category deleted concurrently | Server (`P2025` → 404) | Toast + query invalidation removes the row on next fetch |
| Non-admin caller | `GlobalRolesGuard` 403 | Toast with server message (shouldn't reach the UI — the tab is admin-only) |

## Testing

- **Backend unit:** three new cases in `categories.service.spec.ts` covering rename happy path, duplicate, not-found.
- **Frontend unit/integration:** none added (the repo has no existing FE unit tests for this tab; keep scope tight).
- **E2E:** none (per standing preference).

Manual verification:
1. Start all services, log in as admin.
2. Go to `Admin › Settings › Project Categories`. Confirm pencil icons appear; trash still works.
3. Click pencil, rename a category, submit. Confirm toast + updated row.
4. Try renaming to an existing name → 409 toast.
5. Navigate to a project linked to the renamed category → name reflects the change.
6. Confirm `CampaignObjectivesTab` still behaves as before (regression check on the shared panel).
