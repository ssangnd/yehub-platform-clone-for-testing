# 03 — Login Authentication (Happy Path + Logout)

**Scope:** Successful login flows, logout, and a few input-handling invariants.
**Suggested file:** `yehub-e2e/tests/auth/login-authentication.spec.ts`
**Preconditions:** `TEST_USER` is seeded (admin account). Some tests create and delete additional users via the admin API.

---

## TC_009 — Login with valid credentials

**Objective:** Golden-path login redirects to the dashboard.
**Precondition:** `TEST_USER` exists.
**Steps:**
1. `page.goto('/login')`.
2. Fill email and password with `TEST_USER` values.
3. Click "Sign in".

**Expected result:**
- URL becomes `/` (pathname).
- Dashboard greeting visible (e.g., `page.getByText('Welcome to the Platform')`).
- `localStorage.yehub-auth` contains a non-empty object with `accessToken` and `refreshToken`.

---

## TC_010 — Admin creates user then login with new account

**Objective:** A freshly-created user can log in end-to-end.
**Precondition:** Logged in as admin.
**Steps:**
1. Admin creates a new user via the admin UI **or** via `POST /users` with the admin JWT. Use a unique email (`e2e.${Date.now()}@example.com`).
2. Set an initial password (if the flow supports it) or use the invitation link (see `13-user-deactivation-invitation.md` for the invitation version).
3. Log out.
4. Log in with the new user's credentials.

**Expected result:**
- Login succeeds; dashboard renders.
- In `afterAll`, delete the created user to keep the test idempotent.

---

## TC_011 — Logout functionality

**Objective:** Logout clears session and redirects to login.
**Precondition:** User is logged in (use `loginAsAdmin` helper similar to `invite-user.spec.ts`).
**Steps:**
1. Click the user menu / logout button.

**Expected result:**
- URL becomes `/login`.
- `localStorage.yehub-auth` is removed (or contains no tokens).
- Navigating back to a protected route (e.g. `/users`) immediately redirects to `/login` (do not rely on cached state).

---

## TC_078 — Email is case-insensitive on login (recommended)

**Objective:** `User@Example.com` logs in the same as `user@example.com`.
**Precondition:** Seeded user with lowercase email `user@example.com`.
**Steps:**
1. Fill email with the uppercase variant (`User@Example.com`).
2. Fill password with the correct password.
3. Click "Sign in".

**Expected result:**
- Login succeeds and redirects to `/`.
- Covers the regression fixed in bug **YEH-73** ("Inconsistent email handling between account creation and login"). Include a comment referencing that bug so a future regression is easy to trace.

---

## TC_079 — Password must not be whitespace-only (recommended)

**Objective:** Prevent accepting `'     '` as a valid password.
**Precondition:** On `/login`.
**Steps:**
1. Fill email with `TEST_USER.email`.
2. Fill password with `'        '` (8 spaces).
3. Click "Sign in".

**Expected result:**
- Either a client-side validation error appears, or the server returns 401.
- URL remains `/login`.
- Covers regression fixed in bug **YEH-75** ("Password field accepts 'All Spaces' as a valid password").

---

## Implementation notes

- Use `test.describe.configure({ mode: 'serial' })` for TC_010 since it creates and deletes a user.
- Extract a `loginAs(page, user)` helper — reuse across later spec files (consider promoting it to `tests/helpers/auth.ts`).
- For TC_010, prefer calling the admin API directly for user creation (fast, deterministic) rather than driving the UI each time.
