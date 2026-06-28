import { useState } from 'react'
import { UserMinus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { DataTable, type Column } from '@/components/common/DataTable'
import { PresignedAvatar } from '@/components/common/PresignedAvatar'
import { ConfirmationDialog } from '@/components/common/ConfirmationDialog'
import type { GlobalRole } from '@/api/auth'
import type { ProjectRole } from '@/api/projects'
import { formatDate, formatRelativeTime } from '@/lib/format'

const ROLE_LABELS: Record<ProjectRole, string> = {
  MANAGER: 'Manager',
  EXECUTIVE: 'Executive',
  ANALYST: 'Analyst',
  VIEWER: 'Viewer',
}

export interface MemberRow {
  id: string
  name: string
  email: string
  avatar?: string
  role: ProjectRole
  global_role: GlobalRole
  joined_at: string
  source?: {
    addedByName: string | null
    addedAt: string
  }
}

interface MembersTableProps {
  members: MemberRow[]
  canManage: boolean
  currentUserId?: string
  onUpdateRole: (userId: string, role: ProjectRole) => void
  onRemove: (userId: string) => void
  emptyMessage?: string
  showSource?: boolean
}

export function MembersTable({
  members,
  canManage,
  currentUserId,
  onUpdateRole,
  onRemove,
  emptyMessage = 'No members',
  showSource = false,
}: MembersTableProps) {
  const [memberToRemove, setMemberToRemove] = useState<MemberRow | null>(null)

  const columns: Column<MemberRow>[] = [
    {
      key: 'member',
      header: 'Member',
      render: (member) => (
        <div className="flex items-center gap-3">
          <PresignedAvatar
            imageKey={member.avatar}
            alt={member.name}
            fallback={member.name?.[0]?.toUpperCase() ?? '?'}
          />
          <div>
            <p className="text-sm font-medium">{member.name}</p>
            <p className="text-xs text-muted-foreground">{member.email}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'joined',
      header: 'Joined',
      render: (member) => <span className="text-sm text-muted-foreground">{formatRelativeTime(member.joined_at)}</span>,
    },
    ...(showSource
      ? [
          {
            key: 'source',
            header: 'Source' as string,
            render: (member: MemberRow) =>
              member.source ? (
                <div className="text-xs text-muted-foreground leading-tight">
                  <p>Added by {member.source.addedByName ?? 'unknown'}</p>
                  <p>since {formatDate(member.source.addedAt)}</p>
                </div>
              ) : (
                <span className="text-xs text-muted-foreground">—</span>
              ),
          },
        ]
      : []),
    {
      key: 'role',
      header: 'Role',
      render: (member) => {
        const isSelf = currentUserId === member.id
        const isAuthorizedUser = member.global_role === 'AUTHORIZED_USER'
        const lockRole = isAuthorizedUser && member.role === 'VIEWER'
        if (!canManage || isSelf || lockRole) {
          return <span className="text-sm text-muted-foreground">{ROLE_LABELS[member.role]}</span>
        }
        const availableRoles = (Object.keys(ROLE_LABELS) as ProjectRole[]).filter(
          (r) => !isAuthorizedUser || r === 'VIEWER',
        )
        return (
          <div onClick={(e) => e.stopPropagation()}>
            <Select value={member.role} onValueChange={(v) => onUpdateRole(member.id, v as ProjectRole)}>
              <SelectTrigger className="w-32 h-8 text-xs cursor-pointer">
                <SelectValue>{(value: string) => ROLE_LABELS[value as ProjectRole] ?? value}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {availableRoles.map((r) => (
                  <SelectItem key={r} value={r}>
                    {ROLE_LABELS[r]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )
      },
    },
    ...(canManage
      ? [
          {
            key: 'actions',
            header: '' as string,
            className: 'w-10',
            render: (member: MemberRow) => {
              const isSelf = currentUserId === member.id
              if (isSelf) return null
              return (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-destructive cursor-pointer"
                  onClick={(e: React.MouseEvent) => {
                    e.stopPropagation()
                    setMemberToRemove(member)
                  }}
                  aria-label="Remove member"
                >
                  <UserMinus className="h-4 w-4" />
                </Button>
              )
            },
          },
        ]
      : []),
  ]

  return (
    <>
      <DataTable columns={columns} data={members} keyExtractor={(m) => m.id} emptyMessage={emptyMessage} />
      <ConfirmationDialog
        open={memberToRemove !== null}
        onOpenChange={(open) => {
          if (!open) setMemberToRemove(null)
        }}
        title="Remove member?"
        description={
          <>
            <span className="font-medium">{memberToRemove?.name}</span> will lose access. This action cannot be undone.
          </>
        }
        confirmLabel="Remove"
        confirmVariant="destructive"
        iconClassName="text-destructive"
        onConfirm={() => {
          if (memberToRemove) onRemove(memberToRemove.id)
        }}
      />
    </>
  )
}
