# 13 — User Deactivation & Invitation Flow

**Scope:** Admin disables / enables users, disabled users cannot log in, and
the invite → email → activation → first-login cycle end-to-end.
**Suggested file:** `yehub-e2e/tests/auth/13-user-deactivation-invitation.spec.ts`
**Mode:** `serial` — TC_058 → TC_059 → TC_061 share the same target user and
must run in order.

**Preconditions:** Admin (`TEST_USER`). A dedicated target user created via API
invite + `POST /v1/auth/invitation/:token/accept` with a **known password** so
TC_059 and TC_061 can attempt login directly. Cleanup in `afterAll`.

## Shipped contract (verified 2026-04-22)

| Surface | Behavior |
|---|---|
| **Disable trigger** | User Details dialog → `button "Disable Account"`. |
| **Disable confirmation** | Second dialog `"Disable Account"` with body *"Disable &lt;name&gt;'s account? They will be signed out immediately."* and buttons `Cancel` / `Disable` (exact). |
| **Enable trigger** | When the target is `INACTIVE`, the same button flips to `"Enable Account"`. |
| **Enable confirmation** | Second dialog `"Enable Account"` with body *"Re-activate &lt;name&gt;'s account?"* and buttons `Cancel` / `Enable` (exact). |
| **Row Status cell** | Flips `Active` ↔ `Inactive` live (no refresh needed). |
| **Admin API** | `PATCH /v1/admin/users/:id/disable` and `PATCH /v1/admin/users/:id/enable`. `GET /v1/admin/users/:id` returns `status: "ACTIVE" | "INACTIVE"` (no `isActive` boolean). |
| **Disabled login response** | `POST /v1/auth/login` returns `{ message: "Account locked. Please contact an administrator.", locked: true }`. The backend collapses *disabled* and *lockout-due-to-failed-attempts* into the same response. See TC_059 divergence note. |

---

## TC_058 — Admin deactivates a user

**Objective:** Admin can flip a target's status to `INACTIVE` through the User
Details dialog.
**Precondition:** Admin logged in; target user exists and is `ACTIVE`.
**Steps:**
1. Navigate to `/users`; search for the target's email to bring the row
   on-page.
2. Click the row → `dialog "User Details"` opens.
3. Click `Disable Account` → `dialog "Disable Account"` appears. Click
   `Disable` (`{ exact: true }` to disambiguate from the outer trigger).
4. Wait for `PATCH /v1/admin/users/:id/disable` → `200`.

**Expected result:**
- Both dialogs close.
- The row's Status cell reads `Inactive` without a page reload.
- `GET /v1/admin/users/:id` returns `status: "INACTIVE"`.

---

## TC_059 — Disabled user cannot log in

**Objective:** Attempting to log in with the disabled account fails on
`/login`.
**Precondition:** TC_058 has completed (target is `INACTIVE`). Use a fresh
browser context so no admin state leaks in.
**Steps:**
1. Open a new context → `/login`.
2. Fill the disabled user's email and known password.
3. Click `Sign in`; wait for `POST /v1/auth/login` to respond.

**Expected result:**
- Status is **not** `200`; no `access_token` returned.
- URL stays on `/login`.
- The visible error paragraph reads something disabled-specific (e.g.
  *"Your account is disabled. Contact an administrator."*).

**Known shipping divergence (expected-to-fail in CI):** the backend
currently returns `{ message: "Account locked. Please contact an
administrator.", locked: true }` for a disabled user — identical to the
rate-limit lockout response. The user loses the signal that their
account was *administratively* disabled. The test asserts the correct
"disabled" wording and is **expected to fail** in CI until the backend
splits the two responses. We do **not** annotate with `test.fail()`: the
failure is the regression signal. When the backend is fixed, the test
will start passing automatically.

---

## TC_061 — Admin reactivates the user

