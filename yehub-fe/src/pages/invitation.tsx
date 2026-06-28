import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery } from '@tanstack/react-query'
import { queryKeys } from '@/lib/constants/query-keys'
import { toast } from 'sonner'
import { CheckCircle2, AlertCircle } from 'lucide-react'
import { authApi } from '@/api/auth'
import { acceptInvitationSchema } from '@/lib/schemas'
import type { AcceptInvitationFormValues } from '@/lib/schemas'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'
import { ROUTES } from '@/lib/constants/routes'

export function InvitationPage() {
  const { token } = useParams<{ token: string }>()
  const navigate = useNavigate()
  const [accepted, setAccepted] = useState(false)
  const [countdown, setCountdown] = useState(3)

  const {
    data: invitationInfo,
    isLoading,
    isError,
  } = useQuery({
    queryKey: queryKeys.invitation(token!),
    queryFn: () => authApi.validateInvitation(token!),
    enabled: !!token,
    retry: false,
  })

  const form = useForm<AcceptInvitationFormValues>({
    resolver: zodResolver(acceptInvitationSchema),
    defaultValues: { password: '', confirm_password: '' },
  })

  const acceptMutation = useMutation({
    mutationFn: ({ password }: AcceptInvitationFormValues) => authApi.acceptInvitation(token!, password),
    onSuccess: () => {
      toast.success('Account activated successfully!')
      setAccepted(true)

      // Countdown then redirect
      let secs = 3
      const interval = setInterval(() => {
        secs -= 1
        setCountdown(secs)
        if (secs <= 0) {
          clearInterval(interval)
          navigate(ROUTES.LOGIN)
        }
      }, 1000)
    },
    onError: () => {
      form.setError('root', {
        message: 'Failed to activate account. The link may have already been used.',
      })
    },
  })

  function onSubmit(values: AcceptInvitationFormValues) {
    acceptMutation.mutate(values)
  }

  // ── Success state ────────────────────────────────────────────────────────

  if (accepted) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <Card className="w-full max-w-sm">
          <CardContent className="pt-8 pb-8 text-center space-y-4">
            <CheckCircle2 className="mx-auto size-12 text-primary" />
            <p className="text-lg font-semibold">Account Activated!</p>
            <p className="text-sm text-muted-foreground">
              Redirecting you to sign in in {countdown} second
              {countdown !== 1 ? 's' : ''}…
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  // ── Loading state ────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <Card className="w-full max-w-sm">
          <CardContent className="pt-8 pb-8 text-center">
            <p className="text-sm text-muted-foreground">Validating invitation…</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  // ── Error / invalid token state ──────────────────────────────────────────

  if (isError || !invitationInfo) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <Card className="w-full max-w-sm">
          <CardContent className="pt-8 pb-8 text-center space-y-4">
            <AlertCircle className="mx-auto size-12 text-destructive" />
            <p className="text-lg font-semibold">Invalid or Expired Link</p>
            <p className="text-sm text-muted-foreground">
              This invitation link is invalid or has expired. Please contact your administrator to request a new
              invitation.
            </p>
            <Button variant="outline" className="w-full" onClick={() => navigate(ROUTES.LOGIN)}>
              Go to Login
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  // ── Set password form ────────────────────────────────────────────────────

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl font-bold">Accept Invitation</CardTitle>
          <p className="text-sm text-muted-foreground">Set a password to activate your account</p>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              {form.formState.errors.root && (
                <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {form.formState.errors.root.message}
                </p>
              )}

              {/* Read-only email */}
              <div className="grid gap-2">
                <label className="flex items-center gap-2 text-sm leading-none font-medium select-none">Email</label>
                <Input value={invitationInfo.email} readOnly disabled />
              </div>

              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Password</FormLabel>
                    <FormControl>
                      <Input
                        type="password"
                        autoComplete="new-password"
                        placeholder="At least 8 characters"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="confirm_password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Confirm Password</FormLabel>
                    <FormControl>
                      <Input type="password" autoComplete="new-password" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Button type="submit" className="w-full" disabled={acceptMutation.isPending}>
                {acceptMutation.isPending ? 'Activating…' : 'Activate Account'}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  )
}
