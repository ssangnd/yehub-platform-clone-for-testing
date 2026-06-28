import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import axios from 'axios'
import { toast } from 'sonner'
import { objectivesApi } from '@/api/objectives'
import { queryKeys } from '@/lib/constants/query-keys'

export function useObjectivesTab() {
  const queryClient = useQueryClient()

  const { data, isLoading, isError } = useQuery({
    queryKey: queryKeys.objectives,
    queryFn: objectivesApi.list,
  })

  const invalidateObjectiveAndCampaignCaches = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.objectives })
    // Cached campaigns embed objective names; drop them so the next fetch pulls fresh values.
    queryClient.invalidateQueries({ queryKey: queryKeys.campaigns.all })
    queryClient.invalidateQueries({ queryKey: ['campaign'], exact: false })
  }

  const axiosErrorMessage = (err: unknown, fallback: string) =>
    axios.isAxiosError(err) ? ((err.response?.data as { message?: string })?.message ?? fallback) : fallback

  const createMutation = useMutation({
    mutationFn: (name: string) => objectivesApi.create(name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.objectives })
      toast.success('Objective created')
    },
    onError: (err) => toast.error(axiosErrorMessage(err, 'Failed to create objective')),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) => objectivesApi.update(id, name),
    onSuccess: () => {
      invalidateObjectiveAndCampaignCaches()
      toast.success('Objective updated')
    },
    onError: (err) => toast.error(axiosErrorMessage(err, 'Failed to update objective')),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => objectivesApi.remove(id),
    onSuccess: () => {
      invalidateObjectiveAndCampaignCaches()
      toast.success('Objective deleted')
    },
    onError: () => toast.error('Failed to delete objective'),
  })

  const items = (data ?? []).map((o) => ({
    id: o.id,
    name: o.name,
    usage_count: o.campaign_count ?? 0,
  }))

  return { items, isLoading, isError, createMutation, updateMutation, deleteMutation }
}
