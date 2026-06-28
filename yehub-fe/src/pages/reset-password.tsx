import { useState } from 'react'
import { useNavigate, useSearchParams, Link } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation } from '@tanstack/react-query'
import { toast } from 'sonner'
import { CheckCircle2, AlertCircle } from 'lucide-react'
import { authApi } from '@/api/auth'
import { ROUTES } from '@/lib/constants/routes'
import { getApiErrorMessage } from '@/lib/errors'
import { resetPasswordSchema, type ResetPasswordFormValues } from '@/lib/schemas'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'
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
    mutationFn: ({ new_password }: ResetPasswordFormValues) => authApi.resetPassword(token!, new_password),
    onSuccess: () => {
      toast.success('Password reset successfully')
      setSuccess(true)
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
    onError: (error) => {
      form.setError('root', {
        message: getApiErrorMessage(error, { fallback: 'This reset link is invalid or has expired.' }),
      })
    },
  })

  // No token in URL
  if (!token) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <Card className="w-full max-w-sm">
          <CardContent className="pt-8 pb-8 text-center space-y-4">
            <AlertCircle className="mx-auto size-12 text-destructive" />
            <p className="text-lg font-semibold">Invalid Reset Link</p>
            <p className="text-sm text-muted-foreground">No reset token found. Please request a new reset link.</p>
            <Button variant="outline" className="w-full" render={<Link to={ROUTES.FORGOT_PASSWORD} />}>
              Request new link
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  // Success state
  if (success) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <Card className="w-full max-w-sm">
          <CardContent className="pt-8 pb-8 text-center space-y-4">
            <CheckCircle2 className="mx-auto size-12 text-primary" />
            <p className="text-lg font-semibold">Password Reset!</p>
            <p className="text-sm text-muted-foreground">
              Redirecting to sign in in {countdown} second
              {countdown !== 1 ? 's' : ''}…
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl font-bold">Reset password</CardTitle>
          <p className="text-sm text-muted-foreground">Enter your new password below</p>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit((v) => mutation.mutate(v))} className="space-y-4">
              {form.formState.errors.root && (
                <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive space-y-1">
                  <p>{form.formState.errors.root.message}</p>
                  <Link to={ROUTES.FORGOT_PASSWORD} className="hover:underline">
                    Request a new link
                  </Link>
                </div>
              )}

              <FormField
                control={form.control}
                name="new_password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>New password</FormLabel>
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
                    <FormLabel>Confirm new password</FormLabel>
                    <FormControl>
                      <Input type="password" autoComplete="new-password" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Button type="submit" className="w-full" disabled={mutation.isPending}>
                {mutation.isPending ? 'Resetting…' : 'Reset password'}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  )
}
