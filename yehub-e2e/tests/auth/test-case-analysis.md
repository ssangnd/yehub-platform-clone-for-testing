# Phase 1 — Login & User Management: Test Case Automation Analysis

Source: `YeHub - Phase 1 - Login & User Management - TestCase.xlsx` (sheet "Yehub", 68 test cases: TC_001–TC_068).

## Legend

- **Automate** — Straightforward to implement in Playwright against the staged FE + BE.
- **Automate (conditional)** — Feasible, but depends on infra hooks (test-only endpoints, clock control, or mail inbox access).
- **Manual** — Not worth automating, or genuinely unautomatable with the current stack.

Assumptions about test infrastructure we can rely on:
- `smtp4dev` captures outbound email locally and exposes an HTTP API for inbox assertions.
- A seeded admin account + ability to create/delete users through the admin API.
- A backend test hook (or a short JWT TTL in a test environment) to simulate session/link expiry without actually waiting 15/60 minutes.

---

## 1. FEATURE: LOGIN

### 1.1 UI/UX

| ID | Objective | Decision | Rationale |
|----|-----------|----------|-----------|
| TC_001 | Verify login page layout | **Automate** | Assert presence + visibility of Email, Password, Login button. Visual regression via Playwright screenshot snapshot is optional. |
| TC_002 | Verify placeholder text | **Automate** | Check `placeholder` attribute on both inputs. |
| TC_003 | Verify password masking | **Automate** | Check `input[type="password"]`. |
| TC_004 | Verify Tab order | **Automate** | Use keyboard `Tab` and assert `:focus` progression. |

### 1.2 Functional — Validation

| ID | Objective | Decision | Rationale |
|----|-----------|----------|-----------|
| TC_005 | Login with empty fields | **Automate** | Core form validation. |
| TC_006 | Invalid Email format | **Automate** | Core form validation. |
| TC_007 | Incorrect Password | **Automate** | Seed a known user; submit wrong password. |
| TC_008 | Non-existent Email | **Automate** | Use a random non-existent email. |

### 1.3 Functional — Authentication

| ID | Objective | Decision | Rationale |
|----|-----------|----------|-----------|
| TC_009 | Login with valid credentials | **Automate** | Golden path — highest priority. |
| TC_010 | Admin creates user then login | **Automate** | Covered as a two-step scenario using seeded admin + created user. |
| TC_011 | Logout functionality | **Automate** | Click logout, assert redirect + `yehub-auth` localStorage cleared. |

### 1.4 Security & Session

| ID | Objective | Decision | Rationale |
|----|-----------|----------|-----------|
| TC_012 | Verify password encryption (hashed in DB) | **Manual / backend unit test** | Not an E2E concern. Should live as a backend integration test (query `User.passwordHash` and assert bcrypt/argon2 prefix). Keeping this in E2E couples tests to DB internals. |
| TC_013 | Session timeout (1 hour) | **Automate (conditional)** | Waiting 61 min in a test is unacceptable. Automate only if we can (a) shorten access-token TTL in a `test` env profile, or (b) expose a test-only endpoint to expire the session. Otherwise keep manual. |
| TC_014 | Unauthorized access via URL | **Automate** | Navigate directly to a protected route while logged out → assert redirect to `/login`. |
| TC_015 | Back button after logout | **Automate** | Logout, then `page.goBack()` → assert login page. |

### 1.5 Edge Cases

| ID | Objective | Decision | Rationale |
|----|-----------|----------|-----------|
| TC_016 | SQL Injection check | **Automate** | Smoke-level: submit a few payloads, assert normal "invalid credentials" error and no 5xx. Deeper SQLi coverage belongs to security review, not E2E. |
| TC_017 | Leading/Trailing spaces on email | **Automate** | Behavior is deterministic per spec ("trim and login"). |
| TC_018 | Multiple failed attempts → lockout | **Automate (conditional)** | Only if the lockout feature is actually implemented. Per current BE review it is not — keep **manual** until the feature lands, then automate. |

