import { useQuery } from '@tanstack/react-query'
import { systemSettingsApi } from '@/api/system-settings'
import { queryKeys } from '@/lib/constants/query-keys'
import defaultLogo from '@/assets/default-logo.png'

export function useSystemLogo() {
  const { data, isLoading } = useQuery({
    queryKey: queryKeys.systemSettings.public,
    queryFn: systemSettingsApi.getPublic,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
  })

  const url = data?.logo?.url ?? defaultLogo
  const isCustom = Boolean(data?.logo?.url)

  return { url, isCustom, isLoading }
}

export { defaultLogo }
