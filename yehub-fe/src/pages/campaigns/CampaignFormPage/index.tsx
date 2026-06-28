import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import axios from 'axios'
import { ArrowLeft } from 'lucide-react'
import { campaignsApi } from '@/api/campaigns'
import { campaignFormSchema, type CampaignFormValues } from '@/lib/schemas'
import { queryKeys } from '@/lib/constants/query-keys'
import { PageHeader } from '@/components/common/PageHeader'
import { PageWrapper } from '@/components/common/PageWrapper'
import { Button } from '@/components/ui/button'
import { Form } from '@/components/ui/form'
import { BasicInfoCard } from './components/BasicInfoCard'
import { PlatformsCard } from './components/PlatformsCard'
import { ScheduleCard } from './components/ScheduleCard'
import { PollingIntervalsCard } from './components/PollingIntervalsCard'
import { DisplayMetricsCard } from './components/DisplayMetricsCard'
import { ObjectivesCard } from './components/ObjectivesCard'

export function CampaignFormPage() {
  const { projectId, campaignId } = useParams<{ projectId: string; campaignId: string }>()
  const [searchParams] = useSearchParams()
  const duplicateFromId = searchParams.get('from')
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const isEdit = !!campaignId
  const isDuplicate = !isEdit && !!duplicateFromId

  const sourceId = campaignId ?? duplicateFromId ?? ''
  const { data: sourceCampaign } = useQuery({
    queryKey: queryKeys.campaign(sourceId),
    queryFn: () => campaignsApi.getCampaign(sourceId),
    enabled: !!sourceId,
  })

  const form = useForm<CampaignFormValues>({
    resolver: zodResolver(campaignFormSchema),
    defaultValues: {
      name: '',
      description: '',
      platforms: [],
      start_date: '',
      end_date: '',
      metric_polling_interval: 3600,
      comments_polling_interval: 21600,
      display_metrics: [],
      objectives: [],
    },
    values:
      (isEdit || isDuplicate) && sourceCampaign
        ? {
            name: isDuplicate ? `${sourceCampaign.name} (copy)` : sourceCampaign.name,
            description: sourceCampaign.description ?? '',
            platforms: sourceCampaign.platforms ?? [],
            start_date: sourceCampaign.start_date?.slice(0, 10) ?? '',
            end_date: sourceCampaign.end_date?.slice(0, 10) ?? '',
            metric_polling_interval: sourceCampaign.metric_polling_interval ?? 3600,
            comments_polling_interval: sourceCampaign.comments_polling_interval ?? 21600,
            display_metrics: sourceCampaign.display_metrics ?? [],
            objectives: sourceCampaign.objectives ?? [],
          }
        : undefined,
  })

  const mutation = useMutation({
    mutationFn: (values: CampaignFormValues) => {
      const payload = {
        name: values.name.trim(),
        description: values.description?.trim() || null,
        platforms: values.platforms,
        start_date: values.start_date,
        end_date: values.end_date,
        metric_polling_interval: values.metric_polling_interval,
        comments_polling_interval: values.comments_polling_interval,
        display_metrics: values.display_metrics,
        objective_ids: values.objectives?.map((o) => o.id) ?? [],
      }
      if (isEdit) {
        return campaignsApi.updateCampaign(campaignId!, payload)
      }
      return campaignsApi.createCampaign(projectId!, payload)
    },
    onSuccess: (response) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.campaigns.all })
      if (projectId) {
        queryClient.invalidateQueries({ queryKey: queryKeys.campaigns.byProject(projectId) })
      }
      toast.success(isEdit ? 'Campaign updated' : 'Campaign created')
      const id = isEdit ? campaignId : response.data.id
      navigate(`/projects/${projectId}/campaigns/${id}`)
    },
    onError: (err) => {
      if (axios.isAxiosError(err)) {
        const msg = (err.response?.data as { message?: string })?.message ?? 'Failed to save campaign'
        if (err.response?.status === 409) {
          form.setError('name', {
            type: 'server',
            message:
              msg === 'Failed to save campaign' ? 'A campaign with this name already exists in this project' : msg,
          })
          return
        }
        toast.error(msg)
      }
    },
  })

  const backPath = isEdit ? `/projects/${projectId}/campaigns/${campaignId}` : `/projects/${projectId}`

  return (
    <PageWrapper>
      <PageHeader
        title={isEdit ? 'Edit Campaign' : isDuplicate ? 'Duplicate Campaign' : 'New Campaign'}
        description={sourceCampaign ? `Project: ${sourceCampaign.project_name}` : undefined}
        actions={
          <Button variant="outline" onClick={() => navigate(backPath)} className="cursor-pointer">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Button>
        }
      />

      <Form {...form}>
        <form
          onSubmit={form.handleSubmit(
            (v) => mutation.mutate(v),
            (errors) => {
              console.error('Form validation errors:', errors)
              const firstError = Object.values(errors)[0]
              if (firstError?.message) {
                toast.error(String(firstError.message))
              }
            },
          )}
          className="space-y-6"
        >
          <div className="grid gap-6 lg:grid-cols-12">
            <BasicInfoCard />
            <PlatformsCard />
            <ScheduleCard />
            <PollingIntervalsCard />
            <DisplayMetricsCard />
            <ObjectivesCard />
          </div>

          <div className="flex items-center gap-3">
            <Button type="submit" disabled={mutation.isPending} className="cursor-pointer">
              {mutation.isPending ? 'Saving...' : isEdit ? 'Save Changes' : 'Create Campaign'}
            </Button>
            <Button type="button" variant="outline" className="cursor-pointer" onClick={() => navigate(backPath)}>
              Cancel
            </Button>
          </div>
        </form>
      </Form>
    </PageWrapper>
  )
}
