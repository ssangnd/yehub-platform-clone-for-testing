import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import type { GlobalRole } from '@/types/auth'
import { ROUTES } from '@/lib/constants/routes'

interface RoleGuardProps {
  allowedRoles: GlobalRole[]
}

export function RoleGuard({ allowedRoles }: RoleGuardProps) {
  const { user } = useAuth()

  if (!user || !allowedRoles.includes(user.globalRole)) {
    return <Navigate to={ROUTES.PROJECTS} replace />
  }

  return <Outlet />
}
