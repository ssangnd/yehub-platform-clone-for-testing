# Edit Campaign Objective Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let admins rename a global Campaign Objective from `Admin › Settings › Campaign Objectives`.

**Architecture:** Add a `PATCH /objectives/:id` endpoint (admin-only) backed by a new `ObjectivesService.rename` method. On the frontend, extend the shared `TagListPanel` with an optional `onEdit` prop + pencil action, add a new `EditTagDialog`, and wire an `updateMutation` in `use-objectives-tab.ts`. `ProjectCategoriesTab` stays unchanged because it doesn't pass `onEdit`.

**Tech Stack:** NestJS 11, Prisma 7, Jest (backend). React 19, TanStack Query v5, shadcn/ui (frontend). pnpm.

**Spec:** `docs/superpowers/specs/2026-04-19-edit-campaign-objective-design.md`

---

## File Structure

**Backend (`yehub-be/`)**
- Create: `src/objectives/dto/update-objective.dto.ts` — class-validator DTO for the rename body.
- Modify: `src/objectives/objectives.service.ts` — add `rename(id, name)` with P2002/P2025 mapping.
- Modify: `src/objectives/objectives.service.spec.ts` — add three cases for `rename`.
- Modify: `src/objectives/objectives.controller.ts` — add `PATCH :id` handler.

**Frontend (`yehub-fe/`)**
- Modify: `src/api/objectives.ts` — add `update(id, name)`.
- Create: `src/pages/admin/SettingsPage/components/EditTagDialog.tsx` — mirrors `AddTagDialog`, prefilled.
- Modify: `src/pages/admin/SettingsPage/components/TagListPanel.tsx` — optional `onEdit` / `isEditing` props + pencil button.
- Modify: `src/pages/admin/SettingsPage/use-objectives-tab.ts` — add `updateMutation`.
- Modify: `src/pages/admin/SettingsPage/components/CampaignObjectivesTab.tsx` — wire `onEdit`.

---

## Task 1: Backend — extend service spec with failing rename tests (TDD red)

**Files:**
- Modify: `yehub-be/src/objectives/objectives.service.spec.ts`

- [ ] **Step 1: Add the mock for `update` and three new cases at the bottom of the file.**

Add `update: jest.fn(),` inside the `objective:` object in `mockPrisma` (keep existing `findMany`, `create`, `delete`).

Append a new `describe('rename', ...)` block after the `remove` block:

```ts
  describe('rename', () => {
    it('updates and returns the renamed objective', async () => {
      const updated = {
        id: '1',
        name: 'Brand Awareness',
        created_at: new Date('2026-01-01'),
      };
      mockPrisma.objective.update.mockResolvedValue(updated);

      const result = await service.rename('1', 'Brand Awareness');

      expect(result).toEqual(updated);
      expect(mockPrisma.objective.update).toHaveBeenCalledWith({
        where: { id: '1' },
        data: { name: 'Brand Awareness' },
      });
    });

    it('throws ConflictException on duplicate name (P2002)', async () => {
      const err = new Prisma.PrismaClientKnownRequestError('Unique fail', {
        code: 'P2002',
        clientVersion: '0.0.0',
      });
      mockPrisma.objective.update.mockRejectedValue(err);

      await expect(service.rename('1', 'Awareness')).rejects.toThrow(
        ConflictException,
      );
    });

    it('throws NotFoundException when record not found (P2025)', async () => {
      const err = new Prisma.PrismaClientKnownRequestError('Not found', {
        code: 'P2025',
        clientVersion: '0.0.0',
      });
      mockPrisma.objective.update.mockRejectedValue(err);

      await expect(service.rename('missing', 'X')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
```

- [ ] **Step 2: Run the spec — expect failures.**

Run from `yehub-be/`:
```bash
pnpm exec jest src/objectives/objectives.service.spec.ts
```

Expected: tests in `rename` block fail with `TypeError: service.rename is not a function` (the existing 5 tests still pass).

- [ ] **Step 3: Do not commit yet** — red stage only.

---

## Task 2: Backend — implement `rename` to make the tests green

