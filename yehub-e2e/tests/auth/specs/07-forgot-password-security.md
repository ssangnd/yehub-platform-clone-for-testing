# 07 — Forgot Password: Security (Link Integrity & Session Invalidation)

**Scope:** Link reuse, tamper, multiple concurrent requests, password complexity, and session-kick behavior.
**Suggested file:** `yehub-e2e/tests/auth/forgot-password-security.spec.ts`
**Mode:** `serial` within each describe because state mutates.

**Preconditions:** Dedicated test user seeded in `beforeAll`, deleted in `afterAll`. Use the `getResetLink` helper from spec 06.

---

## TC_030 — Reset link is single-use

**Objective:** Once consumed, the link cannot be reused.
**Precondition:** Perform a successful reset (copy the flow from TC_025–TC_027).
**Steps:**
1. After a successful reset, `page.goto(resetLink)` again.

**Expected result:**
- Page shows an invalid/expired-link error.
- The set-password form is not rendered, or the submit call returns 4xx.

---

## TC_032 — Password reset invalidates other active sessions

**Objective:** Device A is kicked out when the password is reset from Device B.
**Precondition:** The test user is created; use `browser.newContext()` twice to simulate Device A and B.
**Steps:**
1. Context A: log in as the test user.
2. Context B: request forgot-password, open the reset link, submit a new password.
3. Context A: trigger a navigation or API call (e.g., `page.reload()`).

**Expected result:**
- Context A is redirected to `/login`.
- `localStorage.yehub-auth` in Context A no longer carries a valid token (either cleared, or the access token is rejected on the next request).

---

## TC_033 — Reset link integrity (tamper detection)

**Objective:** A tampered token in the URL is rejected.
**Precondition:** A valid `resetLink` was extracted from smtp4dev.
**Steps:**
1. Mutate the token portion of the URL (e.g., flip one character or truncate it).
2. `page.goto(tamperedUrl)`.

**Expected result:**
- Page shows an "Invalid link" / 404 error.
- No set-password form is displayed.
- Parametrize with a few mutations: flip a char, truncate last 5 chars, append junk.

---

## TC_034 — Multiple reset requests: only the latest link is valid

**Objective:** Older tokens are invalidated when a newer one is issued.
**Precondition:** Test user; smtp4dev cleared for that user.
**Steps:**
1. Submit forgot-password 3 times for the same email.
2. Collect all 3 resulting links from smtp4dev (ordered oldest → newest).
3. Attempt to consume link #1 (oldest): `page.goto(link1)`, fill new password, submit.

**Expected result:**
- Link #1 is rejected as invalid/expired.
- Link #3 (newest) works (optional follow-up assertion).
- Covers open bug **YEH-77** ("Outdated Password Reset links remain active after new requests"). Test should initially **fail** until the bug is fixed — mark with a `test.fixme()` if needed, or keep it asserting the expected (post-fix) behavior.

---

## TC_035 — Password complexity enforced on reset

**Objective:** Weak passwords are rejected.
**Precondition:** On the set-password page with a valid token.
**Steps (parametrize):**
1. For each weak password `['123', 'password', 'abcdefg', '        ']`:
   - Fill new + confirm with the weak value.
   - Click submit.

**Expected result (per iteration):**
- Validation error visible (e.g. "min 8 characters", "requires special character").
- Submit is blocked / returns 4xx.
- The password is **not** updated — verify by attempting login with the weak password and asserting 401 after the suite.

---

## TC_073 — Reset from Device B does NOT kick Device B itself (recommended)

**Objective:** The device that performed the reset should immediately be able to log in with the new password and remain functional.
**Precondition:** Test user; two contexts A and B.
**Steps:**
1. Context A logs in.
2. Context B requests and completes reset → redirected to `/login`.
3. Context B logs in with the new password.

**Expected result:**
- Context B login succeeds.
- Context A is logged out (covered by TC_032).
- Lock in the split behavior: Context A kicked, Context B fresh.

---

## Implementation notes

- For TC_034, introduce small delays between requests if the backend uses coarse timestamps for token ordering.
- For TC_032 and TC_073, share a single `seedUser()` helper in `beforeAll`.
- Do not mock any routes — these tests exercise real backend logic and email delivery.
