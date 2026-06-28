import { useState, useMemo } from 'react'
import { useParams } from 'react-router-dom'
import { CommentFeed } from '@/components/comments/CommentFeed'
import { CommentFilters } from '@/components/comments/CommentFilters'
import { Pagination } from '@/components/common/Pagination'
import { EmptyState } from '@/components/common/EmptyState'
import { mockPosts } from '@/mocks/fixtures/posts'
import { mockComments } from '@/mocks/fixtures/comments'
import type { Platform, DateRange } from '@/types/filters'
import type { Sentiment } from '@/types/insight'

const PAGE_SIZE = 20

export default function CampaignCommentsPage() {
  const { campaignId } = useParams()
  const [search, setSearch] = useState('')
  const [platforms, setPlatforms] = useState<Platform[]>([])
  const [dateRange, setDateRange] = useState<DateRange>({ from: undefined, to: undefined })
  const [sentiment, setSentiment] = useState<Sentiment | 'all'>('all')
  const [page, setPage] = useState(1)

  const campaignPostIds = useMemo(() => {
    const postIds = new Set<string>()
    for (const post of mockPosts) {
      if (post.campaignId === campaignId) {
        postIds.add(post.id)
      }
    }
    return postIds
  }, [campaignId])

  const campaignComments = useMemo(() => {
    return mockComments.filter(c => campaignPostIds.has(c.postId))
  }, [campaignPostIds])

  const filtered = useMemo(() => {
    let result = campaignComments

    if (search) {
      const q = search.toLowerCase()
      result = result.filter(c =>
        c.content.toLowerCase().includes(q)
      )
    }

    if (platforms.length > 0) {
      result = result.filter(c => platforms.includes(c.platform))
    }

    if (dateRange.from) {
      result = result.filter(c => new Date(c.publishedAt) >= dateRange.from!)
    }
    if (dateRange.to) {
      result = result.filter(c => new Date(c.publishedAt) <= dateRange.to!)
    }

    if (sentiment !== 'all') {
      result = result.filter(c => c.sentiment === sentiment)
    }

    return result
  }, [campaignComments, search, platforms, dateRange, sentiment])

  const paginatedComments = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  if (campaignComments.length === 0) {
    return (
      <EmptyState
        title="No comments yet"
        description="Comments will appear here once posts in this campaign receive comments."
      />
    )
  }

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        {filtered.length} comments in this campaign
      </p>

      <CommentFilters
        search={search}
        onSearchChange={(v) => { setSearch(v); setPage(1) }}
        platforms={platforms}
        onPlatformsChange={(v) => { setPlatforms(v); setPage(1) }}
        dateRange={dateRange}
        onDateRangeChange={(v) => { setDateRange(v); setPage(1) }}
        sentiment={sentiment}
        onSentimentChange={(v) => { setSentiment(v); setPage(1) }}
      />

      <CommentFeed comments={paginatedComments} />

      <Pagination
        page={page}
        pageSize={PAGE_SIZE}
        total={filtered.length}
        onPageChange={setPage}
      />
    </div>
  )
}
