# 04 — Login Security & Route Guards

**Scope:** URL-level access guards, input sanitization, rate limiting, guest-only redirects.
**Suggested file:** `yehub-e2e/tests/auth/login-security.spec.ts`
**Preconditions:** Mix of logged-out and logged-in tests — use separate `describe` blocks.

---

## TC_014 — Unauthorized access via URL

**Objective:** Protected routes redirect unauthenticated users to login.
**Precondition:** No auth state (`localStorage` is empty; use a fresh browser context).
**Steps:**
1. `page.goto('/')` (or `/users`, `/projects`, any protected route).

**Expected result:**
- URL is rewritten to `/login` (possibly with a `?redirect=` query param).
- Dashboard content is not visible.
- Test each protected route parametrically: `/`, `/users`, `/projects`, `/settings`.

---

## TC_015 — Back button after logout

**Objective:** After logout, the browser Back button does not restore a protected page.
**Precondition:** User is logged in, then logs out.
**Steps:**
1. Log in as `TEST_USER`.
2. Click logout.
3. Call `page.goBack()`.

**Expected result:**
- URL remains on `/login` (or refreshes to `/login`).
- No protected content is rendered from cache.
- Covers regression fixed in bug **YEH-60** ("User is still logged in on another tab after logout").

---

## TC_016 — SQL injection payloads are rejected safely

**Objective:** Classic SQLi payloads do not grant access or crash the server.
**Precondition:** On `/login`.
**Steps (parametrize):**
1. For each payload in `["' OR 1=1 --", "' OR '1'='1", "admin' --", "'; DROP TABLE users; --"]`:
   - Fill email with the payload.
   - Fill password with the payload.
   - Click "Sign in".

**Expected result (per iteration):**
- `POST /auth/login` returns `401` (or `400`), never `500`.
- URL remains `/login`.
- Error message is the same generic "Invalid credentials" / "Invalid input" (no DB error leaked to the UI).

**Note:** This is a smoke test. Deep SQLi coverage belongs to security review, not E2E.

---

## TC_017 — Leading/trailing spaces on email are trimmed

**Objective:** `' user@example.com '` logs in the same as `'user@example.com'`.
**Precondition:** `TEST_USER` exists.
**Steps:**
1. Fill email with `` ` ${TEST_USER.email} ` `` (surrounded by spaces).
2. Fill password with `TEST_USER.password`.
3. Click "Sign in".

**Expected result:**
- Login succeeds and redirects to `/`.
- If the designed behavior is instead to reject whitespace, invert the assertion and lock that decision in. Match current spec/backend behavior.

---

## TC_071 — `<GuestOnly>` redirects authenticated users away from /login (recommended)

**Objective:** An already-authenticated user visiting `/login` is redirected to the dashboard.
**Precondition:** User is logged in.
**Steps:**
1. Log in via `loginAsAdmin`.
2. Call `page.goto('/login')`.

**Expected result:**
- URL is redirected back to `/` (or the previously intended route).
- No login form is rendered (assert `page.getByRole('button', { name: 'Sign in' })` is not visible).
- Referenced in `CLAUDE.md` as the `<GuestOnly>` guard — lock in its behavior.

---

## Implementation notes

- For TC_014, use `browser.newContext()` to guarantee a clean storage state.
- Group TC_014/TC_015/TC_071 in one `describe` (they all deal with route guards) and TC_016/TC_017 in another.
