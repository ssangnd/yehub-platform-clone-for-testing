import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { queryKeys } from '@/lib/constants/query-keys'
import { profilesApi } from '@/api/profiles'
import { kolCategoriesApi } from '@/api/kol-categories'
import { kolTiersApi } from '@/api/kol-tiers'
import { showApiError } from '@/lib/errors'

export function useProfileDetail() {
  const { id: routeId } = useParams<{ id: string }>()
  const id = routeId ?? ''
  const queryClient = useQueryClient()

  const profileQuery = useQuery({
    queryKey: queryKeys.profile(id),
    queryFn: () => profilesApi.get(id),
    enabled: !!id,
  })

  const categoriesQuery = useQuery({
    queryKey: queryKeys.kolCategories,
    queryFn: kolCategoriesApi.list,
  })

  const tiersQuery = useQuery({
    queryKey: queryKeys.kolTiers,
    queryFn: kolTiersApi.list,
  })

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.profile(id) })
    queryClient.invalidateQueries({ queryKey: queryKeys.profiles.all })
  }

  return {
    id,
    profile: profileQuery.data,
    isLoading: profileQuery.isLoading,
    categories: categoriesQuery.data ?? [],
    tiers: tiersQuery.data ?? [],
    invalidate,
  }
}

export function useDeleteProfile(profileId: string) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: () => profilesApi.delete(profileId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.profiles.all })
      queryClient.removeQueries({ queryKey: queryKeys.profile(profileId) })
      toast.success('Profile deleted')
      navigate('/profiles')
    },
    onError: (error) => showApiError(error, { fallback: 'Failed to delete profile' }),
  })
}