**Files:**
- Modify: `yehub-be/src/objectives/objectives.service.ts`

- [ ] **Step 1: Add the `rename` method below `remove`.**

```ts
  async rename(id: string, name: string) {
    try {
      return await this.prisma.objective.update({
        where: { id },
        data: { name },
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError) {
        if (e.code === 'P2002') {
          throw new ConflictException(
            'An objective with that name already exists',
          );
        }
        if (e.code === 'P2025') {
          throw new NotFoundException('Objective not found');
        }
      }
      throw e;
    }
  }
```

- [ ] **Step 2: Run the spec — expect 8 passing tests.**

Run from `yehub-be/`:
```bash
pnpm exec jest src/objectives/objectives.service.spec.ts
```

Expected:
```
Tests:       8 passed, 8 total
```

- [ ] **Step 3: Commit.**

```bash
git add yehub-be/src/objectives/objectives.service.ts yehub-be/src/objectives/objectives.service.spec.ts
git commit -m "feat(be): add ObjectivesService.rename with conflict + not-found mapping"
```

---

## Task 3: Backend — add `UpdateObjectiveDto` and `PATCH /objectives/:id` endpoint

**Files:**
- Create: `yehub-be/src/objectives/dto/update-objective.dto.ts`
- Modify: `yehub-be/src/objectives/objectives.controller.ts`

- [ ] **Step 1: Create the DTO.**

Write `yehub-be/src/objectives/dto/update-objective.dto.ts`:

```ts
import { IsString, MinLength, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateObjectiveDto {
  @ApiProperty({ minLength: 1, maxLength: 100 })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name: string;
}
```

- [ ] **Step 2: Wire the endpoint.**

In `yehub-be/src/objectives/objectives.controller.ts`, add `Patch` to the `@nestjs/common` imports and import the new DTO near the existing `CreateObjectiveDto` import.

Change:
```ts
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
```
to:
```ts
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
```

Add this import after `CreateObjectiveDto`:
```ts
import { UpdateObjectiveDto } from './dto/update-objective.dto';
```

Insert the new handler between `create` and `remove`:
```ts
  @Patch(':id')
  @UseGuards(GlobalRolesGuard)
  @GlobalRoles(GlobalRole.ADMIN)
  @ApiOperation({ summary: 'Rename objective (admin only)' })
  rename(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateObjectiveDto,
  ) {
    return this.objectivesService.rename(id, dto.name);
  }
```

- [ ] **Step 3: Type-check and lint.**

Run from `yehub-be/`:
```bash
pnpm build
pnpm lint
```

Expected: no errors.

- [ ] **Step 4: Manual smoke check via Swagger.**

Run `pnpm start:dev`, open `http://localhost:3000/api/docs`, confirm `PATCH /v1/objectives/{id}` appears under the Objectives tag with the `UpdateObjectiveDto` body. Stop the dev server.

- [ ] **Step 5: Commit.**

```bash
git add yehub-be/src/objectives/dto/update-objective.dto.ts yehub-be/src/objectives/objectives.controller.ts
git commit -m "feat(be): expose PATCH /objectives/:id for admin renames"
```

---

## Task 4: Frontend — add `objectivesApi.update`

**Files:**
- Modify: `yehub-fe/src/api/objectives.ts`

- [ ] **Step 1: Add the update function.**

Replace the entire `objectivesApi` object so it reads:

```ts
export const objectivesApi = {
  list: (): Promise<Objective[]> => apiClient.get<Objective[]>('/objectives').then((r) => r.data),

  create: (name: string): Promise<Objective> => apiClient.post<Objective>('/objectives', { name }).then((r) => r.data),

  update: (id: string, name: string): Promise<Objective> =>
    apiClient.patch<Objective>(`/objectives/${id}`, { name }).then((r) => r.data),

  remove: (id: string) => apiClient.delete(`/objectives/${id}`),
}
```

- [ ] **Step 2: Type-check.**

Run from `yehub-fe/`:
```bash
pnpm build
```

Expected: build succeeds (no new type errors).

- [ ] **Step 3: Commit.**

