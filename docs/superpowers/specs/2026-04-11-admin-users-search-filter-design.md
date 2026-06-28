# Admin Users — Search, Filter & URL-Synced List State

**Date:** 2026-04-11

## Problem

The admin Users page (`GET /admin/users` + `AdminPanelPage`) already supports server-side sorting and pagination (see `2026-03-28-admin-list-users-pagination-design.md`), but there's no way to narrow the list. As the user count grows, admins need to:

- Find a specific user by name or email
- Filter by role (Admin / Internal / Authorized) and status (Invited / Active / Inactive)
- Share a filtered view with a teammate via URL

## Goal

Add search + multi-select role/status filters to both the backend endpoint and the frontend page, and move list state (search, filters, sort, page) into the URL so views are deep-linkable.

Follow the existing `Projects` feature as the reference pattern — it already does search + filter + offset pagination in the same codebase.

## Non-goals

- No multi-select role/status storage model changes — both fields already exist on `User`.
- No cursor-based pagination — offset stays, consistent with Projects.
- No abstraction of a generic `useListQuery` hook — only two list pages exist today; YAGNI.
- No changes to existing sort semantics or default ordering.
- No changes to the `Projects` list page (it can adopt URL-sync later if desired).

## Backend

### DTO: `list-users-query.dto.ts`

Extend the existing DTO at `yehub-be/src/admin/dto/list-users-query.dto.ts` with three optional fields.

| Field | Type | Default | Constraints |
|-------|------|---------|-------------|
| `page` | number | 1 | existing |
| `limit` | number | 10 | existing, max 100 |
| `sortBy` | `'name' \| 'role' \| 'last_login_at'` | — | existing |
| `sortDir` | `'asc' \| 'desc'` | `'asc'` | existing |
| `q` | string | — | **new** — optional, trimmed, `@MaxLength(100)` |
| `role` | `GlobalRole[]` | — | **new** — optional, `@IsEnum(GlobalRole, { each: true })` |
| `status` | `UserStatus[]` | — | **new** — optional, `@IsEnum(UserStatus, { each: true })` |

**Coercion for array params.** NestJS + class-transformer does not auto-wrap a single query value into an array. Use `@Transform(({ value }) => (Array.isArray(value) ? value : value != null ? [value] : undefined))` on `role` and `status` so both `?role=ADMIN` and `?role=ADMIN&role=INTERNAL_USER` parse correctly.

**Trim for `q`.** `@Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))`, then treat empty string as absent in the service.

### Service: `AdminService.listUsers`

Extend the existing implementation in `yehub-be/src/admin/admin.service.ts` to build a `Prisma.UserWhereInput` from the new params:

```ts
const where: Prisma.UserWhereInput = {
  ...(q && {
    OR: [
      { name:  { contains: q, mode: 'insensitive' } },
      { email: { contains: q, mode: 'insensitive' } },
    ],
  }),
  ...(role?.length   && { role:   { in: role } }),
  ...(status?.length && { status: { in: status } }),
};
```

Pass `where` into both the `findMany` and `count` calls inside the existing `$transaction`. The response shape (`{ data, total, page, totalPages }`) is unchanged.

### Controller

No behavioral change. `AdminController.listUsers(@Query() query: ListUsersQueryDto)` continues to forward the DTO to the service.

### Tests

- **Unit test** `AdminService.listUsers` with fixtures covering each param in isolation and in combination: `q` only, `role` only, `status` only, `q + role`, `q + role + status`, empty-string `q`, unknown enum value (should 400 via DTO validation, test at the controller level).
- **Integration test** with a seeded DB confirming: case-insensitive search, multi-value role filter, search + filter composition, `total` reflects the filtered count (not the total user count).

## Frontend

### API client: `yehub-fe/src/api/admin.ts`

Extend `adminApi.listUsers` params:

```ts
adminApi.listUsers({
  page, limit, sortBy, sortDir,
  q,                     // string | undefined
  role,                  // GlobalRole[] | undefined
  status,                // UserStatus[] | undefined
})
```

Serialize `role` and `status` as repeated query params using `URLSearchParams.append`. Omit undefined/empty values so the request URL stays clean.

### Query keys: `yehub-fe/src/api/queryKeys.ts`

Refactor `queryKeys.adminUsers.list` from a positional signature to an object signature so adding new filters doesn't mean a 7-arg call site:

```ts
adminUsers: {
  list: (params: AdminUsersListParams) => ['admin-users', 'list', params] as const,
}
```

Where `AdminUsersListParams` matches the hook's URL-derived state (`q`, `roles`, `statuses`, `sortKey`, `sortDir`, `page`).

### Hook: `use-admin-users.ts`

Rewrite the existing hook so all list state lives in the URL via `useSearchParams` from `react-router-dom`. The hook's public surface:

