# Reset Password by Email — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the existing password reset flow — wire up the reset email on the backend and add forgot-password / reset-password pages on the frontend.

**Architecture:** Backend: add `sendPasswordReset()` to `MailService`, inject it into `AuthService.forgotPassword()` (fire-and-forget). Frontend: two new public pages (`/forgot-password`, `/reset-password`), two new API calls, two new Zod schemas, and a "Forgot password?" link on the login page.

**Tech Stack:** NestJS 11, Prisma, Nodemailer, React 19, React Router v7, React Hook Form, Zod, TanStack Query, shadcn/Tailwind, Jest (backend), pnpm

---

## File Map

| File | Action |
|------|--------|
| `yehub-be/src/mail/mail.service.ts` | Add `sendPasswordReset()` method |
| `yehub-be/src/mail/mail.service.spec.ts` | Create — unit tests for `sendPasswordReset` |
| `yehub-be/src/auth/auth.service.ts` | Inject `MailService` + `ConfigService`, wire email in `forgotPassword()` |
| `yehub-be/src/auth/auth.service.spec.ts` | Create — unit tests for `forgotPassword` |
| `yehub-fe/src/api/auth.ts` | Add `forgotPassword` and `resetPassword` calls |
| `yehub-fe/src/lib/schemas.ts` | Add `forgotPasswordSchema` and `resetPasswordSchema` |
| `yehub-fe/src/pages/forgot-password.tsx` | Create — forgot password page |
| `yehub-fe/src/pages/reset-password.tsx` | Create — reset password page |
| `yehub-fe/src/router.tsx` | Add two public routes |
| `yehub-fe/src/pages/login.tsx` | Add "Forgot password?" link |

---

## Task 1: Add `sendPasswordReset` to MailService

**Files:**
- Modify: `yehub-be/src/mail/mail.service.ts`
- Create: `yehub-be/src/mail/mail.service.spec.ts`

- [ ] **Step 1: Write the failing tests**

Create `yehub-be/src/mail/mail.service.spec.ts`:

```ts
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { MailService } from './mail.service';

describe('MailService', () => {
  describe('sendPasswordReset — SMTP not configured', () => {
    let service: MailService;

    beforeEach(async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          MailService,
          {
            provide: ConfigService,
            useValue: {
              get: jest.fn((key: string, def?: unknown) => {
                if (key === 'SMTP_HOST') return undefined;
                return def;
              }),
            },
          },
        ],
      }).compile();
      service = module.get<MailService>(MailService);
    });

    it('logs a warning with the reset link instead of sending email', async () => {
      const warnSpy = jest.spyOn(service['logger'], 'warn');

      await service.sendPasswordReset(
        'alice@example.com',
        'Alice',
        'http://localhost:5173/reset-password?token=abc123',
      );

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('alice@example.com'),
      );
    });
  });

  describe('sendPasswordReset — SMTP configured', () => {
    let service: MailService;
    let sendMailMock: jest.Mock;

    beforeEach(async () => {
      sendMailMock = jest.fn().mockResolvedValue(undefined);

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          MailService,
          {
            provide: ConfigService,
            useValue: {
              get: jest.fn((key: string, def?: unknown) => {
                if (key === 'SMTP_HOST') return 'smtp.example.com';
                if (key === 'SMTP_FROM') return 'noreply@yehub.com';
                return def;
              }),
            },
          },
        ],
      }).compile();

      service = module.get<MailService>(MailService);
      // Override real transporter with mock to avoid live SMTP calls
      (service as unknown as { transporter: unknown })['transporter'] = {
        sendMail: sendMailMock,
      };
    });

    it('sends email with correct to, from, and subject', async () => {
      await service.sendPasswordReset(
        'alice@example.com',
        'Alice',
        'http://localhost:5173/reset-password?token=abc123',
      );

      expect(sendMailMock).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'alice@example.com',
          from: 'noreply@yehub.com',
          subject: 'Reset your YeHub password',
        }),
      );
    });

    it('includes the reset link in the email body', async () => {
      await service.sendPasswordReset(
        'alice@example.com',
        'Alice',
        'http://localhost:5173/reset-password?token=abc123',
      );

      const html = sendMailMock.mock.calls[0][0].html as string;
      expect(html).toContain('http://localhost:5173/reset-password?token=abc123');
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd yehub-be && pnpm test -- --testPathPattern=mail.service.spec
```

