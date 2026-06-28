import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Input } from '@/components/ui/input'
import { profilesApi } from '@/api/profiles'
import { queryKeys } from '@/lib/constants/query-keys'
import { Search } from 'lucide-react'

interface MoveAccountDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  currentProfileId: string
  onSelect: (targetProfileId: string) => void
}

export function MoveAccountDialog({ open, onOpenChange, currentProfileId, onSelect }: MoveAccountDialogProps) {
  const [search, setSearch] = useState('')

  const { data } = useQuery({
    queryKey: queryKeys.profiles.list({ search, limit: 20 }),
    queryFn: () => profilesApi.list({ search, limit: 20 }),
    enabled: open,
  })

  const otherProfiles = (data?.data ?? []).filter((p) => p.id !== currentProfileId)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Move account to another profile</DialogTitle>
          <DialogDescription>Select a destination profile for this account.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search profiles..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <div className="max-h-64 overflow-y-auto rounded-lg border">
            {otherProfiles.length === 0 ? (
              <p className="p-4 text-center text-sm text-muted-foreground">No profiles found.</p>
            ) : (
              <div className="divide-y">
                {otherProfiles.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => onSelect(p.id)}
                    className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-accent cursor-pointer"
                  >
                    <Avatar className="h-6 w-6">
                      <AvatarFallback className="text-xs">{p.name[0]}</AvatarFallback>
                    </Avatar>
                    <span className="text-sm font-medium truncate">{p.name}</span>
                    <span className="ml-auto text-xs text-muted-foreground">{p.accounts.length} accounts</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
