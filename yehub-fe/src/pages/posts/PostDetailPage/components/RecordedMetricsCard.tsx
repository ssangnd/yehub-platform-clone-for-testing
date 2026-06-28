import { BarChart3, MessageSquare, Share2, Eye, Info } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip'
import { formatNumber, formatRelativeTime } from '@/lib/format'
import { deriveRecordedKpiMetrics, type PostMetricCounts } from '@/lib/post-metrics'
import type { KpiTargets } from '@/api/posts'

interface RecordedMetricsCardProps {
  metrics: PostMetricCounts | null
  kpiTargets: KpiTargets | null
  lastPolledAt: string | null
  onSyncMetrics?: () => void
  onSyncComments?: () => void
  isSyncingMetrics?: boolean
  isSyncingComments?: boolean
}

interface MetricTileProps {
  label: string
  icon: React.ReactNode
  value: number
  kpiTarget: number
  definition: string
}

function MetricTile({ label, icon, value, kpiTarget, definition }: MetricTileProps) {
  const hasKpi = kpiTarget > 0
  const pct = hasKpi ? Math.round((value / kpiTarget) * 100) : 0
  const reachedKpi = pct >= 100

  return (
    <div className="rounded-lg border bg-background/50 p-3 space-y-1.5">
      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <span className="text-primary">{icon}</span>
        <span>{label}</span>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger aria-label={`${label} definition`}>
              <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
            </TooltipTrigger>
            <TooltipContent>{definition}</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
      <p className="text-2xl font-semibold">{formatNumber(value)}</p>
      {hasKpi ? (
        <>
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>vs KPI {formatNumber(kpiTarget)}</span>
            <span>{pct}%</span>
          </div>
          <div className="h-1 w-full overflow-hidden rounded-full bg-primary/20">
            <div
              className={`h-full transition-all ${reachedKpi ? 'bg-green-500' : 'bg-primary'}`}
              style={{ width: `${Math.min(pct, 100)}%` }}
            />
          </div>
        </>
      ) : (
        <p className="text-xs text-muted-foreground">—</p>
      )}
    </div>
  )
}

export function RecordedMetricsCard({
  metrics,
  kpiTargets,
  lastPolledAt,
  onSyncMetrics,
  onSyncComments,
  isSyncingMetrics,
  isSyncingComments,
}: RecordedMetricsCardProps) {
  const targets = kpiTargets ?? { engagement: 0, buzz: 0, interaction: 0, view: 0 }
  const recorded = metrics ? deriveRecordedKpiMetrics(metrics) : null
  const canSync = Boolean(onSyncMetrics || onSyncComments)

  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-2 mb-4">
          <div className="flex items-center gap-1.5">
            <h3 className="text-sm font-semibold">Recorded Metrics</h3>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger>
                  <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                </TooltipTrigger>
                <TooltipContent>Metrics collected by Yehub from the platform</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-xs text-muted-foreground">
              {lastPolledAt ? `Last updated: ${formatRelativeTime(lastPolledAt)}` : 'Not synced yet'}
            </span>
            {metrics && onSyncMetrics && (
              <Button
                size="sm"
                variant="outline"
                onClick={onSyncMetrics}
                disabled={isSyncingMetrics}
                className="h-7 text-xs cursor-pointer"
              >
                <BarChart3 className="h-3.5 w-3.5" />
                Sync metrics
              </Button>
            )}
            {metrics && onSyncComments && (
              <Button
                size="sm"
                variant="outline"
                onClick={onSyncComments}
                disabled={isSyncingComments}
                className="h-7 text-xs cursor-pointer"
              >
                <MessageSquare className="h-3.5 w-3.5" />
                Sync comments
              </Button>
            )}
          </div>
        </div>

        {recorded ? (
          <div className="grid grid-cols-2 gap-3">
            <MetricTile
              label="Engagement"
              icon={<BarChart3 className="h-4 w-4" />}
              value={recorded.engagement}
              kpiTarget={targets.engagement}
              definition="Likes + Shares + Comments"
            />
            <MetricTile
              label="Buzz"
              icon={<MessageSquare className="h-4 w-4" />}
              value={recorded.buzz}
              kpiTarget={targets.buzz}
              definition="Comments + Shares"
            />
            <MetricTile
              label="Interaction"
              icon={<Share2 className="h-4 w-4" />}
              value={recorded.interaction}
              kpiTarget={targets.interaction}
              definition="Likes + Shares + Comments + Views"
            />
            <MetricTile
              label="View"
              icon={<Eye className="h-4 w-4" />}
              value={recorded.view}
              kpiTarget={targets.view}
              definition="Total views collected from the platform"
            />
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center text-center py-10 gap-2">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
              <BarChart3 className="h-6 w-6 text-muted-foreground" />
            </div>
            <p className="text-sm font-semibold">No metrics available</p>
            <p className="text-xs text-muted-foreground">
              {canSync ? 'Sync to collect data for this post.' : 'Metrics are not available yet.'}
            </p>
            {canSync && (
              <div className="mt-2 flex items-center gap-2">
                {onSyncMetrics && (
                  <Button size="sm" onClick={onSyncMetrics} disabled={isSyncingMetrics} className="cursor-pointer">
                    <BarChart3 className="h-4 w-4" />
                    Sync metrics
                  </Button>
                )}
                {onSyncComments && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={onSyncComments}
                    disabled={isSyncingComments}
                    className="cursor-pointer"
                  >
                    <MessageSquare className="h-4 w-4" />
                    Sync comments
                  </Button>
                )}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
