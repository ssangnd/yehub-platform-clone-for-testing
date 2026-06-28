# Admin List Users — Server-Side Pagination & Sorting

**Date:** 2026-03-28

## Problem

The `GET /admin/users` endpoint currently:

1. Ignores `sortBy`/`sortDir` query params — the controller has no `@Query()` decorator, so the backend always returns users ordered by `created_at desc`.
2. Returns all users in a single response — pagination is done entirely client-side by slicing the array.

## Goal

Move sorting and pagination to the server so the API is correct, consistent with the projects endpoint, and scales as the user list grows.

## Backend

### New DTO: `list-users-query.dto.ts`

Located at `yehub-be/src/admin/dto/list-users-query.dto.ts`.

| Field | Type | Default | Constraints |
|-------|------|---------|-------------|
| `page` | number | 1 | min 1 |
| `limit` | number | 10 | min 1, max 100 |
| `sortBy` | `'name' \| 'role' \| 'last_login_at'` | — | optional |
| `sortDir` | `'asc' \| 'desc'` | `'asc'` | optional |

Uses `@Type(() => Number)` + `@IsInt()` for numeric coercion (same pattern as `ListProjectsQueryDto`). Uses `@IsEnum()` for `sortBy`/`sortDir`.

### Controller

`AdminController.listUsers()` adds `@Query() query: ListUsersQueryDto` and passes it to the service.

### Service

`AdminService.listUsers(query: ListUsersQueryDto)` replaces the current no-arg implementation:

- Computes `skip = (page - 1) * limit`
- Builds `orderBy` from `sortBy`/`sortDir` when present; falls back to `{ created_at: 'desc' }` when absent
- Runs a `$transaction([findMany(...), count()])` to get data and total atomically
- Returns `{ data, total, page, totalPages }` — identical shape to `ProjectsService.findAll`

## Frontend

### `src/api/admin.ts`

`listUsers` params expand to include `page?: number` and `limit?: number`. Return type changes from `AdminUser[]` to `PaginatedUsers` (a new local interface `{ data: AdminUser[], total: number, page: number, totalPages: number }`).

### `src/pages/admin/admin-panel.tsx`

- Query key: `['admin-users', sortKey, sortDir, page]` — page changes now trigger a refetch
- Call: `adminApi.listUsers({ sortBy: sortKey, sortDir, page, limit: PAGE_SIZE })`
- Remove client-side slice (`users.slice(...)`) — render `data.data` directly
- `totalPages` sourced from `data.totalPages` instead of `Math.ceil(users.length / PAGE_SIZE)`
- Page reset on sort change is already in place (`setPage(1)` inside `handleSort`)

## Non-goals

- No search/filter params (out of scope for this change)
- No cursor-based pagination
