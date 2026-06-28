import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { formatUsd, formatRelativeTime } from '@/lib/format'
import { jobTypeLabel } from '@/lib/apify'
import { RunStatusBadge } from '@/components/common/RunStatusBadge'
import type { CostOverview } from '@/api/cost'

export function RecentRunsTable({ runs }: { runs: CostOverview['recent_runs'] }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">Recent runs</CardTitle>
      </CardHeader>
      <CardContent>
        {runs.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">No runs yet</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Type</TableHead>
                <TableHead>Target</TableHead>
                <TableHead>Project</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>When</TableHead>
                <TableHead className="text-right">Cost</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {runs.map((run) => (
                <TableRow key={run.id}>
                  <TableCell>{jobTypeLabel(run.job_type)}</TableCell>
                  <TableCell className="max-w-[180px] truncate">{run.label ?? '—'}</TableCell>
                  <TableCell className="max-w-[140px] truncate text-muted-foreground">
                    {run.project_name === 'UNATTRIBUTED' ? 'Unattributed' : run.project_name}
                  </TableCell>
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
        )}
      </CardContent>
    </Card>
  )
}
