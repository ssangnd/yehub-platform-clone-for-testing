import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { queryKeys } from '@/lib/constants/query-keys'
import { authApi } from '@/api/auth'
import { useAuthStore } from '@/store/auth.store'

export function useAuthGuard() {
  const { refreshToken, setUser } = useAuthStore()

  const { isLoading, data: me } = useQuery({
    queryKey: queryKeys.me,
    queryFn: () => authApi.getMe(),
    enabled: !!refreshToken,
    retry: false,
    refetchOnWindowFocus: true,
  })

  useEffect(() => {
    if (me) setUser(me)
  }, [me, setUser])

  return { isLoading, isAuthenticated: !!refreshToken }
}
