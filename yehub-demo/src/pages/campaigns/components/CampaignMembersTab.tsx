import { useState } from 'react'
import { Plus, UserMinus } from 'lucide-react'
import { DataTable, type Column } from '@/components/common/DataTable'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useCampaignMembers, type CampaignMemberDirect, type CampaignMemberInherited } from '@/hooks/useMemberships'
import { useCampaignRole } from '@/hooks/useCampaignRole'
import { PROJECT_ROLE_CONFIG, hasPermission } from '@/lib/constants/roles'
import { formatRelativeTime } from '@/lib/utils/format'
import { mockUsers } from '@/mocks/fixtures/users'
import { toast } from 'sonner'
import { AddMemberDialog } from '@/components/common/AddMemberDialog'
import type { ProjectRole } from '@/types/auth'

interface CampaignMembersTabProps {
  campaignId: string
}

export function CampaignMembersTab({ campaignId }: CampaignMembersTabProps) {
  const { inherited: initialInherited, direct: initialDirect } = useCampaignMembers(campaignId)
  const [directMembers, setDirectMembers] = useState<CampaignMemberDirect[]>(initialDirect)
  const [addDialogOpen, setAddDialogOpen] = useState(false)

  const role = useCampaignRole(campaignId)
  const canManageMembers = role ? hasPermission(role, 'manage_members') : false

  const getUserEmail = (userId: string) => {
    const user = mockUsers.find(u => u.id === userId)
    return user?.email ?? 'Unknown'
  }

  const handleRemoveMember = (member: CampaignMemberDirect) => {
    setDirectMembers(prev => prev.filter(m => m.membership.id !== member.membership.id))
    toast.success(`Removed ${member.user.name} from campaign`)
  }

  const handleRoleChange = (member: CampaignMemberDirect, newRole: ProjectRole) => {
    if (newRole === member.membership.role) return
    setDirectMembers(prev =>
      prev.map(m =>
        m.membership.id === member.membership.id
          ? { ...m, membership: { ...m.membership, role: newRole } }
          : m
      )
    )
    toast.success(`Changed ${member.user.name}'s role to ${PROJECT_ROLE_CONFIG[newRole].label}`)
  }

  const allRoles = Object.keys(PROJECT_ROLE_CONFIG) as ProjectRole[]

  // All user IDs with access (inherited + direct) for filtering in add dialog
  const existingUserIds = [
    ...initialInherited.map(m => m.user.id),
    ...directMembers.map(m => m.user.id),
  ]

  const inheritedColumns: Column<CampaignMemberInherited>[] = [
    {
      key: 'user' as keyof CampaignMemberInherited,
      header: 'Member',
      render: (m) => (
        <div className="flex items-center gap-3">
          <Avatar className="h-8 w-8">
            <AvatarImage src={m.user.avatar} alt={m.user.name} />
            <AvatarFallback className="text-xs">{m.user.name[0]}</AvatarFallback>
          </Avatar>
          <div>
            <p className="text-sm font-medium">{m.user.name}</p>
            <p className="text-xs text-muted-foreground">{m.user.email}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'source' as keyof CampaignMemberInherited,
      header: 'Source',
      render: () => (
        <Badge variant="outline" className="text-xs">From project</Badge>
      ),
    },
    {
      key: 'membership' as keyof CampaignMemberInherited,
      header: 'Role',
      render: (m) => (
        <Badge variant="secondary">{PROJECT_ROLE_CONFIG[m.membership.role].label}</Badge>
      ),
    },
  ]

  const directColumns: Column<CampaignMemberDirect>[] = [
    {
      key: 'user' as keyof CampaignMemberDirect,
      header: 'Member',
      render: (m) => (
        <div className="flex items-center gap-3">
          <Avatar className="h-8 w-8">
            <AvatarImage src={m.user.avatar} alt={m.user.name} />
            <AvatarFallback className="text-xs">{m.user.name[0]}</AvatarFallback>
          </Avatar>
          <div>
            <p className="text-sm font-medium">{m.user.name}</p>
            <p className="text-xs text-muted-foreground">{m.user.email}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'addedAt' as keyof CampaignMemberDirect,
      header: 'Source',
      render: (m) => (
        <div className="text-sm text-muted-foreground">
          <span>Added by {getUserEmail(m.membership.addedBy)}</span>
          <span> since {formatRelativeTime(m.membership.addedAt)}</span>
        </div>
      ),
    },
    {
      key: 'membership' as keyof CampaignMemberDirect,
      header: 'Role',
      render: (m) => canManageMembers ? (
        <div onClick={(e) => e.stopPropagation()}>
          <Select value={m.membership.role} onValueChange={(val) => handleRoleChange(m, val as ProjectRole)}>
            <SelectTrigger className="w-32 h-8 text-xs cursor-pointer">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {allRoles.map(r => (
                <SelectItem key={r} value={r}>{PROJECT_ROLE_CONFIG[r].label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : (
        <Badge variant="secondary">{PROJECT_ROLE_CONFIG[m.membership.role].label}</Badge>
      ),
    },
    ...(canManageMembers ? [{
      key: 'actions' as keyof CampaignMemberDirect,
      header: '',
      render: (m: CampaignMemberDirect) => (
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-muted-foreground hover:text-destructive cursor-pointer"
          onClick={(e: React.MouseEvent) => { e.stopPropagation(); handleRemoveMember(m) }}
          aria-label="Remove member"
        >
          <UserMinus className="h-4 w-4" />
        </Button>
      ),
    }] as Column<CampaignMemberDirect>[] : []),
  ]

  return (
    <div className="space-y-6">
      {/* Inherited Members */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium">Inherited from Project ({initialInherited.length})</p>
        </div>
        <DataTable
          columns={inheritedColumns}
          data={initialInherited}
          keyExtractor={(m) => m.membership.id}
          emptyMessage="No project members"
        />
      </div>

      {/* Direct Campaign Members */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium">Campaign Members ({directMembers.length})</p>
          {canManageMembers && (
            <Button variant="outline" size="sm" onClick={() => setAddDialogOpen(true)} className="cursor-pointer">
              <Plus className="mr-1 h-3 w-3" />Add Member
            </Button>
          )}
        </div>
        <DataTable
          columns={directColumns}
          data={directMembers}
          keyExtractor={(m) => m.membership.id}
          emptyMessage="No campaign-specific members"
        />
      </div>

      <AddMemberDialog
        open={addDialogOpen}
        onOpenChange={setAddDialogOpen}
        scope="campaign"
        scopeId={campaignId}
        existingUserIds={existingUserIds}
        onAdd={(membership) => {
          const user = mockUsers.find(u => u.id === membership.userId)
          if (user) {
            setDirectMembers(prev => [...prev, { membership, user, source: 'direct' }])
          }
        }}
      />
    </div>
  )
}
