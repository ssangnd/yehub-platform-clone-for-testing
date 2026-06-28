# Session Hardening Design

**Date:** 2026-04-11
**Status:** Approved for planning
**Scope:** `yehub-be/` and `yehub-fe/` — auth and session management

## Problem

Four user-facing issues trace back to a single architectural choice: `JwtStrategy.validate()` is stateless. It does not verify the session row exists on each request, so revoked sessions and password changes do not propagate for up to 5 minutes (the access token TTL).

1. **Password change does not invalidate existing sessions immediately.** Other devices stay authenticated until their access token expires.
2. **Revoking a session from the Active Sessions UI does not force the target device to log out.** The row is deleted, but its access token stays valid.
3. **Sessions live for days, violating the 1-hour timeout requirement.** Refresh tokens are valid for 7 days with no idle check.
4. **No account lockout.** A user can be brute-forced indefinitely; only IP-based throttling (5/60s) is in place.

## Decisions

Captured during brainstorming (2026-04-11):

- **Session validation:** Stateful check against Postgres on every authenticated request. Not Redis.
- **Idle timeout:** 1-hour sliding window, anchored to `Session.last_active_at`.
- **`last_active_at` write cadence:** Updated only on `/auth/refresh-token`, not on every request.
- **Lockout threshold:** 5 consecutive failed login attempts.
- **Lockout counter reset:** Any successful login resets to 0.
- **Unlock policy:** Admin-only. Locked account's `status` flips to `INACTIVE`; admin reactivates via the existing user-management status-change endpoint.
- **Failed-login feedback:** Visible countdown — the error response includes `attempts_remaining`. Enumeration leak via countdown is accepted; the existing IP throttler is the enumeration defense.
- **Testing scope:** Backend Jest unit + integration tests. No new e2e tests.

## Architecture

### Root fix — stateful `JwtStrategy`

Every authenticated request performs an indexed session lookup that also enforces the idle timeout:

```sql
SELECT id, user_id, last_active_at
FROM sessions
WHERE id = $1
  AND user_id = $2
  AND last_active_at > now() - interval '1 hour'
```

If no row is returned, the request is rejected with 401. This single change fixes issues #1, #2, and #3 simultaneously — revocation, password change propagation, and idle timeout all flow through the same choke point.

### Data model changes

`User` gains three columns:

```prisma
model User {
  // ... existing fields ...
  failed_login_attempts  Int       @default(0)
  locked_at              DateTime?
  locked_reason          String?
}
```

- `failed_login_attempts` — incremented on each wrong-password attempt, reset to 0 on successful login or password change.
- `locked_at` — timestamp set when auto-lockout triggers. Admin UI can surface this to distinguish auto-lockout from manual deactivation.
- `locked_reason` — string tag, initially `"too_many_failed_attempts"` or `null`.

`Session` is unchanged. `last_active_at` already exists and serves as the idle-timeout anchor.

Migration is safe for existing rows (defaults + nullable columns). No backfill.

### Config constants

New file `yehub-be/src/auth/auth.constants.ts`:

```typescript
export const SESSION_IDLE_TIMEOUT_MS = 60 * 60 * 1000  // 1 hour
export const MAX_FAILED_LOGIN_ATTEMPTS = 5
```

Policy, not deployment config — lives in code, not env.

## Backend Flows

### `JwtStrategy.validate()`

Replace the existing stateless implementation with:

```typescript
async validate(payload: JwtPayload) {
  const session = await this.prisma.session.findFirst({
    where: {
      id: payload.sessionId,
      user_id: payload.sub,
      last_active_at: { gt: new Date(Date.now() - SESSION_IDLE_TIMEOUT_MS) },
    },
    select: {
      id: true,
      user: { select: { id: true, email: true, role: true, status: true } },
    },
  })
  if (!session) throw new UnauthorizedException('Session expired or revoked')
  if (session.user.status !== UserStatus.ACTIVE) {
    throw new UnauthorizedException('Account inactive')
  }
  return {
    id: session.user.id,
    email: session.user.email,
    role: session.user.role,
    sessionId: session.id,
  }
}
```