Expected: FAIL — `service.sendPasswordReset is not a function`

- [ ] **Step 3: Add `sendPasswordReset` to `mail.service.ts`**

Append after the closing brace of `sendInvitation` (before the class closing brace) in `yehub-be/src/mail/mail.service.ts`:

```ts
  async sendPasswordReset(email: string, name: string, resetLink: string) {
    const from = this.config.get<string>('SMTP_FROM', 'noreply@yehub.com');

    if (!this.transporter) {
      this.logger.warn(
        `[DEV] SMTP not configured. Password reset link for ${email}: ${resetLink}`,
      );
      return;
    }

    await this.transporter.sendMail({
      from,
      to: email,
      subject: 'Reset your YeHub password',
      html: `
        <h2>Hi ${name},</h2>
        <p>You requested a password reset for your YeHub account.</p>
        <p>Click the link below to set a new password:</p>
        <p><a href="${resetLink}">${resetLink}</a></p>
        <p>This link expires in 15 minutes.</p>
        <p>If you did not request this, you can safely ignore this email.</p>
      `,
    });
  }
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd yehub-be && pnpm test -- --testPathPattern=mail.service.spec
```

Expected: PASS — 3 tests pass

- [ ] **Step 5: Commit**

```bash
cd yehub-be && git add src/mail/mail.service.ts src/mail/mail.service.spec.ts
git commit -m "feat(mail): add sendPasswordReset method"
```

---

## Task 2: Wire up email in `AuthService.forgotPassword`

**Files:**
- Modify: `yehub-be/src/auth/auth.service.ts`
- Create: `yehub-be/src/auth/auth.service.spec.ts`

- [ ] **Step 1: Write failing tests**

Create `yehub-be/src/auth/auth.service.spec.ts`:

```ts
import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';

describe('AuthService', () => {
  let service: AuthService;
  let prisma: { user: { findUnique: jest.Mock } };
  let jwtService: { sign: jest.Mock; verify: jest.Mock };
  let config: { get: jest.Mock };
  let mail: { sendPasswordReset: jest.Mock };

  beforeEach(async () => {
    prisma = { user: { findUnique: jest.fn() } };
    jwtService = { sign: jest.fn().mockReturnValue('fake-token'), verify: jest.fn() };
    config = { get: jest.fn().mockReturnValue('http://localhost:5173') };
    mail = { sendPasswordReset: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        { provide: JwtService, useValue: jwtService },
        { provide: ConfigService, useValue: config },
        { provide: MailService, useValue: mail },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  describe('forgotPassword', () => {
    it('returns generic message and does not send email when user not found', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      const result = await service.forgotPassword('unknown@example.com');

      expect(result).toEqual({ message: 'If that email exists, a reset link has been sent.' });
      expect(mail.sendPasswordReset).not.toHaveBeenCalled();
    });

    it('returns generic message and does not send email when user is inactive', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'u1',
        email: 'alice@example.com',
        name: 'Alice',
        active: false,
      });

      const result = await service.forgotPassword('alice@example.com');

      expect(result).toEqual({ message: 'If that email exists, a reset link has been sent.' });
      expect(mail.sendPasswordReset).not.toHaveBeenCalled();
    });

    it('fires sendPasswordReset with correct link when user exists and is active', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'u1',
        email: 'alice@example.com',
        name: 'Alice',
        active: true,
      });
      jwtService.sign.mockReturnValue('reset-jwt-token');
      config.get.mockReturnValue('http://localhost:5173');

      const result = await service.forgotPassword('alice@example.com');

      expect(result).toEqual({ message: 'If that email exists, a reset link has been sent.' });
      expect(mail.sendPasswordReset).toHaveBeenCalledWith(
        'alice@example.com',
        'Alice',
        'http://localhost:5173/reset-password?token=reset-jwt-token',
      );
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd yehub-be && pnpm test -- --testPathPattern=auth.service.spec
```

Expected: FAIL — `Cannot find module` or dependency injection errors (MailService/ConfigService not in AuthService yet)

- [ ] **Step 3: Update `auth.service.ts`**

Replace the constructor and `forgotPassword` method in `yehub-be/src/auth/auth.service.ts`:

