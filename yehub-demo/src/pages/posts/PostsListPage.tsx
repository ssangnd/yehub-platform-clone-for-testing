import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { FileText } from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { SearchBar } from '@/components/common/SearchBar'
import { EmptyState } from '@/components/common/EmptyState'
import { PlatformBadge } from '@/components/common/PlatformBadge'
import { DataTable, type Column } from '@/components/common/DataTable'
import { mockPosts } from '@/mocks/fixtures/posts'
import { mockCampaigns } from '@/mocks/fixtures/campaigns'
import { formatNumber } from '@/lib/utils/format'
import type { Post } from '@/types/post'

export default function PostsListPage() {
  const navigate = useNavigate()
  const [search, setSearch] = useState('')

  const filtered = mockPosts.filter(p =>
    p.content.toLowerCase().includes(search.toLowerCase()) ||
    p.authorName.toLowerCase().includes(search.toLowerCase())
  )

  const columns: Column<Post>[] = [
    {
      key: 'platform',
      header: '',
      render: (p) => <PlatformBadge platform={p.platform} size="sm" />,
    },
    {
      key: 'content',
      header: 'Content',
      render: (p) => (
        <div className="max-w-xs">
          <p className="text-sm line-clamp-1">{p.content}</p>
          <p className="text-xs text-muted-foreground mt-1">{p.authorName}</p>
        </div>
      ),
    },
    {
      key: 'campaignId',
      header: 'Campaign',
      render: (p) => {
        const campaign = mockCampaigns.find(c => c.id === p.campaignId)
        return <span className="text-sm">{campaign?.name || '-'}</span>
      },
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
      key: 'shares',
      header: 'Shares',
      sortable: true,
      render: (p) => <span className="font-mono">{formatNumber(p.shares)}</span>,
    },
    {
      key: 'views',
      header: 'Views',
      sortable: true,
      render: (p) => <span className="font-mono">{formatNumber(p.views)}</span>,
    },
    {
      key: 'engagementRate',
      header: 'Engagement',
      sortable: true,
      render: (p) => <span className="font-mono">{p.engagementRate}%</span>,
    },
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        title="Posts"
        description="Browse all monitored posts across campaigns"
      />

      <SearchBar value={search} onChange={setSearch} placeholder="Search posts..." className="max-w-md" />

      {filtered.length === 0 ? (
        <EmptyState
          icon={<FileText className="h-12 w-12" />}
          title="No posts found"
          description="Try a different search term"
        />
      ) : (
        <DataTable
          columns={columns}
          data={filtered}
          keyExtractor={(p) => p.id}
          onRowClick={(p) => {
            const campaign = mockCampaigns.find(c => c.id === p.campaignId)
            if (campaign) {
              navigate(`/projects/${campaign.projectId}/campaigns/${campaign.id}/posts/${p.id}`)
            }
          }}
          emptyMessage="No posts found"
        />
      )}
    </div>
  )
}
