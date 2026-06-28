import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, ExternalLink, Pencil, MoreHorizontal, Trash2 } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { ROUTES } from '@/lib/constants/routes'
import { PlatformBadge } from '@/components/common/PlatformBadge'
import { PLATFORMS } from '@/lib/constants/platforms'
import { PageWrapper } from '@/components/common/PageWrapper'
import { EmptyState } from '@/components/common/EmptyState'
import { Button, buttonVariants } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'

import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip'
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
import { campaignsApi } from '@/api/campaigns'
import { useAuthStore } from '@/store/auth.store'
import { useCan } from '@/hooks/use-can'
import { queryKeys } from '@/lib/constants/query-keys'

import { usePostDetail, useDeletePost, useSyncPost } from './use-post-detail'
import { RecordedMetricsCard } from './components/RecordedMetricsCard'
import { OverallKpiCard } from './components/OverallKpiCard'
import { PostSyncScheduleCard } from './components/PostSyncScheduleCard'
import { PostSettingsDialog } from './components/PostSettingsDialog'
import { SocialEmbed } from './components/SocialEmbed'
import { CommentsSection } from './components/CommentsSection'

export default function PostDetailPage() {
  const { projectId, campaignId, postId } = useParams<{ projectId: string; campaignId: string; postId: string }>()
  const navigate = useNavigate()
  const { post, isLoading, updatePost } = usePostDetail(postId!)
  const syncMutation = useSyncPost(postId!)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)

  const isAdmin = useAuthStore((s) => s.user?.role === 'ADMIN')

  const { data: myRoleData } = useQuery({
    queryKey: queryKeys.campaignMe(post?.campaign_id ?? ''),
    queryFn: () => campaignsApi.getMyRole(post!.campaign_id),
    enabled: !!post?.campaign_id && !isAdmin,
  })

  const myRole = myRoleData?.role ?? null
  const canDeleteByRole = useCan('delete_post', myRole)
  const canDeletePost = isAdmin || canDeleteByRole
  const canManagePostsByRole = useCan('manage_posts', myRole)
  const canEditPost = isAdmin || canManagePostsByRole

  const deleteMutation = useDeletePost(postId!, post?.campaign_id, () => {
    if (projectId && campaignId) {
      navigate(ROUTES.CAMPAIGN_POSTS.replace(':projectId', projectId).replace(':campaignId', campaignId))
    } else {
      navigate(-1)
    }
  })

  if (isLoading) {
    return (
      <PageWrapper>
        <p className="text-sm text-muted-foreground">Loading...</p>
      </PageWrapper>
    )
  }

  if (!post) {
    return (
      <PageWrapper>
        <EmptyState
          title="Post not found"
          action={
            <Button onClick={() => navigate(-1)} className="cursor-pointer">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Go Back
            </Button>
          }
        />
      </PageWrapper>
    )
  }

  const isCompletedCampaign = post.campaign_status === 'COMPLETED'
  const canSyncPost = post.campaign_status === 'ACTIVE'
  const platformLabel = PLATFORMS.find((p) => p.value === post.platform)?.label ?? post.platform

  return (
    <PageWrapper>
      {/* Top header */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={() =>
              navigate(
                projectId && campaignId
                  ? ROUTES.CAMPAIGN_POSTS.replace(':projectId', projectId).replace(':campaignId', campaignId)
                  : (-1 as unknown as string),
              )
            }
            className="cursor-pointer"
            aria-label="Back"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-lg font-semibold">Post Details</h1>
        </div>
        <div className="flex items-center gap-2">
          {canEditPost &&
            (isCompletedCampaign ? (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger>
                    <span className="inline-block cursor-not-allowed">
                      <Button variant="outline" size="sm" disabled className="pointer-events-none opacity-50">
                        <Pencil className="mr-2 h-4 w-4" />
                        Edit post
                      </Button>
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>Cannot edit posts in a completed campaign</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            ) : (
              <Button variant="outline" size="sm" onClick={() => setSettingsOpen(true)} className="cursor-pointer">
                <Pencil className="mr-2 h-4 w-4" />
                Edit post
              </Button>
            ))}
          {canDeletePost && (
            <DropdownMenu>
              <DropdownMenuTrigger
                render={<Button variant="outline" size="sm" className="cursor-pointer" aria-label="More actions" />}
              >
                <MoreHorizontal className="mr-2 h-4 w-4" />
                More
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {isCompletedCampaign ? (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger>
                        <DropdownMenuItem
                          disabled
                          className="text-destructive focus:text-destructive"
                          onSelect={(e) => e.preventDefault()}
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Delete post
                        </DropdownMenuItem>
                      </TooltipTrigger>
                      <TooltipContent>Cannot delete posts in a completed campaign</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                ) : (
                  <DropdownMenuItem
                    className="cursor-pointer text-destructive focus:text-destructive"
                    onClick={() => setDeleteOpen(true)}
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Delete post
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>

      {/* Two-column layout */}
      <div className="grid gap-6 lg:grid-cols-2 items-start">
        {/* Left: media embed and author */}
        <Card className="flex flex-col overflow-hidden">
          <CardHeader className="bg-muted/30 pb-4 border-b">
            <div className="flex items-start gap-4">
              <Avatar className="h-12 w-12 border bg-background">
                <AvatarImage src={post.author_avatar ?? undefined} alt={post.author_name ?? ''} />
                <AvatarFallback>{post.author_name?.[0] ?? 'P'}</AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-base">{post.author_name ?? 'Unknown'}</span>
                  <PlatformBadge platform={post.platform} showLabel />
                </div>
                {post.published_at && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Posted on {format(parseISO(post.published_at), 'MMM d, yyyy')} •{' '}
                    {format(parseISO(post.published_at), 'h:mm a')}
                  </p>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0 min-w-0 bg-muted/10">
            {post.url ? (
              <div className="flex justify-center">
                <SocialEmbed platform={post.platform} url={post.url} />
              </div>
            ) : (
              <div className="p-8 text-center text-sm text-muted-foreground">No URL available</div>
            )}
          </CardContent>
        </Card>

        {/* Right: metrics + KPI + actions */}
        <div className="flex flex-col gap-4">
          <RecordedMetricsCard
            metrics={
              post.last_polled_at
                ? { likes: post.likes, comments: post.comment_count, shares: post.shares, views: post.views }
                : null
            }
            kpiTargets={post.kpi_targets}
            lastPolledAt={post.last_polled_at}
            onSyncMetrics={canSyncPost ? () => syncMutation.mutate({ metrics: true }) : undefined}
            onSyncComments={canSyncPost ? () => syncMutation.mutate({ comments: true }) : undefined}
            isSyncingMetrics={syncMutation.isPending && syncMutation.variables?.metrics === true}
            isSyncingComments={syncMutation.isPending && syncMutation.variables?.comments === true}
          />
          <OverallKpiCard
            metrics={
              post.last_polled_at
                ? { likes: post.likes, comments: post.comment_count, shares: post.shares, views: post.views }
                : null
            }
            kpiTargets={post.kpi_targets}
            campaignStartDate={post.campaign_start_date}
            campaignEndDate={post.campaign_end_date}
          />
          <PostSyncScheduleCard
            lastMetricSyncAt={post.last_metric_polled_at}
            lastCommentSyncAt={post.last_comment_polled_at}
            nextMetricSyncAt={post.next_metric_sync_at}
            nextCommentSyncAt={post.next_comment_sync_at}
          />

          {post.url && (
            <a
              href={post.url}
              target="_blank"
              rel="noopener noreferrer"
              className={buttonVariants({ variant: 'outline', className: 'w-full cursor-pointer' })}
            >
              View on {platformLabel}
              <ExternalLink className="ml-2 h-4 w-4" />
            </a>
          )}
        </div>
      </div>

      {/* Post Settings Dialog */}
      {settingsOpen && (
        <PostSettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} post={post} onSave={updatePost} />
      )}

      {/* Delete Post Confirmation */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this post?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the post and all of its comments and recorded metrics. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                deleteMutation.mutate()
                setDeleteOpen(false)
              }}
              disabled={deleteMutation.isPending}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Comments Section */}
      <CommentsSection postId={postId!} />
    </PageWrapper>
  )
}
