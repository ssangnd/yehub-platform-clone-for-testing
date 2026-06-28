import { ExternalLink, MessageSquare } from 'lucide-react'
import { EmptyState } from '@/components/common/EmptyState'
import { PaginationBar } from '@/components/common/PaginationBar'
import { PlatformBadge } from '@/components/common/PlatformBadge'
import { SearchBar } from '@/components/common/SearchBar'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { PLATFORMS } from '@/lib/constants/platforms'
import { CommentCard } from '@/pages/posts/PostDetailPage/components/CommentCard'
import type { Sentiment } from '@/api/comments'
import type { Platform } from '@/api/posts'
import { useCampaignComments } from './use-campaign-comments'

type Props = {
  campaignId: string
}

const SENTIMENT_OPTIONS: { value: Sentiment | ''; label: string }[] = [
  { value: '', label: 'All sentiments' },
  { value: 'POSITIVE', label: 'Positive' },
  { value: 'NEGATIVE', label: 'Negative' },
  { value: 'NEUTRAL', label: 'Neutral' },
  { value: 'MIXED', label: 'Mixed' },
]

export function CampaignCommentsTab({ campaignId }: Props) {
  const {
    comments,
    totalPages,
    isLoading,
    page,
    setPage,
    search,
    handleSearchChange,
    platformFilter,
    handlePlatformChange,
    sentimentFilter,
    handleSentimentChange,
    sort,
    handleSortChange,
  } = useCampaignComments(campaignId)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <SearchBar
          value={search}
          onChange={handleSearchChange}
          placeholder="Search comments..."
          className="w-full sm:max-w-md"
        />
        <Select value={platformFilter} onValueChange={(value) => handlePlatformChange(value as Platform | '')}>
          <SelectTrigger className="w-38">
            <SelectValue placeholder="All platforms" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">All platforms</SelectItem>
            {PLATFORMS.map((platform) => (
              <SelectItem key={platform.value} value={platform.value}>
                {platform.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={sentimentFilter} onValueChange={(value) => handleSentimentChange(value as Sentiment | '')}>
          <SelectTrigger className="w-38">
            <SelectValue placeholder="All sentiments" />
          </SelectTrigger>
          <SelectContent>
            {SENTIMENT_OPTIONS.map((option) => (
              <SelectItem key={option.value || 'all'} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={sort} onValueChange={(value) => handleSortChange(value as 'newest' | 'oldest' | 'most_likes')}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="newest">Newest First</SelectItem>
            <SelectItem value="oldest">Oldest First</SelectItem>
            <SelectItem value="most_likes">Most Likes</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading comments...</p>
      ) : comments.length === 0 ? (
        <EmptyState
          icon={<MessageSquare className="h-12 w-12" />}
          title="No comments found"
          description="Comments from campaign posts will appear once collected."
        />
      ) : (
        <div className="space-y-2">
          {comments.map((comment) => (
            <div key={comment.id} className="rounded-lg border bg-background">
              <CommentCard comment={comment} />
              <div className="flex flex-wrap items-center gap-2 border-t px-14 py-2 text-xs text-muted-foreground">
                <span>Post</span>
                <PlatformBadge platform={comment.post.platform} size="sm" />
                {comment.post.url ? (
                  <a
                    href={comment.post.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex min-w-0 items-center gap-1 text-primary hover:underline"
                  >
                    <span className="truncate">{comment.post.url}</span>
                    <ExternalLink className="h-3 w-3 shrink-0" />
                  </a>
                ) : (
                  <span className="font-mono">{comment.post.id}</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <PaginationBar page={page} setPage={setPage} totalPages={totalPages} />
    </div>
  )
}
