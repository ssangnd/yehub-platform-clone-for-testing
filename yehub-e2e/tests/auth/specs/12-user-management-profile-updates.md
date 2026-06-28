# 12 — User Management: Profile Updates, Admin Actions & Guards

**Scope:** What admins can actually do to another user (role, disable,
remove), what users can edit on their own profile, the admin-only route
guard, and the server-side guards around self-action and last-admin
removal.
**Suggested file:** `yehub-e2e/tests/auth/12-user-management-updates.spec.ts`

## Shipped contract (verified 2026-04-21)

The original workbook assumed admins could rename other users and edit
their emails. The shipped UI does **not** expose those surfaces; neither
does the API. Tests lock in the actual capability set.

| Surface | What exists | What does NOT exist |
|---|---|---|
| **User Details dialog** (`/users` → row click) | Role combobox (editable), `Remove User`, `Resend Invitation` (INVITED only). Name, email, status are read-only `<p>` paragraphs. | Name edit, email edit, save button. |
| **`/my-account`** (self) | Name textbox (editable), `Save changes` button (disabled at rest), `Change avatar`, Change password form, Active Sessions. Email textbox is `[disabled]`. | Email edit. No admin-style role/status fields. |
| **Admin API** (`/admin/users`) | `GET`, `POST invite`, `POST :id/resend-invitation`, `PATCH :id/role`, `PATCH :id/disable`, `PATCH :id/enable`, `DELETE :id`, `DELETE :id/memberships/:projectId` | `PATCH :id` with name/email. Backend has no such endpoint. |
| **Self API** (`/auth/me`) | `PUT /auth/me` with `{ name, email? }` backs the name/email form. Avatar uploads use the dedicated `PUT /auth/me/avatar` with `{ avatar }`. Email change is accepted by the DTO but the `/my-account` input is disabled, so it is not exercisable through the app. | — |

### Backend guards (`admin.service.ts`)

| Guard | Action | Behavior |
|---|---|---|
| `ensureNotSelf` | role / disable / remove | Admin cannot target their own account → `400 Bad Request`. |
| `ensureNotLastAdmin` | role (demoting admin) / disable / remove of an ADMIN user | Defensive-only. `JwtStrategy` re-reads role/status per request, so the caller is always a currently-ACTIVE admin. That means `count(active admins where id ≠ target) ≥ 1` whenever `caller ≠ target`, and `caller == target` hits `ensureNotSelf` first. The guard is not reachable by any valid request sequence and is not tested on its own. |

**Product rule:** admin-on-admin actions are **allowed**. One admin may
remove, disable, or demote another admin, subject only to
`ensureNotSelf` (no acting on yourself). TC_076 locks in this positive
behavior so a future change that accidentally blocks admin-on-admin
removal (e.g. adding an over-zealous guard) shows up immediately.

---

## TC_054 — Admin changes another user's role

**Objective:** An admin can change a target user's global role via the
User Details dialog. This is the only field admins can mutate on another
user — name and email are read-only in the dialog.
**Precondition:** Admin logged in. Seeded target user (any role ≠
ADMIN).
**Steps:**
1. Navigate to `/users`; search for the seeded user to bring their row
   into view.
2. Click the row → `dialog "User Details"` opens.
3. Click the Role combobox, pick a new option (e.g. `Internal User` when
   the current role is `Authorized User`).
4. A **second confirmation dialog** appears: `dialog "Change Role"` with
   body text `"Change <name>'s role to <new role>?"` and buttons
   `Cancel` / `Confirm`. Click `Confirm`.
5. Wait for `PATCH /v1/admin/users/:id/role` to return `200`.

**Expected result:**
- The confirmation dialog closes.
- `GET /v1/admin/users/:id` reflects the new role (assert via the same
  admin API context the test used to seed).
- The row's `Role` cell updates to the new role label after closing the
  User Details dialog.

---

## TC_055 — User updates own name; email is not self-editable

