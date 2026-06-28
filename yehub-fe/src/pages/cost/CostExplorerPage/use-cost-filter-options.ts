import { useQuery } from '@tanstack/react-query'
import { costApi } from '@/api/cost'
import { queryKeys } from '@/lib/constants/query-keys'

export function useCostFilterOptions() {
  return useQuery({
    queryKey: queryKeys.cost.filterOptions,
    queryFn: () => costApi.getFilterOptions(),
    staleTime: 5 * 60 * 1000,
  })
}
