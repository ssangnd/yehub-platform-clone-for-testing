import { useQuery } from '@tanstack/react-query'
import { commentsApi, type Sentiment } from '@/api/comments'
import type { Platform } from '@/api/posts'
import { queryKeys } from '@/lib/constants/query-keys'
import { useUrlState } from '@/hooks/use-url-state'

type CommentSort = 'newest' | 'oldest' | 'most_likes'

function normalizeCommentParams(next: URLSearchParams) {
  if (next.get('sort') === 'newest') next.delete('sort')
}

export function useCampaignComments(campaignId: string) {
  const { searchParams, page, setPage, update, setParam } = useUrlState(normalizeCommentParams)

  const search = searchParams.get('q') ?? ''
  const platformFilter = (searchParams.get('platform') ?? '') as Platform | ''
  const sentimentFilter = (searchParams.get('sentiment') ?? '') as Sentiment | ''
  const sort = (searchParams.get('sort') as CommentSort | null) ?? 'newest'

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.campaignComments(campaignId, page, search, platformFilter, sentimentFilter, sort),
    queryFn: () =>
      commentsApi.listByCampaign(campaignId, {
        page,
        limit: 20,
        q: search || undefined,
        platform: platformFilter || undefined,
        sentiment: sentimentFilter || undefined,
        sort,
      }),
  })

  const handleSearchChange = (value: string) => setParam('q', value)

  const handlePlatformChange = (value: Platform | '') => setParam('platform', value)

  const handleSentimentChange = (value: Sentiment | '') => setParam('sentiment', value)

  const handleSortChange = (value: CommentSort) =>
    update((next) => {
      next.set('sort', value)
      next.set('page', '1')
    })

  return {
    comments: data?.data ?? [],
    totalPages: data?.totalPages ?? 0,
    total: data?.total ?? 0,
    isLoading,
    page,
    setPage,
    search,
    handleSearchChange,
    platformFilter,
    handlePlatformChange,
    sentimentFilter,
    handleSentimentChange,
    sort,
    handleSortChange,
  }
}
