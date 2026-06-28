import { useQuery } from '@tanstack/react-query'
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart'
import { campaignsApi, type CommentVolumeGranularity } from '@/api/campaigns'
import { queryKeys } from '@/lib/constants/query-keys'

const chartConfig: ChartConfig = {
  count: { label: 'Comments', color: 'var(--chart-1)' },
}

function formatTick(date: string, granularity: CommentVolumeGranularity): string {
  const label = new Date(`${date}T00:00:00.000Z`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  })
  return granularity === 'week' ? `Wk ${label}` : label
}

export function CommentVolumeChart({ campaignId, className }: { campaignId: string; className?: string }) {
  const { data, isPending, isError } = useQuery({
    queryKey: queryKeys.campaignCommentVolume(campaignId),
    queryFn: () => campaignsApi.getCommentVolume(campaignId),
  })

  const points = data?.points ?? []
  const granularity = data?.granularity ?? 'day'

  return (
    <Card className={className}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">Comment volume trend</CardTitle>
      </CardHeader>
      <CardContent>
        {isPending ? (
          <Skeleton className="h-[250px] w-full" />
        ) : isError ? (
          <p className="flex h-[250px] items-center justify-center text-sm text-muted-foreground">Failed to load</p>
        ) : points.length === 0 ? (
          <p className="flex h-[250px] items-center justify-center text-sm text-muted-foreground">No comments yet</p>
        ) : (
          <ChartContainer config={chartConfig} className="h-[250px] w-full">
            <LineChart data={points} margin={{ left: 4, right: 12, top: 8 }}>
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey="date"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                minTickGap={24}
                tickFormatter={(value: string) => formatTick(value, granularity)}
              />
              <YAxis tickLine={false} axisLine={false} width={32} allowDecimals={false} />
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    nameKey="count"
                    labelFormatter={(value) => formatTick(String(value), granularity)}
                  />
                }
              />
              <Line dataKey="count" type="monotone" stroke="var(--color-count)" strokeWidth={2} dot={false} />
            </LineChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  )
}
