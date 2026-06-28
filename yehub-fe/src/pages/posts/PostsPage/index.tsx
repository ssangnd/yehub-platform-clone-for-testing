import { useNavigate } from 'react-router-dom'
import { FileText } from 'lucide-react'
import { PLATFORM_OPTIONS } from '@/lib/constants/platforms'
import { PageHeader } from '@/components/common/PageHeader'
import { SearchBar } from '@/components/common/SearchBar'
import { EmptyState } from '@/components/common/EmptyState'
import { PageWrapper } from '@/components/common/PageWrapper'
import { PaginationBar } from '@/components/common/PaginationBar'
import { PostsTable } from '@/components/common/PostsTable'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { Platform, PostListItem } from '@/api/posts'
import { usePostsList } from './use-posts-list'

export default function PostsPage() {
  const navigate = useNavigate()
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
  } = usePostsList()

  return (
    <PageWrapper>
      <PageHeader title="Posts" description="View posts across all campaigns" />

      <div className="flex items-center gap-3">
        <SearchBar value={search} onChange={handleSearchChange} placeholder="Search posts…" className="max-w-md" />
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
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading posts…</p>
      ) : posts.length === 0 ? (
        <EmptyState
          icon={<FileText className="h-12 w-12" />}
          title="No posts found"
          description={search ? 'Try a different search term.' : 'Posts will appear here once added to campaigns.'}
        />
      ) : (
        <PostsTable
          posts={posts}
          showAccount
          sortableEngagement
          renderCampaign={(post: PostListItem) => (
            <p className="text-sm font-medium truncate max-w-40">{post.campaign_name}</p>
          )}
          sortBy={sortBy}
          sortOrder={sortOrder}
          onSort={toggleSort}
          onRowClick={(p) => navigate(`/projects/${p.project_id}/campaigns/${p.campaign_id}/posts/${p.id}`)}
        />
      )}

      <PaginationBar page={page} setPage={setPage} totalPages={totalPages} />
    </PageWrapper>
  )
}
