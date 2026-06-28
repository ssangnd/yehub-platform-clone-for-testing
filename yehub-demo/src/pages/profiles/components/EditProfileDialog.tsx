import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { Separator } from '@/components/ui/separator'
import { toast } from 'sonner'
import type { Profile, Gender } from '@/types/profile'

interface EditProfileDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  profile: Profile
  onSave: (updates: Pick<Profile, 'name' | 'gender' | 'categories' | 'tier' | 'email' | 'phone' | 'tags'>) => void
}

const CATEGORIES = ['Beauty', 'Tech', 'Food', 'Fashion', 'Travel', 'Fitness', 'Entertainment', 'Education', 'Gaming', 'Lifestyle']
const TIERS = ['Mega', 'Macro', 'Mid-tier', 'Micro', 'Nano']

export function EditProfileDialog({ open, onOpenChange, profile, onSave }: EditProfileDialogProps) {
  const [name, setName] = useState(profile.name)
  const [gender, setGender] = useState(profile.gender ?? '')
  const [categories, setCategories] = useState<string[]>(profile.categories)
  const [tier, setTier] = useState(profile.tier ?? '')
  const [email, setEmail] = useState(profile.email ?? '')
  const [phone, setPhone] = useState(profile.phone ?? '')
  const [tags, setTags] = useState(profile.tags.join(', '))

  useEffect(() => {
    if (open) {
      setName(profile.name)
      setGender(profile.gender ?? '')
      setCategories([...profile.categories])
      setTier(profile.tier ?? '')
      setEmail(profile.email ?? '')
      setPhone(profile.phone ?? '')
      setTags(profile.tags.join(', '))
    }
  }, [open, profile])

  const toggleCategory = (cat: string) => {
    setCategories(prev =>
      prev.includes(cat) ? prev.filter(c => c !== cat) : [...prev, cat]
    )
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onSave({
      name,
      gender: (gender || null) as Gender | null,
      categories,
      tier: tier || null,
      email: email || null,
      phone: phone || null,
      tags: tags.split(',').map(t => t.trim()).filter(Boolean),
    })
    onOpenChange(false)
    toast.success('Profile updated')
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit Profile</DialogTitle>
          <DialogDescription>Update the profile details below.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <Separator />
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1 min-w-0 space-y-2">
              <Label htmlFor="edit-name">Name *</Label>
              <Input id="edit-name" value={name} onChange={e => setName(e.target.value)} required />
            </div>
            <div className="w-32 space-y-2">
              <Label>Gender</Label>
              <Select value={gender} onValueChange={setGender}>
                <SelectTrigger className="w-full"><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="male">Male</SelectItem>
                  <SelectItem value="female">Female</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1 min-w-0 space-y-2">
              <Label>Categories</Label>
              <div className="grid grid-cols-2 gap-2">
                {CATEGORIES.map(cat => (
                  <label key={cat} className="flex items-center gap-2 cursor-pointer">
                    <Checkbox
                      checked={categories.includes(cat)}
                      onCheckedChange={() => toggleCategory(cat)}
                    />
                    <span className="text-sm">{cat}</span>
                  </label>
                ))}
              </div>
            </div>
            <div className="flex-1 min-w-0 space-y-2">
              <Label>Tier</Label>
              <div>
                <Select value={tier} onValueChange={setTier}>
                  <SelectTrigger className="w-full"><SelectValue placeholder="Select tier" /></SelectTrigger>
                  <SelectContent>
                    {TIERS.map(t => (
                      <SelectItem key={t} value={t}>{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1 min-w-0 space-y-2">
              <Label htmlFor="edit-email">Email</Label>
              <Input id="edit-email" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="email@example.com" />
            </div>
            <div className="flex-1 min-w-0 space-y-2">
              <Label htmlFor="edit-phone">Phone</Label>
              <Input id="edit-phone" type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="+84 xxx xxx xxx" />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-tags">Tags (comma separated)</Label>
            <Input id="edit-tags" value={tags} onChange={e => setTags(e.target.value)} placeholder="e.g. KOL, beauty, lifestyle" />
          </div>
          <Separator />
          <div className="flex justify-end gap-3">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} className="cursor-pointer">Cancel</Button>
            <Button type="submit" className="cursor-pointer">Save</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