The outdated "stateless tradeoff" comment is removed.

### `AuthService.login()` — lockout logic

1. Look up user by email.
2. If user not found → throw `UnauthorizedException('Invalid email or password')` with no counter side effects. Non-existent emails do not get a countdown.
3. If `user.status === INACTIVE` → throw `UnauthorizedException('Account locked. Please contact an administrator.')` with `{ locked: true }` in the response body. No counter touch.
4. Bcrypt-compare password.
5. **On mismatch:**
   - Atomically increment `failed_login_attempts` via Prisma `update({ data: { failed_login_attempts: { increment: 1 } } })`.
   - If the returned count is ≥ `MAX_FAILED_LOGIN_ATTEMPTS`, transition in the same transaction: `status = INACTIVE`, `locked_at = now()`, `locked_reason = 'too_many_failed_attempts'`. Delete all existing sessions for this user (`deleteMany`). Throw `UnauthorizedException` with `{ locked: true }`.
   - Otherwise throw `UnauthorizedException('Invalid email or password')` with `{ attempts_remaining: MAX_FAILED_LOGIN_ATTEMPTS - count }`.
6. **On match:** inside a transaction — reset `failed_login_attempts = 0`, create the `Session` row, generate tokens, return. `last_login_at` is updated as today.

The atomic `increment` update eliminates the race where two simultaneous wrong-password attempts both read count=4 and both trigger lockout on the 5th — the DB serializes the increments.

### `AuthService.refreshToken()` — idle-timeout check

```typescript
const session = await this.prisma.session.findUnique({ where: { id: payload.sessionId } })
if (!session) throw new UnauthorizedException('Session revoked')

const cutoff = new Date(Date.now() - SESSION_IDLE_TIMEOUT_MS)
if (session.last_active_at < cutoff) {
  await this.prisma.session.delete({ where: { id: session.id } })
  throw new UnauthorizedException('Session expired due to inactivity')
}

// existing bcrypt check on refresh_token_hash ...

await this.prisma.session.update({
  where: { id: session.id },
  data: { last_active_at: new Date() },
})
```

`last_active_at` is updated only here. That is the sliding-window heartbeat.

**Dependency:** this design requires the access token TTL (currently 5 minutes) to remain significantly shorter than `SESSION_IDLE_TIMEOUT_MS` (1 hour). If the access token TTL is ever raised to approach or exceed the idle timeout, an actively-browsing user would stop triggering refreshes often enough to keep `last_active_at` fresh, and they would be wrongly logged out for inactivity. If the access token TTL needs to change, this assumption must be revisited.

### `AuthService.changePassword()`

Existing behavior stays — delete all sessions where `id != currentSessionId`. Add `failed_login_attempts: 0` reset to the user update done in the same method. With stateful `JwtStrategy` now in place, the other devices are booted on their next request.

### `AuthService.revokeSession()` / `revokeAllOtherSessions()`

No code changes. The existing `delete` / `deleteMany` calls already drop the session rows; stateful validation makes revocation take effect on the target device's next request.

### Admin reactivate path

The existing admin user-status-change endpoint (location to be confirmed during implementation — likely in `users.service.ts`) must be extended: when a user transitions `INACTIVE → ACTIVE`, also clear `failed_login_attempts = 0`, `locked_at = null`, `locked_reason = null`. No new endpoint is needed.

## Frontend Changes

### `yehub-fe/src/pages/login.tsx`

Handle three error response shapes:

| Backend response | UI |
|---|---|
| `{ message: 'Invalid email or password', attempts_remaining: 3 }` | Inline red error: `"Invalid email or password. 3 attempts remaining before lockout."` |
| `{ message: 'Invalid email or password' }` (no `attempts_remaining`) | Inline red error: `"Invalid email or password."` (used for non-existent emails) |
| `{ message: '...', locked: true }` | Red alert banner: `"Your account has been locked due to too many failed login attempts. Please contact an administrator to unlock it."` |

No Zod schema or form field changes.

