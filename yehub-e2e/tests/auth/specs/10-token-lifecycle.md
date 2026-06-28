# 10 — Access / Refresh Token Lifecycle

**Scope:** Silent refresh behavior and the refresh-token contract. These are
recommended additions (not in the workbook) that lock in invariants of the
auth layer.
**Suggested file:** `yehub-e2e/tests/auth/10-token-lifecycle.spec.ts`
**Mode:** `serial` — each test depends on carefully controlled token state.

## Backend contract (verified 2026-04-20)

This feature relies on behavior that is not obvious from the API surface —
record it here so tests and future spec changes stay anchored.

| Item | Value |
|------|-------|
| Refresh endpoint | `POST /auth/refresh-token` |
| Request body | `{ refresh_token: string }` |
| Response body | `{ access_token: string }` — **no `refresh_token` field** |
| Rotation | **Not implemented.** The same refresh token keeps working across calls; its hash in `Session.refresh_token_hash` is never changed by the refresh flow. |
| Access-token TTL | Hardcoded `'5m'` in `auth.service.ts` (no env override) |
| Refresh-token TTL | Hardcoded `'7d'` in `auth.service.ts` (no env override) |
| Session idle timeout | `SESSION_IDLE_TIMEOUT_MS = 1h` — refresh fails if `last_active_at` is older |
| Invalidation | Refresh rejects once the session row is gone (logout, revoke, change-password, admin disable) |

**Implication for TC_069:** the spec asserts the shipped stateful-refresh
behavior — new access token per call, same refresh token reusable until the
session row is revoked. A future change to add rotation must update this TC
(and revisit `clearAllSessions` helpers that rely on RT reuse during test
cleanup).

**Implication for TC_072:** since TTL is not env-configurable, the test must
force the 401 itself — either by corrupting the stored access token or by
mocking one 401 with `page.route`.

**Preconditions for tests:**
- Each test file creates its own user via invite + activation (do not mutate
  `TEST_USER`'s tokens — other files depend on them).
- Use `page.evaluate(() => localStorage.getItem('yehub-auth'))` /
  `localStorage.setItem` to read and manipulate the stored auth state.

---

## TC_069 — Refresh issues a new access token and the refresh token remains valid

**Objective:** `POST /auth/refresh-token` issues a new access token, and the
caller's refresh token remains valid for subsequent refresh calls. The
response carries **only** `access_token` — the refresh token is stateful on
the backend and is not returned or rotated on use.
**Precondition:** File-scoped user created via invite + activation. Raw
tokens obtained by calling `POST /auth/login` against the API directly — do
not route through the UI.

**Steps:**
1. `POST /auth/login` with the file-scoped credentials → capture
   `access_token` (`at1`) and `refresh_token` (`rt1`).
2. Wait ≥1s (JWT `iat`/`exp` are second-resolution; otherwise the newly
   signed token may be byte-identical to `at1`).
3. `POST /auth/refresh-token` with `rt1`.
4. `POST /auth/refresh-token` with `rt1` **again**.

**Expected result:**
- Step 3 returns 200; response body has an `access_token` that differs from
  `at1` and **no `refresh_token` field**.
- Step 4 returns 200; response body again has only an `access_token` (no
  `refresh_token` field). Confirms the refresh token is not invalidated on
  use.

---

## TC_072 — Silent refresh on 401 retries transparently

**Objective:** When a protected API call returns 401 (invalid/expired access
token), the FE's Axios interceptor silently refreshes and retries — the user
sees no interruption.
**Precondition:** File-scoped user is logged in through the UI and landed on
`/`. `localStorage.yehub-auth` is populated with a valid `accessToken` +
`refreshToken`.

**Steps:**
1. Read `yehub-auth` from `localStorage`; replace the signature segment of
   `accessToken` with garbage (`token.split('.')` → mutate `[2]` → rejoin).
   Write it back. This forces the next protected call to 401 without touching
   the refresh token.
2. Navigate to a protected, data-driven page (e.g. `page.goto('/projects')`).
3. Attach `page.waitForResponse` listeners for:
   - `POST /auth/refresh-token` returning 200
   - The retried protected `GET` returning 200
4. Assert the page URL is still `/projects` (no redirect to `/login`) and the
   projects list rendered.

**Expected observed network sequence:**
```
GET  /auth/me            → 401   (because of corrupted access token)
POST /auth/refresh-token → 200   (interceptor kicks in)
GET  /auth/me            → 200   (retry with new access token)
GET  /projects?...       → 200   (page data fetch)
```

**Expected result:**
- The `POST /auth/refresh-token` fires automatically and returns 200.
- The originally failing `GET /auth/me` is retried and returns 200.
- UI stays on `/projects`, the page renders — no `/login` redirect, no error
  toast.
- `localStorage.yehub-auth` no longer holds the corrupted `accessToken`
  (the interceptor replaced it); the `refreshToken` field is byte-identical
  to the pre-test value (backend does not rotate — see TC_069).
- **Do not assert** `newAccessToken !== originalAccessToken`. JWT `iat` is
  second-resolution; if the refresh fires within the same second as the
  original sign, the two tokens are byte-identical. Assert "not the
  corrupted value" instead.

**Alternate approach (equivalent):** use `page.route` to fail the first
protected GET once with a 401, then `unroute` and let the normal flow
proceed. Prefer the localStorage-corruption approach — it exercises the real
interceptor/refresh round-trip against the live backend instead of a mock.

---

## Implementation notes

- Assert on **event ordering** (refresh happened, then retry succeeded), not
  on specific timings. Don't sleep waiting for the 5-minute TTL.
- Do not mutate `TEST_USER`'s tokens or sessions. Each test in this file owns
  its own invited user (follow the pattern in `08-active-sessions.spec.ts`).
- If rotation is ever added to the backend, update TC_069 to assert the new
  contract and revisit helpers that rely on refresh-token reuse (e.g.
  `clearAllSessions` in other spec files).
