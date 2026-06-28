import { useState } from 'react'
import { Link } from 'react-router-dom'
import { BarChart3, ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ROUTES } from '@/lib/constants/routes'

export default function PasswordResetPage() {
  const [email, setEmail] = useState('')
  const [submitted, setSubmitted] = useState(false)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitted(true)
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <BarChart3 className="h-8 w-8 text-primary" />
          </div>
          <CardTitle>Reset Password</CardTitle>
          <CardDescription>
            {submitted
              ? 'Check your email for reset instructions'
              : 'Enter your email to receive a reset link'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {submitted ? (
            <div className="text-center space-y-4">
              <p className="text-sm text-muted-foreground">
                If an account exists for {email}, you will receive a password reset email.
              </p>
              <Link to={ROUTES.LOGIN}>
                <Button variant="outline" className="cursor-pointer">
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Back to login
                </Button>
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="name@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              <Button type="submit" className="w-full cursor-pointer">
                Send reset link
              </Button>
              <div className="text-center">
                <Link to={ROUTES.LOGIN} className="text-sm text-primary hover:underline">
                  <ArrowLeft className="inline mr-1 h-3 w-3" />
                  Back to login
                </Link>
              </div>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
