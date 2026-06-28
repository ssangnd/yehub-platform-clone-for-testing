# 06 — Forgot Password: End-to-End Reset Flow

**Scope:** Complete reset flow from request → email → set new password → re-login.
**Suggested file:** `yehub-e2e/tests/auth/forgot-password-reset.spec.ts`
**Mode:** `test.describe.configure({ mode: 'serial' })` — each test depends on state from the previous one.

**Preconditions:**
- A dedicated test user seeded for this spec (do NOT reuse `TEST_USER` — this flow changes the password). Create via admin API in `beforeAll`, delete in `afterAll`.
- `smtp4dev` reachable at `SMTP4DEV_URL`.
- Shared state variables in the describe scope: `resetLink`, `newPassword`.

**Helper to implement:**
```ts
async function getResetLink(email: string): Promise<string> {
  // 1. GET ${SMTP4DEV_URL}/api/messages
  // 2. find message where `to` includes `email` and subject matches /reset/i
  // 3. GET /api/messages/{id}/html
  // 4. regex-extract the first href matching /reset-password/
}
```
Model it after `getInvitationLink` in `tests/invite-user.spec.ts`.

---

## TC_025 — Receive reset email

**Objective:** Submitting a valid email produces an email containing a reset link.
**Precondition:** Dedicated test user exists; smtp4dev cleared for that address.
**Steps:**
1. Navigate to forgot-password page.
2. Fill email and submit.
3. Poll smtp4dev for a matching message (up to ~10s with `expect.poll`).

**Expected result:**
- At least one smtp4dev message addressed to the test user exists.
- Its HTML body contains an `href` pointing to the reset-password route.
- Store the extracted URL in the describe-scoped `resetLink` variable.

---

## TC_026 — Valid reset link redirects to "Set New Password"

**Objective:** Opening the link lands on the set-password page.
**Precondition:** `resetLink` populated by TC_025.
**Steps:**
1. `page.goto(resetLink)`.

**Expected result:**
- URL includes the reset-password route (assert with a regex, not exact match).
- A password input and confirm-password input are visible.
- A submit button (e.g. "Save" / "Reset password") is visible.

---

## TC_027 — Reset password successfully

**Objective:** Submitting a new valid password updates the account.
**Precondition:** On the set-password page (via TC_026).
**Steps:**
1. Fill new password with a strong value (`newPassword = 'NewPass1!${Date.now()}'`).
2. Fill confirm-password with the same value.
3. Click submit.

**Expected result:**
- Success toast/message visible (e.g. "Password updated").
- URL redirects to `/login`.
- The reset endpoint returned 2xx.

---

## TC_028 — Login with NEW password succeeds

**Objective:** Verify the update actually took effect.
**Precondition:** `newPassword` captured by TC_027.
**Steps:**
1. Fill email with the test user's email.
2. Fill password with `newPassword`.
3. Click "Sign in".

**Expected result:**
- Login succeeds; URL becomes `/`.

---

## TC_029 — Login with OLD password fails

**Objective:** The old password is invalidated.
**Precondition:** Logged out after TC_028.
**Steps:**
1. Navigate to `/login`.
2. Fill email with the test user's email.
3. Fill password with the **original** password (captured before reset).
4. Click "Sign in".

**Expected result:**
- Login fails with 401 and the "Invalid credentials" error.
- URL remains `/login`.

---

## Implementation notes

- Keep `originalPassword` and `newPassword` as describe-scoped variables from `beforeAll`.
- If any earlier test fails, later tests in the chain may cascade — that's acceptable for serial flows.
- After the suite completes, delete the test user via admin API.
- Clear smtp4dev messages for the test user in `beforeAll` to avoid picking up stale emails from a previous run.
