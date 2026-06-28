import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatUsd } from '@/lib/format'
import { jobTypeLabel } from '@/lib/apify'
import type { CostOverview } from '@/api/cost'

export function CostByJobTypeCards({ data }: { data: CostOverview['by_job_type'] }) {
  if (data.length === 0) return null
  return (
    <div className="grid gap-4 md:grid-cols-3">
      {data.map((b) => (
        <Card key={b.job_type}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">{jobTypeLabel(b.job_type)}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xl font-bold">{formatUsd(b.total_usd)}</p>
            <p className="text-xs text-muted-foreground">
              {b.run_count} run{b.run_count === 1 ? '' : 's'}
            </p>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
