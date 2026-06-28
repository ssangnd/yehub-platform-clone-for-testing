import { useNavigate, Outlet } from 'react-router-dom'
import { useAuthStore } from '@/store/auth.store'
import { authApi } from '@/api/auth'
import { ROUTES } from '@/lib/constants/routes'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

export function GuestOnly() {
  const navigate = useNavigate()
  const { user, clearAuth, isAuthenticated } = useAuthStore()

  if (!isAuthenticated()) {
    return <Outlet />
  }

  async function handleLogoutAndContinue() {
    try {
      await authApi.logout()
    } catch {
      // proceed with local logout even if server call fails
    }
    clearAuth()
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle>Active Session</CardTitle>
          <CardDescription>
            You are currently logged in as <strong>{user?.email}</strong>
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Button onClick={() => navigate(ROUTES.HOME)} className="w-full">
            Go to Dashboard
          </Button>
          <Button variant="outline" onClick={handleLogoutAndContinue} className="w-full">
            Logout &amp; Continue
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
