# Admin Full Project Access — Design Spec

**Date:** 2026-03-28
**Branch:** feat/rbac-refactor
**Status:** Approved

## Problem

Admin users are currently scoped to the same project-level restrictions as regular users:
- `GET /projects` only returns projects they are a member of
- All `/:id` routes require membership (and some require `MANAGER` role)

Admins should have full, unrestricted access to all projects.

## Approach

Option A — minimal, surgical changes to two existing files plus the controller.

## Changes

### 1. `ProjectRolesGuard` — admin early-exit

File: `yehub-be/src/auth/guards/project-roles.guard.ts`

Add at the top of `canActivate`, before any membership lookup:

```ts
const { user } = context.switchToHttp().getRequest<{ user: JwtUser }>();
if (user.role === GlobalRole.ADMIN) return true;
```

This bypasses both `checkMembership` and `checkRole` for every route guarded by `ProjectRolesGuard`, giving admins access to: `GET /:id`, `PATCH /:id`, `DELETE /:id`, `GET /:id/me`, `GET /:id/members`, `GET /:id/non-members`, `POST /:id/members`, `PATCH /:id/members/:userId`, `DELETE /:id/members/:userId`.

### 2. `ProjectsService.findAll` — skip membership scope for admin

File: `yehub-be/src/projects/projects.service.ts`

Change signature:
```ts
async findAll(userId: string, query: ListProjectsQueryDto, isAdmin = false)
```

In the `where` clause, conditionally include the membership filter:
```ts
const where = {
  ...(!isAdmin && { memberships: { some: { user_id: userId } } }),
  ...
};
```

When `isAdmin` is `true`, no membership filter is applied — admin sees all projects.

### 3. `ProjectsController.findAll` — pass isAdmin

File: `yehub-be/src/projects/projects.controller.ts`

```ts
findAll(@CurrentUser() user: JwtUser, @Query() query: ListProjectsQueryDto) {
  return this.projectsService.findAll(user.id, query, user.role === GlobalRole.ADMIN);
}
```

## Testing

- `projects.service.spec.ts`: add cases for `isAdmin=true` asserting no `memberships` clause in `where`; existing `isAdmin=false` (default) cases continue to assert membership scoping
- `project-roles.guard.spec.ts` (create if absent): assert that admin role returns `true` without any DB lookup

## Non-goals

- No changes to `GlobalRolesGuard`
- No changes to `POST /projects` (create) — already guarded by `GlobalRolesGuard` requiring `ADMIN` or `INTERNAL_USER`
- No new routes or DTOs
