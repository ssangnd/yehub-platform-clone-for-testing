import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { formatNumber } from '@/lib/format'
import { differenceInDays, parseISO } from 'date-fns'
import { cn } from '@/lib/utils'
import { computeOverallKpi, type PostMetricCounts } from '@/lib/post-metrics'
import type { KpiTargets } from '@/api/posts'

interface OverallKpiCardProps {
  metrics: PostMetricCounts | null
  kpiTargets: KpiTargets | null
  campaignStartDate: string | null
  campaignEndDate: string | null
}

interface CircularProgressProps {
  pct: number
  label: string
  variant: 'empty' | 'default' | 'destructive' | 'success'
}

function CircularProgress({ pct, label, variant }: CircularProgressProps) {
  const size = 96
  const strokeWidth = 8
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (pct / 100) * circumference

  const trackClass = variant === 'empty' ? 'stroke-muted' : 'stroke-primary/20'
  const progressClass =
    variant === 'destructive' ? 'stroke-destructive' : variant === 'success' ? 'stroke-green-500' : 'stroke-primary'

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" strokeWidth={strokeWidth} className={trackClass} />
        {variant !== 'empty' && (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            className={cn('transition-all', progressClass)}
          />
        )}
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className={cn('text-xl font-semibold', variant === 'empty' && 'text-muted-foreground')}>{label}</span>
      </div>
    </div>
  )
}

export function OverallKpiCard({ metrics, kpiTargets, campaignStartDate, campaignEndDate }: OverallKpiCardProps) {
  const targets = kpiTargets ?? { engagement: 0, buzz: 0, interaction: 0, view: 0 }
  const counts = metrics ?? { likes: 0, comments: 0, shares: 0, views: 0 }

  // Overall KPI = sum(min(actual, target)) / sum(target).
  const { totalAchieved: totalCurrent, totalTarget, pct: kpiPct } = computeOverallKpi(counts, targets)

  const hasData = metrics !== null && totalTarget > 0

  if (!hasData) {
    return (
      <Card>
        <CardContent className="p-5">
          <div className="flex items-center gap-4">
            <CircularProgress pct={0} label="--" variant="empty" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <h3 className="text-sm font-semibold">Overall KPI</h3>
                <Badge variant="destructive" className="text-xs">
                  Not available
                </Badge>
              </div>
              <p className="text-base font-semibold">No KPI data</p>
              <p className="text-xs text-muted-foreground mt-1">Update post PKI to view the PKI progress.</p>
            </div>
          </div>
        </CardContent>
      </Card>
    )
  }

  const now = new Date()
  const start = campaignStartDate ? parseISO(campaignStartDate) : now
  const end = campaignEndDate ? parseISO(campaignEndDate) : now
  const totalDays = Math.max(differenceInDays(end, start), 1)
  const elapsedDays = Math.max(Math.min(differenceInDays(now, start), totalDays), 0)
  const expectedKpi = Math.round((elapsedDays / totalDays) * totalTarget)
  const isUnderperforming = totalCurrent < expectedKpi
  const isReached = kpiPct >= 100

  const variant = isReached ? 'success' : isUnderperforming ? 'destructive' : 'default'

  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-center gap-4">
          <CircularProgress pct={kpiPct} label={`${kpiPct}%`} variant={variant} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h3 className="text-sm font-semibold">Overall KPI</h3>
              {isReached ? (
                <Badge className="text-xs bg-green-500/10 text-green-500 border-0">Target Reached</Badge>
              ) : isUnderperforming ? (
                <Badge variant="destructive" className="text-xs">
                  Underperforming
                </Badge>
              ) : (
                <Badge variant="secondary" className="text-xs">
                  On Track
                </Badge>
              )}
            </div>
            <p className="text-xl font-semibold font-mono">
              {formatNumber(totalCurrent)}{' '}
              <span className="text-muted-foreground text-base">/ {formatNumber(totalTarget)}</span>
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
