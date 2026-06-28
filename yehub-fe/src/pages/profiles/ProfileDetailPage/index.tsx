import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ArrowLeft, MoreHorizontal, Plus, Pencil, Mail, Phone, Trash2 } from 'lucide-react'
import { PageWrapper } from '@/components/common/PageWrapper'
import { MetricCard } from '@/components/common/MetricCard'
import { PresignedAvatar } from '@/components/common/PresignedAvatar'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { COLOR_PRESETS, type ColorKey } from '@/lib/constants/colors'
import { formatNumber, formatDate } from '@/lib/format'
import { showApiError } from '@/lib/errors'
import { profilesApi, type LinkAccountPayload, type UpdateProfilePayload } from '@/api/profiles'
import { useCanGlobal } from '@/hooks/use-can'
import { useAuthStore } from '@/store/auth.store'
import { useDeleteProfile, useProfileDetail } from './use-profile-detail'
import { SocialAccountRow } from './components/SocialAccountRow'
import { EditProfileDialog } from './components/EditProfileDialog'
import { LinkAccountDialog } from './components/LinkAccountDialog'

export default function ProfileDetailPage() {
  const navigate = useNavigate()
  const { id, profile, isLoading, categories, tiers, invalidate } = useProfileDetail()

  const [editOpen, setEditOpen] = useState(false)
  const [linkAccountOpen, setLinkAccountOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const user = useAuthStore((s) => s.user)
  const canDelete = useCanGlobal('delete_profile', user?.role ?? null)
  const deleteMutation = useDeleteProfile(id)

  const updateMutation = useMutation({
    mutationFn: (data: UpdateProfilePayload) => profilesApi.update(id, data),
    onSuccess: () => {
      invalidate()
      setEditOpen(false)
      toast.success('Profile updated')
    },
    onError: (error) => showApiError(error, { fallback: 'Failed to update profile' }),
  })

  const linkAccountMutation = useMutation({
    mutationFn: (data: LinkAccountPayload) => profilesApi.linkAccount(id, data),
    onSuccess: () => {
      invalidate()
      setLinkAccountOpen(false)
      toast.success('Account linked')
    },
    onError: (error) => showApiError(error, { fallback: 'Failed to link account' }),
  })

  if (isLoading) {
    return (
      <PageWrapper>
        <div className="flex items-center justify-center py-12">
          <p className="text-muted-foreground">Loading profile...</p>
        </div>
      </PageWrapper>
    )
  }

  if (!profile) {
    return (
      <PageWrapper>
        <div className="flex flex-col items-center justify-center py-12 gap-4">
          <p className="text-muted-foreground">Profile not found</p>
          <Button onClick={() => navigate('/profiles')} className="cursor-pointer">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Button>
        </div>
      </PageWrapper>
    )
  }

  const getBadgeClass = (color: string): string => {
    const preset = COLOR_PRESETS[color as ColorKey]
    return preset ? `${preset.badge} border-0` : ''
  }

  const hasAccounts = profile.accounts.length > 0

  return (
    <PageWrapper>
      {/* Back button + breadcrumb */}
      <div className="flex items-center gap-2 mb-2">
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

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-4 min-w-0">
          <PresignedAvatar
            imageKey={profile.avatar}
            alt={profile.name}
            fallback={profile.name[0]?.toUpperCase() ?? '?'}
            className="size-16 text-xl"
          />
          <div className="space-y-1.5 min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold truncate">{profile.name}</h1>
              {profile.tier && (
                <Badge variant="outline" className={`shrink-0 ${getBadgeClass(profile.tier.color)}`}>
                  {profile.tier.name}
                </Badge>
              )}
            </div>
            {profile.categories.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5">
                {profile.categories.map((cat) => (
                  <Badge key={cat.id} variant="outline" className={getBadgeClass(cat.color)}>
                    {cat.name}
                  </Badge>
                ))}
              </div>
            )}
            {profile.tags.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5">
                {profile.tags.map((tag) => (
                  <Badge key={tag} variant="secondary" className="text-xs">
                    {tag}
                  </Badge>
                ))}
              </div>
            )}
            <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
              {profile.gender && <span className="capitalize">{profile.gender.toLowerCase()}</span>}
              {profile.email && (
                <span className="flex items-center gap-1">
                  <Mail className="h-3.5 w-3.5" />
                  {profile.email}
                </span>
              )}
              {profile.phone && (
                <span className="flex items-center gap-1">
                  <Phone className="h-3.5 w-3.5" />
                  {profile.phone}
                </span>
              )}
            </div>
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              <span>Created {formatDate(profile.createdAt)}</span>
              <span>Updated {formatDate(profile.updatedAt)}</span>
            </div>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setEditOpen(true)} className="cursor-pointer">
            <Pencil className="mr-1 h-3 w-3" />
            Edit
          </Button>
          {canDelete && (
            <DropdownMenu>
              <DropdownMenuTrigger
                render={<Button variant="outline" size="icon" aria-label="More actions" className="cursor-pointer" />}
              >
                <MoreHorizontal className="h-4 w-4" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem variant="destructive" onClick={() => setDeleteOpen(true)}>
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete profile
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>

      {/* Metrics */}
      <div className="grid gap-4 md:grid-cols-2">
        <MetricCard label="Total Followers" value={formatNumber(profile.totalFollowers)} />
        <MetricCard label="Social Accounts" value={profile.accounts.length} />
      </div>

      {/* Social Accounts */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Social Accounts</CardTitle>
            <Button variant="outline" size="sm" onClick={() => setLinkAccountOpen(true)} className="cursor-pointer">
              <Plus className="mr-1 h-3 w-3" />
              Link Account
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {profile.accounts.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">No social accounts linked yet.</p>
          ) : (
            <div className="space-y-3">
              {profile.accounts.map((account) => (
                <SocialAccountRow key={account.id} account={account} profileId={profile.id} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Page-level dialogs (edit + link account) */}
      <EditProfileDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        profile={profile}
        categories={categories}
        tiers={tiers}
        onSave={(data) => updateMutation.mutate(data)}
        isSaving={updateMutation.isPending}
      />
      <LinkAccountDialog
        open={linkAccountOpen}
        onOpenChange={setLinkAccountOpen}
        existingPlatforms={profile.accounts.map((a) => a.platform)}
        onLink={(data) => linkAccountMutation.mutate(data)}
        isSaving={linkAccountMutation.isPending}
      />
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{hasAccounts ? 'Cannot delete profile' : 'Delete profile?'}</AlertDialogTitle>
            <AlertDialogDescription>
              {hasAccounts
                ? `This profile still has ${profile.accounts.length} social account${
                    profile.accounts.length === 1 ? '' : 's'
                  } linked. Unlink all social accounts before deleting the profile.`
                : 'This permanently removes the profile along with its tier and categories. This cannot be undone.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>
              {hasAccounts ? 'Close' : 'Cancel'}
            </AlertDialogCancel>
            {!hasAccounts && (
              <AlertDialogAction
                disabled={deleteMutation.isPending}
                onClick={(e) => {
                  e.preventDefault()
                  deleteMutation.mutate()
                }}
                className="bg-destructive text-white hover:bg-destructive/90"
              >
                {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
              </AlertDialogAction>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageWrapper>
  )
}
