# Edit Project Category Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let admins rename a global `Category` from `Admin › Settings › Project Categories`; renames propagate to every linked project.

**Architecture:** Add a `PATCH /categories/:id` admin-only endpoint backed by a new `CategoriesService.rename` that maps Prisma `P2002`/`P2025` to HTTP conflict/not-found. On the frontend, extend the existing categories hook with an `updateMutation` and wire the shared `TagListPanel`'s already-generic `onEdit` / `isEditing` props through `ProjectCategoriesTab`. The shared `EditTagDialog` requires no changes.

**Tech Stack:** NestJS 11 + Prisma 7 (backend), React 19 + TanStack React Query v5 + shadcn/ui (frontend), Jest (backend unit tests).

---

## File Structure

### Create
- `yehub-be/src/categories/dto/update-category.dto.ts` — DTO for PATCH body.

### Modify
- `yehub-be/src/categories/categories.service.ts` — add `rename` method.
- `yehub-be/src/categories/categories.service.spec.ts` — extend `mockPrisma.category` with `update`, add `describe('rename', …)` block.
- `yehub-be/src/categories/categories.controller.ts` — add `@Patch(':id')` handler + imports.
- `yehub-fe/src/api/categories.ts` — add `update` function.
- `yehub-fe/src/pages/admin/SettingsPage/use-categories-tab.ts` — add `updateMutation`, return it.
- `yehub-fe/src/pages/admin/SettingsPage/components/ProjectCategoriesTab.tsx` — destructure `updateMutation`, pass `onEdit` / `isEditing` into `TagListPanel`.

---

### Task 1: Backend — Add `UpdateCategoryDto`

**Files:**
- Create: `yehub-be/src/categories/dto/update-category.dto.ts`

- [ ] **Step 1: Create the DTO file**

```ts
import { IsString, MinLength, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateCategoryDto {
  @ApiProperty({ minLength: 1, maxLength: 100 })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name: string;
}
```

- [ ] **Step 2: Verify compile**

Run (from `yehub-be/`): `pnpm exec tsc --noEmit`
Expected: passes with no errors.

- [ ] **Step 3: Commit**

```bash
git add yehub-be/src/categories/dto/update-category.dto.ts
git commit -m "feat(be): add UpdateCategoryDto for category renames"
```

---

### Task 2: Backend — Write failing tests for `CategoriesService.rename`

**Files:**
- Modify: `yehub-be/src/categories/categories.service.spec.ts`

- [ ] **Step 1: Extend the `mockPrisma.category` with `update`**

In `categories.service.spec.ts`, change the mock block:

```ts
const mockPrisma = {
  category: {
    findMany: jest.fn(),
    create: jest.fn(),
    delete: jest.fn(),
    update: jest.fn(),
  },
};
```

- [ ] **Step 2: Import `ConflictException`**

Replace the existing `@nestjs/common` import line at the top of the file:

```ts
import { ConflictException, NotFoundException } from '@nestjs/common';
```

- [ ] **Step 3: Add the `describe('rename', …)` block at the end of the file**

Append, immediately before the final closing `});` of `describe('CategoriesService', …)`:

```ts
  describe('rename', () => {
    it('updates and returns the renamed category', async () => {
      const updated = {
        id: '1',
        name: 'Tech Products',
        created_at: new Date('2026-01-01'),
      };
      mockPrisma.category.update.mockResolvedValue(updated);

      const result = await service.rename('1', 'Tech Products');

      expect(result).toEqual(updated);
      expect(mockPrisma.category.update).toHaveBeenCalledWith({
        where: { id: '1' },
        data: { name: 'Tech Products' },
      });
    });

    it('throws ConflictException on duplicate name (P2002)', async () => {
      const err = new Prisma.PrismaClientKnownRequestError('Unique fail', {
        code: 'P2002',
        clientVersion: '0.0.0',
      });
      mockPrisma.category.update.mockRejectedValue(err);

      await expect(service.rename('1', 'Tech')).rejects.toThrow(
        ConflictException,
      );
    });

    it('throws NotFoundException when record not found (P2025)', async () => {
      const err = new Prisma.PrismaClientKnownRequestError('Not found', {
        code: 'P2025',
        clientVersion: '0.0.0',
      });
      mockPrisma.category.update.mockRejectedValue(err);

      await expect(service.rename('missing', 'X')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
```

- [ ] **Step 4: Run tests and confirm the 3 new cases fail**

Run (from `yehub-be/`): `pnpm test -- categories.service.spec`
Expected: the three `rename` cases fail (most likely `TypeError: service.rename is not a function`). The pre-existing tests continue to pass.

- [ ] **Step 5: Commit the failing tests**

