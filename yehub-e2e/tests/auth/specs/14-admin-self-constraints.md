# 14 — Admin Self-Modification Constraints & Role Propagation

**Scope:** Admins cannot destroy their own access from the UI, and a role
change by *another* admin propagates on the next request.
**Suggested file:** `yehub-e2e/tests/auth/14-admin-self-constraints.spec.ts`
**Preconditions:** `TEST_USER` is the primary admin. TC_080 seeds a secondary
admin via API in `beforeAll` and deletes it in `afterAll`.

## Shipped contract (verified 2026-04-22)

On the **admin's own row** the User Details dialog renders:

| Control | State on self row | State on non-self row |
|---|---|---|
| Role combobox | `[disabled]` (cannot open) | editable |
| `Remove User` button | **not rendered** | rendered |
| `Disable Account` / `Enable Account` button | **not rendered** | rendered |
| `Resend Invitation` button | **not rendered** (N/A anyway) | rendered for `INVITED` users |

This is client-side defense in depth on top of the server-side
`ensureNotSelf` guard already locked in by spec 12's **TC_075**. The
absence of the destructive buttons is the cleanest assertion — it's the
UI's promise that a misclick cannot trigger a self-destructive action.

Role-propagation mechanism: `JwtStrategy` re-reads the caller's role and
status from the database on every request. A previously-issued access
token for an admin who has since been demoted is accepted as a valid
JWT, but `GlobalRolesGuard` rejects it with `403 Forbidden resource`.
`<AdminRoute>` in the SPA redirects to `/projects` (a known shipping
divergence from the product rule of `/` — tracked by spec 12 TC_056).

---

## TC_062 — Admin cannot change own role (UI lockdown)

**Objective:** The role combobox is disabled for the current admin's own
row; there is no UI path to mutate it.
**Precondition:** `TEST_USER` logged in.
**Steps:**
1. Navigate to `/users`; search for the admin's own email.
2. Click the row → `dialog "User Details"` opens.
3. Inside the dialog, assert the role combobox is disabled.

**Expected result:**
- `getByRole('dialog', { name: 'User Details' }).getByRole('combobox')`
  is `toBeDisabled()`.
- API half is covered by **spec 12 TC_075** (`PATCH /admin/users/:self/role` → 400).

---

## TC_063 — Admin cannot disable own account (UI lockdown)

**Objective:** The `Disable Account` button is absent from the current
admin's own User Details dialog.
**Precondition:** `TEST_USER` logged in.
**Steps:**
1. Open User Details for `TEST_USER`.
2. Assert no `Disable Account` button exists inside the dialog.

**Expected result:**
- `getByRole('dialog', { name: 'User Details' })
  .getByRole('button', { name: 'Disable Account' })` has count `0`.
- API half is covered by **spec 12 TC_075** (`PATCH /admin/users/:self/disable` → 400).

---

## TC_064 — Admin cannot remove own account (UI lockdown)

**Objective:** The `Remove User` button is absent from the current admin's
own User Details dialog.
**Precondition:** `TEST_USER` logged in.
**Steps:**
1. Open User Details for `TEST_USER`.
2. Assert no `Remove User` button exists inside the dialog.

**Expected result:**
- `getByRole('dialog', { name: 'User Details' })
  .getByRole('button', { name: 'Remove User' })` has count `0`.
- API half is covered by **spec 12 TC_075** (`DELETE /admin/users/:self` → 400).

---

## TC_080 — Role demotion by another admin propagates on next request

**Objective:** When Admin A demotes Admin B to a non-admin role, Admin B
loses admin access on the next request without re-authenticating.
**Precondition:**
- Admin A = `TEST_USER`.
- Admin B = a secondary admin seeded via `POST /admin/users/invite
  { role: 'ADMIN' }` + `POST /auth/invitation/:token/accept { password }`
  with a known password. Deleted in `afterAll`.
- Separate browser contexts for each.

**Steps:**
1. Context B (fresh): log in as Admin B via the UI. Capture the access
   token from `localStorage` (`yehub-auth`).
2. Context B: navigate to `/users` and confirm admin access (search box
   or `columnheader "User"` renders).
3. Context A: log in as `TEST_USER`, open Admin B's User Details,
   change role to `Authorized User`, click `Confirm` on the `Change Role`
   dialog, wait for `PATCH /admin/users/:B/role` → 200.
4. Context B: navigate to `/users` again.
5. Using the token captured in step 1, call `GET /v1/admin/users` via
   `APIRequestContext` — this is the pure-API verification that
   `JwtStrategy` + `GlobalRolesGuard` enforce the demotion even if the
   SPA's redirect were ever bypassed.

**Expected result:**
- After demotion, `GET /v1/admin/users` with Admin B's pre-demotion
  access token returns `403` — the JWT itself remains valid but the
  backend re-reads the role and rejects it.
- In the UI, Context B is redirected **away from** `/users`
  (assert `url.pathname !== '/users'`). The observed target is
  `/projects`; the product rule of `/` is tracked by the separate
  divergence locked in by spec 12 TC_056, so TC_080 uses the
  "not-on-/users" robust form to avoid double-reporting the same bug.

---

## Implementation notes

- **Do not mutate `TEST_USER`.** TC_062/063/064 are read-only — they
  assert the controls exist in the locked-down state, not that the
  actions succeed or fail. TC_075 in spec 12 already handles the
  destructive API probes safely (each call returns 400, so state is
  naturally preserved).
- **TC_080 seeding** uses the same activation pattern as specs 12/13:
  scrape the invitation token out of smtp4dev HTML, then
  `POST /auth/invitation/:token/accept { password }`. Admin B gets a
  known password so the UI login in Context B is deterministic.
- **Capture Admin B's token inside Context B** with
  `page.evaluate(() => JSON.parse(localStorage.getItem('yehub-auth')))`.
  Do not reuse a fresh API-login token, because that would defeat the
  test's point — we want to show the *pre-demotion* JWT still loses
  access after the DB-level role change.
- **Cleanup:** `afterAll` deletes the seeded Admin B; ignore 404 so the
  teardown survives partial failures.
- **Dropped from the workbook:** the original **TC_065** (consolidated
  API-only self-modification probe) is fully covered by spec 12 TC_075
  and is intentionally not re-implemented here.
