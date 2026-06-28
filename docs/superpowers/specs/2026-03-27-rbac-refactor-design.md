# RBAC Refactor — Design Spec

**Date:** 2026-03-27
**Status:** Approved
**Scope:** yehub-be + yehub-fe

## Overview

Refactor the platform's authorization system from project-only roles to a two-tier RBAC model: global roles (platform-wide) + project-scoped roles. Replace open registration with admin-controlled email invitations.

## 1. Global Roles

Added to the User model. Determine platform-wide permissions.

| Role | Description |
|---|---|
| `ADMIN` | Full platform access. User management, project creation, all features. |
| `INTERNAL_USER` | Can create projects. Cannot access admin panel or manage users. |
| `AUTHORIZED_USER` | No global permissions. Can only work within assigned projects. Default for new invitations. |

### Global Permission Matrix

| Action | ADMIN | INTERNAL_USER | AUTHORIZED_USER |
|---|---|---|---|
| Manage users (invite, disable, remove, change role) | Y | N | N |
| Create projects | Y | Y | N |
| Access admin panel | Y | N | N |
| Access assigned projects | Y | Y | Y |

## 2. Project-Scoped Roles

Assigned per project via ProjectMembership. The old `ADMIN` project role is removed; `MANAGER` takes over full project control. `EXECUTIVE` is new.

| Role | Description |
|---|---|
| `MANAGER` | Full project control: members, settings, campaigns, alerts. |
| `EXECUTIVE` | Edit campaigns, view all data. Cannot manage members or configure alerts. |
| `ANALYST` | View all data, search/filter, export. Cannot edit campaigns. |
| `VIEWER` | View all data only. No search, no export, no editing. |

### Project Permission Matrix

| Action | MANAGER | EXECUTIVE | ANALYST | VIEWER |
|---|---|---|---|---|
| Manage members (add, remove, change role) | Y | N | N | N |
| Edit project settings | Y | N | N | N |
| Create/edit campaigns | Y | Y | N | N |
| Configure alerts | Y | N | N | N |
| View all data | Y | Y | Y | Y |
| Search/filter comments | Y | Y | Y | N |
| Export data | Y | Y | Y | N |

### Admin Override Rule

Global `ADMIN` users have no implicit project access. They must be added as a project member to access project data. Admins manage user-project memberships from the admin panel only (view + remove, not add — adding is done from the project side).

## 3. Data Model Changes

### Prisma Schema

**New enum — `GlobalRole`:**
```prisma
enum GlobalRole {
  ADMIN
  INTERNAL_USER
  AUTHORIZED_USER
}
```

**Updated enum — `ProjectRole`:**
```prisma
enum ProjectRole {
  MANAGER
  EXECUTIVE
  ANALYST
  VIEWER
}
```

**User model — new/changed fields:**
```prisma
model User {
  // ... existing fields
  role                   GlobalRole @default(AUTHORIZED_USER)
  password_hash          String?    // nullable until invitation accepted
  invited_by             String?    // UUID of admin who invited
  invitation_token_hash  String?
  invitation_expires_at  DateTime?
  invitation_accepted_at DateTime?
  last_login_at          DateTime?  // updated on each successful login
}
```

**Migration:**
- Add `GlobalRole` enum and `role` column to `users` (default `AUTHORIZED_USER`).
- Drop `ADMIN` from `ProjectRole`, add `EXECUTIVE`.
- Delete all existing project memberships with role `ADMIN` (clean slate — no production data).
- Make `password_hash` nullable.
- Add invitation fields to `users`.

## 4. Backend Architecture

### Approach: Guard-per-layer

Two separate NestJS guards with their own decorators. Controllers compose them as needed.

**`GlobalRolesGuard`** + `@GlobalRoles(...)` decorator:
- Reads `role` from JWT payload (no extra DB query).
- Checks user's global role against the required roles.
- Used on admin endpoints and project creation.

**`ProjectRolesGuard`** (updated) + `@ProjectRoles(...)` decorator:
- Same logic as current guard, updated enum values.
- `MANAGER` replaces `ADMIN` as the top project role.

**JWT payload** — add `role: GlobalRole` field so `GlobalRolesGuard` doesn't need a DB lookup.

### API Changes

**Remove:**
- `POST /auth/register` — no public registration.

**Keep (unchanged):**
- `POST /auth/login`
- `POST /auth/refresh-token`
- `GET /auth/me`
- `PATCH /auth/me`
- `PATCH /auth/me/password`
- `POST /auth/forgot-password`
- `POST /auth/reset-password`

**New — Admin user management (`/admin/users`):**

| Method | Route | Guard | Purpose |
|---|---|---|---|
| GET | `/admin/users` | `@GlobalRoles(ADMIN)` | List all users (with project count, status, last login) |
| POST | `/admin/users/invite` | `@GlobalRoles(ADMIN)` | Send invitation email |
| GET | `/admin/users/:id` | `@GlobalRoles(ADMIN)` | User details + project memberships |
| PATCH | `/admin/users/:id/role` | `@GlobalRoles(ADMIN)` | Change user's global role |
| PATCH | `/admin/users/:id/disable` | `@GlobalRoles(ADMIN)` | Disable account (`active = false`) |
| DELETE | `/admin/users/:id` | `@GlobalRoles(ADMIN)` | Remove user entirely |
| DELETE | `/admin/users/:id/memberships/:projectId` | `@GlobalRoles(ADMIN)` | Remove user from a project |

