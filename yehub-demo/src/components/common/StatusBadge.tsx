import { Badge } from '@/components/ui/badge'
import { STATUS_CONFIG } from '@/lib/constants/statuses'
import type { CampaignStatus } from '@/types/campaign'
import { cn } from '@/lib/utils'

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
