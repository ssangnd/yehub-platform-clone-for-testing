import { useState } from 'react'
import { useParams, useNavigate, useLocation, NavLink } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, Pencil, Play, Pause, CheckCircle2 } from 'lucide-react'
import { PageWrapper } from '@/components/common/PageWrapper'
import { PageHeader } from '@/components/common/PageHeader'
import { PlatformBadge } from '@/components/common/PlatformBadge'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
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
import { StatusBadge } from '../components/StatusBadge'
import { useCampaignDetail } from './use-campaign-detail'
import { CampaignPostsTab } from './components/CampaignPostsTab'
import { CampaignCommentsTab } from './components/CampaignCommentsTab'
import { CampaignOverviewTab } from './components/CampaignOverviewTab'
import { CampaignMembersTab } from './components/CampaignMembersTab'
import { CampaignSpendingTab } from './components/CampaignSpendingTab'
import { cn } from '@/lib/utils'
import { formatDate, formatInterval } from '@/lib/format'
import { useCan } from '@/hooks/use-can'
import { useAuthStore } from '@/store/auth.store'
import { campaignsApi } from '@/api/campaigns'
import { queryKeys } from '@/lib/constants/query-keys'

export function CampaignDetailPage() {
  const { projectId, campaignId } = useParams<{ projectId: string; campaignId: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const [completeConfirmOpen, setCompleteConfirmOpen] = useState(false)
  const [pauseConfirmOpen, setPauseConfirmOpen] = useState(false)
  const { campaign, isLoading, changeStatus, isUpdating } = useCampaignDetail(campaignId!)

  const isAdmin = useAuthStore((s) => s.user?.role === 'ADMIN')
  const { data: myRoleData } = useQuery({
    queryKey: queryKeys.campaignMe(campaignId!),
    queryFn: () => campaignsApi.getMyRole(campaignId!),
    enabled: !!campaignId && !isAdmin,
  })
  const myRole = myRoleData?.role ?? null
  const canEditByRole = useCan('edit_campaign', myRole)
  const canManageByRole = useCan('manage_posts', myRole)
  const canManageMembersByRole = useCan('manage_members', myRole)
  const canDeleteByRole = useCan('delete_post', myRole)
  const canViewSpendingByRole = useCan('view_spending', myRole)
  const canEditCampaign = isAdmin || canEditByRole
  const canManagePosts = isAdmin || canManageByRole
  const canManageMembers = isAdmin || canManageMembersByRole
  const canDeletePost = isAdmin || canDeleteByRole
  const canViewSpending = isAdmin || canViewSpendingByRole

  if (isLoading)
    return (
      <PageWrapper>
        <p className="text-sm text-muted-foreground">Loading…</p>
      </PageWrapper>
    )
  if (!campaign)
    return (
      <PageWrapper>
        <p>Campaign not found.</p>
      </PageWrapper>
    )

  const basePath = `/projects/${projectId}/campaigns/${campaignId}`
  const activeTab = location.pathname.endsWith('/posts')
    ? 'posts'
    : location.pathname.endsWith('/comments')
      ? 'comments'
      : location.pathname.endsWith('/members')
        ? 'members'
        : location.pathname.endsWith('/spending')
          ? 'spending'
          : 'overview'

  const isRunning = campaign.status === 'ACTIVE' || campaign.status === 'PAUSED'
  const isCompleted = campaign.status === 'COMPLETED'

  return (
    <PageWrapper>
      {/* Back navigation */}
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" aria-label="Back" onClick={() => navigate(`/projects/${projectId}`)}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <span className="text-sm text-muted-foreground">{campaign.project_name}</span>
      </div>

      {/* Campaign header */}
      <PageHeader
        title={campaign.name}
        description={campaign.description}
        actions={
          <>
            <StatusBadge status={campaign.status} />
            {canEditCampaign && !isCompleted && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  className="cursor-pointer"
                  onClick={() => navigate(`${basePath}/edit`)}
                >
                  <Pencil className="mr-1 h-4 w-4" />
                  Edit
                </Button>
                {campaign.status === 'DRAFT' && (
                  <Button
                    size="sm"
                    className="cursor-pointer"
                    onClick={() => changeStatus('ACTIVE')}
                    disabled={isUpdating}
                  >
                    <Play className="mr-1 h-4 w-4" /> Activate
                  </Button>
                )}
                {isRunning && campaign.status === 'ACTIVE' && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="cursor-pointer"
                    onClick={() => setPauseConfirmOpen(true)}
                    disabled={isUpdating}
                  >
                    <Pause className="mr-1 h-4 w-4" />
                    Pause
                  </Button>
                )}
                {isRunning && campaign.status === 'PAUSED' && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="cursor-pointer"
                    onClick={() => changeStatus('ACTIVE')}
                    disabled={isUpdating}
                  >
                    <Play className="mr-1 h-4 w-4" />
                    Resume
                  </Button>
                )}
                {isRunning && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="cursor-pointer text-destructive hover:text-destructive"
                    onClick={() => setCompleteConfirmOpen(true)}
                    disabled={isUpdating}
                  >
                    <CheckCircle2 className="mr-1 h-4 w-4" />
                    Mark Complete
                  </Button>
                )}
              </>
            )}
          </>
        }
      />

      {/* Campaign metadata */}
      <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        {campaign.start_date && campaign.end_date && (
          <Badge variant="outline">
            {formatDate(campaign.start_date)} - {formatDate(campaign.end_date)}
          </Badge>
        )}
        <Badge variant="outline">Metrics: {formatInterval(campaign.metric_polling_interval)}</Badge>
        <Badge variant="outline">Comments: {formatInterval(campaign.comments_polling_interval)}</Badge>
        {campaign.platforms?.map((p) => (
          <PlatformBadge key={p} platform={p} size="sm" />
        ))}
      </div>

      {/* Tabs */}
      <div className="border-b">
        <nav className="flex gap-4">
          <NavLink
            to={basePath}
            end
            className={({ isActive }) =>
              cn(
                'pb-2 text-sm font-medium border-b-2',
                isActive
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground',
              )
            }
          >
            Overview
          </NavLink>
          <NavLink
            to={`${basePath}/posts`}
            className={({ isActive }) =>
              cn(
                'pb-2 text-sm font-medium border-b-2',
                isActive
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground',
              )
            }
          >
            Posts ({campaign.post_count})
          </NavLink>
          <NavLink
            to={`${basePath}/comments`}
            className={({ isActive }) =>
              cn(
                'pb-2 text-sm font-medium border-b-2',
                isActive
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground',
              )
            }
          >
            Comments ({campaign.comment_count})
          </NavLink>
          <NavLink
            to={`${basePath}/members`}
            className={({ isActive }) =>
              cn(
                'pb-2 text-sm font-medium border-b-2',
                isActive
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground',
              )
            }
          >
            Members
          </NavLink>
          {canViewSpending && (
            <NavLink
              to={`${basePath}/spending`}
              className={({ isActive }) =>
                cn(
                  'pb-2 text-sm font-medium border-b-2',
                  isActive
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted-foreground hover:text-foreground',
                )
              }
            >
              Spending
            </NavLink>
          )}
        </nav>
      </div>

      {/* Tab content */}
      {activeTab === 'overview' && <CampaignOverviewTab campaign={campaign} />}
      {activeTab === 'posts' && (
        <CampaignPostsTab
          campaignId={campaignId!}
          canManage={canManagePosts && !isCompleted}
          canDelete={canDeletePost}
          campaign={campaign}
        />
      )}
      {activeTab === 'comments' && <CampaignCommentsTab campaignId={campaignId!} />}
      {activeTab === 'members' && <CampaignMembersTab campaignId={campaignId!} canManage={canManageMembers} />}
      {activeTab === 'spending' &&
        (canViewSpending ? (
          <CampaignSpendingTab campaignId={campaignId!} />
        ) : (
          <p className="py-12 text-center text-sm text-muted-foreground">You don't have access to campaign spending.</p>
        ))}

      <AlertDialog open={pauseConfirmOpen} onOpenChange={setPauseConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Pause this campaign?</AlertDialogTitle>
            <AlertDialogDescription>
              Pausing the campaign will stop all processors, including metric polling and comment syncing. You can
              resume the campaign at any time.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                changeStatus('PAUSED')
                setPauseConfirmOpen(false)
              }}
            >
              Pause Campaign
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={completeConfirmOpen} onOpenChange={setCompleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Mark this campaign as completed?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently mark the campaign as completed. No further status changes are allowed and this
              action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                changeStatus('COMPLETED')
                setCompleteConfirmOpen(false)
              }}
            >
              Mark Complete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageWrapper>
  )
}
