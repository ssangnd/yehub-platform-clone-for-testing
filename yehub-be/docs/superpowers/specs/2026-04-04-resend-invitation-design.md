# Resend Invitation Email — Design Spec

## Overview

Add the ability for admins to resend invitation emails to users who haven't yet accepted their invitation. Introduces a `UserStatus` enum to replace the `active` boolean, and a new resend endpoint that invalidates the previous invitation link.

## Requirements

- New `UserStatus` enum (`INVITED`, `ACTIVE`, `INACTIVE`) replaces `active: boolean`
- New `POST /admin/users/:id/resend-invitation` endpoint (admin only)
- Resending generates a new token, invalidating the old one (implicit via overwrite)
- Resets the 24-hour expiry timer on each resend
- 5-minute cooldown between resends per user
- Resend only allowed for users with `status: INVITED`
- Existing invitation expiry changed from 48 hours to 24 hours

## Schema Changes

### New Enum

```prisma
enum UserStatus {
  INVITED
  ACTIVE
  INACTIVE
}
```

### User Model

- **Remove:** `active Boolean @default(true)` and `@@index([active])`
- **Add:** `status UserStatus @default(ACTIVE)` and `@@index([status])`
- **Add:** `invitation_sent_at DateTime?`
- **Keep:** all existing invitation fields (`invitation_token_hash`, `invitation_expires_at`, `invitation_accepted_at`, `invited_by`)

No data migration needed — runs on a fresh database.

## New Endpoint: Resend Invitation

**Route:** `POST /admin/users/:id/resend-invitation`

**Guards:** `JwtAuthGuard` + `GlobalRolesGuard` (ADMIN only)

### Validation

| Check | Status | Message |
|-------|--------|---------|
| User not found | 404 | `User not found` |
| User status is not `INVITED` | 400 | `User is not in invited status` |
| Resend within 5-min cooldown | 429 | `Please wait before resending. You can resend after X minutes.` |

### Logic

1. Fetch user by ID
2. Validate status is `INVITED`
3. Check `invitation_sent_at` is older than 5 minutes
4. Generate new raw token via `crypto.randomBytes(32).toString('hex')`
5. Hash token with bcrypt (10 rounds)
6. Update user: new `invitation_token_hash`, `invitation_expires_at` = now + 24h, `invitation_sent_at` = now
7. Send invitation email with new token link via `MailService.sendInvitation()`
8. Return `{ message: 'Invitation resent successfully' }`

Old token is invalidated implicitly — the hash is overwritten.

## Changes to Existing Flows

### `inviteUser` (AdminService)

- Create user with `status: 'INVITED'` instead of `active: false`
- Set `invitation_sent_at: new Date()` alongside other invitation fields
- Change expiry from 48h to 24h

### `validateInvitationToken` (AuthService)

- Query filter: `status: 'INVITED'` instead of `active: false`

### `acceptInvitation` (AuthService)

- Set `status: 'ACTIVE'` instead of `active: true`

### User listing (`GET /admin/users`)

- Replace `active` field with `status` in response
- Frontend uses `status === 'INVITED'` to show the resend button

### Login / auth guards

- Check `status: 'ACTIVE'` instead of `active: true`

### Mail template

- Update expiry note from "48 hours" to "24 hours"

## Constants

- `INVITATION_EXPIRY_HOURS = 24` (changed from 48)
- `RESEND_COOLDOWN_MINUTES = 5` (new)

## Response Contracts

### Resend success

```json
{ "message": "Invitation resent successfully" }
```

### Updated user list item

```json
{
  "id": "uuid",
  "email": "user@example.com",
  "name": "John Doe",
  "role": "AUTHORIZED_USER",
  "status": "INVITED",
  "last_login_at": null,
  "created_at": "2026-04-04T00:00:00.000Z",
  "avatar": null,
  "project_count": 0
}
```

## Approach

**Minimal in-place token rotation** — no new tables, no queue. Token invalidation is implicit via overwrite of `invitation_token_hash`. Cooldown tracked via `invitation_sent_at` field on the User model.
