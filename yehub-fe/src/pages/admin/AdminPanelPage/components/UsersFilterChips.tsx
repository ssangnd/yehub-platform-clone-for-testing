import { X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import type { UserStatus } from '@/api/admin'
import type { GlobalRole } from '@/api/auth'
import { GLOBAL_ROLE_CONFIG } from '@/lib/constants/roles'
import { USER_STATUS_CONFIG } from '@/lib/constants/statuses'

export interface UsersFilterChipsProps {
  q: string
  roles: GlobalRole[]
  statuses: UserStatus[]
  onClearQ: () => void
  onToggleRole: (role: GlobalRole) => void
  onToggleStatus: (status: UserStatus) => void
}

function Chip({ label, ariaLabel, onRemove }: { label: string; ariaLabel: string; onRemove: () => void }) {
  return (
    <Badge variant="secondary" className="gap-1 pr-1">
      {label}
      <button
        type="button"
        aria-label={ariaLabel}
        onClick={onRemove}
        className="flex size-4 items-center justify-center rounded-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <X className="h-3 w-3" />
      </button>
    </Badge>
  )
}

export function UsersFilterChips({
  q,
  roles,
  statuses,
  onClearQ,
  onToggleRole,
  onToggleStatus,
}: UsersFilterChipsProps) {
  if (!q && roles.length === 0 && statuses.length === 0) return null

  return (
    <div className="flex flex-wrap items-center gap-2">
      {q && <Chip label={`Search: ${q}`} ariaLabel={`Remove filter: search ${q}`} onRemove={onClearQ} />}
      {roles.map((role) => (
        <Chip
          key={role}
          label={`Role: ${GLOBAL_ROLE_CONFIG[role].label}`}
          ariaLabel={`Remove filter: role ${GLOBAL_ROLE_CONFIG[role].label}`}
          onRemove={() => onToggleRole(role)}
        />
      ))}
      {statuses.map((status) => (
        <Chip
          key={status}
          label={`Status: ${USER_STATUS_CONFIG[status].label}`}
          ariaLabel={`Remove filter: status ${USER_STATUS_CONFIG[status].label}`}
          onRemove={() => onToggleStatus(status)}
        />
      ))}
    </div>
  )
}
