import { useQuery } from '@tanstack/react-query'
import { useDebounce } from '@/hooks/use-debounce'
import { useUrlState } from '@/hooks/use-url-state'
import { queryKeys } from '@/lib/constants/query-keys'
import { profilesApi, type ListProfilesParams } from '@/api/profiles'
import { kolCategoriesApi } from '@/api/kol-categories'
import { kolTiersApi } from '@/api/kol-tiers'
import { parseSocialUrlToUsername } from './parse-social-url'

const FILTER_KEYS = ['categoryIds', 'tierIds', 'platforms', 'genders', 'tags'] as const

type ProfileFilters = Partial<Record<(typeof FILTER_KEYS)[number], string>>

function normalizeProfileParams(next: URLSearchParams) {
  // `desc` is the default order, so it never needs to appear in the URL.
  if (next.get('sortOrder') === 'desc') next.delete('sortOrder')
}

export function useProfilesList() {
  const { searchParams, page, setPage, update, setParam } = useUrlState(normalizeProfileParams)

  const search = searchParams.get('q') ?? ''
  const sortBy = searchParams.get('sortBy') ?? undefined
  const sortOrder: 'asc' | 'desc' = searchParams.get('sortOrder') === 'asc' ? 'asc' : 'desc'
  const filters: ProfileFilters = {
    categoryIds: searchParams.get('categoryIds') ?? undefined,
    tierIds: searchParams.get('tierIds') ?? undefined,
    platforms: searchParams.get('platforms') ?? undefined,
    genders: searchParams.get('genders') ?? undefined,
    tags: searchParams.get('tags') ?? undefined,
  }

  const debouncedSearch = useDebounce(search, 300)
  // A pasted social account URL (e.g. instagram.com/john) is parsed down to the
  // account handle so it matches profiles by their social account username.
  const searchTerm = parseSocialUrlToUsername(debouncedSearch)

  const params: ListProfilesParams = {
    search: searchTerm || undefined,
    page,
    limit: 20,
    sortBy,
    sortOrder,
    ...filters,
  }

  const profilesQuery = useQuery({
    queryKey: queryKeys.profiles.list(params as Record<string, unknown>),
    queryFn: () => profilesApi.list(params),
  })

  const categoriesQuery = useQuery({
    queryKey: queryKeys.kolCategories,
    queryFn: kolCategoriesApi.list,
  })

  const tiersQuery = useQuery({
    queryKey: queryKeys.kolTiers,
    queryFn: kolTiersApi.list,
  })

  const tagsQuery = useQuery({
    queryKey: queryKeys.profiles.tags,
    queryFn: profilesApi.listTags,
  })

  const setSearch = (value: string) => setParam('q', value)

  const setFilters = (next: ProfileFilters) => {
    update((params) => {
      for (const key of FILTER_KEYS) {
        const value = next[key]
        if (value) params.set(key, value)
        else params.delete(key)
      }
      params.set('page', '1')
    })
  }

  const handleSort = (key: string) => {
    update((next) => {
      const currentKey = next.get('sortBy')
      const currentOrder = next.get('sortOrder') === 'asc' ? 'asc' : 'desc'
      if (currentKey === key) {
        next.set('sortOrder', currentOrder === 'asc' ? 'desc' : 'asc')
      } else {
        next.set('sortBy', key)
        next.set('sortOrder', 'desc')
      }
      next.set('page', '1')
    })
  }

  return {
    profiles: profilesQuery.data?.data ?? [],
    meta: profilesQuery.data?.meta,
    isLoading: profilesQuery.isLoading,
    categories: categoriesQuery.data ?? [],
    tiers: tiersQuery.data ?? [],
    tags: tagsQuery.data ?? [],
    search,
    setSearch,
    page,
    setPage,
    sortBy,
    sortOrder,
    handleSort,
    filters,
    setFilters,
  }
}
