import { useState, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, ExternalLink, Heart, MessageSquare, Share2, Eye, List, GitBranch, Settings, ChevronLeft, ChevronRight, X } from 'lucide-react'
import { PlatformBadge } from '@/components/common/PlatformBadge'
import { CommentFeed, type CommentViewMode } from '@/components/comments/CommentFeed'
import { EmptyState } from '@/components/common/EmptyState'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Separator } from '@/components/ui/separator'
import { Progress } from '@/components/ui/progress'
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip'
import { mockPosts } from '@/mocks/fixtures/posts'
import { mockCampaigns } from '@/mocks/fixtures/campaigns'
import { mockComments } from '@/mocks/fixtures/comments'
import { formatDate, formatNumber } from '@/lib/utils/format'
import { differenceInDays, parseISO } from 'date-fns'
import { toast } from 'sonner'

type SortOption = 'newest' | 'oldest' | 'most_reactions'

const POLLING_OPTIONS = [
  { value: '15min', label: 'Every 15 minutes' },
  { value: '1hr', label: 'Every hour' },
  { value: '6hr', label: 'Every 6 hours' },
  { value: '12hr', label: 'Every 12 hours' },
  { value: '24hr', label: 'Every 24 hours' },
  { value: 'custom', label: 'Custom' },
  { value: 'manual', label: 'Manual' },
]

const PAGE_SIZE = 20