---

## 2. FEATURE: FORGOT PASSWORD

### 2.1 UI/UX

| ID | Objective | Decision | Rationale |
|----|-----------|----------|-----------|
| TC_019 | Forgot Password link visible | **Automate** | Simple DOM assertion on login page. |
| TC_020 | Forgot Password page layout | **Automate** | Assert email input, Send button, Back-to-Login link. |
| TC_021 | Success message display | **Automate** | Submit valid email, assert toast/banner text. |

### 2.2 Functional — Validation

| ID | Objective | Decision | Rationale |
|----|-----------|----------|-----------|
| TC_022 | Empty email field | **Automate** | Form validation. |
| TC_023 | Invalid email format | **Automate** | Form validation. |
| TC_024 | Non-existent email behavior | **Automate** | Per spec note: "show error for non-existent". Deterministic, worth locking in. |

### 2.3 Reset Flow

| ID | Objective | Decision | Rationale |
|----|-----------|----------|-----------|
| TC_025 | Receive Reset Email | **Automate** | Use smtp4dev API to fetch the latest message for the user and assert it contains a reset link. |
| TC_026 | Valid Reset Link redirects to "Set New Password" | **Automate** | Extract link from smtp4dev, `page.goto(link)`, assert URL. |
| TC_027 | Reset password successfully | **Automate** | End-to-end: request reset → extract link → set new password → assert success + redirect. |
| TC_028 | Login with NEW password | **Automate** | Chained with TC_027. |
| TC_029 | Login with OLD password fails | **Automate** | Chained with TC_027. |

### 2.4 Security & Session

| ID | Objective | Decision | Rationale |
|----|-----------|----------|-----------|
| TC_030 | Link used only once | **Automate** | Reuse link after successful reset → assert "expired/used" error. |
| TC_031 | Link timeout (15 min) | **Automate (conditional)** | Requires either a configurable token TTL in test env, a test-only endpoint to age the token, or JWT-manipulation. Without that infra → **manual**. |
| TC_032 | Password change invalidates old sessions | **Automate** | Two browser contexts: login on A, reset on B, refresh on A, assert kicked to login. |
| TC_033 | Reset Link integrity (tamper) | **Automate** | Mutate the token in the URL and assert 404/invalid. |

### 2.5 Edge Cases

| ID | Objective | Decision | Rationale |
|----|-----------|----------|-----------|
| TC_034 | Multiple reset requests — only latest link valid | **Automate** | Trigger 3 requests, read smtp4dev, assert only the last link works, earlier links return "expired/invalid". This is already an open bug (YEH-77) so automation is high-value. |
| TC_035 | Password complexity enforcement | **Automate** | Parametrize weak passwords; assert each is rejected. |
| TC_036 | Spam/Junk folder check | **Manual** | Depends on real-world email provider (Gmail, Outlook) scoring; cannot be asserted in CI with smtp4dev. |

---

## 3. FEATURE: ACCOUNT SETTINGS (Sessions)

### 3.1 Session Management

| ID | Objective | Decision | Rationale |
|----|-----------|----------|-----------|
| TC_037 | View Active Sessions list | **Automate** | Log in, navigate to settings, assert session row exists with device/browser/IP/time. |
| TC_038 | Identify "Current Device" | **Automate** | Assert the current session row carries a "This device" badge. |
| TC_039 | Remote Logout (terminate session B) | **Automate** | Two browser contexts sharing creds; terminate B from A; assert B is redirected on next action. Directly covers YEH-79. |
| TC_040 | Logout all other sessions | **Automate** | Same as TC_039 across 3 contexts. |
| TC_041 | Password Change Session Sync | **Automate** | Covered jointly with TC_032 — can share fixtures. |

### 3.2 Security & Session

| ID | Objective | Decision | Rationale |
|----|-----------|----------|-----------|
| TC_042 | Multi-device login | **Automate** | Two browser contexts login successfully, both remain authenticated. |
| TC_043 | Session independence | **Automate** | Perform different actions in each context; assert no cross-interference. |
| TC_044 | Logout from one device only | **Automate** | Logout A, assert B still authenticated on refresh. |

