import { Clock } from 'lucide-react'
import { formatDistanceToNow, parseISO } from 'date-fns'
import { Card, CardContent } from '@/components/ui/card'

interface PostSyncScheduleCardProps {
  lastMetricSyncAt: string | null
  lastCommentSyncAt: string | null
  nextMetricSyncAt: string | null
  nextCommentSyncAt: string | null
}

function formatSyncTime(value: string | null, emptyLabel: string) {
  if (!value) return emptyLabel
  return formatDistanceToNow(parseISO(value), { addSuffix: true })
}

function SyncScheduleRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  )
}

export function PostSyncScheduleCard({
  lastMetricSyncAt,
  lastCommentSyncAt,
  nextMetricSyncAt,
  nextCommentSyncAt,
}: PostSyncScheduleCardProps) {
  return (
    <Card>
      <CardContent className="space-y-3 p-5">
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold">Sync Schedule</h3>
        </div>
        <div className="space-y-2">
          <SyncScheduleRow label="Last metric sync" value={formatSyncTime(lastMetricSyncAt, 'Not synced yet')} />
          <SyncScheduleRow label="Last comment sync" value={formatSyncTime(lastCommentSyncAt, 'Not synced yet')} />
          <SyncScheduleRow label="Next metric sync" value={formatSyncTime(nextMetricSyncAt, 'Not scheduled')} />
          <SyncScheduleRow label="Next comment sync" value={formatSyncTime(nextCommentSyncAt, 'Not scheduled')} />
        </div>
      </CardContent>
    </Card>
  )
}
