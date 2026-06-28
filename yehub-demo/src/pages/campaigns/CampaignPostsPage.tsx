import { useState, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Plus, Upload, FileText, X } from 'lucide-react'
import { SearchBar } from '@/components/common/SearchBar'
import { EmptyState } from '@/components/common/EmptyState'
import { PlatformBadge, PlatformIcon } from '@/components/common/PlatformBadge'
import { PLATFORM_CONFIG } from '@/lib/constants/platforms'
import { DataTable, type Column } from '@/components/common/DataTable'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Progress } from '@/components/ui/progress'
import { mockPosts } from '@/mocks/fixtures/posts'
import { mockCampaigns } from '@/mocks/fixtures/campaigns'
import { formatNumber } from '@/lib/utils/format'
import { differenceInDays, parseISO } from 'date-fns'
import { detectPlatform } from '@/lib/utils/platform'
import { toast } from 'sonner'
import type { Post } from '@/types/post'

export default function CampaignPostsPage() {
  const { projectId, campaignId } = useParams()
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [addDialogOpen, setAddDialogOpen] = useState(false)
  const [importDialogOpen, setImportDialogOpen] = useState(false)
  const [postUrls, setPostUrls] = useState('')
  const [csvFile, setCsvFile] = useState<File | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const campaign = mockCampaigns.find(c => c.id === campaignId)
  const posts = mockPosts.filter(p => p.campaignId === campaignId)

  // KPI date-based evaluation
  const now = new Date()
  const campaignStart = campaign ? parseISO(campaign.startDate) : now
  const campaignEnd = campaign ? parseISO(campaign.endDate) : now
  const totalDays = Math.max(differenceInDays(campaignEnd, campaignStart), 1)
  const elapsedDays = Math.max(Math.min(differenceInDays(now, campaignStart), totalDays), 0)
  const timeProgress = elapsedDays / totalDays
  const filtered = posts.filter(p =>
    p.content.toLowerCase().includes(search.toLowerCase()) ||
    p.authorName.toLowerCase().includes(search.toLowerCase())
  )

  const parsedUrls = postUrls
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0)

  const detectedPlatforms = parsedUrls.map(url => ({
    url,
    platform: detectPlatform(url),
  }))

  const validCount = detectedPlatforms.filter(d => d.platform !== null).length

  const handleAddPosts = (e: React.FormEvent) => {
    e.preventDefault()
    const count = validCount
    setAddDialogOpen(false)
    setPostUrls('')
    toast.success(`${count} post${count !== 1 ? 's' : ''} added successfully`)
  }

  const handleImportCsv = (e: React.FormEvent) => {
    e.preventDefault()
    setImportDialogOpen(false)
    setCsvFile(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
    toast.success('Posts imported from CSV successfully')
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null
    if (file && !file.name.endsWith('.csv')) {
      toast.error('Please select a CSV file')
      e.target.value = ''
      return
    }
    setCsvFile(file)
  }

  const columns: Column<Post>[] = [
    {
      key: 'authorName',
      header: 'Author',
      render: (p) => (
        <div className="flex items-center gap-2">
          <PlatformIcon platform={p.platform} className="h-4 w-4 shrink-0" style={{ color: PLATFORM_CONFIG[p.platform].color }} />
          <span className="text-sm font-medium truncate">{p.authorName}</span>
        </div>
      ),
    },
    {
      key: 'content',
      header: 'Content',
      render: (p) => (
        <div className="max-w-xs">
          <p className="text-sm line-clamp-2">{p.content}</p>
        </div>
      ),
    },
    {
      key: 'likes',
      header: 'Likes',
      sortable: true,
      render: (p) => <span className="font-mono">{formatNumber(p.likes)}</span>,
    },
    {
      key: 'comments',
      header: 'Comments',
      sortable: true,
      render: (p) => <span className="font-mono">{formatNumber(p.comments)}</span>,
    },
{
      key: 'engagementRate',
      header: 'Engagement',
      sortable: true,
      render: (p) => <span className="font-mono">{p.engagementRate}%</span>,
    },
    {
      key: 'kpiCurrents' as keyof Post,
      header: 'KPI',
      render: (p) => {
        const totalTarget = p.kpiTargets.engagement + p.kpiTargets.buzz + p.kpiTargets.interaction + p.kpiTargets.view
        const totalCurrent = p.kpiCurrents.engagement + p.kpiCurrents.buzz + p.kpiCurrents.interaction + p.kpiCurrents.view
        const pct = totalTarget > 0 ? Math.min(Math.round((totalCurrent / totalTarget) * 100), 100) : 0
        const expectedKpi = Math.round(timeProgress * totalTarget)
        const isUnderperforming = totalTarget > 0 && totalCurrent < expectedKpi
        return (
          <div className="w-28 space-y-1">
            <div className="flex justify-between text-xs">
              <span className="font-mono">{formatNumber(totalCurrent)}</span>
              <span className="text-muted-foreground">{formatNumber(totalTarget)}</span>
            </div>
            <Progress value={pct} className="h-2" indicatorClassName={isUnderperforming ? 'bg-destructive' : undefined} />
            <p className={`text-xs text-right ${isUnderperforming ? 'text-destructive' : 'text-muted-foreground'}`}>{pct}%</p>
          </div>
        )
      },
    },
  ]

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <SearchBar value={search} onChange={setSearch} placeholder="Search posts..." className="max-w-md" />
        <div className="flex items-center gap-2 shrink-0">
          <Button variant="outline" onClick={() => setImportDialogOpen(true)} className="cursor-pointer">
            <Upload className="mr-2 h-4 w-4" />Import Posts
          </Button>
          <Button onClick={() => setAddDialogOpen(true)} className="cursor-pointer">
            <Plus className="mr-2 h-4 w-4" />Add Post
          </Button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={<FileText className="h-12 w-12" />}
          title="No posts found"
          description={search ? 'Try a different search term' : 'Add posts to this campaign to start monitoring'}
        />
      ) : (
        <DataTable
          columns={columns}
          data={filtered}
          keyExtractor={(p) => p.id}
          onRowClick={(p) => navigate(`/projects/${projectId}/campaigns/${campaignId}/posts/${p.id}`)}
          emptyMessage="No posts found"
        />
      )}

      {/* Add Post Dialog - multiple URLs */}
      <Dialog open={addDialogOpen} onOpenChange={(open) => { setAddDialogOpen(open); if (!open) setPostUrls('') }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Add Posts</DialogTitle>
            <DialogDescription>Paste social media post URLs to add to this campaign. One URL per line.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleAddPosts} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="post-urls">Post URLs</Label>
              <Textarea
                id="post-urls"
                value={postUrls}
                onChange={(e) => setPostUrls(e.target.value)}
                placeholder={"https://facebook.com/post/123\nhttps://tiktok.com/@user/video/456\nhttps://youtube.com/watch?v=abc"}
                rows={6}
                className="font-mono text-sm"
                required
              />
            </div>
            {parsedUrls.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">
                  {validCount} of {parsedUrls.length} URL{parsedUrls.length !== 1 ? 's' : ''} detected
                </p>
                <div className="max-h-32 overflow-y-auto space-y-1">
                  {detectedPlatforms.map(({ url, platform }, i) => (
                    <div key={i} className="flex items-center gap-2 text-sm">
                      {platform ? (
                        <PlatformBadge platform={platform} size="sm" />
                      ) : (
                        <X className="h-4 w-4 text-destructive shrink-0" />
                      )}
                      <span className={`truncate ${platform ? 'text-foreground' : 'text-destructive'}`}>{url}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <Separator />
            <div className="flex justify-end gap-3">
              <Button type="button" variant="outline" onClick={() => { setAddDialogOpen(false); setPostUrls('') }} className="cursor-pointer">Cancel</Button>
              <Button type="submit" className="cursor-pointer" disabled={validCount === 0}>
                Add {validCount > 0 ? `${validCount} Post${validCount !== 1 ? 's' : ''}` : 'Posts'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Import Posts Dialog - CSV file */}
      <Dialog open={importDialogOpen} onOpenChange={(open) => { setImportDialogOpen(open); if (!open) { setCsvFile(null); if (fileInputRef.current) fileInputRef.current.value = '' } }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Import Posts from CSV</DialogTitle>
            <DialogDescription>Upload a CSV file containing post URLs. The file should have a column with post URLs.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleImportCsv} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="csv-file">CSV File</Label>
              <div className="border-2 border-dashed rounded-lg p-6 text-center">
                <input
                  ref={fileInputRef}
                  id="csv-file"
                  type="file"
                  accept=".csv"
                  onChange={handleFileChange}
                  className="hidden"
                />
                {csvFile ? (
                  <div className="flex items-center justify-center gap-2">
                    <FileText className="h-5 w-5 text-muted-foreground" />
                    <span className="text-sm font-medium">{csvFile.name}</span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 cursor-pointer"
                      onClick={() => { setCsvFile(null); if (fileInputRef.current) fileInputRef.current.value = '' }}
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ) : (
                  <div>
                    <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                    <p className="text-sm text-muted-foreground mb-2">Drag and drop or click to upload</p>
                    <Button type="button" variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} className="cursor-pointer">
                      Choose File
                    </Button>
                  </div>
                )}
              </div>
              <p className="text-xs text-muted-foreground">Supported format: CSV with a "url" column. Max 500 URLs per import.</p>
            </div>
            <Separator />
            <div className="flex justify-end gap-3">
              <Button type="button" variant="outline" onClick={() => { setImportDialogOpen(false); setCsvFile(null); if (fileInputRef.current) fileInputRef.current.value = '' }} className="cursor-pointer">Cancel</Button>
              <Button type="submit" className="cursor-pointer" disabled={!csvFile}>Import Posts</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