```bash
git add yehub-be/src/categories/categories.service.spec.ts
git commit -m "test(be): add failing rename cases for CategoriesService"
```

---

### Task 3: Backend — Implement `CategoriesService.rename`

**Files:**
- Modify: `yehub-be/src/categories/categories.service.ts`

- [ ] **Step 1: Update the `@nestjs/common` import to include `ConflictException`**

Replace the current first import:

```ts
import {
  Injectable,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
```

- [ ] **Step 2: Add the `rename` method below `remove`**

Append inside the `CategoriesService` class, after the existing `remove` method:

```ts
  async rename(id: string, name: string) {
    try {
      return await this.prisma.category.update({
        where: { id },
        data: { name },
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError) {
        if (e.code === 'P2002') {
          throw new ConflictException(
            'A category with that name already exists',
          );
        }
        if (e.code === 'P2025') {
          throw new NotFoundException('Category not found');
        }
      }
      throw e;
    }
  }
```

- [ ] **Step 3: Run tests — all pass**

Run (from `yehub-be/`): `pnpm test -- categories.service.spec`
Expected: all tests pass (pre-existing + 3 new rename cases).

- [ ] **Step 4: Commit**

```bash
git add yehub-be/src/categories/categories.service.ts
git commit -m "feat(be): add CategoriesService.rename with conflict + not-found mapping"
```

---

### Task 4: Backend — Expose `PATCH /categories/:id`

**Files:**
- Modify: `yehub-be/src/categories/categories.controller.ts`

- [ ] **Step 1: Add `Patch` to the `@nestjs/common` import**

Replace the current `@nestjs/common` import with:

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

- [ ] **Step 2: Import `UpdateCategoryDto`**

Add immediately below the existing `CreateCategoryDto` import:

```ts
import { UpdateCategoryDto } from './dto/update-category.dto';
```

- [ ] **Step 3: Add the `@Patch(':id')` handler between `create` and `remove`**

Insert this method between the existing `create` and `remove` methods in `CategoriesController`:

```ts
  @Patch(':id')
  @UseGuards(GlobalRolesGuard)
  @GlobalRoles(GlobalRole.ADMIN)
  @ApiOperation({ summary: 'Rename category (admin only)' })
  rename(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCategoryDto,
  ) {
    return this.categoriesService.rename(id, dto.name);
  }
```

- [ ] **Step 4: Verify compile + lint**

Run (from `yehub-be/`):
```
pnpm exec tsc --noEmit
pnpm lint
```
Expected: no type errors, no lint errors.

- [ ] **Step 5: Commit**

```bash
git add yehub-be/src/categories/categories.controller.ts
git commit -m "feat(be): expose PATCH /categories/:id for admin renames"
```

---

### Task 5: Frontend — Add `categoriesApi.update`

**Files:**
- Modify: `yehub-fe/src/api/categories.ts`

- [ ] **Step 1: Add the `update` function**

Insert a new property inside the `categoriesApi` object, between `create` and `remove`:

```ts
  update: (id: string, name: string): Promise<Category> =>
    apiClient.patch<Category>(`/categories/${id}`, { name }).then((r) => r.data),
```

The full file should end up matching this shape:

```ts
import { apiClient } from './client'

export interface Category {
  id: string
  name: string
  project_count?: number
}

export const categoriesApi = {
  list: (): Promise<Category[]> => apiClient.get<Category[]>('/categories').then((r) => r.data),

  create: (name: string): Promise<Category> => apiClient.post<Category>('/categories', { name }).then((r) => r.data),

  update: (id: string, name: string): Promise<Category> =>
    apiClient.patch<Category>(`/categories/${id}`, { name }).then((r) => r.data),

  remove: (id: string) => apiClient.delete(`/categories/${id}`),
}
```

- [ ] **Step 2: Verify build**

Run (from `yehub-fe/`): `pnpm build`
Expected: builds without errors.

- [ ] **Step 3: Commit**

```bash
git add yehub-fe/src/api/categories.ts
git commit -m "feat(fe): add categoriesApi.update"
```

---

### Task 6: Frontend — Add `updateMutation` to `useCategoriesTab`

**Files:**
- Modify: `yehub-fe/src/pages/admin/SettingsPage/use-categories-tab.ts`

- [ ] **Step 1: Add `updateMutation` after `createMutation` and before `deleteMutation`**

Insert this block inside `useCategoriesTab` between the existing `createMutation` and `deleteMutation`:

```ts
  const updateMutation = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) => categoriesApi.update(id, name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.categories })
      // Cached projects embed the category name; drop them so the next fetch
      // shows the renamed value everywhere.
      queryClient.invalidateQueries({ queryKey: queryKeys.projects.all })
      queryClient.invalidateQueries({ queryKey: ['project'], exact: false })
      toast.success('Category updated')
    },
    onError: (err) => {
      const msg = axios.isAxiosError(err)
        ? ((err.response?.data as { message?: string })?.message ?? 'Failed to update category')
        : 'Failed to update category'
      toast.error(msg)
    },
  })
```

