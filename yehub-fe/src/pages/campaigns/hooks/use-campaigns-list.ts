import { useQuery } from '@tanstack/react-query'
import { campaignsApi, type CampaignStatus, type CampaignSortField, type SortOrder } from '@/api/campaigns'
import { queryKeys } from '@/lib/constants/query-keys'
import { useDebounce } from '@/hooks/use-debounce'
import { useUrlState } from '@/hooks/use-url-state'

const PAGE_LIMIT = 20

function normalizeCampaignParams(next: URLSearchParams) {
  // An order without a sort field is meaningless — keep the URL clean.
  if (!next.get('sort_by')) next.delete('order')
}

interface UseCampaignsListOptions {
  projectId?: string
}

export function useCampaignsList({ projectId }: UseCampaignsListOptions = {}) {
  const { searchParams, page, setPage, update, setParam } = useUrlState(normalizeCampaignParams)

  const search = searchParams.get('q') ?? ''
  const statusFilter = (searchParams.get('status') ?? '') as CampaignStatus | ''
  const sortBy = (searchParams.get('sort_by') as CampaignSortField | null) ?? undefined
  const order = (searchParams.get('order') as SortOrder | null) ?? undefined
  const debouncedSearch = useDebounce(search, 300)

  const { data, isLoading } = useQuery({
    queryKey: projectId
      ? queryKeys.campaigns.listByProject(projectId, page, debouncedSearch, statusFilter, sortBy, order)
      : queryKeys.campaigns.list(page, debouncedSearch, statusFilter, sortBy, order),
    queryFn: () => {
      const params = {
        page,
        limit: PAGE_LIMIT,
        q: debouncedSearch || undefined,
        status: statusFilter || undefined,
        sort_by: sortBy,
        order,
      }
      return projectId ? campaignsApi.listCampaignsByProject(projectId, params) : campaignsApi.listAllCampaigns(params)
    },
  })

  const handleSearchChange = (value: string) => setParam('q', value)

  const handleStatusChange = (value: string | null) => setParam('status', value)

  const handleSort = (field: CampaignSortField) => {
    update((next) => {
      const currentField = next.get('sort_by')
      const currentOrder = next.get('order')
      if (currentField === field) {
        next.set('order', currentOrder === 'asc' ? 'desc' : 'asc')
      } else {
        next.set('sort_by', field)
        next.set('order', 'asc')
      }
      next.set('page', '1')
    })
  }

  return {
    campaigns: data?.data ?? [],
    totalPages: data?.totalPages ?? 0,
    isLoading,
    page,
    setPage,
    search,
    handleSearchChange,
    statusFilter,
    handleStatusChange,
    sortBy,
    order,
    handleSort,
  }
}
