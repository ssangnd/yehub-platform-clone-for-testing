import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { mockMemberships } from '@/mocks/fixtures/memberships'
import { Megaphone } from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { SearchBar } from '@/components/common/SearchBar'
import { EmptyState } from '@/components/common/EmptyState'
import { StatusBadge } from '@/components/common/StatusBadge'
import { PlatformBadge } from '@/components/common/PlatformBadge'
import { DataTable, type Column } from '@/components/common/DataTable'
import { mockCampaigns } from '@/mocks/fixtures/campaigns'
import { mockProjects } from '@/mocks/fixtures/projects'
import { formatNumber, formatDate } from '@/lib/utils/format'
import type { Campaign } from '@/types/campaign'

export default function CampaignsListPage() {
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const { user } = useAuth()

  // Get campaigns the user has access to
  const accessibleCampaigns = mockCampaigns.filter(c => {
    if (!user) return false
    // Admins see all
    if (user.globalRole === 'admin') return true
    // Project member — access to all campaigns in the project
    const hasProjectAccess = mockMemberships.some(
      m => m.scope === 'project' && m.userId === user.id && m.scopeId === c.projectId
    )
    if (hasProjectAccess) return true
    // Direct campaign member
    const hasCampaignAccess = mockMemberships.some(
      m => m.scope === 'campaign' && m.userId === user.id && m.scopeId === c.id
    )
    return hasCampaignAccess
  })

  const filtered = accessibleCampaigns.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase())
  )

  const columns: Column<Campaign>[] = [
    {
      key: 'name',
      header: 'Campaign',
      render: (c) => (
        <div className="max-w-xs">
          <p className="text-sm font-medium">{c.name}</p>
          <p className="text-xs text-muted-foreground line-clamp-1">{c.description}</p>
        </div>
      ),
    },
    {
      key: 'projectId',
      header: 'Project',
      render: (c) => {
        const project = mockProjects.find(p => p.id === c.projectId)
        return <span className="text-sm">{project?.name || '-'}</span>
      },
    },
    {
      key: 'status',
      header: 'Status',
      render: (c) => <StatusBadge status={c.status} />,
    },
    {
      key: 'platforms',
      header: 'Platforms',
      render: (c) => (
        <div className="flex gap-1">
          {c.platforms.map(p => (
            <PlatformBadge key={p} platform={p} size="sm" />
          ))}
        </div>
      ),
    },
    {
      key: 'startDate',
      header: 'Date Range',
      render: (c) => (
        <span className="text-sm whitespace-nowrap">
          {formatDate(c.startDate)} - {formatDate(c.endDate)}
        </span>
      ),
    },
    {
      key: 'postCount',
      header: 'Posts',
      sortable: true,
      render: (c) => <span className="font-mono">{c.postCount}</span>,
    },
    {
      key: 'commentCount',
      header: 'Comments',
      sortable: true,
      render: (c) => <span className="font-mono">{formatNumber(c.commentCount)}</span>,
    },
    {
      key: 'engagementRate',
      header: 'Engagement',
      sortable: true,
      render: (c) => <span className="font-mono">{c.engagementRate}%</span>,
    },
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        title="Campaigns"
        description="Browse all campaigns across projects"
      />

      <SearchBar value={search} onChange={setSearch} placeholder="Search campaigns..." className="max-w-md" />

      {filtered.length === 0 ? (
        <EmptyState
          icon={<Megaphone className="h-12 w-12" />}
          title="No campaigns found"
          description="Try a different search term"
        />
      ) : (
        <DataTable
          columns={columns}
          data={filtered}
          keyExtractor={(c) => c.id}
          onRowClick={(c) => navigate(`/projects/${c.projectId}/campaigns/${c.id}`)}
          emptyMessage="No campaigns found"
        />
      )}
    </div>
  )
}
