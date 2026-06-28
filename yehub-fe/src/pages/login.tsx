import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { authApi } from '@/api/auth'
import { useAuthStore } from '@/store/auth.store'
import { getLoginErrorDetails } from '@/lib/errors'
import { loginSchema, type LoginFormValues } from '@/lib/schemas'
import { ROUTES } from '@/lib/constants/routes'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export function LoginPage() {
  const navigate = useNavigate()
  const { setTokens } = useAuthStore()
  const queryClient = useQueryClient()
  const [serverError, setServerError] = useState<string | null>(null)

  const form = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  })

  const loginMutation = useMutation({
    mutationFn: ({ email, password }: LoginFormValues) => authApi.login(email, password),
    onSuccess: (data) => {
      setTokens(data.access_token, data.refresh_token)
      queryClient.clear()
      toast.success('Logged in successfully')
      navigate(ROUTES.HOME)
    },
    onError: (error) => {
      const details = getLoginErrorDetails(error)
      if (details.locked) {
        setServerError(
          'Your account has been locked due to too many failed login attempts. Please contact an administrator to unlock it.',
        )
        return
      }
      if (typeof details.attemptsRemaining === 'number') {
        setServerError(`Invalid email or password. ${details.attemptsRemaining} attempts remaining before lockout.`)
        return
      }
      setServerError(details.message)
    },
  })

  function onSubmit(values: LoginFormValues) {
    setServerError(null)
    loginMutation.mutate(values)
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl font-bold">Sign in</CardTitle>
          <CardDescription>Enter your email and password to access your account</CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              {serverError && (
                <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{serverError}</p>
              )}

              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input
                        type="text"
                        inputMode="email"
                        placeholder="Please enter your email address."
                        autoComplete="email"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <div className="flex items-center justify-between">
                      <FormLabel>Password</FormLabel>
                      <Link
                        to={ROUTES.FORGOT_PASSWORD}
                        tabIndex={-1}
                        className="text-sm text-muted-foreground hover:underline"
                      >
                        Forgot password?
                      </Link>
                    </div>
                    <FormControl>
                      <Input
                        type="password"
                        placeholder="Please enter your password."
                        autoComplete="current-password"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Button type="submit" className="w-full" disabled={loginMutation.isPending}>
                {loginMutation.isPending ? 'Signing in…' : 'Sign in'}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  )
}
