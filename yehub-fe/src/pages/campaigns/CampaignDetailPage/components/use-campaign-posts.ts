import { useQuery } from '@tanstack/react-query'
import { postsApi, type Platform } from '@/api/posts'
import { queryKeys } from '@/lib/constants/query-keys'
import { useDebounce } from '@/hooks/use-debounce'
import { useUrlState } from '@/hooks/use-url-state'

const PAGE_LIMIT = 20

export type PostSortField = 'likes' | 'comment_count' | 'engagement' | 'created_at'

function normalizePostParams(next: URLSearchParams) {
  // `desc` is the default order, and an order without a sort field is moot.
  if (next.get('order') === 'desc') next.delete('order')
  if (!next.get('sort_by')) next.delete('order')
}

export function useCampaignPosts(campaignId: string) {
  const { searchParams, page, setPage, update, setParam } = useUrlState(normalizePostParams)

  const search = searchParams.get('q') ?? ''
  const platformFilter = (searchParams.get('platform') ?? '') as Platform | ''
  const sortBy = (searchParams.get('sort_by') as PostSortField | null) ?? undefined
  const sortOrder: 'asc' | 'desc' = searchParams.get('order') === 'asc' ? 'asc' : 'desc'
  const debouncedSearch = useDebounce(search, 300)

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.posts.list(campaignId, page, debouncedSearch, platformFilter, sortBy, sortOrder),
    queryFn: () =>
      postsApi.listPosts(campaignId, {
        page,
        limit: PAGE_LIMIT,
        q: debouncedSearch || undefined,
        platform: platformFilter || undefined,
        sort_by: sortBy,
        order: sortBy ? sortOrder : undefined,
      }),
  })

  const toggleSort = (field: PostSortField) => {
    update((next) => {
      const currentField = next.get('sort_by')
      const currentOrder = next.get('order') === 'asc' ? 'asc' : 'desc'
      if (currentField === field) {
        next.set('order', currentOrder === 'asc' ? 'desc' : 'asc')
      } else {
        next.set('sort_by', field)
        next.set('order', 'desc')
      }
      next.set('page', '1')
    })
  }

  const handleSearchChange = (value: string) => setParam('q', value)

  const setPlatformFilter = (value: Platform | '') => setParam('platform', value)

  return {
    posts: data?.data ?? [],
    totalPages: data?.totalPages ?? 0,
    isLoading,
    page,
    setPage,
    search,
    handleSearchChange,
    platformFilter,
    setPlatformFilter,
    sortBy,
    sortOrder,
    toggleSort,
  }
}
