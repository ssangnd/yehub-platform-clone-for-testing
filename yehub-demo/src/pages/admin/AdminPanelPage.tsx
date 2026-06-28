import { useState } from 'react'
import { PageHeader } from '@/components/layout/PageHeader'
import { DataTable, type Column } from '@/components/common/DataTable'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { UserPlus } from 'lucide-react'
import { mockUsers } from '@/mocks/fixtures/users'
import { mockMemberships } from '@/mocks/fixtures/memberships'
import { GLOBAL_ROLE_CONFIG } from '@/lib/constants/roles'
import { formatRelativeTime } from '@/lib/utils/format'
import { toast } from 'sonner'
import { UserDetailDialog } from './components/UserDetailDialog'
import type { User, GlobalRole } from '@/types/auth'

export default function AdminPanelPage() {
  const [users, setUsers] = useState<User[]>(mockUsers)
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false)
  const [selectedUser, setSelectedUser] = useState<User | null>(null)
  const [detailDialogOpen, setDetailDialogOpen] = useState(false)

  const handleToggleStatus = (userId: string) => {
    setUsers(prev =>
      prev.map(u =>
        u.id === userId
          ? { ...u, status: u.status === 'active' ? 'inactive' as const : 'active' as const }
          : u
      )
    )
    setSelectedUser(prev =>
      prev?.id === userId
        ? { ...prev, status: prev.status === 'active' ? 'inactive' as const : 'active' as const }
        : prev
    )
    const user = users.find(u => u.id === userId)
    const newStatus = user?.status === 'active' ? 'disabled' : 'enabled'
    toast.success(`Account ${newStatus} for ${user?.name}`)
  }

  const handleRemoveUser = (userId: string) => {
    const user = users.find(u => u.id === userId)
    setUsers(prev => prev.filter(u => u.id !== userId))
    setSelectedUser(null)
    toast.success(`Removed ${user?.name}`)
  }

  const handleChangeGlobalRole = (userId: string, newRole: GlobalRole) => {
    setUsers(prev =>
      prev.map(u => u.id === userId ? { ...u, globalRole: newRole } : u)
    )
    setSelectedUser(prev =>
      prev?.id === userId ? { ...prev, globalRole: newRole } : prev
    )
    const user = users.find(u => u.id === userId)
    toast.success(`Changed ${user?.name}'s role to ${GLOBAL_ROLE_CONFIG[newRole].label}`)
  }


  const getMembershipCount = (userId: string) =>
    mockMemberships.filter(m => m.userId === userId).length

  const columns: Column<User>[] = [
    {
      key: 'name',
      header: 'User',
      render: (u) => (
        <div className="flex items-center gap-3">
          <Avatar className="h-8 w-8">
            <AvatarImage src={u.avatar} alt={u.name} />
            <AvatarFallback className="text-xs">{u.name[0]}</AvatarFallback>
          </Avatar>
          <div>
            <p className="text-sm font-medium">{u.name}</p>
            <p className="text-xs text-muted-foreground">{u.email}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'globalRole',
      header: 'Role',
      render: (u) => (
        <Badge variant={u.globalRole === 'admin' ? 'destructive' : u.globalRole === 'internal_user' ? 'default' : 'secondary'}>
          {GLOBAL_ROLE_CONFIG[u.globalRole].label}
        </Badge>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (u) => (
        <Badge variant="outline" className={u.status === 'active' ? 'bg-green-500/10 text-green-500 border-0' : ''}>
          {u.status === 'active' ? 'Active' : 'Inactive'}
        </Badge>
      ),
    },
    {
      key: 'memberships' as keyof User,
      header: 'Projects',
      render: (u) => <span className="text-sm">{u.globalRole === 'admin' ? 'All projects' : `${getMembershipCount(u.id)} projects`}</span>,
    },
    {
      key: 'lastLogin',
      header: 'Last Login',
      sortable: true,
      render: (u) => <span className="text-sm text-muted-foreground">{formatRelativeTime(u.lastLogin)}</span>,
    },
  ]

  const handleRowClick = (user: User) => {
    setSelectedUser(user)
    setDetailDialogOpen(true)
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Admin Panel"
        description="Manage users and permissions"
        actions={
          <Button onClick={() => setInviteDialogOpen(true)} className="cursor-pointer">
            <UserPlus className="mr-2 h-4 w-4" />Invite User
          </Button>
        }
      />

      <DataTable
        columns={columns}
        data={users}
        keyExtractor={(u) => u.id}
        onRowClick={handleRowClick}
        emptyMessage="No users found"
      />

      {/* Invite User Dialog */}
      <Dialog open={inviteDialogOpen} onOpenChange={setInviteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Invite User</DialogTitle>
            <DialogDescription>Send an invitation email to add a new team member.</DialogDescription>
          </DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); setInviteDialogOpen(false); toast.success('Invitation sent') }} className="space-y-4">
            <Separator />
            <div className="space-y-2">
              <Label htmlFor="inv-name">Full Name</Label>
              <Input id="inv-name" placeholder="John Doe" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="inv-email">Email</Label>
              <Input id="inv-email" type="email" placeholder="user@company.com" required />
            </div>
            <div className="space-y-2">
              <Label>Role</Label>
              <div>
                <Select defaultValue="authorized_user">
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(Object.keys(GLOBAL_ROLE_CONFIG) as GlobalRole[]).map(role => (
                      <SelectItem key={role} value={role}>{GLOBAL_ROLE_CONFIG[role].label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <Separator />
            <div className="flex justify-end gap-3">
              <Button type="button" variant="outline" onClick={() => setInviteDialogOpen(false)} className="cursor-pointer">Cancel</Button>
              <Button type="submit" className="cursor-pointer">Send Invitation</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* User Detail Dialog */}
      <UserDetailDialog
        open={detailDialogOpen}
        onOpenChange={setDetailDialogOpen}
        user={selectedUser}
        onToggleStatus={handleToggleStatus}
        onRemove={handleRemoveUser}
        onChangeGlobalRole={handleChangeGlobalRole}
      />
    </div>
  )
}
