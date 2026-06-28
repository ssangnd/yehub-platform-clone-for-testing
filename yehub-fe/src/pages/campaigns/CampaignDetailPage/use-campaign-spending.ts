import { useQuery } from '@tanstack/react-query'
import { campaignsApi } from '@/api/campaigns'
import { queryKeys } from '@/lib/constants/query-keys'

export function useCampaignSpending(campaignId: string) {
  return useQuery({
    queryKey: queryKeys.campaignSpending(campaignId),
    queryFn: () => campaignsApi.getSpending(campaignId),
  })
}