**Objective:** After re-enabling, the target can log in again.
**Precondition:** Target is `INACTIVE` from TC_058.
**Steps:**
1. Admin context: navigate to `/users`; search → open the row's User
   Details dialog.
2. Click `Enable Account` → `dialog "Enable Account"` appears. Click
   `Enable` (`{ exact: true }`).
3. Wait for `PATCH /v1/admin/users/:id/enable` → `200`.
4. API probe: `POST /v1/auth/login` with the target's credentials.

**Expected result:**
- Row Status cell reverts to `Active`.
- `GET /v1/admin/users/:id` returns `status: "ACTIVE"`.
- API login returns `200` with an `access_token`.

---

## TC_077 — Invitation → activation → first login (end-to-end)

**Objective:** The shipped invite flow produces an email whose link lets the
invitee set a password and log in successfully. Covers the full UI +
email + UI loop end-to-end in one place (there is no standalone
`invite-user.spec.ts` — the previous file was removed, and the flow is
otherwise only exercised as a precondition helper in specs 06-10).
**Precondition:** Admin logged in; smtp4dev reachable. Purge any stale
messages for the invitee address before submitting.

**Steps:**
1. Admin: navigate to `/users`, click `Invite User`.
2. Fill the `Invite User` dialog — `Full Name`, `Email` (scoped to the
   dialog; the page header also has an "Email"-ish combobox filter),
   leave the default role (`Authorized User`).
3. Click `Send Invitation` → wait for `POST /v1/admin/users/invite` → `201`.
4. Poll smtp4dev for the invitation email to the invitee. Extract the
   token from the `/invitation/<token>` path in the HTML body.
5. Open a **fresh browser context** and navigate to
   `{{FE}}/invitation/<token>`.
6. Fill `Password` and `Confirm Password`, click `Activate Account`; wait
   for `POST /v1/auth/invitation/:token/accept` → `200`.
7. Activation routes the invitee to `/login`. Fill in the email and the
   same password, click `Sign in`; wait for `POST /v1/auth/login` → `200`.

**Expected result:**
- Invitation email is delivered within ~10 seconds and contains an
  `/invitation/<token>` link.
- Activation returns `200` and the activation page navigates to `/login`.
- First login returns a valid `access_token` and the invitee lands on
  `/`.
- `GET /v1/admin/users/:id` (admin context) returns `status: "ACTIVE"`.

**Cleanup:** `afterAll` deletes the invitee via `DELETE /v1/admin/users/:id`.

---

## Implementation notes

- **Seed the TC_058/059/061 target via API**, not through the UI — the
  test isn't about the invite form. Invite with
  `POST /v1/admin/users/invite` then activate with
  `POST /v1/auth/invitation/:token/accept { password }`. This gives the
  target a known password so TC_059 and TC_061 can attempt direct logins.
- **Purge smtp4dev before inviting.** `DELETE /api/messages/:id` for any
  stale message addressed to the invitee; otherwise the poll may grab a
  prior run's token.
- **Disambiguate the confirm button** with `getByRole('dialog', { name:
  'Disable Account' })` scope + `{ name: 'Disable', exact: true }` — the
  outer dialog's `Disable Account` trigger would otherwise also match.
  Same pattern for `Enable` in TC_061.
- **TC_059 uses `test.fail()`** with a message that references the
  backend message-collapse divergence. Remove the annotation once the
  backend returns a disabled-specific response; the assertion already
  asserts the correct shipped-when-fixed copy.
- **TC_077 runs in a fresh context** for the activation and first-login
  steps so that admin auth state does not leak into the invitee's
  browser session.
- **Cleanup:** `afterAll` deletes both the TC_058/059/061 target and the
  TC_077 invitee. Ignore 404 so partial failures in the middle of the
  serial chain still tear down cleanly.
- **TC numbering:** spec 12 also uses `TC_077` for a separate removal
  test. Both files run independently so this is not a runtime collision,
  but a future renumber pass should resolve it.
