# 08 — Account Settings: Active Sessions & Remote Logout

**Scope:** The "Active Sessions" list in Account Settings — view, identify current device, terminate individual sessions, terminate all others, password-change sync, last-active timestamp.
**Suggested file:** `yehub-e2e/tests/auth/active-sessions.spec.ts`
**Mode:** `serial` for tests that share multi-context state.

**Preconditions:**
- Dedicated test user seeded in `beforeAll`, deleted in `afterAll`.
- Navigate to the account settings / sessions page (confirm the exact path in the FE router — e.g. `/settings/sessions` or similar).
- Helper: a `loginInNewContext(browser, user)` that returns `{ context, page }` for multi-device scenarios.

---

## TC_037 — View Active Sessions list

**Objective:** The sessions list displays the current session with required metadata.
**Precondition:** Logged in as the test user.
**Steps:**
1. Navigate to the Active Sessions page.

**Expected result:**
- At least one row is rendered.
- Each row shows: device/browser, IP or location, and a login/last-active timestamp.
- Assert via `page.getByRole('table')` (or whatever wrapper exists) and count rows.

---

## TC_038 — "This device" label on current session

**Objective:** The row for the current session is clearly flagged.
**Precondition:** On the Active Sessions page after a fresh login.
**Steps:**
1. Observe the session rows.

**Expected result:**
- Exactly one row contains a "This device" / "Current" badge or styling.
- All other rows (if any) do not carry that label.

---

## TC_039 — Remote logout: terminate a specific session

**Objective:** Clicking "Logout" on another device's row forces it to log out.
**Precondition:** Two contexts A and B both logged in as the test user.
**Steps:**
1. Context A: open Active Sessions page — two rows should be visible.
2. Context A: click "Logout" / "Terminate" on Context B's row; confirm the dialog if present.
3. Context B: trigger a navigation (e.g. `page.reload()`) or click any menu item.

**Expected result:**
- Context A sees Context B's row disappear (or marked terminated).
- Context B redirects to `/login` on its next action.
- Covers regression fixed in bug **YEH-79** ("Active sessions remain authenticated after being revoked").

---

## TC_040 — Logout all other sessions

**Objective:** A single action terminates every other device.
**Precondition:** Three contexts A, B, C logged in as the same test user.
**Steps:**
1. Context A: click "Logout all other sessions" and confirm.

**Expected result:**
- Context A remains authenticated.
- Contexts B and C are logged out on their next action (both redirect to `/login`).
- After a refresh on Context A, only one row (itself) remains in the list.

---

## TC_041 — Password change invalidates other sessions

**Objective:** Changing the password forces re-login on other devices.
**Precondition:** Three contexts A, B, C logged in.
**Steps:**
1. Context A: change password via account settings (`/settings/password` or similar).
2. Contexts B and C: perform any action.

**Expected result:**
- Contexts B and C redirect to `/login`.
- Context A remains authenticated.
- If product decision is to log out **all** devices including A: invert the assertion accordingly. Match the spec.

---

## TC_075 — Session row's last-active timestamp updates on activity (recommended)

**Objective:** The "last active" field reflects recent activity.
**Precondition:** Two contexts A and B logged in.
**Steps:**
1. Context A: navigate to Active Sessions page, read B's last-active timestamp → `t1`.
2. Context B: perform an action (e.g. fetch any protected resource) — wait ~30 seconds for the BE to persist the update.
3. Context A: refresh the Active Sessions page, read B's last-active timestamp → `t2`.

**Expected result:**
- `t2 > t1`.
- If the BE does not yet update `lastActiveAt` on every request, mark the test as `test.fixme()` and link an issue — do not delete it.

---

## Implementation notes

- Use `browser.newContext()` explicitly for each device. Do NOT reuse the same context across devices — Playwright shares storage state within a context.
- Add a small `waitForResponse` after each logout/terminate to avoid racing the list-refresh.
- For TC_041, the password-change flow shares logic with spec 07 (TC_032); consider extracting a shared helper.
- Bugs directly covered: **YEH-79** (TC_039), potentially **YEH-84** (if you extend TC_040 to cover expired-session cleanup — see spec 09 TC_074-adjacent logic).
