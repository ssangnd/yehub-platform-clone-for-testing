import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart'
import { formatNumber, formatUsd, formatRelativeTime } from '@/lib/format'
import { jobTypeLabel } from '@/lib/apify'
import { RunStatusBadge } from '@/components/common/RunStatusBadge'
import type { CommentVolumeGranularity } from '@/api/campaigns'
import { useCampaignSpending } from '../use-campaign-spending'

const chartConfig: ChartConfig = {
  usd: { label: 'Spend', color: 'var(--chart-1)' },
}

function formatTick(date: string, granularity: CommentVolumeGranularity): string {
  const label = new Date(`${date}T00:00:00.000Z`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  })
  return granularity === 'week' ? `Wk ${label}` : label
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-2xl font-bold">{value}</p>
      </CardContent>
    </Card>
  )
}

function TopCostList({
  title,
  items,
}: {
  title: string
  items: { id: string; label: string; runCount: number; totalUsd: number }[]
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">No data yet</p>
        ) : (
          <ul className="space-y-2">
            {items.map((item) => (
              <li key={item.id} className="flex items-center justify-between gap-3 text-sm">
                <span className="min-w-0 truncate">{item.label}</span>
                <span className="shrink-0 text-muted-foreground">
                  {formatUsd(item.totalUsd)} · {item.runCount} run{item.runCount === 1 ? '' : 's'}
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

export function CampaignSpendingTab({ campaignId }: { campaignId: string }) {
  const { data, isPending, isError } = useCampaignSpending(campaignId)

  if (isPending) {
    return (
      <div className="space-y-6">
        <div className="grid gap-4 md:grid-cols-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
        <Skeleton className="h-[250px] w-full" />
      </div>
    )
  }

  if (isError || !data) {
    return <p className="py-12 text-center text-sm text-muted-foreground">Failed to load spending data.</p>
  }

  if (data.run_count === 0) {
    return (
      <p className="py-12 text-center text-sm text-muted-foreground">No Apify runs recorded for this campaign yet.</p>
    )
  }

  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="grid gap-4 md:grid-cols-2">
        <SummaryCard label="Total spend" value={formatUsd(data.total_usd)} />
        <SummaryCard label="Total runs" value={formatNumber(data.run_count)} />
      </div>

      {/* By job type */}
      <div className="grid gap-4 md:grid-cols-3">
        {data.by_job_type.map((b) => (
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

      {/* Spend over time */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">Spend over time</CardTitle>
        </CardHeader>
        <CardContent>
          {data.series.points.length === 0 ? (
            <p className="flex h-[250px] items-center justify-center text-sm text-muted-foreground">No spend yet</p>
          ) : (
            <ChartContainer config={chartConfig} className="h-[250px] w-full">
              <BarChart data={data.series.points} margin={{ left: 4, right: 12, top: 8 }}>
                <CartesianGrid vertical={false} />
                <XAxis
                  dataKey="date"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  minTickGap={24}
                  tickFormatter={(value: string) => formatTick(value, data.series.granularity)}
                />
                <YAxis tickLine={false} axisLine={false} width={48} tickFormatter={(v: number) => formatUsd(v)} />
                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      nameKey="usd"
                      labelFormatter={(value) => formatTick(String(value), data.series.granularity)}
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

      {/* Top cost drivers */}
      <div className="grid gap-4 md:grid-cols-2">
        <TopCostList
          title="Top posts by cost"
          items={data.top_posts.map((p) => ({
            id: p.post_id,
            label: p.label,
            runCount: p.run_count,
            totalUsd: p.total_usd,
          }))}
        />
        <TopCostList
          title="Top accounts by cost"
          items={data.top_accounts.map((a) => ({
            id: a.social_account_id,
            label: a.label,
            runCount: a.run_count,
            totalUsd: a.total_usd,
          }))}
        />
      </div>

      {/* Recent runs */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">Recent runs</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Type</TableHead>
                <TableHead>Target</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>When</TableHead>
                <TableHead className="text-right">Cost</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.recent_runs.map((run) => (
                <TableRow key={run.id}>
                  <TableCell>{jobTypeLabel(run.job_type)}</TableCell>
                  <TableCell className="max-w-[200px] truncate">{run.label ?? '—'}</TableCell>
                  <TableCell>
                    <RunStatusBadge status={run.status} />
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {run.started_at ? formatRelativeTime(run.started_at) : '—'}
                  </TableCell>
                  <TableCell className="text-right">
                    {run.usage_finalized && run.usage_total_usd !== null ? (
                      formatUsd(run.usage_total_usd)
                    ) : (
                      <span className="text-muted-foreground">pending</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
