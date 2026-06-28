import { Badge } from '@/components/ui/badge'

export function RunStatusBadge({ status }: { status: string }) {
  const tone =
    status === 'SUCCEEDED'
      ? 'bg-emerald-100 text-emerald-700'
      : status === 'FAILED' || status === 'ABORTED' || status === 'TIMED-OUT'
        ? 'bg-red-100 text-red-700'
        : 'bg-amber-100 text-amber-700'
  return (
    <Badge variant="outline" className={`${tone} border-0`}>
      {status}
    </Badge>
  )
}
