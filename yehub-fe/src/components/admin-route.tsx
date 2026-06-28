import { useEffect } from 'react'
import { Navigate, Outlet } from 'react-router-dom'
import { toast } from 'sonner'
import { useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '@/lib/constants/query-keys'
import { ROUTES } from '@/lib/constants/routes'
import type { GlobalRole } from '@/api/auth'

export function AdminRoute() {
  const queryClient = useQueryClient()
  const me = queryClient.getQueryData<{ role: GlobalRole }>(queryKeys.me)
  const isAdmin = me?.role === 'ADMIN'

  useEffect(() => {
    if (me && !isAdmin) {
      toast.error('You do not have access to the admin panel')
    }
  }, [me, isAdmin])

  if (!me || !isAdmin) {
    return <Navigate to={ROUTES.PROJECTS} replace />
  }

  return <Outlet />
}