```bash
git add yehub-fe/src/api/objectives.ts
git commit -m "feat(fe): add objectivesApi.update"
```

---

## Task 5: Frontend — create `EditTagDialog`

**Files:**
- Create: `yehub-fe/src/pages/admin/SettingsPage/components/EditTagDialog.tsx`

- [ ] **Step 1: Write the component.**

Write `yehub-fe/src/pages/admin/SettingsPage/components/EditTagDialog.tsx`:

```tsx
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'

interface EditTagDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  entityLabel: string
  currentName: string
  isSubmitting: boolean
  onSubmit: (name: string) => void
}

export function EditTagDialog({
  open,
  onOpenChange,
  entityLabel,
  currentName,
  isSubmitting,
  onSubmit,
}: EditTagDialogProps) {
  const [name, setName] = useState(currentName)

  useEffect(() => {
    if (open) setName(currentName)
  }, [open, currentName])

  const trimmed = name.trim()
  const isValid = trimmed.length > 0 && trimmed.length <= 100
  const isUnchanged = trimmed === currentName.trim()
  const canSubmit = isValid && !isUnchanged && !isSubmitting

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!canSubmit) return
    onSubmit(trimmed)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Edit {entityLabel}</DialogTitle>
          <DialogDescription>Rename this {entityLabel.toLowerCase()}. Names must be unique.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="edit-tag-name">Name</Label>
            <Input
              id="edit-tag-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={100}
              autoFocus
            />
          </div>
          <div className="flex justify-end gap-3">
            <Button type="button" variant="outline" className="cursor-pointer" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" className="cursor-pointer" disabled={!canSubmit}>
              {isSubmitting ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 2: Type-check.**

Run from `yehub-fe/`:
```bash
pnpm build
```

Expected: build succeeds (file compiles; it's unused so far).

- [ ] **Step 3: Commit.**

```bash
git add yehub-fe/src/pages/admin/SettingsPage/components/EditTagDialog.tsx
git commit -m "feat(fe): add EditTagDialog for renaming admin tags"
```

---

## Task 6: Frontend — extend `TagListPanel` with optional edit affordance

**Files:**
- Modify: `yehub-fe/src/pages/admin/SettingsPage/components/TagListPanel.tsx`

- [ ] **Step 1: Update props + imports + render.**

Replace the entire file with:

```tsx
import { useState } from 'react'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { AddTagDialog } from './AddTagDialog'
import { DeleteTagDialog } from './DeleteTagDialog'
import { EditTagDialog } from './EditTagDialog'

export interface TagListItem {
  id: string
  name: string
  usage_count: number
}

interface TagListPanelProps {
  entityLabel: string
  entityLabelPlural: string
  usageNoun: string
  items: TagListItem[]
  isLoading: boolean
  isError: boolean
  onCreate: (name: string) => void
  onDelete: (id: string) => void
  isCreating: boolean
  isDeleting: boolean
  onEdit?: (id: string, name: string) => void
  isEditing?: boolean
}

