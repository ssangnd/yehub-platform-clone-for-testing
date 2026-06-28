import { PageWrapper } from '@/components/common/PageWrapper'
import { PageHeader } from '@/components/common/PageHeader'
import { useSetPageTitle } from '@/hooks/use-page-title'
import { Skeleton } from '@/components/ui/skeleton'
import { useCostExplorer } from './use-cost-explorer'
import { useCostFilterOptions } from './use-cost-filter-options'
import { CostFilterBar } from './components/CostFilterBar'
import { CostSummaryCards } from './components/CostSummaryCards'
import { CostOverTimeChart } from './components/CostOverTimeChart'
import { CostByPlatformChart } from './components/CostByPlatformChart'
import { CostBreakdownTable } from './components/CostBreakdownTable'
import { CostByJobTypeCards } from './components/CostByJobTypeCards'
import { RecentRunsTable } from './components/RecentRunsTable'

export function CostExplorerPage() {
  const { filters, setFilters, data, isPending } = useCostExplorer()
  const { data: options } = useCostFilterOptions()

  useSetPageTitle('Cost Explorer')

  const invalidRange = filters.from > filters.to

  return (
    <PageWrapper>
      <PageHeader title="Cost Explorer" description="Apify spend across all projects and campaigns." />
      <CostFilterBar filters={filters} onChange={setFilters} options={options} />

      {invalidRange ? (
        <p className="py-12 text-center text-sm text-muted-foreground">
          Select a valid date range — "from" must be on or before "to".
        </p>
      ) : isPending ? (
        <div className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-24 w-full" />
            ))}
          </div>
          <Skeleton className="h-[250px] w-full" />
        </div>
      ) : !data ? (
        <p className="py-12 text-center text-sm text-muted-foreground">Failed to load cost data.</p>
      ) : data.summary.run_count === 0 ? (
        <p className="py-12 text-center text-sm text-muted-foreground">No Apify runs in the selected range.</p>
      ) : (
        <div className="space-y-6">
          <CostSummaryCards summary={data.summary} />
          <CostByJobTypeCards data={data.by_job_type} />
          <CostOverTimeChart series={data.series} />
          <CostByPlatformChart data={data.by_platform} />
          <div className="grid gap-4 lg:grid-cols-2">
            <CostBreakdownTable
              title="Top projects by spend"
              primaryHeader="Project"
              rows={data.by_project.map((p) => ({
                key: p.project_id ?? 'unattributed',
                primary: p.project_name,
                runCount: p.run_count,
                totalUsd: p.total_usd,
              }))}
            />
            <CostBreakdownTable
              title="Top campaigns by spend"
              primaryHeader="Campaign"
              secondaryHeader="Project"
              rows={data.by_campaign.map((c) => ({
                key: c.campaign_id ?? 'unattributed',
                primary: c.campaign_name,
                secondary: c.project_name,
                runCount: c.run_count,
                totalUsd: c.total_usd,
              }))}
            />
          </div>
          <RecentRunsTable runs={data.recent_runs} />
        </div>
      )}
    </PageWrapper>
  )
}
