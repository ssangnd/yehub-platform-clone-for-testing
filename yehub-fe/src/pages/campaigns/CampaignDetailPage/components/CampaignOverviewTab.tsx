import { useQuery } from '@tanstack/react-query'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { campaignsApi, type Campaign } from '@/api/campaigns'
import { queryKeys } from '@/lib/constants/query-keys'
import { formatNumber } from '@/lib/format'
import { CAMPAIGN_METRIC_LABELS, type CampaignMetric } from '@/lib/constants/campaign-metrics'
import { CommentVolumeChart } from './CommentVolumeChart'
import { PlatformDistributionChart } from './PlatformDistributionChart'

// Metrics without an agreed backend definition stay as placeholders.
const COMING_SOON_METRICS = new Set<string>(['p2pCommentRate'])

function MetricCard({ campaignId, metric }: { campaignId: string; metric: string }) {
  const label = CAMPAIGN_METRIC_LABELS[metric as CampaignMetric] ?? metric
  const comingSoon = COMING_SOON_METRICS.has(metric)

  const { data, isPending, isError } = useQuery({
    queryKey: queryKeys.campaignMetric(campaignId, metric),
    queryFn: () => campaignsApi.getMetric(campaignId, metric),
    enabled: !comingSoon,
  })

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
      </CardHeader>
      <CardContent>
        {comingSoon ? (
          <p className="text-2xl font-bold text-muted-foreground">Coming soon</p>
        ) : isPending ? (
          <Skeleton className="h-8 w-20" />
        ) : isError ? (
          <p className="text-2xl font-bold text-muted-foreground">—</p>
        ) : (
          <p className="text-2xl font-bold">{formatNumber(data.value)}</p>
        )}
      </CardContent>
    </Card>
  )
}

export function CampaignOverviewTab({ campaign }: { campaign: Campaign }) {
  const metrics = campaign.display_metrics ?? []

  return (
    <div className="space-y-6">
      {metrics.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {metrics.map((metric) => (
            <MetricCard key={metric} campaignId={campaign.id} metric={metric} />
          ))}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <CommentVolumeChart campaignId={campaign.id} className="lg:col-span-2" />
        <PlatformDistributionChart campaignId={campaign.id} className="lg:col-span-1" />
      </div>
    </div>
  )
}
