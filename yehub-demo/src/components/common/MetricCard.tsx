import { Card, CardContent } from '@/components/ui/card'
import { TrendIndicator } from './TrendIndicator'
import { TrendSparkline } from '@/components/charts/TrendSparkline'
import { cn } from '@/lib/utils'
import { formatNumber } from '@/lib/utils/format'

interface MetricCardProps {
  label: string
  value: number | string
  trend?: number
  sparklineData?: number[]
  icon?: React.ReactNode
  className?: string
}

export function MetricCard({ label, value, trend, sparklineData, icon, className }: MetricCardProps) {
  const displayValue = typeof value === 'number' ? formatNumber(value) : value

  return (
    <Card className={cn('transition-shadow duration-200 hover:shadow-md cursor-default', className)}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <p className="text-sm font-medium text-muted-foreground">{label}</p>
            <p className="text-2xl font-bold font-mono">{displayValue}</p>
            {trend !== undefined && <TrendIndicator value={trend} />}
          </div>
          <div className="flex flex-col items-end gap-2">
            {icon && <div className="text-muted-foreground">{icon}</div>}
            {sparklineData && sparklineData.length > 0 && (
              <TrendSparkline data={sparklineData} trend={trend} />
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
