import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Plus, Upload, FileText, Download } from 'lucide-react'
import { useMutation } from '@tanstack/react-query'
import { toast } from 'sonner'
import { postsApi } from '@/api/posts'
import { SearchBar } from '@/components/common/SearchBar'
import { EmptyState } from '@/components/common/EmptyState'
import { PaginationBar } from '@/components/common/PaginationBar'
import { PostsTable } from '@/components/common/PostsTable'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useCampaignPosts } from './use-campaign-posts'
import { AddPostDialog } from './AddPostDialog'
import { ImportPostsDialog } from './ImportPostsDialog'
import { PostRowActions } from './PostRowActions'
import type { Platform, PostItem } from '@/api/posts'
import type { Campaign } from '@/api/campaigns'
import { PLATFORM_OPTIONS } from '@/lib/constants/platforms'
import { formatNumber } from '@/lib/format'
import { differenceInDays, parseISO } from 'date-fns'

function KpiCell({ post, campaign }: { post: PostItem; campaign: Campaign }) {
  const targets = post.kpi_targets
  if (!targets) return <>—</>
  const totalTarget = targets.engagement + targets.buzz + targets.interaction + targets.view
  const totalCurrent = post.likes + post.shares + post.comment_count + post.views
  if (totalTarget === 0) return <>—</>
  const pct = Math.min(Math.round((totalCurrent / totalTarget) * 100), 100)
  const now = new Date()
  const start = campaign.start_date ? parseISO(campaign.start_date) : now
  const end = campaign.end_date ? parseISO(campaign.end_date) : now
  const totalDays = Math.max(differenceInDays(end, start), 1)
  const elapsed = Math.max(Math.min(differenceInDays(now, start), totalDays), 0)
  const expectedKpi = Math.round((elapsed / totalDays) * totalTarget)
  const isUnderperforming = totalCurrent < expectedKpi
  return (
    <div className="w-28 space-y-1">
      <div className="flex justify-between text-xs">
        <span className="font-mono">{formatNumber(totalCurrent)}</span>
        <span className="text-muted-foreground">{formatNumber(totalTarget)}</span>
      </div>
      <div className="relative h-2 w-full overflow-hidden rounded-full bg-primary/20">
        <div
          className={`h-full transition-all ${isUnderperforming ? 'bg-destructive' : 'bg-primary'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className={`text-xs text-right ${isUnderperforming ? 'text-destructive' : 'text-muted-foreground'}`}>{pct}%</p>
    </div>
  )
}

export function CampaignPostsTab({
  campaignId,
  canManage,
  canDelete,
  campaign,
}: {
  campaignId: string
  canManage: boolean
  canDelete: boolean
  campaign: Campaign
}) {
  const { projectId } = useParams<{ projectId: string }>()
  const navigate = useNavigate()
  const [addOpen, setAddOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const {
    posts,
    totalPages,
    isLoading,
    page,
    setPage,
    search,
    handleSearchChange,
    platformFilter,
    setPlatformFilter,
    sortBy,
    sortOrder,
    toggleSort,
  } = useCampaignPosts(campaignId)

  const exportMutation = useMutation({
    mutationFn: () =>
      postsApi.exportPosts(campaignId, {
        q: search || undefined,
        platform: platformFilter || undefined,
      }),
    onSuccess: (blob) => {
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${campaign.name}-posts.xlsx`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    },
    onError: () => toast.error('Export failed'),
  })

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <SearchBar value={search} onChange={handleSearchChange} placeholder="Search by URL…" className="max-w-md" />
        <Select value={platformFilter} onValueChange={(v) => setPlatformFilter(v as Platform | '')}>
          <SelectTrigger className="w-35">
            <SelectValue placeholder="All platforms" />
          </SelectTrigger>
          <SelectContent>
            {PLATFORM_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="ml-auto flex gap-2">
          <Button
            size="sm"
            variant="outline"
            className="cursor-pointer"
            onClick={() => exportMutation.mutate()}
            disabled={exportMutation.isPending}
          >
            <Download className="mr-1 h-3 w-3" /> {exportMutation.isPending ? 'Exporting…' : 'Export'}
          </Button>
          {canManage && (
            <>
              <Button size="sm" variant="outline" className="cursor-pointer" onClick={() => setImportOpen(true)}>
                <Upload className="mr-1 h-3 w-3" /> Import posts
              </Button>
              <Button size="sm" className="cursor-pointer" onClick={() => setAddOpen(true)}>
                <Plus className="mr-1 h-3 w-3" /> Add Post
              </Button>
            </>
          )}
        </div>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading posts…</p>
      ) : posts.length === 0 ? (
        <EmptyState
          icon={<FileText className="h-12 w-12" />}
          title="No posts yet"
          description="Add posts by URL or import from a CSV / Excel file."
        />
      ) : (
        <PostsTable
          posts={posts}
          showAccount
          hideShares
          hideViews
          sortableEngagement
          trailingHeader="KPI"
          renderTrailing={(post: PostItem) => <KpiCell post={post} campaign={campaign} />}
          renderActions={(post: PostItem) => (
            <PostRowActions
              post={post}
              campaignId={campaignId}
              canDelete={canDelete}
              campaignCompleted={campaign.status === 'COMPLETED'}
            />
          )}
          sortBy={sortBy}
          sortOrder={sortOrder}
          onSort={toggleSort as (key: string) => void}
          onRowClick={(p) => navigate(`/projects/${projectId}/campaigns/${campaignId}/posts/${p.id}`)}
        />
      )}

      <PaginationBar page={page} setPage={setPage} totalPages={totalPages} />

      <AddPostDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        campaignId={campaignId}
        campaignPlatforms={campaign.platforms}
      />
      <ImportPostsDialog open={importOpen} onOpenChange={setImportOpen} campaignId={campaignId} />
    </div>
  )
}
