import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { campaignsApi, type CampaignStatus } from '@/api/campaigns'
import { queryKeys } from '@/lib/constants/query-keys'
import { toast } from 'sonner'
import axios from 'axios'

export function useCampaignDetail(campaignId: string) {
  const queryClient = useQueryClient()

  const { data: campaign, isLoading } = useQuery({
    queryKey: queryKeys.campaign(campaignId),
    queryFn: () => campaignsApi.getCampaign(campaignId),
    enabled: !!campaignId,
  })

  const changeStatusMutation = useMutation({
    mutationFn: (status: CampaignStatus) => campaignsApi.changeCampaignStatus(campaignId, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.campaign(campaignId) })
      queryClient.invalidateQueries({ queryKey: queryKeys.campaigns.all })
      toast.success('Campaign updated')
    },
    onError: (err) => {
      if (axios.isAxiosError(err)) {
        toast.error((err.response?.data as { message?: string })?.message ?? 'Failed to update campaign')
      }
    },
  })

  const deleteMutation = useMutation({
    mutationFn: () => campaignsApi.deleteCampaign(campaignId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.campaigns.all })
      toast.success('Campaign deleted')
    },
    onError: (err) => {
      if (axios.isAxiosError(err)) {
        toast.error((err.response?.data as { message?: string })?.message ?? 'Failed to delete campaign')
      }
    },
  })

  const changeStatus = (status: CampaignStatus) => {
    changeStatusMutation.mutate(status)
  }

  return { campaign, isLoading, changeStatus, deleteMutation, isUpdating: changeStatusMutation.isPending }
}
