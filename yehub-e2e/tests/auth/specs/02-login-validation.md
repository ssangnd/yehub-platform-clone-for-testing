# 02 — Login Form Validation

**Scope:** Client-side and server-side validation on the login form.
**Suggested file:** `yehub-e2e/tests/auth/login-validation.spec.ts`
**Preconditions:** `page.goto('/login')` in `beforeEach`. No authenticated state.

Reference: existing patterns in `tests/login.spec.ts` for validation tests.

---

## TC_005 — Login with empty fields

**Objective:** Submitting an empty form surfaces required-field errors.
**Precondition:** On `/login`; both inputs empty.
**Steps:**
1. Click "Sign in" without filling any field.

**Expected result:**
- URL remains `/login`.
- An error message for the email field is visible (matches `/invalid input|required/i`).
- An error message for the password field is visible (e.g. "Password is required").
- No network call to `/auth/login` is issued — assert via `page.on('request', ...)` counter OR simply assert the URL stays on login.

---

## TC_006 — Invalid email format

**Objective:** Malformed emails are rejected client-side.
**Precondition:** On `/login`.
**Steps:**
1. Fill email with `not-an-email` (or `test@com`).
2. Fill password with any non-empty string.
3. Click "Sign in".

**Expected result:**
- URL remains `/login`.
- An email-format error is visible (e.g. "Invalid input" or "Invalid email format").
- Parametrize with a few invalid cases: `'not-an-email'`, `'test@com'`, `'@missing-local.com'`, `'has space@x.com'`.

---

## TC_007 — Incorrect password

**Objective:** Valid email + wrong password returns a generic error.
**Precondition:** A seeded user exists (use `TEST_USER` from `constants.ts`).
**Steps:**
1. Fill email with `TEST_USER.email`.
2. Fill password with `'wrongpassword'`.
3. Click "Sign in".

**Expected result:**
- `POST /auth/login` returns 401.
- URL remains `/login`.
- Error "Invalid credentials" (or equivalent) is visible.
- Implementation: prefer hitting the real backend; if flaky, mock with `page.route(...)` like `tests/login.spec.ts` does.

---

## TC_008 — Non-existent email

**Objective:** Unknown email returns a generic "Invalid email or password" error.
**Precondition:** No account exists for the chosen email.
**Steps:**
1. Fill email with `nonexistent+${Date.now()}@example.com`.
2. Fill password with any value.
3. Click "Sign in".

**Expected result:**
- `POST /auth/login` returns 401.
- URL remains `/login`.
- Error message starts with `"Invalid email or password"`.
- **Note:** TC_007's error adds a ". N attempts remaining before lockout." suffix (because the account exists and has a lockout counter); TC_008 omits that suffix because there's no account to lock. Both messages sharing the same prefix is the accepted behavior — assert the shared prefix rather than full-string equality.

---

## Implementation notes

- `test.describe.configure({ mode: 'parallel' })` — these tests are independent.
- For TC_007 and TC_008, assert that response status is `401`, not `500`, by intercepting with `page.waitForResponse`.
- Do **not** assert distinct error strings between TC_007 and TC_008 — they should match.