Replace:
```ts
import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
```

With:
```ts
import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
```

Replace the constructor:
```ts
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}
```

With:
```ts
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    private readonly mail: MailService,
  ) {}
```

Replace the `forgotPassword` method:
```ts
  async forgotPassword(email: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });

    if (!user || !user.active) {
      return { message: 'If that email exists, a reset link has been sent.' };
    }

    const payload = { sub: user.id, type: 'password_reset' };
    const resetToken = this.jwtService.sign(payload, {
      expiresIn: RESET_TOKEN_EXPIRY,
    });

    // TODO: Send reset email with resetToken
    if (process.env.NODE_ENV !== 'production') {
      console.log(`[DEV] Password reset token for ${email}: ${resetToken}`);
    }

    return { message: 'If that email exists, a reset link has been sent.' };
  }
```

With:
```ts
  async forgotPassword(email: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });

    if (!user || !user.active) {
      return { message: 'If that email exists, a reset link has been sent.' };
    }

    const payload = { sub: user.id, type: 'password_reset' };
    const resetToken = this.jwtService.sign(payload, {
      expiresIn: RESET_TOKEN_EXPIRY,
    });

    const frontendUrl = this.config.get<string>('FRONTEND_URL', 'http://localhost:5173');
    const resetLink = `${frontendUrl}/reset-password?token=${resetToken}`;
    void this.mail.sendPasswordReset(user.email, user.name, resetLink);

    return { message: 'If that email exists, a reset link has been sent.' };
  }
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd yehub-be && pnpm test -- --testPathPattern=auth.service.spec
```

Expected: PASS — 3 tests pass

- [ ] **Step 5: Run full backend test suite to check for regressions**

```bash
cd yehub-be && pnpm test
```

Expected: All tests pass

- [ ] **Step 6: Commit**

```bash
cd yehub-be && git add src/auth/auth.service.ts src/auth/auth.service.spec.ts
git commit -m "feat(auth): wire up password reset email in forgotPassword"
```

---

## Task 3: Frontend API calls and Zod schemas

**Files:**
- Modify: `yehub-fe/src/api/auth.ts`
- Modify: `yehub-fe/src/lib/schemas.ts`

- [ ] **Step 1: Add `forgotPassword` and `resetPassword` to `authApi`**

In `yehub-fe/src/api/auth.ts`, add after the `acceptInvitation` entry (before the closing `}`):

```ts
  forgotPassword: (email: string) =>
    apiClient
      .post<{ message: string }>('/auth/forgot-password', { email })
      .then((r) => r.data),

  resetPassword: (token: string, newPassword: string) =>
    apiClient
      .post<{ message: string }>('/auth/reset-password', {
        token,
        new_password: newPassword,
      })
      .then((r) => r.data),
```

- [ ] **Step 2: Add Zod schemas and types to `schemas.ts`**

In `yehub-fe/src/lib/schemas.ts`, add after the `changePasswordSchema` block (before the type exports):

```ts
export const forgotPasswordSchema = z.object({
  email: z.email(),
});

export const resetPasswordSchema = z
  .object({
    new_password: z.string().min(8, 'Password must be at least 8 characters'),
    confirm_password: z.string(),
  })
  .refine((data) => data.new_password === data.confirm_password, {
    message: 'Passwords do not match',
    path: ['confirm_password'],
  });
```

Add the type exports at the end of `schemas.ts`:

```ts
export type ForgotPasswordFormValues = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordFormValues = z.infer<typeof resetPasswordSchema>;
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd yehub-fe && pnpm exec tsc --noEmit
```

Expected: No errors

- [ ] **Step 4: Commit**

```bash
cd yehub-fe && git add src/api/auth.ts src/lib/schemas.ts
git commit -m "feat(auth): add forgotPassword and resetPassword API calls and schemas"
```

---

## Task 4: Create `ForgotPasswordPage`

**Files:**
- Create: `yehub-fe/src/pages/forgot-password.tsx`

- [ ] **Step 1: Create the page**

Create `yehub-fe/src/pages/forgot-password.tsx`:

