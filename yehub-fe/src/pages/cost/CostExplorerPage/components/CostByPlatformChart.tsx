import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart'
import { formatUsd } from '@/lib/format'
import { PLATFORMS } from '@/lib/constants/platforms'
import type { CostOverview } from '@/api/cost'

const chartConfig: ChartConfig = { total_usd: { label: 'Spend', color: 'var(--chart-2)' } }

function platformLabel(platform: string): string {
  if (platform === 'UNATTRIBUTED') return 'Unattributed'
  return PLATFORMS.find((p) => p.value === platform)?.label ?? platform
}

export function CostByPlatformChart({ data }: { data: CostOverview['by_platform'] }) {
  const rows = data.map((d) => ({ ...d, label: platformLabel(d.platform) }))
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">Spend by platform</CardTitle>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="flex h-[250px] items-center justify-center text-sm text-muted-foreground">No spend yet</p>
        ) : (
          <ChartContainer config={chartConfig} className="h-[250px] w-full">
            <BarChart data={rows} margin={{ left: 4, right: 12, top: 8 }}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} />
              <YAxis tickLine={false} axisLine={false} width={48} tickFormatter={(v: number) => formatUsd(v)} />
              <ChartTooltip
                content={<ChartTooltipContent nameKey="total_usd" formatter={(value) => formatUsd(Number(value))} />}
              />
              <Bar dataKey="total_usd" fill="var(--color-total_usd)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  )
}
