import { useQuery } from '@tanstack/react-query'
import { authApi } from '@/api/auth'
import { useAuthStore } from '@/store/auth.store'
import { queryKeys } from '@/lib/constants/query-keys'

export function useMyAccount() {
  const user = useAuthStore((s) => s.user)

  const initials = user?.name
    ? user.name
        .split(' ')
        .map((n) => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2)
    : 'U'

  const { data: profile, isError } = useQuery({
    queryKey: queryKeys.me,
    queryFn: () => authApi.getMe(),
    retry: false,
  })

  return { profile, isError, user, initials }
}
