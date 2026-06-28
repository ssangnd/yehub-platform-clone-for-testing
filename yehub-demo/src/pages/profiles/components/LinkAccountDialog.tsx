import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { toast } from 'sonner'
import type { Platform } from '@/types/filters'
import type { SocialAccount } from '@/types/profile'

interface LinkAccountDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  existingPlatforms: Platform[]
  onLink: (account: SocialAccount) => void
}

const PLATFORMS: { value: Platform; label: string; urlPlaceholder: string }[] = [
  { value: 'facebook', label: 'Facebook', urlPlaceholder: 'https://facebook.com/username' },
  { value: 'instagram', label: 'Instagram', urlPlaceholder: 'https://instagram.com/username' },
  { value: 'threads', label: 'Threads', urlPlaceholder: 'https://threads.net/@username' },
  { value: 'tiktok', label: 'TikTok', urlPlaceholder: 'https://tiktok.com/@username' },
  { value: 'youtube', label: 'YouTube', urlPlaceholder: 'https://youtube.com/@channel' },
]

export function LinkAccountDialog({ open, onOpenChange, existingPlatforms, onLink }: LinkAccountDialogProps) {
  const [platform, setPlatform] = useState<Platform | ''>('')
  const [profileUrl, setProfileUrl] = useState('')
  const [username, setUsername] = useState('')

  useEffect(() => {
    if (open) {
      setPlatform('')
      setProfileUrl('')
      setUsername('')
    }
  }, [open])

  const selectedPlatform = PLATFORMS.find(p => p.value === platform)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!platform || !username) return

    const newAccount: SocialAccount = {
      id: `acc-${Date.now()}`,
      platform: platform as Platform,
      username,
      profileUrl: profileUrl || '',
      followers: 0,
      isVerified: false,
      avatarUrl: `https://api.dicebear.com/7.x/initials/svg?seed=${username}`,
      lastSyncedAt: new Date().toISOString(),
    }
    onLink(newAccount)
    onOpenChange(false)
    toast.success(`Linked ${selectedPlatform?.label ?? platform} account @${username}`)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Link Social Account</DialogTitle>
          <DialogDescription>Connect a social media account to this profile.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <Separator />
          <div className="space-y-2">
            <Label>Platform *</Label>
            <div>
              <Select value={platform} onValueChange={(val) => setPlatform(val as Platform)}>
                <SelectTrigger className="w-full"><SelectValue placeholder="Select platform" /></SelectTrigger>
                <SelectContent>
                  {PLATFORMS.map(p => (
                    <SelectItem
                      key={p.value}
                      value={p.value}
                      disabled={existingPlatforms.includes(p.value)}
                    >
                      {p.label}{existingPlatforms.includes(p.value) ? ' (already linked)' : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="link-username">Username *</Label>
            <Input
              id="link-username"
              value={username}
              onChange={e => setUsername(e.target.value)}
              placeholder="username"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="link-url">Profile URL</Label>
            <Input
              id="link-url"
              value={profileUrl}
              onChange={e => setProfileUrl(e.target.value)}
              placeholder={selectedPlatform?.urlPlaceholder ?? 'https://...'}
            />
          </div>
          <Separator />
          <div className="flex justify-end gap-3">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} className="cursor-pointer">Cancel</Button>
            <Button type="submit" disabled={!platform || !username} className="cursor-pointer">Link Account</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
