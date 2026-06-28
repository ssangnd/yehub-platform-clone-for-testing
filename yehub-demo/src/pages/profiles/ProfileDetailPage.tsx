import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Plus, Pencil, Mail, Phone } from 'lucide-react'
import { MetricCard } from '@/components/common/MetricCard'
import { EmptyState } from '@/components/common/EmptyState'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { mockProfiles } from '@/mocks/fixtures/profiles'
import { mockCategories } from '@/pages/profiles/SegmentsPage'
import { mockTiers } from '@/pages/profiles/TiersPage'
import { COLOR_PRESETS } from '@/lib/constants/colors'
import { formatNumber, formatDate } from '@/lib/utils/format'

function getCategoryBadgeClass(name: string): string {
  const cat = mockCategories.find(c => c.name === name)
  return cat ? `${COLOR_PRESETS[cat.color].badge} border-0` : ''
}


function getTierBadgeClass(name: string): string {
  const tier = mockTiers.find(t => t.name === name)
  return tier ? `${COLOR_PRESETS[tier.color].badge} border-0` : ''
}
import { toast } from 'sonner'
import { SocialAccountRow } from './components/SocialAccountRow'
import { EditProfileDialog } from './components/EditProfileDialog'
import { LinkAccountDialog } from './components/LinkAccountDialog'
import { MoveAccountDialog } from './components/MoveAccountDialog'
import type { Profile, SocialAccount } from '@/types/profile'

export default function ProfileDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()

  const found = mockProfiles.find(p => p.id === id)
  const [profile, setProfile] = useState<Profile | null>(() =>
    found ? structuredClone(found) : null
  )

  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [linkDialogOpen, setLinkDialogOpen] = useState(false)
  const [moveDialogOpen, setMoveDialogOpen] = useState(false)
  const [selectedAccount, setSelectedAccount] = useState<SocialAccount | null>(null)

  if (!profile) {
    return (
      <EmptyState
        title="Profile not found"
        action={<Button onClick={() => navigate('/profiles')} className="cursor-pointer"><ArrowLeft className="mr-2 h-4 w-4" />Back</Button>}
      />
    )
  }

  const handleSaveProfile = (updates: Pick<Profile, 'name' | 'gender' | 'categories' | 'tier' | 'email' | 'phone' | 'tags'>) => {
    setProfile(prev => prev ? { ...prev, ...updates, updatedAt: new Date().toISOString() } : prev)
  }

  const handleLinkAccount = (account: SocialAccount) => {
    setProfile(prev => {
      if (!prev) return prev
      const accounts = [...prev.accounts, account]
      return { ...prev, accounts, totalFollowers: accounts.reduce((sum, a) => sum + a.followers, 0) }
    })
  }

  const handleMoveAccount = (_targetProfileId: string) => {
    if (!selectedAccount) return
    setProfile(prev => {
      if (!prev) return prev
      const accounts = prev.accounts.filter(a => a.id !== selectedAccount.id)
      return { ...prev, accounts, totalFollowers: accounts.reduce((sum, a) => sum + a.followers, 0) }
    })
    setSelectedAccount(null)
  }

  const handleUnlinkAccount = (account: SocialAccount) => {
    setProfile(prev => {
      if (!prev) return prev
      const accounts = prev.accounts.filter(a => a.id !== account.id)
      return { ...prev, accounts, totalFollowers: accounts.reduce((sum, a) => sum + a.followers, 0) }
    })
    toast.success(`Unlinked @${account.username} from profile`)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 mb-2">
        <Button variant="ghost" size="icon" onClick={() => navigate('/profiles')} className="cursor-pointer" aria-label="Back">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <span className="text-sm text-muted-foreground">Profiles</span>
      </div>

      {/* Profile Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-4 min-w-0">
          <Avatar className="h-16 w-16 shrink-0">
            <AvatarImage src={profile.accounts[0]?.avatarUrl} alt={profile.name} />
            <AvatarFallback className="text-xl">{profile.name[0]}</AvatarFallback>
          </Avatar>
          <div className="space-y-1.5 min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold truncate">{profile.name}</h1>
              {profile.tier && <Badge variant="outline" className={`shrink-0 ${getTierBadgeClass(profile.tier)}`}>{profile.tier}</Badge>}
            </div>
            {profile.categories.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5">
                {profile.categories.map(cat => (
                  <Badge key={cat} variant="outline" className={getCategoryBadgeClass(cat)}>{cat}</Badge>
                ))}
              </div>
            )}
            {profile.tags.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5">
                {profile.tags.map(tag => (
                  <Badge key={tag} variant="secondary" className="text-xs">{tag}</Badge>
                ))}
              </div>
            )}
            <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
              {profile.gender && <span className="capitalize">{profile.gender}</span>}
              {profile.email && (
                <span className="flex items-center gap-1">
                  <Mail className="h-3.5 w-3.5" />{profile.email}
                </span>
              )}
              {profile.phone && (
                <span className="flex items-center gap-1">
                  <Phone className="h-3.5 w-3.5" />{profile.phone}
                </span>
              )}
            </div>
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              <span>Created {formatDate(profile.createdAt)}</span>
              <span>Updated {formatDate(profile.updatedAt)}</span>
            </div>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={() => setEditDialogOpen(true)} className="shrink-0 cursor-pointer">
          <Pencil className="mr-1 h-3 w-3" />Edit
        </Button>
      </div>

      {/* Metrics */}
      <div className="grid gap-4 md:grid-cols-3">
        <MetricCard label="Total Followers" value={formatNumber(profile.totalFollowers)} />
        <MetricCard label="Social Accounts" value={profile.accounts.length} />
        <MetricCard label="Linked Posts" value={profile.linkedPosts} />
      </div>

      {/* Social Accounts */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Social Accounts</CardTitle>
            <Button variant="outline" size="sm" onClick={() => setLinkDialogOpen(true)} className="cursor-pointer">
              <Plus className="mr-1 h-3 w-3" />Link Account
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {profile.accounts.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">No social accounts linked yet.</p>
          ) : (
            <div className="space-y-3">
              {profile.accounts.map(account => (
                <SocialAccountRow
                  key={account.id}
                  account={account}
                  onSync={() => toast.success(`Syncing @${account.username}...`)}
                  onOpenExternal={() => window.open(account.profileUrl, '_blank', 'noopener,noreferrer')}
                  onMoveToProfile={() => {
                    setSelectedAccount(account)
                    setMoveDialogOpen(true)
                  }}
                  onUnlink={() => handleUnlinkAccount(account)}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dialogs */}
      <EditProfileDialog
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        profile={profile}
        onSave={handleSaveProfile}
      />
      <LinkAccountDialog
        open={linkDialogOpen}
        onOpenChange={setLinkDialogOpen}
        existingPlatforms={profile.accounts.map(a => a.platform)}
        onLink={handleLinkAccount}
      />
      <MoveAccountDialog
        open={moveDialogOpen}
        onOpenChange={setMoveDialogOpen}
        account={selectedAccount}
        currentProfileId={profile.id}
        onMove={handleMoveAccount}
      />
    </div>
  )
}
