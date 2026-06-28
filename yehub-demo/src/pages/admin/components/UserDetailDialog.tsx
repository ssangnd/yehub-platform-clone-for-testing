import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Ban, UserCheck, Trash2, TriangleAlert, X } from 'lucide-react'
import { GLOBAL_ROLE_CONFIG, PROJECT_ROLE_CONFIG } from '@/lib/constants/roles'
import { useUserMemberships, type UserMembership } from '@/hooks/useMemberships'
import { formatRelativeTime, formatDate } from '@/lib/utils/format'
import { toast } from 'sonner'
import type { User, GlobalRole } from '@/types/auth'

interface UserDetailDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  user: User | null
  onToggleStatus: (userId: string) => void
  onRemove: (userId: string) => void
  onChangeGlobalRole: (userId: string, newRole: GlobalRole) => void
}

export function UserDetailDialog({ open, onOpenChange, user, onToggleStatus, onRemove, onChangeGlobalRole }: UserDetailDialogProps) {
  const initialMemberships = useUserMemberships(user?.id ?? '')
  const [memberships, setMemberships] = useState<UserMembership[]>(initialMemberships)
  const [confirmRemoveOpen, setConfirmRemoveOpen] = useState(false)
  const [confirmLevelOpen, setConfirmLevelOpen] = useState(false)
  const [confirmMembershipRemoveOpen, setConfirmMembershipRemoveOpen] = useState(false)
  const [pendingLevel, setPendingLevel] = useState<GlobalRole | null>(null)
  const [pendingMembershipRemoval, setPendingMembershipRemoval] = useState<{ id: string; projectName: string } | null>(null)

  useEffect(() => {
    if (open) setMemberships(initialMemberships)
  }, [open, user?.id])

  if (!user) return null

  const handleRequestRemoveMembership = (membershipId: string, projectName: string) => {
    setPendingMembershipRemoval({ id: membershipId, projectName })
    setConfirmMembershipRemoveOpen(true)
  }

  const handleConfirmRemoveMembership = () => {
    if (pendingMembershipRemoval) {
      setMemberships(prev => prev.filter(m => m.membership.id !== pendingMembershipRemoval.id))
      toast.success(`Removed ${user.name} from ${pendingMembershipRemoval.projectName}`)
    }
    setConfirmMembershipRemoveOpen(false)
    setPendingMembershipRemoval(null)
  }

  const handleLevelSelect = (newRole: GlobalRole) => {
    if (newRole === user.globalRole) return
    setPendingLevel(newRole)
    setConfirmLevelOpen(true)
  }

  const handleConfirmLevelChange = () => {
    if (pendingLevel) {
      onChangeGlobalRole(user.id, pendingLevel)
    }
    setConfirmLevelOpen(false)
    setPendingLevel(null)
  }

  const handleConfirmRemove = () => {
    setConfirmRemoveOpen(false)
    onOpenChange(false)
    onRemove(user.id)
  }

  const promotingToAdmin = user.globalRole !== 'admin' && pendingLevel === 'admin'
  const demotingFromAdmin = user.globalRole === 'admin' && pendingLevel !== 'admin'

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>User Details</DialogTitle>
            <DialogDescription>View user information and project memberships.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <Avatar className="h-12 w-12">
                <AvatarImage src={user.avatar} alt={user.name} />
                <AvatarFallback>{user.name[0]}</AvatarFallback>
              </Avatar>
              <div>
                <p className="font-semibold">{user.name}</p>
                <p className="text-sm text-muted-foreground">{user.email}</p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-4 text-sm">
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">Role:</span>
                <div>
                  <Select value={user.globalRole} onValueChange={(val) => handleLevelSelect(val as GlobalRole)}>
                    <SelectTrigger className="w-36 h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(Object.keys(GLOBAL_ROLE_CONFIG) as GlobalRole[]).map(role => (
                        <SelectItem key={role} value={role}>{GLOBAL_ROLE_CONFIG[role].label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <span className="text-muted-foreground">Status: </span>
                <Badge variant="outline" className={user.status === 'active' ? 'bg-green-500/10 text-green-500 border-0' : ''}>
                  {user.status === 'active' ? 'Active' : 'Inactive'}
                </Badge>
              </div>
            </div>
            <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
              <span>Last login: {formatRelativeTime(user.lastLogin)}</span>
              <span>Created: {formatDate(user.createdAt)}</span>
            </div>
            <Separator />
            <div>
              <p className="text-sm font-medium mb-3">Access</p>
              {user.globalRole === 'admin' ? (
                <p className="text-sm text-muted-foreground text-center py-4">Admin has access to all projects and campaigns.</p>
              ) : memberships.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">No memberships.</p>
              ) : (
                <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                  {memberships.map((entry) => {
                    const name = entry.scope === 'project' ? entry.project.name : entry.campaign.name
                    const subtitle = entry.scope === 'project' ? entry.project.clientName : `Campaign`
                    return (
                      <div key={entry.membership.id} className="flex items-center justify-between rounded-md border px-3 py-2">
                        <div>
                          <p className="text-sm font-medium">{name}</p>
                          <p className="text-xs text-muted-foreground">{subtitle}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline">{PROJECT_ROLE_CONFIG[entry.membership.role].label}</Badge>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 text-muted-foreground hover:text-destructive cursor-pointer"
                            onClick={() => handleRequestRemoveMembership(entry.membership.id, name)}
                          >
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
            <Separator />
            <div className="flex justify-between">
              <Button
                variant="destructive"
                size="sm"
                onClick={() => setConfirmRemoveOpen(true)}
                className="cursor-pointer"
              >
                <Trash2 className="mr-2 h-4 w-4" />Remove User
              </Button>
              {user.status === 'active' ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onToggleStatus(user.id)}
                  className="cursor-pointer"
                >
                  <Ban className="mr-2 h-4 w-4" />Disable Account
                </Button>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onToggleStatus(user.id)}
                  className="cursor-pointer"
                >
                  <UserCheck className="mr-2 h-4 w-4" />Enable Account
                </Button>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Remove Confirmation Dialog */}
      <Dialog open={confirmRemoveOpen} onOpenChange={setConfirmRemoveOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <TriangleAlert className="h-5 w-5 text-destructive" />Remove User
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to remove <span className="font-medium text-foreground">{user.name}</span>? This will revoke all project memberships. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-3 mt-2">
            <Button variant="outline" onClick={() => setConfirmRemoveOpen(false)} className="cursor-pointer">Cancel</Button>
            <Button variant="destructive" onClick={handleConfirmRemove} className="cursor-pointer">Remove</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Role Change Confirmation Dialog */}
      <Dialog open={confirmLevelOpen} onOpenChange={(open) => { setConfirmLevelOpen(open); if (!open) setPendingLevel(null) }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <TriangleAlert className="h-5 w-5 text-amber-500" />Change Role
            </DialogTitle>
            <DialogDescription>
              {promotingToAdmin ? (
                <>
                  Promoting <span className="font-medium text-foreground">{user.name}</span> to Admin will grant full system access including all projects.
                </>
              ) : demotingFromAdmin ? (
                <>
                  Changing <span className="font-medium text-foreground">{user.name}</span> from Admin to {pendingLevel ? GLOBAL_ROLE_CONFIG[pendingLevel].label : ''} will revoke global access. They will need to be added to individual projects to regain access.
                </>
              ) : (
                <>
                  Change <span className="font-medium text-foreground">{user.name}</span>'s role to {pendingLevel ? GLOBAL_ROLE_CONFIG[pendingLevel].label : ''}?
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-3 mt-2">
            <Button variant="outline" onClick={() => { setConfirmLevelOpen(false); setPendingLevel(null) }} className="cursor-pointer">Cancel</Button>
            <Button onClick={handleConfirmLevelChange} className="cursor-pointer">Confirm</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Remove Membership Confirmation Dialog */}
      <Dialog open={confirmMembershipRemoveOpen} onOpenChange={(open) => { setConfirmMembershipRemoveOpen(open); if (!open) setPendingMembershipRemoval(null) }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <TriangleAlert className="h-5 w-5 text-amber-500" />Remove Project Access
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to remove <span className="font-medium text-foreground">{user.name}</span> from <span className="font-medium text-foreground">{pendingMembershipRemoval?.projectName}</span>?
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-3 mt-2">
            <Button variant="outline" onClick={() => { setConfirmMembershipRemoveOpen(false); setPendingMembershipRemoval(null) }} className="cursor-pointer">Cancel</Button>
            <Button variant="destructive" onClick={handleConfirmRemoveMembership} className="cursor-pointer">Remove</Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