```tsx
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation } from '@tanstack/react-query'
import { authApi } from '@/api/auth'
import { forgotPasswordSchema, type ForgotPasswordFormValues } from '@/lib/schemas'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

export function ForgotPasswordPage() {
  const [submitted, setSubmitted] = useState(false)

  const form = useForm<ForgotPasswordFormValues>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: '' },
  })

  const mutation = useMutation({
    mutationFn: ({ email }: ForgotPasswordFormValues) =>
      authApi.forgotPassword(email),
    onSettled: () => setSubmitted(true),
  })

  if (submitted) {
    return (
      <div className='flex min-h-screen items-center justify-center bg-background p-4'>
        <Card className='w-full max-w-sm'>
          <CardContent className='pt-8 pb-8 text-center space-y-4'>
            <p className='text-base font-medium'>Check your email</p>
            <p className='text-sm text-muted-foreground'>
              If that email exists, a reset link has been sent.
            </p>
            <Link
              to='/login'
              className='text-sm text-muted-foreground hover:underline block'
            >
              Back to sign in
            </Link>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className='flex min-h-screen items-center justify-center bg-background p-4'>
      <Card className='w-full max-w-sm'>
        <CardHeader className='space-y-1'>
          <CardTitle className='text-2xl font-bold'>Forgot password</CardTitle>
          <CardDescription>
            Enter your email and we'll send you a reset link
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form
              onSubmit={form.handleSubmit((v) => mutation.mutate(v))}
              className='space-y-4'
            >
              <FormField
                control={form.control}
                name='email'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input
                        type='email'
                        placeholder='you@example.com'
                        autoComplete='email'
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Button
                type='submit'
                className='w-full'
                disabled={mutation.isPending}
              >
                {mutation.isPending ? 'Sending…' : 'Send reset link'}
              </Button>

              <p className='text-center text-sm text-muted-foreground'>
                <Link to='/login' className='hover:underline'>
                  Back to sign in
                </Link>
              </p>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd yehub-fe && pnpm exec tsc --noEmit
```

Expected: No errors

- [ ] **Step 3: Commit**

```bash
cd yehub-fe && git add src/pages/forgot-password.tsx
git commit -m "feat(auth): add ForgotPasswordPage"
```

---

## Task 5: Create `ResetPasswordPage`

**Files:**
- Create: `yehub-fe/src/pages/reset-password.tsx`

- [ ] **Step 1: Create the page**

Create `yehub-fe/src/pages/reset-password.tsx`:

```tsx
import { useState } from 'react'
import { useNavigate, useSearchParams, Link } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation } from '@tanstack/react-query'
import { toast } from 'sonner'
import { CheckCircle2, AlertCircle } from 'lucide-react'
import { authApi } from '@/api/auth'
import { resetPasswordSchema, type ResetPasswordFormValues } from '@/lib/schemas'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export function ResetPasswordPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token')
  const [success, setSuccess] = useState(false)
  const [countdown, setCountdown] = useState(3)

  const form = useForm<ResetPasswordFormValues>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { new_password: '', confirm_password: '' },
  })

  const mutation = useMutation({
    mutationFn: ({ new_password }: ResetPasswordFormValues) =>
      authApi.resetPassword(token!, new_password),
    onSuccess: () => {
      toast.success('Password reset successfully')
      setSuccess(true)
      let secs = 3
      const interval = setInterval(() => {
        secs -= 1
        setCountdown(secs)
        if (secs <= 0) {
          clearInterval(interval)
          navigate('/login')
        }
      }, 1000)
    },
    onError: () => {
      form.setError('root', {
        message: 'This reset link is invalid or has expired.',
      })
    },
  })

  // No token in URL
  if (!token) {
    return (
      <div className='flex min-h-screen items-center justify-center bg-background p-4'>
        <Card className='w-full max-w-sm'>
          <CardContent className='pt-8 pb-8 text-center space-y-4'>
            <AlertCircle className='mx-auto size-12 text-destructive' />
            <p className='text-lg font-semibold'>Invalid Reset Link</p>
            <p className='text-sm text-muted-foreground'>
              No reset token found. Please request a new reset link.
            </p>
            <Button variant='outline' className='w-full' asChild>
              <Link to='/forgot-password'>Request new link</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  // Success state
  if (success) {
    return (
      <div className='flex min-h-screen items-center justify-center bg-background p-4'>
        <Card className='w-full max-w-sm'>
          <CardContent className='pt-8 pb-8 text-center space-y-4'>
            <CheckCircle2 className='mx-auto size-12 text-primary' />
            <p className='text-lg font-semibold'>Password Reset!</p>
            <p className='text-sm text-muted-foreground'>
              Redirecting to sign in in {countdown} second
              {countdown !== 1 ? 's' : ''}…
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className='flex min-h-screen items-center justify-center bg-background p-4'>
      <Card className='w-full max-w-sm'>
        <CardHeader className='space-y-1'>
          <CardTitle className='text-2xl font-bold'>Reset password</CardTitle>
          <p className='text-sm text-muted-foreground'>
            Enter your new password below
          </p>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form
              onSubmit={form.handleSubmit((v) => mutation.mutate(v))}
              className='space-y-4'
            >
              {form.formState.errors.root && (
                <div className='rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive space-y-1'>
                  <p>{form.formState.errors.root.message}</p>
                  <Link to='/forgot-password' className='hover:underline'>
                    Request a new link
                  </Link>
                </div>
              )}

              <FormField
                control={form.control}
                name='new_password'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>New password</FormLabel>
                    <FormControl>
                      <Input
                        type='password'
                        autoComplete='new-password'
                        placeholder='At least 8 characters'
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name='confirm_password'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Confirm new password</FormLabel>
                    <FormControl>
                      <Input
                        type='password'
                        autoComplete='new-password'
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Button
                type='submit'
                className='w-full'
                disabled={mutation.isPending}
              >
                {mutation.isPending ? 'Resetting…' : 'Reset password'}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd yehub-fe && pnpm exec tsc --noEmit
```

