import { useState } from 'react'
import { Plus } from 'lucide-react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '@/lib/constants/query-keys'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { projectsApi, type ProjectRole } from '@/api/projects'
import { MembersTable, type MemberRow } from '@/components/common/MembersTable'
import { AddMemberDialog } from '@/components/common/AddMemberDialog'
import { useAuthStore } from '@/store/auth.store'
import { showApiError } from '@/lib/errors'

interface ProjectMembersTabProps {
  projectId: string
  canManage: boolean
}

export function ProjectMembersTab({ projectId, canManage }: ProjectMembersTabProps) {
  const queryClient = useQueryClient()
  const currentUserId = useAuthStore((s) => s.user?.id)
  const [addDialogOpen, setAddDialogOpen] = useState(false)

  const { data: members = [], isLoading } = useQuery({
    queryKey: queryKeys.projectMembers(projectId),
    queryFn: () => projectsApi.listMembers(projectId).then((r) => r.data),
  })

  const updateRoleMutation = useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: ProjectRole }) =>
      projectsApi.updateMember(projectId, userId, role),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.projectMembers(projectId) })
      toast.success('Role updated')
    },
    onError: (error) => showApiError(error, { fallback: 'Failed to update role' }),
  })

  const removeMutation = useMutation({
    mutationFn: (userId: string) => projectsApi.removeMember(projectId, userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.projectMembers(projectId) })
      toast.success('Member removed')
    },
    onError: (error) => showApiError(error, { fallback: 'Failed to remove member' }),
  })

  if (isLoading) {
    return <p className="text-sm text-muted-foreground py-4">Loading members...</p>
  }

  const rows: MemberRow[] = members.map((m) => ({
    id: m.user_id,
    name: m.name,
    email: m.email,
    avatar: m.avatar,
    role: m.role,
    global_role: m.global_role,
    joined_at: m.joined_at,
  }))

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {members.length} member{members.length !== 1 ? 's' : ''}
        </p>
        {canManage && (
          <Button variant="outline" size="sm" onClick={() => setAddDialogOpen(true)} className="cursor-pointer">
            <Plus className="mr-1 h-3 w-3" />
            Add Member
          </Button>
        )}
      </div>

      <MembersTable
        members={rows}
        canManage={canManage}
        currentUserId={currentUserId}
        onUpdateRole={(userId, role) => updateRoleMutation.mutate({ userId, role })}
        onRemove={(userId) => removeMutation.mutate(userId)}
        emptyMessage="No members yet"
      />

      {canManage && (
        <AddMemberDialog
          open={addDialogOpen}
          onOpenChange={setAddDialogOpen}
          description="Add a user to this project with a specific role."
          searchQueryKey={queryKeys.nonMembers.byProject(projectId)}
          onSearch={(q) => projectsApi.getNonMembers(projectId, { q, limit: 10 })}
          onAdd={(userId, role) => projectsApi.addMember(projectId, { user_id: userId, role })}
          invalidateKeys={[queryKeys.projectMembers(projectId), queryKeys.nonMembers.byProject(projectId)]}
        />
      )}
    </div>
  )
}
