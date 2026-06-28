import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatNumber, formatUsd } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { CostOverview } from '@/api/cost'

export function CostSummaryCards({ summary }: { summary: CostOverview['summary'] }) {
  const cards = [
    { label: 'Total spend', value: formatUsd(summary.total_usd) },
    { label: 'Total runs', value: formatNumber(summary.run_count) },
    { label: 'Success', value: formatNumber(summary.success_count), valueClassName: 'text-green-600' },
    { label: 'Failure', value: formatNumber(summary.failure_count), valueClassName: 'text-red-600' },
  ]
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {cards.map((c) => (
        <Card key={c.label}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">{c.label}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className={cn('text-2xl font-bold', c.valueClassName)}>{c.value}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