Expected: No errors

- [ ] **Step 3: Commit**

```bash
cd yehub-fe && git add src/pages/reset-password.tsx
git commit -m "feat(auth): add ResetPasswordPage"
```

---

## Task 6: Wire up routes and login link

**Files:**
- Modify: `yehub-fe/src/router.tsx`
- Modify: `yehub-fe/src/pages/login.tsx`

- [ ] **Step 1: Add routes to `router.tsx`**

In `yehub-fe/src/router.tsx`, add the two imports at the top (after existing imports):

```ts
import { ForgotPasswordPage } from '@/pages/forgot-password'
import { ResetPasswordPage } from '@/pages/reset-password'
```

Add the two routes to the router array (after the `/invitation/:token` route, before the `ProtectedRoute` block):

```ts
  { path: '/forgot-password', element: <ForgotPasswordPage /> },
  { path: '/reset-password', element: <ResetPasswordPage /> },
```

- [ ] **Step 2: Add "Forgot password?" link to `login.tsx`**

In `yehub-fe/src/pages/login.tsx`, add `Link` to the react-router-dom import:

Replace:
```ts
import { useNavigate } from 'react-router-dom'
```

With:
```ts
import { useNavigate, Link } from 'react-router-dom'
```

Replace the password field label `div`:
```tsx
                  <div className='flex items-center justify-between'>
                    <FormLabel>Password</FormLabel>
                  </div>
```

With:
```tsx
                  <div className='flex items-center justify-between'>
                    <FormLabel>Password</FormLabel>
                    <Link
                      to='/forgot-password'
                      className='text-sm text-muted-foreground hover:underline'
                    >
                      Forgot password?
                    </Link>
                  </div>
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd yehub-fe && pnpm exec tsc --noEmit
```

Expected: No errors

- [ ] **Step 4: Commit**

```bash
cd yehub-fe && git add src/router.tsx src/pages/login.tsx
git commit -m "feat(auth): add forgot/reset-password routes and login link"
```

---

## Self-Review Checklist

- [x] **Spec coverage:** MailService `sendPasswordReset` ✓ | AuthService wire-up + fire-and-forget ✓ | `authApi` calls ✓ | Zod schemas ✓ | ForgotPasswordPage (always shows generic message) ✓ | ResetPasswordPage (no-token state, success state, error state with link back) ✓ | Router routes ✓ | Login "Forgot password?" link ✓
- [x] **Placeholders:** None
- [x] **Type consistency:** `ForgotPasswordFormValues` / `ResetPasswordFormValues` defined in Task 3, used in Tasks 4 & 5. `authApi.forgotPassword` / `authApi.resetPassword` defined in Task 3, called in Tasks 4 & 5. All consistent.
