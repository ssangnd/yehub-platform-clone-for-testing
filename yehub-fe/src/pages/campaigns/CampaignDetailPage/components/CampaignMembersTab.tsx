import { useState } from 'react'
import { Plus } from 'lucide-react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '@/lib/constants/query-keys'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { DataTable, type Column } from '@/components/common/DataTable'
import { campaignsApi, type CampaignInheritedMember, type MemberRole } from '@/api/campaigns'
import { MembersTable, type MemberRow } from '@/components/common/MembersTable'
import { AddMemberDialog } from '@/components/common/AddMemberDialog'
import { useAuthStore } from '@/store/auth.store'

const ROLE_LABELS: Record<MemberRole, string> = {
  MANAGER: 'Manager',
  EXECUTIVE: 'Executive',
  ANALYST: 'Analyst',
  VIEWER: 'Viewer',
}

const inheritedColumns: Column<CampaignInheritedMember>[] = [
  {
    key: 'member',
    header: 'Member',
    render: (member) => (
      <div className="flex items-center gap-3">
        <Avatar className="h-8 w-8">
          <AvatarImage src={member.user?.avatar} alt={member.user?.name} />
          <AvatarFallback className="text-xs">{member.user.name?.[0]?.toUpperCase() ?? '?'}</AvatarFallback>
        </Avatar>
        <div>
          <p className="text-sm font-medium">{member.user.name}</p>
          <p className="text-xs text-muted-foreground">{member.user.email}</p>
        </div>
      </div>
    ),
  },
  {
    key: 'source',
    header: 'Source',
    render: () => (
      <Badge variant="outline" className="text-xs">
        From project
      </Badge>
    ),
  },
  {
    key: 'role',
    header: 'Role',
    render: (member) => <span className="text-sm text-muted-foreground">{ROLE_LABELS[member.role]}</span>,
  },
]

interface CampaignMembersTabProps {
  campaignId: string
  canManage: boolean
}

export function CampaignMembersTab({ campaignId, canManage }: CampaignMembersTabProps) {
  const queryClient = useQueryClient()
  const currentUserId = useAuthStore((s) => s.user?.id)
  const [addDialogOpen, setAddDialogOpen] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.campaignMembers(campaignId),
    queryFn: () => campaignsApi.listMembers(campaignId),
  })

  const inherited = data?.inherited ?? []
  const direct = data?.direct ?? []

  const updateRoleMutation = useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: MemberRole }) =>
      campaignsApi.updateMember(campaignId, userId, role),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.campaignMembers(campaignId) })
      toast.success('Role updated')
    },
    onError: () => toast.error('Failed to update role'),
  })

  const removeMutation = useMutation({
    mutationFn: (userId: string) => campaignsApi.removeMember(campaignId, userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.campaignMembers(campaignId) })
      toast.success('Member removed')
    },
    onError: () => toast.error('Failed to remove member'),
  })

  if (isLoading) {
    return <p className="text-sm text-muted-foreground py-4">Loading members...</p>
  }

  const directRows: MemberRow[] = direct.map((m) => ({
    id: m.user.id,
    name: m.user.name,
    email: m.user.email,
    avatar: m.user.avatar,
    role: m.role,
    global_role: m.global_role,
    joined_at: m.created_at,
    source: {
      addedByName: m.added_by_user?.name ?? null,
      addedAt: m.created_at,
    },
  }))

  return (
    <div className="space-y-6">
      {/* Inherited from Project */}
      <div className="space-y-3">
        <p className="text-sm font-medium">Inherited from Project ({inherited.length})</p>
        <DataTable
          columns={inheritedColumns}
          data={inherited}
          keyExtractor={(m) => m.user.id}
          emptyMessage="No project members"
        />
      </div>

      {/* Campaign Members (direct) */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium">Campaign Members ({direct.length})</p>
          {canManage && (
            <Button variant="outline" size="sm" onClick={() => setAddDialogOpen(true)} className="cursor-pointer">
              <Plus className="mr-1 h-3 w-3" />
              Add Member
            </Button>
          )}
        </div>
        <MembersTable
          members={directRows}
          canManage={canManage}
          currentUserId={currentUserId}
          onUpdateRole={(userId, role) => updateRoleMutation.mutate({ userId, role })}
          onRemove={(userId) => removeMutation.mutate(userId)}
          emptyMessage="No campaign-specific members"
          showSource
        />
      </div>

      {canManage && (
        <AddMemberDialog
          open={addDialogOpen}
          onOpenChange={setAddDialogOpen}
          description="Add a user to this campaign with a specific role."
          searchQueryKey={queryKeys.campaignNonMembers.byCampaign(campaignId)}
          onSearch={(q) => campaignsApi.getNonMembers(campaignId, { q, limit: 10 })}
          onAdd={(userId, role) => campaignsApi.addMember(campaignId, { user_id: userId, role })}
          invalidateKeys={[queryKeys.campaignMembers(campaignId), queryKeys.campaignNonMembers.byCampaign(campaignId)]}
        />
      )}
    </div>
  )
}
