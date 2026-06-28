import { useNavigate } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { Separator } from '@/components/ui/separator'
import { toast } from 'sonner'

export default function AddProfilePage() {
  const navigate = useNavigate()

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    toast.success('Profile created successfully')
    navigate('/profiles')
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate('/profiles')}
          className="cursor-pointer"
          aria-label="Back"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <span className="text-sm text-muted-foreground">Profiles</span>
      </div>

      <PageHeader
        title="Add Profile"
        description="Create a new influencer or brand profile"
      />

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Basic Information */}
        <Card>
          <CardContent className="p-6 space-y-4">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Basic Information</h3>
            <Separator />
            <div className="flex flex-col sm:flex-row flex-wrap gap-4">
              <div className="flex flex-col sm:flex-row gap-4 w-full">
                <div className="flex-1 min-w-0 space-y-2">
                  <Label htmlFor="profile-name">Name *</Label>
                  <Input id="profile-name" placeholder="Profile name" required />
                </div>
                <div className="w-32 space-y-2">
                  <Label>Gender</Label>
                  <Select>
                    <SelectTrigger className="w-full"><SelectValue placeholder="Select" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="male">Male</SelectItem>
                      <SelectItem value="female">Female</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex-1 min-w-0 space-y-2">
                <Label>Categories</Label>
                <div className="grid grid-cols-2 gap-2">
                  {['Beauty', 'Tech', 'Food', 'Fashion', 'Travel', 'Fitness', 'Entertainment', 'Education', 'Gaming', 'Lifestyle'].map(cat => (
                    <label key={cat} className="flex items-center gap-2 cursor-pointer">
                      <Checkbox />
                      <span className="text-sm">{cat}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div className="flex-1 min-w-0 space-y-2">
                <Label>Tier</Label>
                <div>
                  <Select>
                    <SelectTrigger className="w-full"><SelectValue placeholder="Select tier" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="mega">Mega (1M+)</SelectItem>
                      <SelectItem value="macro">Macro (100K-1M)</SelectItem>
                      <SelectItem value="mid-tier">Mid-tier (50K-100K)</SelectItem>
                      <SelectItem value="micro">Micro (10K-50K)</SelectItem>
                      <SelectItem value="nano">Nano (1K-10K)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Contact Information */}
        <Card>
          <CardContent className="p-6 space-y-4">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Contact Information</h3>
            <Separator />
            <div className="flex flex-col sm:flex-row flex-wrap gap-4">
              <div className="flex-1 min-w-0 space-y-2">
                <Label htmlFor="profile-email">Email (optional)</Label>
                <Input id="profile-email" type="email" placeholder="email@example.com" />
              </div>
              <div className="flex-1 min-w-0 space-y-2">
                <Label htmlFor="profile-phone">Phone (optional)</Label>
                <Input id="profile-phone" type="tel" placeholder="+84 xxx xxx xxx" />
              </div>
              <div className="w-full space-y-2">
                <Label htmlFor="profile-tags">Tags (comma separated)</Label>
                <Input id="profile-tags" placeholder="e.g. KOL, beauty, lifestyle" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Social Accounts */}
        <Card>
          <CardContent className="p-6 space-y-4">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Social Accounts (optional)</h3>
            <Separator />
            <div className="flex flex-col sm:flex-row flex-wrap gap-4">
              <div className="flex-1 min-w-0 sm:basis-[calc(50%-0.5rem)] space-y-2">
                <Label htmlFor="profile-facebook">Facebook</Label>
                <Input id="profile-facebook" placeholder="https://facebook.com/username" />
              </div>
              <div className="flex-1 min-w-0 sm:basis-[calc(50%-0.5rem)] space-y-2">
                <Label htmlFor="profile-instagram">Instagram</Label>
                <Input id="profile-instagram" placeholder="https://instagram.com/username" />
              </div>
              <div className="flex-1 min-w-0 sm:basis-[calc(50%-0.5rem)] space-y-2">
                <Label htmlFor="profile-threads">Threads</Label>
                <Input id="profile-threads" placeholder="https://threads.net/@username" />
              </div>
              <div className="flex-1 min-w-0 sm:basis-[calc(50%-0.5rem)] space-y-2">
                <Label htmlFor="profile-tiktok">TikTok</Label>
                <Input id="profile-tiktok" placeholder="https://tiktok.com/@username" />
              </div>
              <div className="w-full space-y-2">
                <Label htmlFor="profile-youtube">YouTube</Label>
                <Input id="profile-youtube" placeholder="https://youtube.com/@channel" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Actions */}
        <div className="flex justify-end gap-3">
          <Button type="button" variant="outline" onClick={() => navigate('/profiles')} className="cursor-pointer">
            Cancel
          </Button>
          <Button type="submit" className="cursor-pointer">Create Profile</Button>
        </div>
      </form>
    </div>
  )
}