### 3.3 Edge Cases

| ID | Objective | Decision | Rationale |
|----|-----------|----------|-----------|
| TC_045 | Session limit (N+1 device) | **Manual for now** | Automate only if a session-limit feature exists; current schema tracks sessions but doesn't appear to cap them. |
| TC_046 | Session info accuracy via VPN | **Manual** | Requires a real VPN egress. Cannot reliably simulate geolocation in CI. We can automate a narrower variant: assert the `ip` field is populated and matches the request's `X-Forwarded-For` in test. |
| TC_047 | Manual logout removes session from list | **Automate** | Logout on B, refresh list on A, assert row disappears. |
| TC_048 | Auto-cleanup of expired sessions | **Automate (conditional)** | Requires backend test hook to expire a session record. Without it → **manual**. Directly covers open bug YEH-84. |
| TC_049 | Action with expired session → redirect + cleanup | **Automate (conditional)** | Same dependency as TC_048. |

---

## 4. FEATURE: USER MANAGEMENT

### 4.1 UI/UX

| ID | Objective | Decision | Rationale |
|----|-----------|----------|-----------|
| TC_050 | User list displays columns | **Automate** | Assert table headers and at least one seeded row. |
| TC_051 | Search by name | **Automate** | Seed N users, search partial name, assert filtered list. |
| TC_052 | Search by email | **Automate** | Same as TC_051. |
| TC_053 | Empty search result shows message | **Automate** | Search a random string, assert empty-state text. |

### 4.2 Functional — Update & Permission

| ID | Objective | Decision | Rationale |
|----|-----------|----------|-----------|
| TC_054 | Admin updates other user info | **Automate** | High-value admin flow. |
| TC_055 | User updates own profile (name, not email) | **Automate** | Per spec note: email should NOT be self-editable. Lock that invariant in an assertion. |
| TC_056 | Normal user blocked from Admin URL | **Automate** | Log in as user, navigate to `/admin/users`, assert 403/redirect. |
| TC_057 | Duplicate email update | **Automate** | Seed two users; update A's email to B's; assert error. |

### 4.3 Deactivation

| ID | Objective | Decision | Rationale |
|----|-----------|----------|-----------|
| TC_058 | Admin deactivates a user | **Automate** | Toggle + assert status change. |
| TC_059 | Disabled user login blocked | **Automate** | Chained with TC_058. |
| TC_060 | Data integrity for disabled user | **Manual / backend test** | "Old activities remain intact" is a DB-level invariant — better as a backend integration test querying `ProjectMembership`, `Post`, etc. In E2E the assertion would be indirect and flaky. |
| TC_061 | Admin reactivates user | **Automate** | Chained with TC_058–TC_059. |

### 4.4 Security & Admin Constraints

| ID | Objective | Decision | Rationale |
|----|-----------|----------|-----------|
| TC_062 | Admin cannot change own role | **Automate** | UI-level assertion (button disabled or error on click). |
| TC_063 | Admin cannot deactivate self | **Automate** | Same as above. |
| TC_064 | Admin cannot delete self | **Automate** | Same as above. |
| TC_065 | API rejects self-destructive calls | **Automate** | Use Playwright's `request` fixture to hit the backend directly with admin JWT and assert 4xx. This protects against UI-only guards being bypassed. |

### 4.5 Edge Cases

| ID | Objective | Decision | Rationale |
|----|-----------|----------|-----------|
| TC_066 | Concurrent admin edit | **Automate (conditional)** | Achievable with two browser contexts, but timing-sensitive. Good candidate but write carefully to avoid flakiness; needs optimistic-concurrency support in the API (version field or `updatedAt` check). If BE doesn't support this yet → **manual**. |
| TC_067 | Special characters in name | **Automate** | Parametrized cases: accented chars (accept), HTML/JS injection (sanitize/reject). |
| TC_068 | Pagination with 100+ users | **Automate** | Seed users via backend API, then assert pagination controls and page count. |