**Objective:** A user can update their own display name from
`/my-account`. The email input is rendered but disabled — confirming the
shipped invariant "Email change is not exposed to users."
**Precondition:** File-scoped non-admin user logged in.
**Steps:**
1. Navigate to `/my-account`.
2. Assert the Email textbox is disabled.
3. Change the Name textbox to `Updated Name ${Date.now()}`.
4. Click `Save changes`; wait for `PUT /v1/auth/me` → `200`.

**Expected result:**
- Email input reports `toBeDisabled()`.
- `Save changes` is disabled while the form is pristine and enables once
  Name is dirtied.
- After save: a success toast appears; `GET /v1/auth/me` returns the new
  name; the sidebar user button shows the new name.

---

## TC_056 — Non-admin is blocked from User Management

**Objective:** A non-admin cannot reach admin-only UI routes or hit
admin APIs.
**Precondition:** File-scoped non-admin user logged in.
**Steps:**
1. In the UI, call `page.goto('/users')`.
2. In parallel, call `GET /v1/admin/users` with the non-admin's JWT via
   `APIRequestContext`.

**Expected result:**
- UI: `<AdminRoute>` redirects the non-admin to `/` (the dashboard
  home). Assert `url.pathname === '/'` after the navigation settles.
- API: responds with `403 Forbidden` (the global `GlobalRolesGuard`
  rejects non-admin callers before the handler runs).

**Known shipping divergence:** at the time of writing, `<AdminRoute>`
redirects to `/projects` instead of `/`. The UI assertion is kept at `/`
to lock in the product rule; expect this TC's UI half to fail until the
redirect target is corrected.

---

## TC_075 — Admin cannot act on their own account

**Objective:** Server rejects self-targeted role change, disable, and
remove. Covers `ensureNotSelf` for all three endpoints.
**Precondition:** Admin API context (`TEST_USER` token); obtain the
admin's own `id` from `GET /v1/auth/me`.
**Steps:** Using the admin token against their own `id`:
1. `PATCH /v1/admin/users/:self/role` with `{ role: 'AUTHORIZED_USER' }`.
2. `PATCH /v1/admin/users/:self/disable`.
3. `DELETE /v1/admin/users/:self`.

**Expected result (each call):**
- Status `400`.
- Response message contains `"cannot"` and the relevant action
  (`"update your own role"`, `"disable your own account"`,
  `"remove your own account"`).
- `GET /v1/auth/me` afterwards still returns the admin with role
  `ADMIN` and status `ACTIVE`.

---

## TC_076 — Admin removes another admin (via UI)

**Objective:** One admin can remove another admin through the standard
User Details dialog. The Remove User flow is not hidden or disabled when
the target's role is `ADMIN`. The only restriction on admin targeting is
`ensureNotSelf` (covered by TC_075).
**Precondition:** File-scoped helper admin seeded via
`POST /v1/admin/users/invite` with `role: ADMIN`. INVITED status is
sufficient — the target does not need to have activated. `TEST_USER` is
logged in through the UI.
**Steps:**
1. Navigate to `/users`; fill the search box with the helper admin's
   email (or a `runid` substring) to bring the row on-page.
