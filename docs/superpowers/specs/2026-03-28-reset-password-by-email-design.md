# Reset Password by Email — Design Spec

**Date:** 2026-03-28
**Branch:** feat/rbac-refactor

---

## Overview

Complete the existing password reset flow. The backend endpoints already exist and the reset token logic is implemented. The gap is: (1) the reset email is never sent (it's a `// TODO`), and (2) the frontend has no pages for the forgot-password or reset-password flows.

No database migrations, no new endpoints, no schema changes required.

---

## Backend

### `MailService` — new method

Add `sendPasswordReset(email: string, name: string, resetLink: string)` to `yehub-be/src/mail/mail.service.ts`.

- **Dev fallback:** when `this.transporter` is null (no SMTP configured), log via `this.logger.warn(...)` — same pattern as `sendInvitation`.
- **Subject:** `"Reset your YeHub password"`
- **HTML body:** greeting with user's name, reset link as an `<a>` tag, note that it expires in 15 minutes.

### `AuthService` — wire up the TODO

In `forgotPassword()` (`yehub-be/src/auth/auth.service.ts`):

1. Inject `MailService` and `ConfigService` into the constructor.
2. Build the reset link: `${config.get('FRONTEND_URL')}/reset-password?token=${resetToken}`
3. Call `this.mail.sendPasswordReset(user.email, user.name, resetLink)` — **do not `await`**. Fire-and-forget prevents timing-based email enumeration (the response returns immediately regardless of email success).
4. Remove the `console.log` dev fallback — the `MailService` dev fallback handles logging.

`MailModule` is already `@Global()` so no import changes needed in `AuthModule`.

### Token verification (existing, unchanged)

`resetPassword()` already:
- Verifies JWT signature + expiry via `jwtService.verify(token)` (15-minute window)
- Checks `payload.type === 'password_reset'` to prevent auth token misuse
- Looks up user by `payload.sub`, checks `active`
- Hashes and saves new password, clears `refresh_token_hash` (invalidates all sessions)

**Known limitation:** JWT tokens are not invalidated after first use. A second use within the 15-minute window would overwrite the password again. Acceptable for this use case given the short TTL.

---

## Frontend

### `authApi` — two new calls

In `yehub-fe/src/api/auth.ts`:

```ts
forgotPassword: (email: string) =>
  apiClient.post('/auth/forgot-password', { email }).then((r) => r.data),

resetPassword: (token: string, newPassword: string) =>
  apiClient
    .post('/auth/reset-password', { token, new_password: newPassword })
    .then((r) => r.data),
```

### `schemas.ts` — two new Zod schemas

In `yehub-fe/src/lib/schemas.ts`:

```ts
forgotPasswordSchema = z.object({
  email: z.email(),
})

resetPasswordSchema = z.object({
  new_password: z.string().min(8, 'Password must be at least 8 characters'),
  confirm_password: z.string(),
}).refine((data) => data.new_password === data.confirm_password, {
  message: 'Passwords do not match',
  path: ['confirm_password'],
})
```

### New pages

#### `ForgotPasswordPage` — `/forgot-password`

- Card layout (same as login page: `max-w-sm`, centered)
- Single email field + submit button
- On success **or** error (404): always show the same message — `"If that email exists, a reset link has been sent."` — to prevent email enumeration
- "Back to sign in" link below the card

#### `ResetPasswordPage` — `/reset-password`

- Reads `token` from `useSearchParams()` (`?token=xxx`)
- If no token in URL: show an error card — "Invalid or missing reset link. Please request a new one." with a link to `/forgot-password`
- Form: new password + confirm password fields
- On success: show success state (CheckCircle icon), toast `"Password reset successfully"`, 3-second countdown redirect to `/login` — same pattern as `InvitationPage`
- On error (401/400 from API): show inline error — "This reset link is invalid or has expired. Please request a new one." with link to `/forgot-password`

### Router changes

In `yehub-fe/src/router.tsx`, add two public routes (outside `ProtectedRoute`):

```ts
{ path: '/forgot-password', element: <ForgotPasswordPage /> },
{ path: '/reset-password',  element: <ResetPasswordPage /> },
```

### Login page

In `yehub-fe/src/pages/login.tsx`, add a "Forgot password?" link inside the password field label row (the `div` with `flex items-center justify-between` already exists for this purpose):

```tsx
<Link to="/forgot-password" className="text-sm text-muted-foreground hover:underline">
  Forgot password?
</Link>
```

---

## UX Flow

```
Login page
  └─ "Forgot password?" link
       └─ /forgot-password
            ├─ user enters email → POST /auth/forgot-password
            ├─ always shows: "If that email exists, a reset link has been sent."
            └─ [email received]
                  └─ link: /reset-password?token=<jwt>
                        ├─ user enters new password → POST /auth/reset-password
                        ├─ success → countdown → /login
                        └─ invalid/expired token → error card → link back to /forgot-password
```

---

## Files Changed

| File | Change |
|------|--------|
| `yehub-be/src/mail/mail.service.ts` | Add `sendPasswordReset()` |
| `yehub-be/src/auth/auth.service.ts` | Inject `MailService` + `ConfigService`, wire up email in `forgotPassword()` |
| `yehub-fe/src/api/auth.ts` | Add `forgotPassword` and `resetPassword` |
| `yehub-fe/src/lib/schemas.ts` | Add `forgotPasswordSchema` and `resetPasswordSchema` |
| `yehub-fe/src/pages/forgot-password.tsx` | New page |
| `yehub-fe/src/pages/reset-password.tsx` | New page |
| `yehub-fe/src/router.tsx` | Add two public routes |
| `yehub-fe/src/pages/login.tsx` | Add "Forgot password?" link |