---

## Summary

| Category | Count |
|----------|-------|
| Automate (unconditional) | **48** |
| Automate (conditional on infra hooks) | **8** (TC_013, TC_018, TC_031, TC_048, TC_049, TC_066, and minor variants) |
| Manual / out of E2E scope | **12** (TC_012, TC_036, TC_045, TC_046, TC_060 + partial overlaps) |

Recommended sequencing when implementing:
1. **Smoke / golden paths first:** TC_009, TC_011, TC_027–TC_029, TC_054, TC_058–TC_061.
2. **Validation & form errors:** TC_005–TC_008, TC_022–TC_024, TC_035, TC_057, TC_067.
3. **Session matrix (multi-context):** TC_032, TC_039, TC_040, TC_042–TC_044, TC_047.
4. **Admin guards:** TC_056, TC_062–TC_065.
5. **Bug-driven regression:** TC_034 (YEH-77), TC_039 (YEH-79), TC_048/TC_049 (YEH-84) — these have *known open bugs*, so automating them doubles as regression gates.
6. Leave conditional-on-hooks tests (TC_013, TC_031, TC_048) until the backend exposes a test-only expiry endpoint or a configurable short TTL.

---

## Recommended additional test cases

Gaps we'd add to the existing list:

| New ID | Objective | Why it's worth adding |
|--------|-----------|-----------------------|
| TC_069 | **Refresh token rotation** — after silent refresh, the old refresh token must be rejected | YeHub uses refresh tokens (7d). Rotation is a common source of subtle auth bugs; covers a whole class of regressions. |
| TC_070 | **Cross-tab logout** via `storage` event | `CLAUDE.md` explicitly calls this out as frontend auth behavior. Easy to automate with two tabs in the same context. |
| TC_071 | **Login while already logged in** (`<GuestOnly>` guard) | Verifies the login page redirects authenticated users away — the spec mentions this guard exists to prevent race conditions. |
| TC_072 | **Silent token refresh on 401** | Call an API after access token expires (short TTL in test env); assert the client auto-refreshes and retries without user-visible logout. |
| TC_073 | **Password reset while logged in on another device** — does the device survive or get kicked? | TC_032 covers "reset kicks other sessions" only if spec says so. Add explicit coverage documenting the chosen behavior. |
| TC_074 | **Disabled user with an active session** — what happens on the next request? | TC_059 only covers *login* by a disabled user. An already-authenticated disabled user should also be ejected on the next call (or not, depending on spec). Lock in the decision. |
| TC_075 | **Session row shows correct `lastActiveAt` after activity** | `Session` model tracks device metadata; asserting "last active" updates protects observability of sessions. |
| TC_076 | **Rate limiting on `/auth/login` and `/auth/forgot-password`** | Even without account lockout (TC_018), IP-based throttling is a common requirement. Automate via the `request` fixture: fire N requests, assert 429. |
| TC_077 | **Admin creates user → invitation email → first login / set-password flow** | TC_010 stops at "admin creates user then login." The real flow typically involves an invitation email and initial password setup — worth end-to-end coverage. |
| TC_078 | **Email case-insensitivity on login** | `User@Example.com` should log in the same as `user@example.com`. Bug YEH-73 ("Inconsistent email handling") is listed as fixed — pin it. |
| TC_079 | **Password whitespace-only rejected** | Directly covers fixed bug YEH-75 ("Password field accepts 'All Spaces'"). Adding this regression test prevents reopening. |
| TC_080 | **Role change propagation** — demoting an admin to user revokes `/admin/*` access on their next request | Complements TC_062 (self-role-change) with the inverse: changes made by a different admin. |

These additions largely harden what the existing suite only *implies*, and several of them map 1:1 onto bugs already listed in the `BUG` sheet of the workbook — giving the automation direct value as a regression safety net.