2. Click the helper admin's row → `dialog "User Details"` opens.
3. Inside the User Details dialog, click `Remove User`.
4. A second dialog `"Remove User"` appears with body `"Are you sure you
   want to permanently remove <name>? This action cannot be undone."`
   and buttons `Cancel` / `Remove`. Click the `Remove` button (match
   with `{ name: 'Remove', exact: true }` — the outer User Details
   dialog's `Remove User` button also matches a non-exact locator).
5. Wait for `DELETE /v1/admin/users/:helperAdmin` → `204`.

**Expected result:**
- Both dialogs close.
- The helper admin's row is no longer present in the table with the same
  search query (assert via `getByRole('row').filter({ hasText: email })
  .toHaveCount(0)`).
- Secondary API probe: `GET /v1/admin/users/:helperAdmin` returns `404`.
- `TEST_USER` ends the test unchanged: role=`ADMIN`, status=`ACTIVE`.

**Cleanup:** none needed — the helper is removed by the test itself.
The `afterAll` should attempt a `DELETE /v1/admin/users/:helperAdmin` as
a safety net and ignore `404`.

---

## TC_077 — Admin removes another non-admin user (happy path)

**Objective:** With the guards satisfied, an admin can remove a
non-admin user via the dialog, and the row disappears from the list.
**Precondition:** Admin logged in. Seeded target user with role
`AUTHORIZED_USER` (any non-ADMIN role works).
**Steps:**
1. Navigate to `/users`; search for the target to bring the row on-page.
2. Click the row → `dialog "User Details"` opens.
3. Click `Remove User` in the User Details dialog.
4. A second dialog `"Remove User"` appears with body `"Are you sure you
   want to permanently remove <name>? This action cannot be undone."`
   and buttons `Cancel` / `Remove`. Click the `Remove` button
   (match with `{ name: 'Remove', exact: true }` — the outer User
   Details dialog's `Remove User` button would otherwise also match).
5. Wait for `DELETE /v1/admin/users/:id` → `204`.

**Expected result:**
- Both dialogs close.
- `GET /v1/admin/users/:id` returns `404`.
- The target's row is no longer present in the table with the same
  search query.

---

## Dropped from the workbook

These rows from the original spreadsheet are not shipped and are
intentionally left out rather than marked `fixme`. The code simply does
not have these surfaces today and no ticket is in flight.

- **Admin renames another user (original TC_054).** No admin name-edit
  surface (UI or API). Replaced by TC_054's role change, which is the
  only mutable field on the details dialog.
- **Admin changes another user's email to a duplicate (original
  TC_057).** Prerequisite "Open User A's edit dialog" does not exist.
  The analogous uniqueness guard is exercised at invite time and lives
  in the invitation spec (YEH-74 coverage there).
- **Special characters in admin-edited names (original TC_067).** Same
  reason — no admin name-edit surface. A self-edit variant of this check
  is out of scope for this spec; if needed, it belongs with TC_055 as an
  extension.

---

## Implementation notes

- **Seed via API.** `POST /v1/admin/users/invite` for every target;
  activation is only needed for the non-admin in TC_055 / TC_056 (who
  logs in through the UI). TC_054, TC_076, and TC_077 operate against
  INVITED users — role change and removal work without activation, which
  keeps setup fast.
- **Use the API accept-invitation endpoint for activation, not the UI.**
  `POST /v1/auth/invitation/:token/accept { password }`. Scrape the raw
  token out of the smtp4dev message HTML. This avoids opening a second
  browser context just to activate a test fixture.
- **Only TC_075 is pure API.** TC_054, TC_076, TC_077 drive the User
  Details dialog through the UI because the dialog's behavior (role
  confirmation, Remove confirmation, row disappearance) is part of the
  contract. TC_056 exercises both layers — UI for the route guard and
  API for the endpoint guard — because they are independent enforcement
  points.
- **Disambiguate the `Remove` button** in TC_076 / TC_077: both dialogs
  ("User Details" and the inner "Remove User" confirmation) expose a
  button whose accessible name starts with `Remove`. Scope the locator
  with `getByRole('dialog', { name: 'Remove User' })` and use
  `{ name: 'Remove', exact: true }` to hit the confirm button without
  matching the outer `Remove User` trigger.
- **Capture `self` id from `GET /v1/auth/me`.** Don't hardcode TEST_USER's
  id — it differs per environment.
- **Do not leave `TEST_USER` demoted or disabled.** TC_075 uses `TEST_USER`
  as the caller; all three self-action calls are expected to fail with
  `400`, so state is naturally preserved. Still, the test asserts
  role=`ADMIN` and status=`ACTIVE` at the end as a guard against a
  regression that silently lets one of the self-actions through.
- **Cleanup:** `afterAll` deletes every seeded user (non-admin, TC_054,
  TC_076, TC_077). TC_076 and TC_077 already delete their target — the
  cleanup issues `DELETE` anyway and ignores `404`.
