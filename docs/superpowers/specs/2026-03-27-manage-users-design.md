# Manage Users Page — Design Spec

**Date:** 2026-03-27
**Branch:** feat/rbac-refactor
**Scope:** yehub-fe + yehub-be

---

## Overview

Upgrade the existing `/users` admin page in `yehub-fe` to match the demo UI/UX (`yehub-demo/src/pages/admin/AdminPanelPage.tsx`). Add `enableUser` to the backend. The route is already guarded by `AdminRoute` (ADMIN role only).

---

## Backend Changes (`yehub-be`)

### New: `enableUser` method — `AdminService`

- Finds user by ID, throws `NotFoundException` if not found
- Sets `active: true` via Prisma update
- No "last admin" guard needed (enabling can't reduce admin count)

### New: `PATCH /admin/users/:id/enable` — `AdminController`

- HTTP 204 No Content on success
- Protected by existing `JwtAuthGuard` + `GlobalRolesGuard` + `@GlobalRoles(GlobalRole.ADMIN)`
- Swagger: `@ApiOperation({ summary: 'Enable user account' })`

### API client (`yehub-fe/src/api/admin.ts`)

Add:
```ts
enableUser: (id: string) =>
  apiClient.patch(`/admin/users/${id}/enable`).then(r => r.data),
```

---

## Frontend Changes (`yehub-fe`)

### 1. Constants — `src/lib/constants/roles.ts`

Add `GLOBAL_ROLE_CONFIG` alongside existing `PROJECT_ROLE_CONFIG`:

```ts
export const GLOBAL_ROLE_CONFIG: Record<GlobalRole, { label: string; description: string }> = {
  ADMIN: { label: 'Admin', description: 'Full access to all platform features and settings.' },
  INTERNAL_USER: { label: 'Internal User', description: 'Manages profiles and monitors dashboards.' },
  AUTHORIZED_USER: { label: 'Authorized User', description: 'Access limited to assigned projects only.' },
}
```

Keys use uppercase to match `GlobalRole` type in fe (`'ADMIN' | 'INTERNAL_USER' | 'AUTHORIZED_USER'`).

### 2. Install shadcn Pagination

```bash
pnpm dlx shadcn@latest add pagination
```

Adds `src/components/ui/pagination.tsx`.

### 3. Page rewrite — `src/pages/admin/admin-panel.tsx`

Full rewrite. All data fetching via existing `adminApi` + React Query. No mock data.

#### Layout

```
PageHeader (title="Admin Panel", description="Manage users and permissions")
  actions: <Button onClick=openInviteDialog><UserPlus /> Invite User</Button>

shadcn Table (sortable: Name, Role, Last Login)
shadcn Pagination
```

#### Table columns

| Column | Content | Sortable |
|--------|---------|----------|
| User | `Avatar` (initials fallback) + name + email | by name |
| Role | Colored `Badge` (destructive=ADMIN, default=INTERNAL_USER, secondary=AUTHORIZED_USER) | by role |
| Status | `Badge` outline, green tint if active | — |
| Projects | count or "All projects" for ADMIN | — |
| Last Login | relative time string | by last_login_at |

Clicking a row opens the User Details dialog.

Sorting state: `sortKey: 'name' | 'role' | 'last_login_at' | null`, `sortDir: 'asc' | 'desc'` — managed locally with `useState`. Sort is client-side over the full user list.

Pagination: 10 rows per page, shadcn `Pagination` component below table.

#### Invite User Dialog

Shadcn `Dialog`. Form with zod validation via `react-hook-form` (reuse existing `inviteUserSchema` + `InviteUserFormValues`).

Fields:
- Full Name (text, required)
- Email (email, required)
- Role (select: Authorized User / Internal User / Admin, default: Authorized User)

Actions: Cancel | Send Invitation (disabled while mutation pending).
On success: `toast.success`, invalidate `['admin-users']`, close dialog.
On error: `toast.error`.

#### User Details Dialog

Shadcn `Dialog` (max-w-lg). Opened by row click, fetches detail via `adminApi.getUser(id)`.

**Header section:**
- `Avatar` (h-12 w-12, initials fallback)
- Name (font-semibold) + email (text-muted-foreground)

**Info row:**
- Role: shadcn `Select` dropdown — changing triggers a confirmation dialog before calling `updateRole` mutation
- Status: Badge (green tint = active, outline = inactive)

**Meta row:**
- Last login (relative time)
- Created date

**Access section (separator above):**
- If ADMIN: "Admin has access to all projects."
- Otherwise: scrollable list of project memberships — each row shows project name, role badge, X button
- X button triggers a confirmation dialog before calling `removeUserMembership` mutation

**Footer actions (separator above):**
- "Remove User" (destructive button) — triggers confirmation dialog → `removeUser` mutation → close dialog
- "Disable Account" (outline button, shown when `active: true`) → confirmation → `disableUser` mutation → close
- "Enable Account" (outline button, shown when `active: false`) → confirmation → `enableUser` mutation → close (no last-admin check on enable)

**Confirmation dialogs (nested `Dialog`):**
- Role change: warns if promoting to ADMIN or demoting from ADMIN
- Remove user: "This cannot be undone"
- Disable account: simple confirm
- Remove membership: names the project

All mutations invalidate `['admin-users']` and `['admin-user', id]` on success.

---

## Access Control

No changes needed. `AdminRoute` in `router.tsx` already redirects non-admins to `/projects`. Backend already enforces `GlobalRole.ADMIN` via `GlobalRolesGuard`.

---

## Out of Scope

- Search/filter on the users table
- Bulk actions
- Categories section (already implemented, not touched)
- Audit log
