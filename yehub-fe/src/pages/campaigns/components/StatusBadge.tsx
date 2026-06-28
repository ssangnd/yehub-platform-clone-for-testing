import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { CampaignStatus } from '@/api/campaigns'

const STATUS_CONFIG: Record<CampaignStatus, { label: string; bgClass: string }> = {
  DRAFT: { label: 'Draft', bgClass: 'bg-gray-500/10 text-gray-500' },
  ACTIVE: { label: 'Active', bgClass: 'bg-green-500/10 text-green-500' },
  PAUSED: { label: 'Paused', bgClass: 'bg-yellow-500/10 text-yellow-500' },
  COMPLETED: { label: 'Completed', bgClass: 'bg-blue-500/10 text-blue-500' },
}

interface StatusBadgeProps {
  status: CampaignStatus
  className?: string
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const config = STATUS_CONFIG[status]

  return (
    <Badge variant="outline" className={cn(config.bgClass, 'border-0', className)}>
      {config.label}
    </Badge>
  )
}
