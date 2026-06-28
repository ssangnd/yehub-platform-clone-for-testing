import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { mockUsers } from '@/mocks/fixtures/users'
import { PROJECT_ROLE_CONFIG } from '@/lib/constants/roles'
import { toast } from 'sonner'
import type { ProjectRole, Membership } from '@/types/auth'

interface AddMemberDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  scope: 'project' | 'campaign'
  scopeId: string
  existingUserIds: string[]
  onAdd: (membership: Membership) => void
}

export function AddMemberDialog({ open, onOpenChange, scope, scopeId, existingUserIds, onAdd }: AddMemberDialogProps) {
  const [selectedUserId, setSelectedUserId] = useState('')
  const [role, setRole] = useState<ProjectRole>('viewer')

  useEffect(() => {
    if (open) {
      setSelectedUserId('')
      setRole('viewer')
    }
  }, [open])

  const availableUsers = mockUsers.filter(u => !existingUserIds.includes(u.id))
  const selectedUser = mockUsers.find(u => u.id === selectedUserId)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedUserId) return

    const membership: Membership = {
      id: `mem-${Date.now()}`,
      userId: selectedUserId,
      scope,
      scopeId,
      role,
      addedAt: new Date().toISOString(),
      addedBy: 'user-1',
    }
    onAdd(membership)
    onOpenChange(false)
    toast.success(`Added ${selectedUser?.name ?? 'user'} as ${PROJECT_ROLE_CONFIG[role].label}`)
  }

  const label = scope === 'project' ? 'project' : 'campaign'

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add Member</DialogTitle>
          <DialogDescription>Add a user to this {label} with a specific role.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <Separator />
          <div className="space-y-2">
            <Label>User *</Label>
            {selectedUser ? (
              <div className="flex items-center justify-between rounded-md border px-3 py-2">
                <div className="flex items-center gap-2">
                  <Avatar className="h-6 w-6">
                    <AvatarImage src={selectedUser.avatar} />
                    <AvatarFallback className="text-xs">{selectedUser.name[0]}</AvatarFallback>
                  </Avatar>
                  <span className="text-sm">{selectedUser.name}</span>
                </div>
                <Button type="button" variant="ghost" size="sm" onClick={() => setSelectedUserId('')} className="cursor-pointer h-7 text-xs">
                  Change
                </Button>
              </div>
            ) : (
              <Command className="rounded-lg border">
                <CommandInput placeholder="Search users..." />
                <CommandList>
                  <CommandEmpty>No available users.</CommandEmpty>
                  <CommandGroup>
                    {availableUsers.map(u => (
                      <CommandItem key={u.id} value={u.name} onSelect={() => setSelectedUserId(u.id)} className="cursor-pointer">
                        <Avatar className="h-6 w-6">
                          <AvatarImage src={u.avatar} />
                          <AvatarFallback className="text-xs">{u.name[0]}</AvatarFallback>
                        </Avatar>
                        <span>{u.name}</span>
                        <span className="text-xs text-muted-foreground ml-auto">{u.email}</span>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            )}
          </div>
          <div className="space-y-2">
            <Label>Role *</Label>
            <div>
              <Select value={role} onValueChange={(val) => setRole(val as ProjectRole)}>
                <SelectTrigger className="w-full">
                  <SelectValue>{PROJECT_ROLE_CONFIG[role]?.label}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(PROJECT_ROLE_CONFIG) as ProjectRole[]).map(r => (
                    <SelectItem key={r} value={r}>
                      <span>{PROJECT_ROLE_CONFIG[r].label}</span>
                      <span className="text-xs text-muted-foreground ml-2">— {PROJECT_ROLE_CONFIG[r].description}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <Separator />
          <div className="flex justify-end gap-3">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} className="cursor-pointer">Cancel</Button>
            <Button type="submit" disabled={!selectedUserId} className="cursor-pointer">Add Member</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
