import { useNavigate } from 'react-router-dom'
import { MessageSquare, Heart, Megaphone, FolderKanban, FileClock, Share2, Eye } from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { MetricCard } from '@/components/common/MetricCard'
import { StatusBadge } from '@/components/common/StatusBadge'
import { PlatformBadge } from '@/components/common/PlatformBadge'
import { TimeSeriesChart } from '@/components/charts/TimeSeriesChart'
import { PlatformBreakdownChart } from '@/components/charts/PlatformBreakdownChart'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { mockDailyMetrics, mockPlatformMetrics, mockOverviewMetrics } from '@/mocks/fixtures/metrics'
import { mockCampaigns } from '@/mocks/fixtures/campaigns'
import { mockPosts } from '@/mocks/fixtures/posts'
import { mockProjects } from '@/mocks/fixtures/projects'

import { formatNumber } from '@/lib/utils/format'

export default function DashboardPage() {
  const navigate = useNavigate()
  const activeCampaigns = mockCampaigns
    .filter(c => c.status === 'active')
    .sort((a, b) => b.commentCount - a.commentCount)
    .slice(0, 5)

  const trendingPosts = [...mockPosts]
    .sort((a, b) => (b.likes + b.comments + b.shares + b.views) - (a.likes + a.comments + a.shares + a.views))
    .slice(0, 5)

  const chartSeries = [
    { key: 'comments', label: 'Comments', color: '#f4c10b' },
    { key: 'engagements', label: 'Engagements', color: '#FCD34D' },
  ]

  const platformData = mockPlatformMetrics.map(p => ({
    platform: p.platform,
    value: p.comments,
  }))

  return (
    <div className="space-y-6">
      <PageHeader title="Dashboard" description="Overview of your social listening activity" />

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          label="Total Projects"
          value={mockProjects.length}
          icon={<FolderKanban className="h-5 w-5" />}
        />
        <MetricCard
          label="Active Campaigns"
          value={mockOverviewMetrics.activeCampaigns.value}
          icon={<Megaphone className="h-5 w-5" />}
        />
        <MetricCard
          label="Planned Campaigns"
          value={mockCampaigns.filter(c => c.status === 'draft').length}
          icon={<FileClock className="h-5 w-5" />}
        />
        <MetricCard
          label="Total Campaigns"
          value={mockCampaigns.length}
          icon={<Megaphone className="h-5 w-5" />}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <TimeSeriesChart
          data={mockDailyMetrics}
          series={chartSeries}
          title="Comment & Engagement Volume"
          type="area"
          className="lg:col-span-2"
        />
        <PlatformBreakdownChart data={platformData} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Active Campaigns</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {activeCampaigns.map(campaign => (
                <div
                  key={campaign.id}
                  className="flex items-center justify-between rounded-lg p-3 hover:bg-muted/50 cursor-pointer transition-colors duration-150"
                  onClick={() => navigate(`/projects/${campaign.projectId}/campaigns/${campaign.id}`)}
                >
                  <div className="flex items-center gap-3">
                    <div>
                      <p className="text-sm font-medium">{campaign.name}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <StatusBadge status={campaign.status} />
                        {campaign.platforms.slice(0, 3).map(p => (
                          <PlatformBadge key={p} platform={p} size="sm" />
                        ))}
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-mono font-medium">{formatNumber(campaign.commentCount)}</p>
                    <p className="text-xs text-muted-foreground">{campaign.engagementRate}% eng.</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Trending Posts</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {trendingPosts.map(post => (
                <div key={post.id} className="flex gap-3 rounded-lg p-3 hover:bg-muted/50 transition-colors duration-150">
                  <Avatar className="h-8 w-8 shrink-0">
                    <AvatarImage src={post.authorAvatar} />
                    <AvatarFallback className="text-xs">{post.authorName[0]}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium truncate">{post.authorName}</span>
                      <PlatformBadge platform={post.platform} size="sm" />
                    </div>
                    <p className="text-sm text-muted-foreground line-clamp-1 mt-0.5">{post.content}</p>
                    <div className="flex items-center gap-4 mt-1.5">
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Heart className="h-3 w-3" />
                        {formatNumber(post.likes)}
                      </span>
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <MessageSquare className="h-3 w-3" />
                        {formatNumber(post.comments)}
                      </span>
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Share2 className="h-3 w-3" />
                        {formatNumber(post.shares)}
                      </span>
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Eye className="h-3 w-3" />
                        {formatNumber(post.views)}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
