# Session Management Design

## Problem

The current auth system stores a single `refresh_token_hash` on the `User` model. This means:

- Only one refresh token is valid at a time (last login wins)
- Logout clears `refresh_token_hash`, killing all sessions across all devices
- Tabs in the same browser share `localStorage` but have no cross-tab sync — logging out in one tab does not redirect the other

## Requirements

1. **Multi-device login** — users can be logged in from multiple browsers/devices simultaneously
2. **Per-device logout** — logging out from one device does not affect other devices
3. **Logout all** — users can revoke all other sessions from Account Settings
4. **Session visibility** — display active sessions with device, OS, IP, location, and last active time
5. **Same-browser tab sync** — logging out in one tab instantly redirects all other tabs to login
6. **Individual session revocation** — users can revoke any specific session from the session list

## Data Model

### New `Session` model

```prisma
model Session {
  id                 String   @id @default(uuid()) @db.Uuid
  user_id            String   @db.Uuid
  refresh_token_hash String
  device_name        String
  os_name            String
  ip_address         String
  location           String?
  last_active_at     DateTime @default(now())
  created_at         DateTime @default(now())

  user User @relation(fields: [user_id], references: [id], onDelete: Cascade)

  @@index([user_id])
  @@map("sessions")
}
```

### Changes to `User` model

- Remove `refresh_token_hash` column
- Add `sessions Session[]` relation

### JWT payload change

The refresh token and access token payloads include `sessionId`:

```typescript
{ sub: userId, sessionId: string, email: string, role: GlobalRole }
```

## Backend Changes

### Dependencies

- `ua-parser-js` — User-Agent parsing (browser name/version, OS name/version)
- `geoip-lite` — in-memory MaxMind GeoLite2 IP geolocation (city-level, no external API)

### Login (`POST /auth/login`)

1. Validate credentials (unchanged)
2. Parse `User-Agent` header with `ua-parser-js` to extract browser and OS
3. Extract client IP from `req.ip` or `X-Forwarded-For`
4. Resolve IP to city/country via `geoip-lite`
5. Create `Session` row with bcrypt-hashed refresh token and device metadata
6. Sign refresh token JWT with `{ sub, sessionId, email, role }`
7. Sign access token JWT with `{ sub, sessionId, email, role }`
8. Return `{ access_token, refresh_token }`

### Refresh token (`POST /auth/refresh-token`)

1. Verify refresh token JWT signature
2. Find session by `sessionId` from payload
3. If session not found, return 401 (session was revoked)
4. Verify refresh token against `session.refresh_token_hash` with bcrypt
5. Update `session.last_active_at`
6. Return new access token

### Logout (`POST /auth/logout`)

1. Extract `sessionId` from the current access token (via JWT guard)
2. Delete that session row

### New endpoints

#### `GET /auth/sessions`

Returns all sessions for the current user. Each session includes:

```typescript
{
  id: string
  device_name: string
  os_name: string
  ip_address: string
  location: string | null
  last_active_at: string
  created_at: string
  is_current: boolean  // true if session.id matches the request's sessionId
}
```

#### `DELETE /auth/sessions/:sessionId`

Revoke a specific session. Must belong to the current user. Cannot revoke the current session (use logout instead).

#### `DELETE /auth/sessions`

Revoke all sessions except the current one.

### Password change (`PATCH /auth/me/password`)

Delete all sessions except current to force re-login on other devices.

### Password reset (`POST /auth/reset-password`)

Delete all sessions (user is not logged in during reset, so there is no "current" session). The user must re-login after resetting.

### JwtStrategy update

`JwtPayload` interface and `validate()` method updated to include `sessionId`. The `CurrentUser` decorator exposes `sessionId` alongside `id`, `email`, and `role`.

## Frontend Changes

### Active session guard on public auth pages

**Problem:** Public auth pages (`/login`, `/forgot-password`, `/reset-password`, `/invitation/:token`) have no guard against authenticated users. If a user opens two tabs on the login page and logs in with different accounts, it causes a race condition in localStorage — the second login overwrites the first session's tokens. The same applies to reset-password and invitation acceptance while already logged in.

**Solution:** A `GuestOnly` wrapper component that detects an active session (via `useAuthStore.isAuthenticated()`) and renders a full-page overlay instead of the underlying form. The overlay shows:

- Message: "You're currently logged in as **{email}**"
- Two buttons: "Go to Dashboard" (navigates to `/`) and "Logout & Continue" (calls `clearAuth()`, which clears localStorage, triggers cross-tab sync, and reveals the underlying form)

This applies uniformly to all four public auth pages. The overlay completely replaces the page content — the form is not rendered while the overlay is visible, preventing any interaction or API calls.

The `GuestOnly` component wraps the public auth routes in the router, mirroring how `AuthOnly` wraps protected routes.

### Tab sync

Add a `storage` event listener during auth store initialization. When another tab clears the `yehub-auth` localStorage key (i.e. `accessToken` becomes `null`), redirect to `/login`. This provides instant cross-tab logout since all tabs in the same browser share localStorage.

### Account Settings — Sessions UI

Two sections:

1. **Current Session** (top) — displays device, OS, IP, location, last active. "This device" badge. No revoke button.
2. **Other Sessions** (below) — list of all other sessions with the same metadata. Each row has a "Revoke" button. A "Revoke all other sessions" button appears at the top of this section.

### API integration

- Page load: `GET /auth/sessions`
- Revoke one: `DELETE /auth/sessions/:id` with optimistic removal from list
- Revoke all others: `DELETE /auth/sessions` with optimistic clear of the list

### Logout flow

Unchanged — `POST /auth/logout` deletes the session row server-side, `clearAuth()` clears localStorage (triggers `storage` event for other tabs).

### Access token payload

`JwtPayload` interface on the frontend does not need changes — `sessionId` is used server-side only. The frontend identifies the current session from the `is_current` flag in the sessions API response.

### Session revocation window

Access tokens are stateless JWTs with a **5-minute** expiry. The `JwtStrategy.validate()` does not check whether the session still exists in the database — this is an intentional tradeoff to avoid a DB query on every authenticated request. A revoked session's access token remains valid until it expires (max 5 minutes). The refresh token flow, which runs every 5 minutes, does verify session validity and will reject revoked sessions.

## Migration Strategy

1. Create `sessions` table
2. Drop `refresh_token_hash` column from `users` table

This is a breaking change — all existing sessions are invalidated. Users must re-login. Acceptable for a pre-production demo branch.

## Dependencies

| Package | Purpose | Size |
|---------|---------|------|
| `ua-parser-js` | User-Agent parsing | ~17KB |
| `geoip-lite` | MaxMind GeoLite2 in-memory IP lookup | ~60MB memory |

No frontend dependencies added.

## Testing

### Unit tests

- Login creates a session row with correct metadata
- Refresh token looks up session and updates `last_active_at`
- Refresh with revoked session returns 401
- Logout deletes only the current session
- Revoke specific session deletes correct row
- Revoke all sessions deletes all except current
- Password change/reset deletes all sessions except current

### Manual testing

- Login from two browsers — both appear in sessions list
- Revoke one — that browser gets 401 on next refresh
- Logout — other browser sessions unaffected
- Same browser two tabs — logout one, other redirects instantly
- "Revoke all" — all other devices get 401
