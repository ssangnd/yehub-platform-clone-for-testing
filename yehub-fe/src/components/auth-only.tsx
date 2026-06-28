import { Navigate, Outlet } from 'react-router-dom'
import { useAuthGuard } from '@/hooks/use-auth-guard'
import { ROUTES } from '@/lib/constants/routes'

export function AuthOnly() {
  const { isLoading, isAuthenticated } = useAuthGuard()

  if (!isAuthenticated) {
    return <Navigate to={ROUTES.LOGIN} replace />
  }

  if (isLoading) {
    return null
  }

  return <Outlet />
}
