import { useState } from 'react'
import { UserPlus } from 'lucide-react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { PresignedAvatar } from '@/components/common/PresignedAvatar'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { GlobalRole } from '@/api/auth'
import type { MemberRole } from '@/api/campaigns'
import { PROJECT_ROLE_CONFIG } from '@/lib/constants/roles'
import { showApiError } from '@/lib/errors'
import { useDebounce } from '@/hooks/use-debounce'

interface NonMember {
  id: string
  email: string
  name: string
  avatar?: string
  global_role: GlobalRole
}

interface AddMemberDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  description: string
  searchQueryKey: readonly unknown[]
  onSearch: (q?: string) => Promise<NonMember[]>
  onAdd: (userId: string, role: MemberRole) => Promise<unknown>
  invalidateKeys: readonly (readonly unknown[])[]
}

export function AddMemberDialog({
  open,
  onOpenChange,
  description,
  searchQueryKey,
  onSearch,
  onAdd,
  invalidateKeys,
}: AddMemberDialogProps) {
  const queryClient = useQueryClient()
  const [selectedUserId, setSelectedUserId] = useState('')
  const [role, setRole] = useState<MemberRole>('VIEWER')
  const [search, setSearch] = useState('')

  const debouncedSearch = useDebounce(search, 300)

  const queryKey = [...searchQueryKey, debouncedSearch]
  const { data: nonMembers = [], isFetching } = useQuery({
    queryKey,
    queryFn: () => onSearch(debouncedSearch || undefined),
    enabled: open,
  })

  const selectedUser = nonMembers.find((u) => u.id === selectedUserId)
  const restrictToViewer = selectedUser?.global_role === 'AUTHORIZED_USER'
  const availableRoles = (Object.keys(PROJECT_ROLE_CONFIG) as MemberRole[]).filter(
    (r) => !restrictToViewer || r === 'VIEWER',
  )
  const effectiveRole: MemberRole = restrictToViewer ? 'VIEWER' : role

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      setSelectedUserId('')
      setRole('VIEWER')
      setSearch('')
    }
    onOpenChange(newOpen)
  }

  const addMutation = useMutation({
    mutationFn: () => onAdd(selectedUserId, effectiveRole),
    onSuccess: () => {
      for (const key of invalidateKeys) {
        queryClient.invalidateQueries({ queryKey: key })
      }
      onOpenChange(false)
      toast.success(`Added ${selectedUser?.name ?? 'user'} as ${PROJECT_ROLE_CONFIG[effectiveRole].label}`)
    },
    onError: (error) => showApiError(error, { fallback: 'Failed to add member' }),
  })

  return (
    <Dialog open={open} onOpenChange={handleOpenChange} disablePointerDismissal>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add Member</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            addMutation.mutate()
          }}
          className="space-y-4"
        >
          <Separator />
          <div className="space-y-2">
            <Label>User *</Label>
            {selectedUser ? (
              <div className="flex items-center justify-between rounded-md border px-3 py-2">
                <div className="flex items-center gap-2">
                  <PresignedAvatar
                    imageKey={selectedUser.avatar}
                    alt={selectedUser.name}
                    fallback={selectedUser.name[0]}
                    className="h-6 w-6"
                  />
                  <span className="text-sm">{selectedUser.name}</span>
                  <span className="text-xs text-muted-foreground">{selectedUser.email}</span>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedUserId('')}
                  className="cursor-pointer h-7 text-xs"
                >
                  Change
                </Button>
              </div>
            ) : (
              <Command className="rounded-lg border" shouldFilter={false}>
                <CommandInput placeholder="Search users..." value={search} onValueChange={setSearch} />
                <CommandList>
                  {isFetching ? (
                    <div className="py-3 text-center text-sm text-muted-foreground">Searching...</div>
                  ) : (
                    <>
                      <CommandEmpty>No available users.</CommandEmpty>
                      <CommandGroup>
                        {nonMembers.map((u) => (
                          <CommandItem
                            key={u.id}
                            value={u.id}
                            onSelect={() => setSelectedUserId(u.id)}
                            className="cursor-pointer"
                          >
                            <PresignedAvatar
                              imageKey={u.avatar}
                              alt={u.name}
                              fallback={u.name[0]}
                              className="h-6 w-6"
                            />
                            <span>{u.name}</span>
                            <span className="text-xs text-muted-foreground ml-auto">{u.email}</span>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </>
                  )}
                </CommandList>
              </Command>
            )}
          </div>
          <div className="space-y-2">
            <Label>Role *</Label>
            <Select value={effectiveRole} onValueChange={(v) => setRole(v as MemberRole)} disabled={restrictToViewer}>
              <SelectTrigger className="w-full cursor-pointer">
                <SelectValue>{(value: string) => PROJECT_ROLE_CONFIG[value as MemberRole]?.label ?? value}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {availableRoles.map((r) => (
                  <SelectItem key={r} value={r}>
                    <span>{PROJECT_ROLE_CONFIG[r].label}</span>
                    <span className="text-xs text-muted-foreground ml-2">— {PROJECT_ROLE_CONFIG[r].description}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {restrictToViewer && (
              <p className="text-xs text-muted-foreground">Authorized users can only be added as Viewer.</p>
            )}
          </div>
          <Separator />
          <div className="flex justify-end gap-3">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} className="cursor-pointer">
              Cancel
            </Button>
            <Button type="submit" disabled={!selectedUserId || addMutation.isPending} className="cursor-pointer">
              <UserPlus className="mr-1.5 h-4 w-4" />
              {addMutation.isPending ? 'Adding...' : 'Add Member'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
