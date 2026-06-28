import { useParams, useNavigate } from 'react-router-dom'
import { MetricCard } from '@/components/common/MetricCard'
import { PlatformIcon } from '@/components/common/PlatformBadge'
import { PLATFORM_CONFIG } from '@/lib/constants/platforms'
import { EmptyState } from '@/components/common/EmptyState'
import { DataTable, type Column } from '@/components/common/DataTable'
import { TimeSeriesChart } from '@/components/charts/TimeSeriesChart'
import { PlatformBreakdownChart } from '@/components/charts/PlatformBreakdownChart'
import { Progress } from '@/components/ui/progress'
import { mockCampaigns } from '@/mocks/fixtures/campaigns'
import { mockPosts } from '@/mocks/fixtures/posts'
import { mockDailyMetrics } from '@/mocks/fixtures/metrics'
import { cn } from '@/lib/utils'
import { formatNumber } from '@/lib/utils/format'
import { differenceInDays, parseISO } from 'date-fns'
import { ALL_CAMPAIGN_METRICS, CAMPAIGN_METRIC_LABELS } from '@/types/campaign'
import type { CampaignMetric } from '@/types/campaign'
import type { Post } from '@/types/post'

export default function CampaignOverviewPage() {
  const { projectId, campaignId } = useParams()
  const navigate = useNavigate()

  const campaign = mockCampaigns.find(c => c.id === campaignId)
  const posts = mockPosts.filter(p => p.campaignId === campaignId)

  // KPI date-based evaluation
  const now = new Date()
  const campaignStart = campaign ? parseISO(campaign.startDate) : now
  const campaignEnd = campaign ? parseISO(campaign.endDate) : now
  const totalDays = Math.max(differenceInDays(campaignEnd, campaignStart), 1)
  const elapsedDays = Math.max(Math.min(differenceInDays(now, campaignStart), totalDays), 0)
  const timeProgress = elapsedDays / totalDays

  if (!campaign) {
    return (
      <EmptyState
        title="Campaign not found"
      />
    )
  }

  const platformCounts = posts.reduce((acc, post) => {
    acc[post.platform] = (acc[post.platform] || 0) + post.comments
    return acc
  }, {} as Record<string, number>)

  const platformData = Object.entries(platformCounts).map(([platform, value]) => ({
    platform,
    value,
  }))

  const totalBuzz = posts.reduce((s, p) => s + p.kpiCurrents.buzz, 0)
  const totalInteractions = posts.reduce((s, p) => s + p.kpiCurrents.interaction, 0)
  const totalViews = posts.reduce((s, p) => s + p.kpiCurrents.view, 0)
  const totalEngagement = posts.reduce((s, p) => s + p.kpiCurrents.engagement, 0)
  const p2pRate = campaign.commentCount > 0 && campaign.postCount > 0
    ? ((campaign.commentCount / campaign.postCount) * 100 / campaign.engagementRate).toFixed(1)
    : '0'

  const metricValues: Record<CampaignMetric, string | number> = {
    posts: campaign.postCount,
    comments: campaign.commentCount,
    buzz: totalBuzz,
    interactions: totalInteractions,
    view: totalViews,
    engagement: totalEngagement,
    p2pCommentRate: `${p2pRate}%`,
  }

  const displayOrder = campaign.displayMetrics ?? ALL_CAMPAIGN_METRICS
  const metrics = displayOrder.map(key => ({
    key,
    label: CAMPAIGN_METRIC_LABELS[key],
    value: metricValues[key],
  }))

  const columns: Column<Post>[] = [
    {
      key: 'authorName',
      header: 'Author',
      render: (p) => (
        <div className="flex items-center gap-2">
          <PlatformIcon platform={p.platform} className="h-4 w-4 shrink-0" style={{ color: PLATFORM_CONFIG[p.platform].color }} />
          <span className="text-sm font-medium truncate">{p.authorName}</span>
        </div>
      ),
    },
    {
      key: 'content',
      header: 'Content',
      render: (p) => (
        <div className="max-w-xs">
          <p className="text-sm line-clamp-2">{p.content}</p>
        </div>
      ),
    },
    {
      key: 'likes',
      header: 'Likes',
      sortable: true,
      render: (p) => <span className="font-mono">{formatNumber(p.likes)}</span>,
    },
    {
      key: 'comments',
      header: 'Comments',
      sortable: true,
      render: (p) => <span className="font-mono">{formatNumber(p.comments)}</span>,
    },
{
      key: 'engagementRate',
      header: 'Eng. Rate',
      sortable: true,
      render: (p) => <span className="font-mono">{p.engagementRate}%</span>,
    },
    {
      key: 'kpiCurrents' as keyof Post,
      header: 'KPI',
      render: (p) => {
        const totalTarget = p.kpiTargets.engagement + p.kpiTargets.buzz + p.kpiTargets.interaction + p.kpiTargets.view
        const totalCurrent = p.kpiCurrents.engagement + p.kpiCurrents.buzz + p.kpiCurrents.interaction + p.kpiCurrents.view
        const pct = totalTarget > 0 ? Math.min(Math.round((totalCurrent / totalTarget) * 100), 100) : 0
        const expectedKpi = Math.round(timeProgress * totalTarget)
        const isUnderperforming = totalTarget > 0 && totalCurrent < expectedKpi
        return (
          <div className="w-28 space-y-1">
            <div className="flex justify-between text-xs">
              <span className="font-mono">{formatNumber(totalCurrent)}</span>
              <span className="text-muted-foreground">{formatNumber(totalTarget)}</span>
            </div>
            <Progress value={pct} className="h-2" indicatorClassName={isUnderperforming ? 'bg-destructive' : undefined} />
            <p className={`text-xs text-right ${isUnderperforming ? 'text-destructive' : 'text-muted-foreground'}`}>{pct}%</p>
          </div>
        )
      },
    },
  ]

  return (
    <div className="space-y-6">
      <div className={cn('grid gap-4 md:grid-cols-2', {
        'lg:grid-cols-3': metrics.length === 3,
        'lg:grid-cols-4': metrics.length >= 4,
      })}>
        {metrics.map(m => (
          <MetricCard key={m.key} label={m.label} value={m.value} />
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <TimeSeriesChart
          data={mockDailyMetrics.slice(0, 20)}
          series={[{ key: 'comments', label: 'Comments', color: '#f4c10b' }]}
          title="Comment Volume"
          type="area"
          className="lg:col-span-2"
        />
        <PlatformBreakdownChart data={platformData} />
      </div>

      <div>
        <h3 className="text-lg font-semibold mb-4">Top Performance ({posts.length})</h3>
        <DataTable
          columns={columns}
          data={posts}
          keyExtractor={(p) => p.id}
          onRowClick={(p) => navigate(`/projects/${projectId}/campaigns/${campaignId}/posts/${p.id}`)}
          emptyMessage="No posts added yet"
        />
      </div>
    </div>
  )
}
