import { useState } from 'react'
import { Trash2, Ban, UserCheck, Send, X } from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '@/lib/constants/query-keys'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { usePresignedUrl } from '@/hooks/use-presigned-url'
import { Separator } from '@/components/ui/separator'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { adminApi } from '@/api/admin'
import { showApiError } from '@/lib/errors'
import { StatusBadge } from './StatusBadge'
import type { GlobalRole } from '@/api/auth'
import type { ProjectRole } from '@/api/projects'
import { GLOBAL_ROLE_CONFIG, PROJECT_ROLE_CONFIG } from '@/lib/constants/roles'
import { formatRelativeTime } from '@/lib/format'
import { useAuthStore } from '@/store/auth.store'
import { ConfirmationDialog } from '@/components/common/ConfirmationDialog'

interface UserDetailDialogProps {
  userId: string
  open: boolean
  onOpenChange: (v: boolean) => void
}

export function UserDetailDialog({ userId, open, onOpenChange }: UserDetailDialogProps) {
  const queryClient = useQueryClient()
  const [confirmRemoveOpen, setConfirmRemoveOpen] = useState(false)
  const [confirmDisableOpen, setConfirmDisableOpen] = useState(false)
  const [confirmEnableOpen, setConfirmEnableOpen] = useState(false)
  const [confirmRoleOpen, setConfirmRoleOpen] = useState(false)
  const [pendingRole, setPendingRole] = useState<GlobalRole | null>(null)
  const [confirmMembershipOpen, setConfirmMembershipOpen] = useState(false)
  const [pendingMembership, setPendingMembership] = useState<{
    projectId: string
    projectName: string
  } | null>(null)

  const currentUser = useAuthStore((s) => s.user)
  const isSelf = currentUser?.id === userId

  const { data: user, isLoading } = useQuery({
    queryKey: queryKeys.adminUser(userId),
    queryFn: () => adminApi.getUser(userId),
    enabled: open,
  })

  const { url: avatarUrl } = usePresignedUrl(user?.avatar)

  const updateRoleMutation = useMutation({
    mutationFn: (role: GlobalRole) => adminApi.updateRole(userId, role),
    onSuccess: () => {
      toast.success('Role updated')
      queryClient.invalidateQueries({ queryKey: queryKeys.adminUsers.all })
      queryClient.invalidateQueries({ queryKey: queryKeys.adminUser(userId) })
    },
    onError: (error) => showApiError(error, { fallback: 'Failed to update role' }),
  })

  const disableMutation = useMutation({
    mutationFn: () => adminApi.disableUser(userId),
    onSuccess: () => {
      toast.success('Account disabled')
      queryClient.invalidateQueries({ queryKey: queryKeys.adminUsers.all })
      queryClient.invalidateQueries({ queryKey: queryKeys.adminUser(userId) })
    },
    onError: (error) => showApiError(error, { fallback: 'Failed to disable account' }),
  })

  const enableMutation = useMutation({
    mutationFn: () => adminApi.enableUser(userId),
    onSuccess: () => {
      toast.success('Account enabled')
      queryClient.invalidateQueries({ queryKey: queryKeys.adminUsers.all })
      queryClient.invalidateQueries({ queryKey: queryKeys.adminUser(userId) })
    },
    onError: (error) => showApiError(error, { fallback: 'Failed to enable account' }),
  })

  const removeMutation = useMutation({
    mutationFn: () => adminApi.removeUser(userId),
    onSuccess: () => {
      toast.success('User removed')
      queryClient.invalidateQueries({ queryKey: queryKeys.adminUsers.all })
      onOpenChange(false)
    },
    onError: (error) => showApiError(error, { fallback: 'Failed to remove user' }),
  })

  const removeMembershipMutation = useMutation({
    mutationFn: (projectId: string) => adminApi.removeUserMembership(userId, projectId),
    onSuccess: () => {
      toast.success('Membership removed')
      queryClient.invalidateQueries({ queryKey: queryKeys.adminUser(userId) })
      queryClient.invalidateQueries({ queryKey: queryKeys.adminUsers.all })
    },
    onError: (error) => showApiError(error, { fallback: 'Failed to remove membership' }),
  })

  const resendInvitationMutation = useMutation({
    mutationFn: () => adminApi.resendInvitation(userId),
    onSuccess: () => {
      toast.success('Invitation resent successfully')
      queryClient.invalidateQueries({ queryKey: queryKeys.adminUser(userId) })
    },
    onError: (error) => showApiError(error, { fallback: 'Failed to resend invitation' }),
  })

  const promotingToAdmin = user?.role !== 'ADMIN' && pendingRole === 'ADMIN'
  const demotingFromAdmin = user?.role === 'ADMIN' && pendingRole !== 'ADMIN'

  const roleChangeDescription = promotingToAdmin ? (
    <>
      Promoting <span className="font-medium text-foreground">{user?.name}</span> to Admin will grant full system access
      including all projects.
    </>
  ) : demotingFromAdmin ? (
    <>
      Changing <span className="font-medium text-foreground">{user?.name}</span> from Admin will revoke global access.
      They will need individual project assignments to regain access.
    </>
  ) : (
    <>
      Change <span className="font-medium text-foreground">{user?.name}</span>'s role to{' '}
      <span className="font-medium text-foreground">{pendingRole ? GLOBAL_ROLE_CONFIG[pendingRole].label : ''}</span>?
    </>
  )

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(v) => {
          if (!v) {
            setPendingRole(null)
            setPendingMembership(null)
          }
          onOpenChange(v)
        }}
      >
        <DialogContent className="flex max-h-[90vh] flex-col sm:max-w-lg p-0 space-y-0 gap-0">
          <DialogHeader className="p-4">
            <DialogTitle>User Details</DialogTitle>
            <DialogDescription>View user information and project memberships.</DialogDescription>
          </DialogHeader>

          {isLoading ? (
            <p className="py-12 text-center text-sm text-muted-foreground">Loading…</p>
          ) : !user ? (
            <p className="py-4 text-sm text-destructive">Failed to load user.</p>
          ) : (
            <div className="space-y-4 overflow-y-auto p-4 pt-0">
              <div className="flex items-center gap-3">
                <Avatar size="lg">
                  <AvatarImage src={avatarUrl} alt={user?.name} />
                  <AvatarFallback>{(user.name[0] ?? '?').toUpperCase()}</AvatarFallback>
                </Avatar>
                <div>
                  <p className="font-semibold">{user.name}</p>
                  <p className="text-sm text-muted-foreground">{user.email}</p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-4 text-sm">
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">Role:</span>
                  <Select
                    value={user.role}
                    disabled={isSelf}
                    onValueChange={(v) => {
                      const role = v as GlobalRole
                      if (role === user.role) return
                      setPendingRole(role)
                      setConfirmRoleOpen(true)
                    }}
                  >
                    <SelectTrigger className="h-8 min-w-36 text-xs">
                      <SelectValue>
                        {(value: string) => GLOBAL_ROLE_CONFIG[value as GlobalRole]?.label ?? value}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {(Object.keys(GLOBAL_ROLE_CONFIG) as GlobalRole[]).map((role) => (
                        <SelectItem key={role} value={role}>
                          {GLOBAL_ROLE_CONFIG[role].label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">Status:</span>
                  <StatusBadge status={user.status} />
                </div>
              </div>

              <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
                <span>Last login: {user.last_login_at ? formatRelativeTime(user.last_login_at) : 'Never'}</span>
                <span>Created: {new Date(user.created_at).toLocaleDateString()}</span>
              </div>

              <Separator />

              <div>
                <p className="mb-3 text-sm font-medium">Access</p>
                {user.role === 'ADMIN' ? (
                  <p className="py-4 text-center text-sm text-muted-foreground">Admin has access to all projects.</p>
                ) : user.memberships.length === 0 ? (
                  <p className="py-4 text-center text-sm text-muted-foreground">No project memberships.</p>
                ) : (
                  <div className="max-h-48 space-y-2 overflow-y-auto pr-1">
                    {user.memberships.map((m) => (
                      <div key={m.project_id} className="flex items-center justify-between rounded-md border px-3 py-2">
                        <p className="text-sm font-medium">{m.project_name}</p>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline">{PROJECT_ROLE_CONFIG[m.role as ProjectRole].label}</Badge>
                          <Button
                            variant="ghost"
                            size="icon-xs"
                            className="text-muted-foreground hover:text-destructive"
                            onClick={() => {
                              setPendingMembership({
                                projectId: m.project_id,
                                projectName: m.project_name,
                              })
                              setConfirmMembershipOpen(true)
                            }}
                          >
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <Separator />

              {!isSelf && (
                <div className="flex justify-between">
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => setConfirmRemoveOpen(true)}
                    disabled={removeMutation.isPending}
                  >
                    <Trash2 />
                    Remove User
                  </Button>
                  <div className="flex gap-2">
                    {user.status === 'INVITED' && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => resendInvitationMutation.mutate()}
                        disabled={resendInvitationMutation.isPending}
                      >
                        <Send />
                        Resend Invitation
                      </Button>
                    )}
                    {user.status === 'ACTIVE' ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setConfirmDisableOpen(true)}
                        disabled={disableMutation.isPending}
                      >
                        <Ban />
                        Disable Account
                      </Button>
                    ) : user.status === 'INACTIVE' ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setConfirmEnableOpen(true)}
                        disabled={enableMutation.isPending}
                      >
                        <UserCheck />
                        Enable Account
                      </Button>
                    ) : null}
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <ConfirmationDialog
        open={confirmRemoveOpen}
        onOpenChange={setConfirmRemoveOpen}
        title="Remove User"
        description={
          <>
            Are you sure you want to permanently remove{' '}
            <span className="font-medium text-foreground">{user?.name}</span>? This action cannot be undone.
          </>
        }
        confirmLabel="Remove"
        confirmVariant="destructive"
        isPending={removeMutation.isPending}
        iconClassName="text-destructive"
        onConfirm={() => removeMutation.mutate()}
      />

      <ConfirmationDialog
        open={confirmDisableOpen}
        onOpenChange={setConfirmDisableOpen}
        title="Disable Account"
        description={
          <>
            Disable <span className="font-medium text-foreground">{user?.name}</span>'s account? They will be signed out
            immediately.
          </>
        }
        confirmLabel="Disable"
        isPending={disableMutation.isPending}
        onConfirm={() => disableMutation.mutate()}
      />

      <ConfirmationDialog
        open={confirmEnableOpen}
        onOpenChange={setConfirmEnableOpen}
        title="Enable Account"
        description={
          <>
            Re-activate <span className="font-medium text-foreground">{user?.name}</span>'s account?
          </>
        }
        confirmLabel="Enable"
        isPending={enableMutation.isPending}
        onConfirm={() => enableMutation.mutate()}
      />

      <ConfirmationDialog
        open={confirmRoleOpen}
        onOpenChange={(v) => {
          setConfirmRoleOpen(v)
          if (!v) setPendingRole(null)
        }}
        title="Change Role"
        description={roleChangeDescription}
        confirmLabel="Confirm"
        isPending={updateRoleMutation.isPending}
        onConfirm={() => {
          if (pendingRole) updateRoleMutation.mutate(pendingRole)
          setPendingRole(null)
        }}
      />

      <ConfirmationDialog
        open={confirmMembershipOpen}
        onOpenChange={(v) => {
          setConfirmMembershipOpen(v)
          if (!v) setPendingMembership(null)
        }}
        title="Remove Project Access"
        description={
          <>
            Remove <span className="font-medium text-foreground">{user?.name}</span> from{' '}
            <span className="font-medium text-foreground">{pendingMembership?.projectName}</span>?
          </>
        }
        confirmLabel="Remove"
        confirmVariant="destructive"
        isPending={removeMembershipMutation.isPending}
        onConfirm={() => {
          if (pendingMembership) removeMembershipMutation.mutate(pendingMembership.projectId)
          setPendingMembership(null)
        }}
      />
    </>
  )
}
