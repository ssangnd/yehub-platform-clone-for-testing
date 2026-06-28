import { useEffect } from 'react'
import { Navigate, Outlet } from 'react-router-dom'
import { toast } from 'sonner'
import { useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '@/lib/constants/query-keys'
import { ROUTES } from '@/lib/constants/routes'
import { useCanGlobal } from '@/hooks/use-can'
import type { GlobalRole } from '@/api/auth'

export function ProfilesRoute() {
  const queryClient = useQueryClient()
  const me = queryClient.getQueryData<{ role: GlobalRole }>(queryKeys.me)
  const canViewProfiles = useCanGlobal('view_profiles', me?.role ?? null)

  useEffect(() => {
    if (me && !canViewProfiles) {
      toast.error('You do not have access to profiles')
    }
  }, [me, canViewProfiles])

  if (!me || !canViewProfiles) {
    return <Navigate to={ROUTES.PROJECTS} replace />
  }

  return <Outlet />
}
