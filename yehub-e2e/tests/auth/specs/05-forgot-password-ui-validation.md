# 05 — Forgot Password UI & Validation

**Scope:** Forgot-password page layout and request-form validation (no email content yet).
**Suggested file:** `yehub-e2e/tests/auth/forgot-password-ui.spec.ts`
**Preconditions:** Navigate to the forgot-password page via the login screen link.

---

## TC_019 — "Forgot Password" link is visible on login

**Objective:** Login page exposes a forgot-password link.
**Precondition:** On `/login`.
**Steps:**
1. Observe the login form.

**Expected result:**
- `page.getByRole('link', { name: /forgot password/i })` is visible and has a non-empty `href`.
- Clicking it navigates to the forgot-password route (e.g., `/forgot-password`).

---

## TC_020 — Forgot Password page layout

**Objective:** Page renders the expected controls.
**Precondition:** On the forgot-password page.
**Steps:**
1. Observe the page.

**Expected result:**
- Email input visible.
- Submit button (e.g. `getByRole('button', { name: /send|reset/i })`) visible.
- "Back to Login" link visible and its `href` points to `/login`.

---

## TC_021 — Success message on valid request

**Objective:** Submitting a valid email shows confirmation copy.
**Precondition:** `TEST_USER` exists; on forgot-password page.
**Steps:**
1. Fill email with `TEST_USER.email`.
2. Click the submit button.

**Expected result:**
- A success banner/toast appears with copy matching `/email.*reset instructions|check your inbox/i`.
- The submit button enters a loading state briefly (optional assertion).
- `POST` to the forgot-password endpoint returns 2xx.

---

## TC_022 — Empty email field

**Objective:** Empty submission is blocked.
**Precondition:** On forgot-password page.
**Steps:**
1. Leave email empty.
2. Click submit.

**Expected result:**
- Validation error visible (e.g. "Email is required").
- No request to the forgot-password endpoint is issued.

---

## TC_023 — Invalid email format

**Objective:** Malformed email is rejected client-side.
**Precondition:** On forgot-password page.
**Steps:**
1. Fill email with `abc.com`.
2. Click submit.

**Expected result:**
- Validation error visible ("Invalid email format" or equivalent).
- No server call.
- Parametrize with: `abc.com`, `no-at-sign`, `user@`, `@host.com`.

---

## TC_024 — Non-existent email behavior

**Objective:** Lock in the product decision for unknown emails.
**Precondition:** A fresh email that is NOT registered (`unknown+${Date.now()}@example.com`).
**Steps:**
1. Fill email with the unknown address.
2. Click submit.

**Expected result (per spec note in the workbook):**
- UI displays an error message indicating the email is not found (not a generic success).
- `smtp4dev` inbox has **zero** new messages for that address (poll `${SMTP4DEV_URL}/api/messages` and filter by `to`).

**Note:** If the product later chooses user-enumeration protection (always show success), invert this assertion. Until then, the current spec says show the error.

---

## Implementation notes

- Tests TC_019–TC_023 can run in parallel; TC_024 should verify smtp4dev is empty for the specific recipient — not that the inbox is globally empty.
- Before TC_021 and TC_024, purge smtp4dev messages for the target address to avoid cross-test contamination: `DELETE ${SMTP4DEV_URL}/api/messages/{id}` or `DELETE /api/messages` (check smtp4dev API docs).