export function TagListPanel({
  entityLabel,
  entityLabelPlural,
  usageNoun,
  items,
  isLoading,
  isError,
  onCreate,
  onDelete,
  isCreating,
  isDeleting,
  onEdit,
  isEditing = false,
}: TagListPanelProps) {
  const [addOpen, setAddOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<TagListItem | null>(null)
  const [editTarget, setEditTarget] = useState<TagListItem | null>(null)

  const handleCreate = (name: string) => {
    onCreate(name)
    setAddOpen(false)
  }

  const handleConfirmDelete = () => {
    if (!deleteTarget) return
    onDelete(deleteTarget.id)
    setDeleteTarget(null)
  }

  const handleConfirmEdit = (name: string) => {
    if (!editTarget || !onEdit) return
    onEdit(editTarget.id, name)
    setEditTarget(null)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">{entityLabelPlural}</h2>
          <p className="text-sm text-muted-foreground">{items.length} total</p>
        </div>
        <Button onClick={() => setAddOpen(true)} className="cursor-pointer">
          <Plus className="mr-2 h-4 w-4" />
          Add {entityLabel}
        </Button>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground py-8 text-center">Loading…</p>
      ) : isError ? (
        <p className="text-sm text-destructive py-8 text-center">Failed to load.</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-muted-foreground py-8 text-center">
          No {entityLabelPlural.toLowerCase()} yet. Add one to get started.
        </p>
      ) : (
        <ul className="divide-y rounded border">
          {items.map((item) => (
            <li key={item.id} className="flex items-center justify-between gap-3 p-3">
              <div className="flex items-center gap-3">
                <span className="font-medium">{item.name}</span>
                <Badge variant="secondary">
                  {item.usage_count} {item.usage_count === 1 ? usageNoun : `${usageNoun}s`}
                </Badge>
              </div>
              <div className="flex items-center gap-1">
                {onEdit && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="cursor-pointer"
                    onClick={() => setEditTarget(item)}
                    aria-label={`Edit ${item.name}`}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  className="cursor-pointer text-destructive hover:text-destructive"
                  onClick={() => setDeleteTarget(item)}
                  aria-label={`Delete ${item.name}`}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <AddTagDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        entityLabel={entityLabel}
        isCreating={isCreating}
        onCreate={handleCreate}
      />

      <DeleteTagDialog
        open={!!deleteTarget}
        onOpenChange={(v) => {
          if (!v) setDeleteTarget(null)
        }}
        entityLabel={entityLabel}
        usageNoun={usageNoun}
        name={deleteTarget?.name ?? ''}
        usageCount={deleteTarget?.usage_count ?? 0}
        isDeleting={isDeleting}
        onConfirm={handleConfirmDelete}
      />

      {onEdit && (
        <EditTagDialog
          open={!!editTarget}
          onOpenChange={(v) => {
            if (!v) setEditTarget(null)
          }}
          entityLabel={entityLabel}
          currentName={editTarget?.name ?? ''}
          isSubmitting={isEditing}
          onSubmit={handleConfirmEdit}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 2: Type-check.**

Run from `yehub-fe/`:
```bash
pnpm build
```

Expected: build succeeds. `ProjectCategoriesTab` still compiles because the new props are optional.

- [ ] **Step 3: Commit.**

```bash
git add yehub-fe/src/pages/admin/SettingsPage/components/TagListPanel.tsx
git commit -m "feat(fe): add optional edit affordance to TagListPanel"
```

---

## Task 7: Frontend — add `updateMutation` to `use-objectives-tab`

**Files:**
- Modify: `yehub-fe/src/pages/admin/SettingsPage/use-objectives-tab.ts`

- [ ] **Step 1: Replace the file with the updated hook.**

```ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import axios from 'axios'
import { toast } from 'sonner'
import { objectivesApi } from '@/api/objectives'
import { queryKeys } from '@/lib/constants/query-keys'

export function useObjectivesTab() {
  const queryClient = useQueryClient()

  const { data, isLoading, isError } = useQuery({
    queryKey: queryKeys.objectives,
    queryFn: objectivesApi.list,
  })

  const invalidateObjectiveAndCampaignCaches = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.objectives })
    // Cached campaigns embed objective names; drop them so the next fetch pulls fresh values.
    queryClient.invalidateQueries({ queryKey: queryKeys.campaigns.all })
    queryClient.invalidateQueries({ queryKey: ['campaign'], exact: false })
  }

  const axiosErrorMessage = (err: unknown, fallback: string) =>
    axios.isAxiosError(err)
      ? ((err.response?.data as { message?: string })?.message ?? fallback)
      : fallback

  const createMutation = useMutation({
    mutationFn: (name: string) => objectivesApi.create(name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.objectives })
      toast.success('Objective created')
    },
    onError: (err) => toast.error(axiosErrorMessage(err, 'Failed to create objective')),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) => objectivesApi.update(id, name),
    onSuccess: () => {
      invalidateObjectiveAndCampaignCaches()
      toast.success('Objective updated')
    },
    onError: (err) => toast.error(axiosErrorMessage(err, 'Failed to update objective')),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => objectivesApi.remove(id),
    onSuccess: () => {
      invalidateObjectiveAndCampaignCaches()
      toast.success('Objective deleted')
    },
    onError: () => toast.error('Failed to delete objective'),
  })

  const items = (data ?? []).map((o) => ({
    id: o.id,
    name: o.name,
    usage_count: o.campaign_count ?? 0,
  }))

  return { items, isLoading, isError, createMutation, updateMutation, deleteMutation }
}
```

- [ ] **Step 2: Type-check.**

Run from `yehub-fe/`:
```bash
pnpm build
```

Expected: build succeeds.

- [ ] **Step 3: Commit.**

```bash
git add yehub-fe/src/pages/admin/SettingsPage/use-objectives-tab.ts
git commit -m "feat(fe): add updateMutation for objectives"
```

---

## Task 8: Frontend — wire `onEdit` in `CampaignObjectivesTab`

**Files:**
- Modify: `yehub-fe/src/pages/admin/SettingsPage/components/CampaignObjectivesTab.tsx`

- [ ] **Step 1: Replace the file.**

```tsx
import { useObjectivesTab } from '../use-objectives-tab'
import { TagListPanel } from './TagListPanel'

export function CampaignObjectivesTab() {
  const { items, isLoading, isError, createMutation, updateMutation, deleteMutation } = useObjectivesTab()

  return (
    <TagListPanel
      entityLabel="Category Objective"
      entityLabelPlural="Category Objectives"
      usageNoun="campaign"
      items={items}
      isLoading={isLoading}
      isError={isError}
      onCreate={(name) => createMutation.mutate(name)}
      onDelete={(id) => deleteMutation.mutate(id)}
      onEdit={(id, name) => updateMutation.mutate({ id, name })}
      isCreating={createMutation.isPending}
      isDeleting={deleteMutation.isPending}
      isEditing={updateMutation.isPending}
    />
  )
}
```

- [ ] **Step 2: Type-check + lint.**

Run from `yehub-fe/`:
```bash
pnpm build
pnpm lint
```

Expected: no errors.

- [ ] **Step 3: Commit.**

```bash
git add yehub-fe/src/pages/admin/SettingsPage/components/CampaignObjectivesTab.tsx
git commit -m "feat(fe): wire rename action in CampaignObjectivesTab"
```

---

## Task 9: Full verification

**Files:** none (verification only).

- [ ] **Step 1: Backend tests.**

Run from `yehub-be/`:
```bash
pnpm test
```

Expected: all suites green.

- [ ] **Step 2: Backend lint + build.**

```bash
pnpm lint
pnpm build
```

Expected: no errors.

- [ ] **Step 3: Frontend lint + build.**

Run from `yehub-fe/`:
```bash
pnpm lint
pnpm build
```

Expected: no errors.

- [ ] **Step 4: Manual E2E smoke (documented, not automated).**

Start infra: `docker compose up -d` at the repo root. In two terminals:
- `cd yehub-be && pnpm start:dev`
- `cd yehub-fe && pnpm dev`

Log in as an admin, navigate to `Admin › Settings › Campaign Objectives`. Verify:

1. Each objective row shows a pencil icon next to the trash icon.
2. Clicking the pencil opens an `Edit Category Objective` dialog prefilled with the current name; Save is disabled until the name changes.
3. Renaming to a unique name succeeds; toast shows "Objective updated"; the list refreshes with the new name.
4. Renaming to a name already used by another objective shows a toast: "An objective with that name already exists".
5. Open any campaign linked to the renamed objective — it now shows the new name.
6. Open `Admin › Settings › Project Categories` — no pencil icon, behavior unchanged.

- [ ] **Step 5: No commit for verification.**

---

## Commit summary (expected end state)

```
feat(fe): wire rename action in CampaignObjectivesTab
feat(fe): add updateMutation for objectives
feat(fe): add optional edit affordance to TagListPanel
feat(fe): add EditTagDialog for renaming admin tags
feat(fe): add objectivesApi.update
feat(be): expose PATCH /objectives/:id for admin renames
feat(be): add ObjectivesService.rename with conflict + not-found mapping
docs: add design spec for editing a campaign objective   <- already on main
```