- [ ] **Step 2: Return `updateMutation` from the hook**

Change the final `return` statement from:

```ts
  return { items, isLoading, isError, createMutation, deleteMutation }
```

to:

```ts
  return { items, isLoading, isError, createMutation, updateMutation, deleteMutation }
```

- [ ] **Step 3: Verify build**

Run (from `yehub-fe/`): `pnpm build`
Expected: no type errors.

- [ ] **Step 4: Commit**

```bash
git add yehub-fe/src/pages/admin/SettingsPage/use-categories-tab.ts
git commit -m "feat(fe): add updateMutation for categories"
```

---

### Task 7: Frontend — Wire rename action in `ProjectCategoriesTab`

**Files:**
- Modify: `yehub-fe/src/pages/admin/SettingsPage/components/ProjectCategoriesTab.tsx`

- [ ] **Step 1: Destructure `updateMutation` from the hook**

Replace the destructuring line:

```tsx
  const { items, isLoading, isError, createMutation, deleteMutation } = useCategoriesTab()
```

with:

```tsx
  const { items, isLoading, isError, createMutation, updateMutation, deleteMutation } = useCategoriesTab()
```

- [ ] **Step 2: Pass `onEdit` / `isEditing` to `TagListPanel`**

Update the `<TagListPanel>` JSX so the final shape is:

```tsx
    <TagListPanel
      entityLabel="Project Category"
      entityLabelPlural="Project Categories"
      usageNoun="project"
      items={items}
      isLoading={isLoading}
      isError={isError}
      onCreate={(name) => createMutation.mutate(name)}
      onEdit={(id, name) => updateMutation.mutate({ id, name })}
      onDelete={(id) => deleteMutation.mutate(id)}
      isCreating={createMutation.isPending}
      isEditing={updateMutation.isPending}
      isDeleting={deleteMutation.isPending}
    />
```

- [ ] **Step 3: Verify build + lint**

Run (from `yehub-fe/`):
```
pnpm build
pnpm lint
```
Expected: build succeeds, lint passes.

- [ ] **Step 4: Commit**

```bash
git add yehub-fe/src/pages/admin/SettingsPage/components/ProjectCategoriesTab.tsx
git commit -m "feat(fe): wire rename action in ProjectCategoriesTab"
```

---

### Task 8: Verification — lint + format + manual check

**Files:** none modified by default; formatter may auto-adjust files from prior tasks.

- [ ] **Step 1: Backend lint + build**

Run (from `yehub-be/`):
```
pnpm lint
pnpm build
pnpm test -- categories.service.spec
```
Expected: all pass.

- [ ] **Step 2: Frontend lint, format-check, build**

Run (from `yehub-fe/`):
```
pnpm lint
pnpm exec prettier --check src
pnpm build
```
Expected: all pass. If `prettier --check` reports drift on files we touched, run `pnpm exec prettier --write <file>` on the affected paths, stage, and commit with message `chore(fe): prettier format <scope>`.

- [ ] **Step 3: Manual smoke test (per spec)**

Bring up the app locally (`docker compose up -d`, then `pnpm start:dev` in `yehub-be/` and `pnpm dev` in `yehub-fe/`) and, logged in as admin:

1. `Admin › Settings › Project Categories` — pencil icons visible; trash still works.
2. Click pencil, rename a category, submit → toast + row updates.
3. Rename to an existing name → 409 toast ("A category with that name already exists").
4. Open a project linked to the renamed category → updated name shown.
5. `Admin › Settings › Campaign Objectives` — regression check: still works as before.

If any step fails, stop and report before proceeding.

- [ ] **Step 4: Final status**

If everything above passes, report success. No additional commit required unless formatter changes were applied in Step 2.

---

## Self-Review

- **Spec coverage:** every spec section is realized — DTO (Task 1), service rename + tests (Tasks 2–3), route (Task 4), API client (Task 5), hook mutation (Task 6), tab wiring (Task 7), verification (Task 8). No spec requirements are unplanned.
- **Placeholder scan:** no TBD/TODO; every code step has complete code; commands + expected outcomes are explicit.
- **Type consistency:** `UpdateCategoryDto` name matches between controller import and DTO file; `rename(id, name)` signature is consistent across service, controller, API client, hook (`{ id, name }`), and tab call site; `queryKeys.categories` / `queryKeys.projects.all` / `['project']` invalidation set matches the existing `deleteMutation` in the same hook.