**New — Invitation acceptance (public, no auth):**

| Method | Route | Purpose |
|---|---|---|
| GET | `/auth/invitation/:token` | Validate token, return user email |
| POST | `/auth/invitation/:token/accept` | Set password, activate account |

**Admin self-protection rules:**
- Cannot disable or remove the last `ADMIN` user.
- Cannot demote the last `ADMIN` to a non-admin role.
- Backend enforces this by counting remaining active admins before any disable/remove/role-change operation.

**Updated — Project endpoints:**
- `POST /projects` — guarded by `@GlobalRoles(ADMIN, INTERNAL_USER)` instead of open to all.
- Project member endpoints — `@ProjectRoles(MANAGER)` replaces `@ProjectRoles(ADMIN)`.

## 5. Invitation & Email Flow

### Flow

1. Admin submits invite form (name, email, global role) → `POST /admin/users/invite`.
2. Backend creates User row: `password_hash = null`, `active = false`. Generates 32-byte random hex token, stores bcrypt hash + expiry (48 hours).
3. Backend sends email containing link: `{FRONTEND_URL}/invitation/{raw_token}`.
4. User clicks link → frontend calls `GET /auth/invitation/:token` → validates → shows set-password form.
5. User submits password → `POST /auth/invitation/:token/accept` → backend hashes password, sets `active = true`, sets `invitation_accepted_at`, clears token fields.
6. User redirected to login page.
7. Expired/invalid tokens show an error page with a message to contact their admin.

### Token Security

- Raw token sent in email only, never stored in DB.
- DB stores bcrypt hash of token.
- 48-hour expiry.
- One-time use — cleared after acceptance.

### Email Service

Nodemailer with configurable SMTP transport.

**Environment variables:**
- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_USER`
- `SMTP_PASS`
- `SMTP_FROM`

**Dev fallback:** Log the invitation link to console when SMTP is not configured.

## 6. Frontend Changes

### Remove
- Register page and route.
- All "Sign up" links.

### New Routes

```
/invitation/:token          (public — invitation acceptance)
/admin/users                (admin only — user management)
```

### Updated Route Structure

```
/login                      (public)
/forgot-password            (public)
/reset-password             (public)
/invitation/:token          (public — new)
/admin/users                (protected, admin only — new)
/projects                   (protected)
/projects/:id               (protected)
/projects/:id/settings      (protected)
/profile                    (protected)
```

### New Pages/Components

**Admin Panel (`/admin/users`):**
- User list table: avatar, name, email, role badge (colored by role), status badge (Active/Inactive), project count, last login.
- Sortable by last login.
- "Invite User" button in header.

**Invite User Modal:**
- Fields: Full Name, Email, Role dropdown (Admin / Internal User / Authorized User).
- Validation: required fields, email format.
- Success toast on completion.

**User Details Sidebar/Modal:**
- User info: avatar, name, email.
- Role dropdown (changeable by admin).
- Status badge (Active/Inactive).
- Last login, created date.
- Project memberships list: project name, project role badge, remove (X) button.
- Footer actions: "Remove User" (danger) and "Disable Account".

**Invitation Acceptance Page (`/invitation/:token`):**
- Validates token on load (shows loading, then error or form).
- Displays email (read-only, from token validation response).
- Password + confirm password fields.
- Submit → activate → redirect to login.

### Updated Components

**Auth store — add `role` to `AuthUser` type:**
- `AuthUser` gains `role: GlobalRole` field (populated from JWT / `/auth/me` response).
- Used by route guards and `useCan` for global permission checks.

**`useCan` hook — extend for global + project permissions:**
- Global actions: `create_project`, `manage_users`.
- Project actions: `edit`, `manage_members`, `export`, `search`, `create_campaign`, `configure_alerts`.
- Accepts either `(globalAction, globalRole)` or `(projectAction, projectRole)`.

**Project creation button:**
- Hidden for `AUTHORIZED_USER`.

**Project member management:**
- Role dropdown options: MANAGER, EXECUTIVE, ANALYST, VIEWER (no more ADMIN).
- Add member modal: searchable user list (users not yet in project), role picker.

**Route protection:**
- `/admin/*` routes check `user.role === 'ADMIN'` (read from auth store / JWT).
- Redirect to `/projects` with toast if unauthorized.

## 7. Migration Strategy

Since there's no production data, this is a clean migration:

1. Update Prisma schema (new enums, new fields, nullable password_hash).
2. Generate and run migration.
3. Delete existing project memberships with old `ADMIN` role.
4. Seed an initial `ADMIN` user for development.
5. Remove register endpoint and frontend page.
6. Deploy backend changes, then frontend changes.
