import type { UserStatus } from '@/api/admin'
import { Badge } from '@/components/ui/badge'
import { USER_STATUS_CONFIG } from '@/lib/constants/statuses'

const STATUS_BADGE_CLASSNAME: Record<UserStatus, string> = {
  ACTIVE: 'bg-success/10 text-success border-0',
  INVITED: 'bg-warning/10 text-warning border-0',
  INACTIVE: '',
}

export function StatusBadge({ status }: { status: UserStatus }) {
  return (
    <Badge variant="outline" className={STATUS_BADGE_CLASSNAME[status]}>
      {USER_STATUS_CONFIG[status].label}
    </Badge>
  )
}
