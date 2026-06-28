import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart'
import { formatUsd } from '@/lib/format'
import type { CostOverview } from '@/api/cost'
import type { CommentVolumeGranularity } from '@/api/campaigns'

const chartConfig: ChartConfig = { usd: { label: 'Spend', color: 'var(--chart-1)' } }

function formatTick(date: string, granularity: CommentVolumeGranularity): string {
  const label = new Date(`${date}T00:00:00.000Z`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  })
  return granularity === 'week' ? `Wk ${label}` : label
}

export function CostOverTimeChart({ series }: { series: CostOverview['series'] }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">Spend over time</CardTitle>
      </CardHeader>
      <CardContent>
        {series.points.length === 0 ? (
          <p className="flex h-[250px] items-center justify-center text-sm text-muted-foreground">No spend yet</p>
        ) : (
          <ChartContainer config={chartConfig} className="h-[250px] w-full">
            <BarChart data={series.points} margin={{ left: 4, right: 12, top: 8 }}>
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey="date"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                minTickGap={24}
                tickFormatter={(value: string) => formatTick(value, series.granularity)}
              />
              <YAxis tickLine={false} axisLine={false} width={48} tickFormatter={(v: number) => formatUsd(v)} />
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    nameKey="usd"
                    labelFormatter={(value) => formatTick(String(value), series.granularity)}
                    formatter={(value) => formatUsd(Number(value))}
                  />
                }
              />
              <Bar dataKey="usd" fill="var(--color-usd)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  )
}
