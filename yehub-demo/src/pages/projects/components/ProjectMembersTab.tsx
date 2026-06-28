import { useState } from 'react'
import { Plus, UserMinus } from 'lucide-react'
import { DataTable, type Column } from '@/components/common/DataTable'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useProjectMembers, type ProjectMember } from '@/hooks/useMemberships'
import { PROJECT_ROLE_CONFIG } from '@/lib/constants/roles'
import { formatRelativeTime } from '@/lib/utils/format'
import { mockUsers } from '@/mocks/fixtures/users'
import { toast } from 'sonner'
import { AddMemberDialog } from '@/components/common/AddMemberDialog'
import type { ProjectRole, Membership } from '@/types/auth'

interface ProjectMembersTabProps {
  projectId: string
}

export function ProjectMembersTab({ projectId }: ProjectMembersTabProps) {
  const initialMembers = useProjectMembers(projectId)
  const [members, setMembers] = useState<ProjectMember[]>(initialMembers)
  const [addDialogOpen, setAddDialogOpen] = useState(false)

  const getUserEmail = (userId: string) => {
    const user = mockUsers.find(u => u.id === userId)
    return user?.email ?? 'Unknown'
  }

  const handleAddMember = (membership: Membership) => {
    const user = mockUsers.find(u => u.id === membership.userId)
    if (user) {
      setMembers(prev => [...prev, { membership, user }])
    }
  }

  const handleRemoveMember = (member: ProjectMember) => {
    setMembers(prev => prev.filter(m => m.membership.id !== member.membership.id))
    toast.success(`Removed ${member.user.name} from project`)
  }

  const handleRoleChange = (member: ProjectMember, newRole: ProjectRole) => {
    if (newRole === member.membership.role) return
    setMembers(prev =>
      prev.map(m =>
        m.membership.id === member.membership.id
          ? { ...m, membership: { ...m.membership, role: newRole } }
          : m
      )
    )
    toast.success(`Changed ${member.user.name}'s role to ${PROJECT_ROLE_CONFIG[newRole].label}`)
  }

  const allRoles = Object.keys(PROJECT_ROLE_CONFIG) as ProjectRole[]

  const columns: Column<ProjectMember>[] = [
    {
      key: 'user' as keyof ProjectMember,
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
      key: 'addedAt' as keyof ProjectMember,
      header: 'Source',
      render: (m) => (
        <div className="text-sm text-muted-foreground">
          <span>Added by {getUserEmail(m.membership.addedBy)}</span>
          <span> since {formatRelativeTime(m.membership.addedAt)}</span>
        </div>
      ),
    },
    {
      key: 'membership' as keyof ProjectMember,
      header: 'Role',
      render: (m) => (
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
      ),
    },
    {
      key: 'actions' as keyof ProjectMember,
      header: '',
      render: (m) => (
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-muted-foreground hover:text-destructive cursor-pointer"
          onClick={(e) => { e.stopPropagation(); handleRemoveMember(m) }}
          aria-label="Remove member"
        >
          <UserMinus className="h-4 w-4" />
        </Button>
      ),
    },
  ]

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{members.length} member{members.length !== 1 ? 's' : ''}</p>
        <Button variant="outline" size="sm" onClick={() => setAddDialogOpen(true)} className="cursor-pointer">
          <Plus className="mr-1 h-3 w-3" />Add Member
        </Button>
      </div>

      <DataTable
        columns={columns}
        data={members}
        keyExtractor={(m) => m.membership.id}
        emptyMessage="No members yet"
      />

      <AddMemberDialog
        open={addDialogOpen}
        onOpenChange={setAddDialogOpen}
        scope="project"
        scopeId={projectId}
        existingUserIds={members.map(m => m.user.id)}
        onAdd={handleAddMember}
      />
    </div>
  )
}
