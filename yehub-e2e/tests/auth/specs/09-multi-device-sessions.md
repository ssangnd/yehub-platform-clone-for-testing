# 09 — Multi-Device & Cross-Context Session Behavior

**Scope:** How independent browser contexts behave when the same user is logged in on multiple devices/tabs, including cross-tab logout and disabled-user ejection.
**Suggested file:** `yehub-e2e/tests/auth/multi-device-sessions.spec.ts`
**Mode:** `serial` for tests that span two contexts.

**Preconditions:**
- Dedicated test user seeded in `beforeAll`, deleted in `afterAll`.
- Each test creates its own `browser.newContext()` instances and closes them in `afterEach` / `afterAll`.

---

## TC_042 — Multi-device login succeeds on both devices

**Objective:** Logging in on Device B does not kick Device A off.
**Precondition:** Test user exists; two fresh contexts.
**Steps:**
1. Context A (simulate Chrome/PC): log in.
2. Context B (simulate Safari/mobile via `userAgent` override in `newContext`): log in with the same user.
3. Context A: `page.reload()` or hit a protected page.

**Expected result:**
- Context A remains authenticated — dashboard loads, no redirect.
- Context B is also authenticated.

---

## TC_043 — Session independence

**Objective:** Actions in one context don't mutate or cancel another.
**Precondition:** Both contexts logged in (from TC_042 or fresh).
**Steps:**
1. Context A: navigate to `/users`.
2. Context B: navigate to `/projects`.
3. Context A: perform a harmless action (e.g. open a dialog).
4. Context B: perform a different action.

**Expected result:**
- Neither context redirects to `/login`.
- Both contexts' URLs remain at their respective pages.
- No shared state bleed (e.g., Context A's modal doesn't appear in Context B).

---

## TC_044 — Logout from one device only

**Objective:** Logout in Context A does not log out Context B.
**Precondition:** Both contexts logged in.
**Steps:**
1. Context A: click logout.
2. Context B: reload or click a menu.

**Expected result:**
- Context A: URL is `/login`.
- Context B: remains on its current protected page; no redirect.

---

## TC_047 — Manual logout removes the session from the list

**Objective:** When Device B logs itself out, Device A's sessions list reflects the removal after refresh.
**Precondition:** Both contexts logged in; Context A has Active Sessions page open.
**Steps:**
1. Context B: click logout.
2. Context A: wait briefly, then refresh the sessions list.

**Expected result:**
- Context B's row is no longer present in the list on Context A.
- Only the "This device" row remains.

---

## TC_070 — Cross-tab logout via the `storage` event (recommended)

**Objective:** Two tabs in the **same** browser context stay in sync when one logs out.
**Precondition:** Single context; open two tabs (`context.newPage()` twice), both authenticated.
**Steps:**
1. Tab 1: click logout.
2. Tab 2: perform any action (click a menu, navigate).

**Expected result:**
- Tab 2 redirects to `/login` automatically — triggered by the `storage` event listener described in `CLAUDE.md`.
- `localStorage.yehub-auth` is cleared in both tabs.

**Note:** This is different from TC_044 (which uses two separate contexts). `storage` events only fire within the same origin + same browsing context group.

---

## TC_074 — Disabled user with an active session is ejected on next request (recommended)

**Objective:** An already-logged-in user whose account gets disabled cannot continue operating.
**Precondition:** Two contexts: `adminContext` (logged in as admin) and `victimContext` (logged in as the test user).
**Steps:**
1. `adminContext`: navigate to User Management and disable the test user.
2. `victimContext`: perform any action that triggers a backend call (e.g. `page.reload()` on a protected page, or click a menu that fetches data).

**Expected result:**
- `victimContext` is redirected to `/login`, OR the next API call returns 401/403 and the client logs out.
- The exact behavior depends on whether the BE validates `user.isActive` on every request. If today the BE only checks it at login (stateless JWT), this test will expose that gap — mark `test.fixme()` if so.

---

## Implementation notes

- To simulate different devices in TC_042, pass `userAgent` to `browser.newContext({ userAgent: 'Mozilla/5.0 (iPhone; ...) ...' })`.
- For TC_070, reuse a single `browser.newContext()` and open multiple pages on it — do NOT use `browser.newContext()` twice.
- For TC_074, the test user must be restored (re-enabled) in `afterEach` if reused.
- Always close contexts in `afterEach` to prevent context leaks across tests.
