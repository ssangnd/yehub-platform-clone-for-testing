import { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { BarChart3, Eye, EyeOff } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { ROUTES } from '@/lib/constants/routes'

const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
})

type LoginForm = z.infer<typeof loginSchema>

export default function LoginPage() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  const from = (location.state as { from?: { pathname: string } })?.from?.pathname || ROUTES.DASHBOARD

  const { register, handleSubmit, formState: { errors } } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: 'admin@sociallistening.com', password: 'password' },
  })

  const onSubmit = async (data: LoginForm) => {
    setIsLoading(true)
    setError(null)
    try {
      await login(data.email, data.password)
      navigate(from, { replace: true })
    } catch {
      setError('Invalid email or password')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <div className="flex items-center gap-2">
              <BarChart3 className="h-8 w-8 text-primary" />
              <span className="font-mono text-2xl font-bold">Yehub</span>
            </div>
          </div>
          <CardTitle>Welcome back</CardTitle>
          <CardDescription>Sign in to your account to continue</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="name@company.com"
                {...register('email')}
              />
              {errors.email && (
                <p className="text-sm text-destructive">{errors.email.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  {...register('password')}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 cursor-pointer"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
              {errors.password && (
                <p className="text-sm text-destructive">{errors.password.message}</p>
              )}
            </div>
            <Button type="submit" className="w-full cursor-pointer" disabled={isLoading}>
              {isLoading ? 'Signing in...' : 'Sign in'}
            </Button>
            <div className="text-center">
              <a href={ROUTES.PASSWORD_RESET} className="text-sm text-primary hover:underline cursor-pointer">
                Forgot password?
              </a>
            </div>
            <div className="mt-6 rounded-lg bg-muted p-3">
              <p className="text-xs text-muted-foreground mb-2 font-medium">Demo accounts:</p>
              <div className="grid grid-cols-2 gap-1 text-xs text-muted-foreground">
                <span>admin@sociallistening.com</span><span>Admin</span>
                <span>manager@sociallistening.com</span><span>User</span>
                <span>analyst@sociallistening.com</span><span>User</span>
                <span>viewer@sociallistening.com</span><span>User</span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">Password: password</p>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
