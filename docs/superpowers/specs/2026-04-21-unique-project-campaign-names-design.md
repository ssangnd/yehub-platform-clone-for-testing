# Design: Prevent Duplicate Project and Campaign Names

**Date:** 2026-04-21
**Branch:** `fix/unique-project-campaign-names`
**Worktree:** `.worktrees/unique-names`

## Problem

Users can currently create multiple projects with identical names, and multiple campaigns with identical names within the same project. This causes confusion in listing views, reporting, and search. We need to:

1. Prevent creating a project with a name that already exists.
2. Prevent creating a campaign with a name that already exists in the same project.
3. Surface a clear error message on the frontend when a duplicate is attempted.
4. Enforce both rules at the database level with unique indexes.

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Project name uniqueness scope | Global across all projects | Simplest model, matches product expectation that project names are identifiers |
| Case sensitivity | Case-sensitive | Matches existing Postgres `@unique` defaults; consistent with recent email case-sensitivity work |
| Soft-deleted campaigns | Partial unique index, ignores soft-deleted | Allows name reuse after deletion, which is user-friendly; `Campaign.deleted_at IS NULL` |

## Schema Changes

File: `yehub-be/prisma/schema.prisma`

### Project

Add `@unique` to `name`:

```prisma
model Project {
  id          String    @id @default(uuid()) @db.Uuid
  name        String    @unique
  ...
}
```

### Campaign

Prisma's `@@unique` does not support partial indexes, so we keep the model unchanged and create the index via raw SQL in the migration file.

## Migration

Created via `pnpm prisma:migrate --name unique_project_campaign_names`.

The generated migration needs the raw SQL appended for the partial index, because Prisma's schema-based unique constraints do not support `WHERE` clauses. The final migration SQL:

```sql
-- Enforce globally unique project names
CREATE UNIQUE INDEX "projects_name_key" ON "projects"("name");

-- Enforce unique campaign names within a project, ignoring soft-deleted rows
CREATE UNIQUE INDEX "campaigns_project_id_name_active_key"
  ON "campaigns"("project_id", "name")
  WHERE "deleted_at" IS NULL;
```

### Existing duplicates

Resolving any pre-existing duplicate project/campaign names is handled by the user before the migration is applied. The plan does not include automated pre-flight queries or data cleanup.

## Backend Changes

### `yehub-be/src/projects/projects.service.ts`

- `create(userId, dto)`: Before `prisma.project.create`, check for an existing project with the same name:
  ```ts
  const existing = await this.prisma.project.findUnique({ where: { name: dto.name } });
  if (existing) throw new ConflictException('A project with this name already exists');
  ```
- `update(projectId, dto)`: If `dto.name` is provided and differs from the existing name, run the same check (excluding the current project by id).
- Wrap `prisma.project.create` and `prisma.project.update` with a try/catch that re-throws `P2002` Prisma errors as `ConflictException` with the same message, as a safety net for concurrent creates.

### `yehub-be/src/campaigns/campaigns.service.ts`

- `create(projectId, dto)`: Before `prisma.campaign.create`, check:
  ```ts
  const existing = await this.prisma.campaign.findFirst({
    where: { project_id: projectId, name: dto.name, deleted_at: null },
  });
  if (existing) throw new ConflictException('A campaign with this name already exists in this project');
  ```
- `update(id, dto)`: If `dto.name` is provided and differs from the existing name, run the same check excluding the current campaign.
- Catch `P2002` and re-throw as `ConflictException`.

Both checks use the existing `ConflictException` import (already in both service files).

### Tests

- `projects.service.spec.ts`: add cases for `create()` and `update()` that verify `ConflictException` is thrown on duplicate name.
- `campaigns.service.spec.ts`: add cases covering duplicate-name in create and update, and verify soft-deleted campaigns do NOT block name reuse.

## Frontend Changes

### Error surfacing

The existing Axios client (`yehub-fe/src/api/client.ts`) already surfaces HTTP error messages via the response interceptor. The project and campaign create/edit forms need to translate a 409 response into a user-visible message.

### Files to update

- `yehub-fe/src/pages/projects/ProjectsListPage/components/CreateProjectDialog.tsx` — create project form.
- `yehub-fe/src/pages/projects/components/EditProjectDialog.tsx` — edit project form.
- `yehub-fe/src/pages/campaigns/CampaignFormPage/index.tsx` — create/edit campaign form.

In each form, on a 409 response from create/update:
- Use React Hook Form's `setError('name', { type: 'server', message })` to display the error at the `name` field.
- Prefer the server-provided message; fall back to a generic "A {project|campaign} with this name already exists" if the response lacks one.
- Follow the existing error-handling pattern already used in these forms for other server errors.

### Tests

Unit/component tests for the forms are not currently thorough; we will not expand coverage for this change unless existing patterns dictate otherwise. E2E (`yehub-e2e/`) smoke tests will remain green — duplicate-name paths are not covered by existing E2E tests and adding them is out of scope for this change.

## Non-goals

- Migrating existing duplicates in production data automatically — that is a manual step documented in the migration guide.
- Renaming soft-deleted campaigns to free up names proactively — the partial index already handles this.
- Case-insensitive uniqueness — explicitly rejected in favor of case-sensitive matching.
- Per-user project name scoping — explicitly rejected in favor of global uniqueness.

## Rollout

1. Create and apply Prisma migration in dev.
2. Run CI (lint, test, build for backend; lint, build for frontend).
3. Merge to main → Render auto-deploys backend; migration runs via `prisma:migrate:deploy`.

Pre-existing duplicates in any environment are resolved by the user out-of-band before the migration runs.

## Risks

- **Race conditions on create:** The pre-check is not atomic with the insert, so two concurrent requests could both pass the check. The DB-level unique index + P2002 catch is the authoritative defense.
- **Case-sensitive matching may surprise users** (e.g., "Acme" and "ACME" both allowed). Accepted per explicit decision.
