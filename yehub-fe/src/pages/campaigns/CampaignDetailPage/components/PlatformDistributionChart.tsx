import { useQuery } from '@tanstack/react-query'
import { Cell, Pie, PieChart } from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart'
import { campaignsApi } from '@/api/campaigns'
import { queryKeys } from '@/lib/constants/query-keys'
import { PLATFORM_BRAND } from '@/lib/constants/platforms'

export function PlatformDistributionChart({ campaignId, className }: { campaignId: string; className?: string }) {
  const { data, isPending, isError } = useQuery({
    queryKey: queryKeys.campaignPlatformDistribution(campaignId),
    queryFn: () => campaignsApi.getCommentsByPlatform(campaignId),
  })

  const distribution = data?.distribution ?? []

  const chartConfig: ChartConfig = Object.fromEntries(
    distribution.map((d) => [
      d.platform,
      {
        label: PLATFORM_BRAND[d.platform]?.label ?? d.platform,
        color: PLATFORM_BRAND[d.platform]?.color ?? 'var(--chart-1)',
      },
    ]),
  )

  return (
    <Card className={className}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">Comments by platform</CardTitle>
      </CardHeader>
      <CardContent>
        {isPending ? (
          <Skeleton className="h-[250px] w-full" />
        ) : isError ? (
          <p className="flex h-[250px] items-center justify-center text-sm text-muted-foreground">Failed to load</p>
        ) : distribution.length === 0 ? (
          <p className="flex h-[250px] items-center justify-center text-sm text-muted-foreground">No comments yet</p>
        ) : (
          <ChartContainer config={chartConfig} className="mx-auto aspect-square max-h-[250px]">
            <PieChart>
              <ChartTooltip content={<ChartTooltipContent nameKey="platform" />} />
              <Pie data={distribution} dataKey="count" nameKey="platform" innerRadius={50}>
                {distribution.map((d) => (
                  <Cell key={d.platform} fill={`var(--color-${d.platform})`} />
                ))}
              </Pie>
              <ChartLegend content={<ChartLegendContent nameKey="platform" />} />
            </PieChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  )
}
