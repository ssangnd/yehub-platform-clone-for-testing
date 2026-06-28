import { useState } from 'react'
import { Plus, Award, Pencil, Trash2 } from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { EmptyState } from '@/components/common/EmptyState'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { COLOR_PRESETS, type ColorKey } from '@/lib/constants/colors'
import { toast } from 'sonner'

interface Tier {
  id: string
  name: string
  description: string
  minFollowers: number
  maxFollowers: number | null
  profileCount: number
  color: ColorKey
}

export const mockTiers: Tier[] = [
  { id: 'tier-1', name: 'Mega', description: '1M+ followers — Top-tier celebrities and influencers', minFollowers: 1000000, maxFollowers: null, profileCount: 3, color: 'amber' },
  { id: 'tier-2', name: 'Macro', description: '100K-1M followers — Established influencers', minFollowers: 100000, maxFollowers: 999999, profileCount: 8, color: 'purple' },
  { id: 'tier-3', name: 'Mid-tier', description: '50K-100K followers — Growing influencers', minFollowers: 50000, maxFollowers: 99999, profileCount: 15, color: 'blue' },
  { id: 'tier-4', name: 'Micro', description: '10K-50K followers — Niche content creators', minFollowers: 10000, maxFollowers: 49999, profileCount: 28, color: 'green' },
  { id: 'tier-5', name: 'Nano', description: '1K-10K followers — Everyday advocates', minFollowers: 1000, maxFollowers: 9999, profileCount: 42, color: 'gray' },
]

function formatFollowers(n: number): string {
  if (n >= 1000000) return `${n / 1000000}M`
  if (n >= 1000) return `${n / 1000}K`
  return String(n)
}

function ColorSwatchPicker({ value, onChange }: { value: ColorKey; onChange: (c: ColorKey) => void }) {
  return (
    <div className="space-y-2">
      <Label>Color</Label>
      <div className="flex flex-wrap gap-2">
        {(Object.entries(COLOR_PRESETS) as [ColorKey, typeof COLOR_PRESETS[ColorKey]][]).map(([key, preset]) => (
          <button
            key={key}
            type="button"
            onClick={() => onChange(key)}
            className={cn(
              'h-6 w-6 rounded-full cursor-pointer transition-all',
              preset.swatch,
              value === key ? 'ring-2 ring-offset-2 ring-current' : 'hover:scale-110'
            )}
            aria-label={preset.label}
          />
        ))}
      </div>
    </div>
  )
}

export default function TiersPage() {
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [editTier, setEditTier] = useState<Tier | null>(null)
  const [newColor, setNewColor] = useState<ColorKey>('blue')
  const [editColor, setEditColor] = useState<ColorKey>('blue')

  const handleEdit = (tier: Tier) => {
    setEditTier(tier)
    setEditColor(tier.color)
    setEditDialogOpen(true)
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Tiers"
        description="Classify profiles by follower count and influence level"
        actions={
          <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (open) setNewColor('blue') }}>
            <DialogTrigger asChild>
              <Button className="cursor-pointer"><Plus className="mr-2 h-4 w-4" />Add Tier</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Create Tier</DialogTitle><DialogDescription>Define a new tier for profile classification.</DialogDescription></DialogHeader>
              <form onSubmit={(e) => { e.preventDefault(); setDialogOpen(false); toast.success('Tier created') }} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="tier-name">Tier Name</Label>
                  <Input id="tier-name" placeholder="e.g. Mega, Macro, Micro" required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="tier-desc">Description</Label>
                  <Textarea id="tier-desc" placeholder="Describe this tier..." rows={3} />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="tier-min">Min Followers</Label>
                    <Input id="tier-min" type="number" placeholder="e.g. 10000" required />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="tier-max">Max Followers</Label>
                    <Input id="tier-max" type="number" placeholder="Leave empty for no limit" />
                  </div>
                </div>
                <ColorSwatchPicker value={newColor} onChange={setNewColor} />
                <Button type="submit" className="w-full cursor-pointer">Create Tier</Button>
              </form>
            </DialogContent>
          </Dialog>
        }
      />

      {mockTiers.length === 0 ? (
        <EmptyState icon={<Award className="h-12 w-12" />} title="No tiers yet" description="Create tiers to classify profiles by influence level" />
      ) : (
        <div className="space-y-3">
          {mockTiers.map(tier => (
            <Card key={tier.id}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <Badge variant="outline" className={`${COLOR_PRESETS[tier.color].badge} border-0 text-sm`}>{tier.name}</Badge>
                    <div>
                      <p className="text-sm text-muted-foreground">{tier.description}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {formatFollowers(tier.minFollowers)} {tier.maxFollowers ? `— ${formatFollowers(tier.maxFollowers)}` : '+'} followers
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-mono">
                      <span className="font-medium text-foreground">{tier.profileCount}</span>
                      <span className="text-muted-foreground"> profiles</span>
                    </span>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" className="h-7 w-7 cursor-pointer" onClick={() => handleEdit(tier)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 cursor-pointer text-destructive hover:text-destructive" onClick={() => toast.success('Tier deleted')}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Edit Tier Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit Tier</DialogTitle><DialogDescription>Update tier details.</DialogDescription></DialogHeader>
          {editTier && (
            <form onSubmit={(e) => { e.preventDefault(); setEditDialogOpen(false); toast.success('Tier updated') }} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="edit-tier-name">Tier Name</Label>
                <Input id="edit-tier-name" defaultValue={editTier.name} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-tier-desc">Description</Label>
                <Textarea id="edit-tier-desc" defaultValue={editTier.description} rows={3} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-tier-min">Min Followers</Label>
                  <Input id="edit-tier-min" type="number" defaultValue={editTier.minFollowers} required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-tier-max">Max Followers</Label>
                  <Input id="edit-tier-max" type="number" defaultValue={editTier.maxFollowers ?? ''} placeholder="Leave empty for no limit" />
                </div>
              </div>
              <ColorSwatchPicker value={editColor} onChange={setEditColor} />
              <Button type="submit" className="w-full cursor-pointer">Save Changes</Button>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