### `yehub-fe/src/api/client.ts`

The existing 401 interceptor already calls `clearAuth()` and redirects to `/login` when the refresh call itself returns 401. With stateful validation, most 401s on protected endpoints will now trigger a refresh attempt that fails because the session row is gone — the existing fallback path handles this correctly.

Add a toast on the forced-logout redirect: `"Your session has expired. Please log in again."` so users understand why they were kicked out.

### `yehub-fe/src/pages/MyAccountPage/SessionsCard.tsx`

No code changes. The UI already invalidates the React Query cache on revoke; the only "bug" was that the revoked device stayed authenticated, which is now fixed in the backend.

### `yehub-fe/src/store/auth.store.ts`

No changes.

## Error Handling & Edge Cases

- **Concurrent wrong-password attempts at count=4.** Prevented by Prisma's atomic `increment` — the database serializes, so exactly one attempt sees count=5 and triggers lockout.
- **Revocation between `JwtStrategy.validate()` and the actual DB operation.** Sub-millisecond window, accepted.
- **Password change mid-flight for another device.** Other device's in-flight request may slip through. Next request from that device fails at `JwtStrategy.validate()`.
- **Session deleted while client is mid-refresh.** `refreshToken()` throws 401; axios interceptor catches it on the refresh call and logs out. Already handled.
- **Clock skew.** Idle-timeout comparison crosses Node and Postgres clocks. 1-hour window has plenty of slack for typical NTP drift. Not guarded.
- **Admin locks themselves out via failed logins.** Possible; requires another admin to reactivate. Documented; no escape hatch.
- **Manual admin deactivation.** When an admin flips a user to `INACTIVE` for non-lockout reasons, the existing endpoint should also call `prisma.session.deleteMany({ where: { user_id } })` so the user is booted immediately. Verified and added during implementation if not already present.
- **Email enumeration via countdown.** Accepted. Non-existent emails return generic "Invalid email or password" with no countdown; valid emails return a countdown. An observer can distinguish. The existing IP throttler (5/60s) is the enumeration defense; the product does not hide account existence.

## Testing Strategy

Backend Jest unit + integration tests only. Per project instruction, no new e2e tests.

### `auth.service.spec.ts`

- Login: failed attempt increments counter and returns `attempts_remaining`
- Login: successful login resets `failed_login_attempts` to 0
- Login: 5th consecutive failure flips `status = INACTIVE`, sets `locked_at`, `locked_reason = 'too_many_failed_attempts'`
- Login: attempt on already-locked account returns `{ locked: true }` without touching the counter
- Login: attempt on non-existent email returns generic error with no counter side effects
- Refresh: session with `last_active_at` older than 1 hour is deleted and throws
- Refresh: valid refresh updates `last_active_at` to `now()`
- Refresh: missing/revoked session throws
- Change password: deletes other sessions, keeps current session, resets `failed_login_attempts`

### `jwt.strategy.spec.ts`

- Valid session + active user → returns user context
- Missing session (revoked) → throws
- Session with stale `last_active_at` → throws
- Session exists but user is `INACTIVE` → throws
- Session belongs to a different user than the JWT payload → throws

### `auth.controller` integration

- `POST /auth/login` wrong password returns `{ attempts_remaining: 4 }` shape
- `DELETE /auth/sessions/:id` — subsequent request with the revoked session's access token returns 401 (proves immediate invalidation)

### Users service (existing test file)

- Admin INACTIVE → ACTIVE transition clears `failed_login_attempts`, `locked_at`, `locked_reason`
- Admin ACTIVE → INACTIVE transition deletes all sessions for that user

## Out of Scope

- Redis-backed session cache (considered, rejected in favor of Postgres single source of truth).
- Refresh token rotation.
- Per-session device fingerprinting beyond existing IP/user-agent.
- Audit log table for login attempts. Can be added later if compliance demands.
- Frontend unit tests (none exist in `yehub-fe/` today).
- E2E test coverage.
- Separate admin unlock endpoint (existing status-change endpoint is extended instead).