```ts
const {
  // data
  users, total, page, totalPages, isLoading, isError,
  // inputs (each writes to URL, resets page to 1 where appropriate)
  q, setQ,
  roles, toggleRole,        // GlobalRole[]
  statuses, toggleStatus,   // UserStatus[]
  sortKey, sortDir, toggleSort,
  setPage,
  clearFilters,             // resets q, roles, statuses (keeps sort + page-1)
  hasActiveFilters,         // derived: q || roles.length || statuses.length
} = useAdminUsers();
```

**Behaviors:**

- **Search debounce.** The search input is controlled locally (`useState`) + `useDebounce(value, 300)`; only the debounced value writes to the URL and the React Query key. Prevents a new request on every keystroke.
- **Page reset.** Any change to `q`, `roles`, or `statuses` resets `page` to 1. Sort changes already reset to 1.
- **URL cleanliness.** Empty/default values (`page=1`, empty arrays, empty `q`) are omitted from the URL. `/admin` is the canonical "no filters" URL.
- **`keepPreviousData: true`** on the React Query call so the table does not flash empty between pages or filter changes.
- **Single source of truth.** The URL is authoritative. The hook reads from `searchParams` on every render and derives typed state (parsing enums defensively — unknown values are dropped, not thrown).

### URL shape

```
/admin?q=alice&role=ADMIN&role=INTERNAL_USER&status=ACTIVE&sortBy=name&sortDir=asc&page=2
```

Param names match the backend DTO 1:1 so the FE can forward them directly without renaming.

### UI: `AdminPanelPage`

Three additions above the existing users table.

**1. Toolbar row** (flex, `gap-2`, wraps on narrow screens):

```
[🔍 Search users...        ]  [Role ▾]  [Status ▾]  [Clear]   …   Showing 1–10 of 47
```

- **Search input** — shadcn `Input` with a left-aligned search icon, placeholder "Search by name or email", `aria-label="Search users"`.
- **Role filter** — shadcn `Popover` + `Command` multi-select. Trigger label: "Role" (empty), "Role: Admin" (one), "Role: 2" (many). Checkboxes: Admin / Internal / Authorized.
- **Status filter** — same pattern. Invited / Active / Inactive.
- **Clear filters** — ghost button, rendered only when `hasActiveFilters` is true. Calls `clearFilters()`.
- **Result count** — right-aligned, `Showing X–Y of TOTAL`, wrapped in a container with `aria-live="polite"` so screen readers hear filter changes.

**2. Active filter chips** — a second row of shadcn `Badge` pills with dismiss `×`, rendered only when `hasActiveFilters` is true. One chip per active role, one per active status, one for `q` if set. Clicking `×` toggles that value off. Low cost, big clarity win — kept in scope.

**3. Empty state** — when `total === 0` and `hasActiveFilters` is true, the table body shows a single row: "No users match your filters." with a "Clear filters" button. Distinct from the "no users at all" empty state (which should not be reachable in this system but is handled defensively).

**Pagination.** The existing pagination component stays, reading `page` / `totalPages` from the hook.

**Sort.** Existing clickable headers stay, `toggleSort` now writes to the URL instead of local state.

**Shadcn components needed:** `Input`, `Popover`, `Command` (+ `CommandList`, `CommandItem`), `Checkbox`, `Badge`. Most likely already installed; confirm during implementation and `shadcn add` anything missing.

### Accessibility

- Search input: labeled via `aria-label`.
- Result count: `aria-live="polite"`.
- Filter popovers: focus trap + Esc close + keyboard-navigable list items (shadcn `Command` handles this).
- Chip dismiss buttons: `aria-label="Remove filter: Role Admin"` and similar.
- Table headers remain clickable buttons with `aria-sort` reflecting the current sort state.

## Data flow (summary)

```
URL (searchParams) ──▶ useAdminUsers() ──▶ React Query key ──▶ adminApi.listUsers() ──▶ GET /admin/users?...
                                                                                               │
                                                                                               ▼
                                                                              AdminService.listUsers(dto)
                                                                                               │
                                                                                               ▼
                                                                              Prisma where builder + $transaction
                                                                                               │
                                                                                               ▼
                                                                              { data, total, page, totalPages }
```

The URL is the single source of truth on the FE; the DTO is the single source of truth on the BE. They share the same param names, so there is no translation layer.

## Testing & verification

- **BE unit tests:** `where` builder combinations (see above).
- **BE integration test:** one happy-path test hitting a seeded DB.
- **FE manual verification:** start `yehub-fe` dev server, exercise search / role filter / status filter / combined / clear filters / URL copy-paste into a new tab / browser back-forward. Confirm empty state and `aria-live` updates.
- **Type check + existing test suites** pass on both BE and FE.

## Risks & open questions

- **React Router version.** Implementation assumes `react-router-dom` v6+ (`useSearchParams`). If the project is on an older version, we'll need to adjust — to verify at implementation time.
- **Prisma `mode: 'insensitive'`.** Requires a Postgres backend (confirmed — `schema.prisma` uses Postgres). Safe.
- **Duplicated enums.** `GlobalRole` and `UserStatus` are currently duplicated between BE and FE. This spec does not fix the duplication; filter values will be typed against the existing FE-side enum constants. Deduplicating is a separate concern.
