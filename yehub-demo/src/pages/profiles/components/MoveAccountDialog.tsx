import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { mockProfiles } from '@/mocks/fixtures/profiles'
import { toast } from 'sonner'
import type { SocialAccount } from '@/types/profile'

interface MoveAccountDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  account: SocialAccount | null
  currentProfileId: string
  onMove: (targetProfileId: string) => void
}

export function MoveAccountDialog({ open, onOpenChange, account, currentProfileId, onMove }: MoveAccountDialogProps) {
  const otherProfiles = mockProfiles.filter(p => p.id !== currentProfileId)

  const handleSelect = (profileId: string) => {
    const target = mockProfiles.find(p => p.id === profileId)
    onMove(profileId)
    onOpenChange(false)
    toast.success(`Moved @${account?.username} to ${target?.name ?? 'profile'}`)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Move @{account?.username} to another profile</DialogTitle>
          <DialogDescription>Select a destination profile for this account.</DialogDescription>
        </DialogHeader>
        <Command className="rounded-lg border">
          <CommandInput placeholder="Search profiles..." />
          <CommandList>
            <CommandEmpty>No profiles found.</CommandEmpty>
            <CommandGroup>
              {otherProfiles.map(p => (
                <CommandItem key={p.id} value={p.name} onSelect={() => handleSelect(p.id)} className="cursor-pointer">
                  <Avatar className="h-6 w-6">
                    <AvatarImage src={p.accounts[0]?.avatarUrl} />
                    <AvatarFallback className="text-xs">{p.name[0]}</AvatarFallback>
                  </Avatar>
                  <span>{p.name}</span>
                  <span className="text-xs text-muted-foreground ml-auto">{p.accounts.length} accounts</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  )
}