function PhotoGrid({ photos, onPhotoClick }: { photos: string[]; onPhotoClick: (index: number) => void }) {
  const count = photos.length

  if (count === 1) {
    return (
      <div className="mt-3 rounded-lg overflow-hidden cursor-pointer" onClick={() => onPhotoClick(0)}>
        <img src={photos[0]} alt="" className="w-full max-h-[480px] object-cover" />
      </div>
    )
  }

  if (count === 2) {
    return (
      <div className="mt-3 grid grid-cols-2 gap-0.5 rounded-lg overflow-hidden">
        {photos.map((url, i) => (
          <div key={i} className="cursor-pointer aspect-square" onClick={() => onPhotoClick(i)}>
            <img src={url} alt="" className="h-full w-full object-cover" />
          </div>
        ))}
      </div>
    )
  }

  if (count === 3) {
    return (
      <div className="mt-3 grid grid-cols-2 gap-0.5 rounded-lg overflow-hidden" style={{ height: 400 }}>
        <div className="row-span-2 cursor-pointer" onClick={() => onPhotoClick(0)}>
          <img src={photos[0]} alt="" className="h-full w-full object-cover" />
        </div>
        <div className="cursor-pointer" onClick={() => onPhotoClick(1)}>
          <img src={photos[1]} alt="" className="h-full w-full object-cover" />
        </div>
        <div className="cursor-pointer" onClick={() => onPhotoClick(2)}>
          <img src={photos[2]} alt="" className="h-full w-full object-cover" />
        </div>
      </div>
    )
  }

  // 4+ photos: 2x2 grid, last cell shows "+N more" if > 4
  const visible = photos.slice(0, 4)
  const remaining = count - 4

  return (
    <div className="mt-3 grid grid-cols-2 gap-0.5 rounded-lg overflow-hidden">
      {visible.map((url, i) => (
        <div key={i} className="relative cursor-pointer aspect-square" onClick={() => onPhotoClick(i)}>
          <img src={url} alt="" className="h-full w-full object-cover" />
          {i === 3 && remaining > 0 && (
            <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
              <span className="text-white text-2xl font-semibold">+{remaining}</span>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

export default function PostDetailPage() {
  const { projectId, campaignId, postId } = useParams()
  const navigate = useNavigate()
  const [sort, setSort] = useState<SortOption>('newest')
  const [viewMode, setViewMode] = useState<CommentViewMode>('threaded')
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)

  const post = mockPosts.find(p => p.id === postId)

  // Post-level overrides
  const [pollingOverride, setPollingOverride] = useState(false)
  const [pollingInterval, setPollingInterval] = useState('1hr')
  const [commentPollingOverride, setCommentPollingOverride] = useState(false)
  const [commentPollingInterval, setCommentPollingInterval] = useState('6hr')
  const [metricCustomMin, setMetricCustomMin] = useState(60)
  const [commentCustomMin, setCommentCustomMin] = useState(360)
  const [kpiTargets, setKpiTargets] = useState(post?.kpiTargets ?? { engagement: 0, buzz: 0, interaction: 0, view: 0 })

  const allComments = useMemo(() => mockComments.filter(c => c.postId === postId), [postId])

  const sortedComments = useMemo(() => {
    const sorted = [...allComments]
    switch (sort) {
      case 'oldest':
        sorted.sort((a, b) => new Date(a.publishedAt).getTime() - new Date(b.publishedAt).getTime())
        break
      case 'newest':
        sorted.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime())
        break
      case 'most_reactions':
        sorted.sort((a, b) => (b.likes + b.replyCount) - (a.likes + a.replyCount))
        break
    }
    return sorted
  }, [allComments, sort])

  // In threaded mode, pagination counts only top-level comments
  const topLevelComments = useMemo(
    () => sortedComments.filter(c => !c.parentCommentId),
    [sortedComments],
  )

  const displayComments = viewMode === 'threaded'
    ? topLevelComments.slice(0, visibleCount)
    : sortedComments.slice(0, visibleCount)

  const totalForPagination = viewMode === 'threaded' ? topLevelComments.length : sortedComments.length
  const hasMore = visibleCount < totalForPagination

  if (!post) {
    return (
      <EmptyState
        title="Post not found"
        action={<Button onClick={() => navigate(projectId && campaignId ? `/projects/${projectId}/campaigns/${campaignId}/posts` : -1 as any)} className="cursor-pointer"><ArrowLeft className="mr-2 h-4 w-4" />Go Back</Button>}
      />
    )
  }

  const campaign = mockCampaigns.find(c => c.id === campaignId)
  const totalTarget = kpiTargets.engagement + kpiTargets.buzz + kpiTargets.interaction + kpiTargets.view
  const totalCurrent = post.kpiCurrents.engagement + post.kpiCurrents.buzz + post.kpiCurrents.interaction + post.kpiCurrents.view
  const kpiPct = totalTarget > 0 ? Math.min(Math.round((totalCurrent / totalTarget) * 100), 100) : 0

  // Calculate expected KPI based on campaign timeline
  const now = new Date()
  const campaignStart = campaign ? parseISO(campaign.startDate) : now
  const campaignEnd = campaign ? parseISO(campaign.endDate) : now
  const totalDays = Math.max(differenceInDays(campaignEnd, campaignStart), 1)
  const elapsedDays = Math.max(Math.min(differenceInDays(now, campaignStart), totalDays), 0)
  const expectedPct = Math.round((elapsedDays / totalDays) * 100)
  const expectedKpi = Math.round((elapsedDays / totalDays) * totalTarget)
  const isUnderperforming = totalTarget > 0 && totalCurrent < expectedKpi

  const kpiTypes = ['engagement', 'buzz', 'interaction', 'view'] as const
  const kpiLabels = { engagement: 'Engagement', buzz: 'Buzz', interaction: 'Interaction', view: 'View' }

  const handleSettingsSave = (e: React.FormEvent) => {
    e.preventDefault()
    setSettingsOpen(false)
    toast.success('Post settings updated')
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 mb-2">
        <Button variant="ghost" size="icon" onClick={() => navigate(projectId && campaignId ? `/projects/${projectId}/campaigns/${campaignId}/posts` : -1 as any)} className="cursor-pointer" aria-label="Back">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <span className="text-sm text-muted-foreground">Posts</span>
      </div>

      <Card>
        <CardContent className="p-6">
          <div className="flex items-start gap-4">
            <Avatar className="h-12 w-12">
              <AvatarImage src={post.authorAvatar} alt={post.authorName} />
              <AvatarFallback>{post.authorName[0]}</AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold">{post.authorName}</span>
                  <PlatformBadge platform={post.platform} showLabel />
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0 cursor-pointer"
                  onClick={() => setSettingsOpen(true)}
                  aria-label="Post settings"
                >
                  <Settings className="h-4 w-4" />
                </Button>
              </div>
              <p className="text-sm text-muted-foreground mt-1">{formatDate(post.publishedAt)}</p>
              <p className="mt-3 text-sm">{post.content}</p>
              {post.mediaUrls && post.mediaUrls.length > 0 && (
                <PhotoGrid photos={post.mediaUrls} onPhotoClick={(i) => setLightboxIndex(i)} />
              )}
              <div className="flex items-center gap-5 mt-3">
                <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
                  <Heart className="h-4 w-4" />
                  {formatNumber(post.likes)}
                </span>
                <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
                  <MessageSquare className="h-4 w-4" />
                  {formatNumber(post.comments)}
                </span>
                <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
                  <Share2 className="h-4 w-4" />
                  {formatNumber(post.shares)}
                </span>
                <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
                  <Eye className="h-4 w-4" />
                  {formatNumber(post.views)}
                </span>
              </div>
              <a
                href={post.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-sm text-primary hover:underline mt-2 cursor-pointer"
              >
                View on {post.platform} <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* KPI Progress */}
      <Card>
        <CardContent className="p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold">KPI Progress</h3>
              {isUnderperforming ? (
                <Badge variant="destructive" className="text-xs">Underperforming</Badge>
              ) : kpiPct >= 100 ? (
                <Badge className="text-xs bg-green-500/10 text-green-500 border-0">Target Reached</Badge>
              ) : (
                <Badge variant="secondary" className="text-xs">On Track</Badge>
              )}
            </div>
            <span className="text-sm font-mono">
              {formatNumber(totalCurrent)} <span className="text-muted-foreground">/ {formatNumber(totalTarget)}</span>
            </span>
          </div>
          <Progress
            value={kpiPct}
            className="h-3"
            indicatorClassName={isUnderperforming ? 'bg-destructive' : undefined}
          />
          <div className="flex items-center justify-between mt-2 text-xs text-muted-foreground">
            <span>Day {elapsedDays} of {totalDays}</span>
            <div className="flex items-center gap-3">
              <span>Expected: {formatNumber(expectedKpi)} ({expectedPct}%)</span>
              <span>Actual: {kpiPct}%</span>
            </div>
          </div>
          <div className="grid grid-cols-4 gap-3 mt-4">
            {kpiTypes.map(type => {
              const target = kpiTargets[type]
              const current = post.kpiCurrents[type]
              const pct = target > 0 ? Math.min(Math.round((current / target) * 100), 100) : 0
              return (
                <div key={type} className="space-y-1">
                  <p className="text-xs font-medium">{kpiLabels[type]}</p>
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span className="font-mono">{formatNumber(current)}</span>
                    <span>{formatNumber(target)}</span>
                  </div>
                  <Progress value={pct} className="h-1.5" />
                  <p className="text-xs text-right text-muted-foreground">{pct}%</p>
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>

      {/* Post Settings Dialog */}
      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Post Settings</DialogTitle>
            <DialogDescription>
              Override campaign defaults for this post's polling intervals and KPI target.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSettingsSave} className="space-y-5">
            <Separator />

            {/* Metric Polling Override */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label htmlFor="polling-override" className="text-sm font-medium">Override Metric Polling</Label>
                <Switch
                  id="polling-override"
                  checked={pollingOverride}
                  onCheckedChange={setPollingOverride}
                  className="cursor-pointer"
                />
              </div>
              {pollingOverride && (
                <>
                  <Select value={pollingInterval} onValueChange={setPollingInterval}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {POLLING_OPTIONS.map(opt => (
                        <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {pollingInterval === 'custom' && (
                    <div className="space-y-1">
                      <Label htmlFor="metric-custom-min" className="text-xs">Interval (minutes)</Label>
                      <Input
                        id="metric-custom-min"
                        type="number"
                        min={15}
                        max={10080}
                        value={metricCustomMin}
                        onChange={(e) => setMetricCustomMin(Number(e.target.value))}
                        required
                      />
                      <p className="text-xs text-muted-foreground">Min 15 min, max 10,080 min (7 days)</p>
                    </div>
                  )}
                </>
              )}
              {!pollingOverride && (
                <p className="text-xs text-muted-foreground">Using campaign default</p>
              )}
            </div>

            {/* Comment Polling Override */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label htmlFor="comment-polling-override" className="text-sm font-medium">Override Comment Polling</Label>
                <Switch
                  id="comment-polling-override"
                  checked={commentPollingOverride}
                  onCheckedChange={setCommentPollingOverride}
                  className="cursor-pointer"
                />
              </div>
              {commentPollingOverride && (
                <>
                  <Select value={commentPollingInterval} onValueChange={setCommentPollingInterval}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {POLLING_OPTIONS.map(opt => (
                        <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {commentPollingInterval === 'custom' && (
                    <div className="space-y-1">
                      <Label htmlFor="comment-custom-min" className="text-xs">Interval (minutes)</Label>
                      <Input
                        id="comment-custom-min"
                        type="number"
                        min={15}
                        max={10080}
                        value={commentCustomMin}
                        onChange={(e) => setCommentCustomMin(Number(e.target.value))}
                        required
                      />
                      <p className="text-xs text-muted-foreground">Min 15 min, max 10,080 min (7 days)</p>
                    </div>
                  )}
                </>
              )}
              {!commentPollingOverride && (
                <p className="text-xs text-muted-foreground">Using campaign default</p>
              )}
            </div>

            <Separator />

            {/* KPI Targets */}
            <div className="space-y-3">
              <Label className="text-sm font-medium">KPI Targets</Label>
              <div className="grid grid-cols-2 gap-3">
                {kpiTypes.map(type => (
                  <div key={type} className="space-y-1">
                    <Label htmlFor={`kpi-${type}`} className="text-xs">{kpiLabels[type]}</Label>
                    <Input
                      id={`kpi-${type}`}
                      type="number"
                      min={0}
                      value={kpiTargets[type]}
                      onChange={(e) => setKpiTargets(prev => ({ ...prev, [type]: Number(e.target.value) }))}
                      required
                    />
                    <p className="text-xs text-muted-foreground">
                      {formatNumber(post.kpiCurrents[type])} / {formatNumber(kpiTargets[type])}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="outline" onClick={() => setSettingsOpen(false)} className="cursor-pointer">
                Cancel
              </Button>
              <Button type="submit" className="cursor-pointer">Save</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Photo Lightbox */}
      {lightboxIndex !== null && post.mediaUrls && post.mediaUrls.length > 0 && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center"
          onClick={() => setLightboxIndex(null)}
        >
          <Button
            variant="ghost"
            size="icon"
            className="absolute top-4 right-4 text-white hover:bg-white/20 cursor-pointer z-10"
            onClick={() => setLightboxIndex(null)}
          >
            <X className="h-6 w-6" />
          </Button>
          {post.mediaUrls.length > 1 && (
            <>
              <Button
                variant="ghost"
                size="icon"
                className="absolute left-4 text-white hover:bg-white/20 cursor-pointer z-10 h-10 w-10"
                onClick={(e) => {
                  e.stopPropagation()
                  setLightboxIndex((lightboxIndex - 1 + post.mediaUrls!.length) % post.mediaUrls!.length)
                }}
              >
                <ChevronLeft className="h-8 w-8" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="absolute right-4 text-white hover:bg-white/20 cursor-pointer z-10 h-10 w-10"
                onClick={(e) => {
                  e.stopPropagation()
                  setLightboxIndex((lightboxIndex + 1) % post.mediaUrls!.length)
                }}
              >
                <ChevronRight className="h-8 w-8" />
              </Button>
            </>
          )}
          <img
            src={post.mediaUrls[lightboxIndex]}
            alt=""
            className="max-h-[90vh] max-w-[90vw] object-contain"
            onClick={(e) => e.stopPropagation()}
          />
          <span className="absolute bottom-4 text-white/70 text-sm">
            {lightboxIndex + 1} / {post.mediaUrls.length}
          </span>
        </div>
      )}

      <div>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">Comments ({allComments.length})</h3>
          <div className="flex items-center gap-2">
            <TooltipProvider>
              <div className="flex items-center border rounded-md">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className={`h-8 w-8 rounded-r-none cursor-pointer ${viewMode === 'threaded' ? 'bg-muted' : ''}`}
                      onClick={() => { setViewMode('threaded'); setVisibleCount(PAGE_SIZE) }}
                      aria-label="Threaded view"
                    >
                      <GitBranch className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Threaded</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className={`h-8 w-8 rounded-l-none cursor-pointer ${viewMode === 'flat' ? 'bg-muted' : ''}`}
                      onClick={() => { setViewMode('flat'); setVisibleCount(PAGE_SIZE) }}
                      aria-label="Flat view"
                    >
                      <List className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Flat</TooltipContent>
                </Tooltip>
              </div>
            </TooltipProvider>
            <Select value={sort} onValueChange={(v) => { setSort(v as SortOption); setVisibleCount(PAGE_SIZE) }}>
              <SelectTrigger className="w-44 h-8 text-sm cursor-pointer">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="newest">Newest First</SelectItem>
                <SelectItem value="oldest">Oldest First</SelectItem>
                <SelectItem value="most_reactions">Most Reactions</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <CommentFeed
          comments={displayComments}
          allComments={allComments}
          mode={viewMode}
        />
        {hasMore && (
          <div className="flex justify-center mt-4">
            <Button
              variant="outline"
              onClick={() => setVisibleCount(prev => prev + PAGE_SIZE)}
              className="cursor-pointer"
            >
              Load More ({totalForPagination - visibleCount} remaining)
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
