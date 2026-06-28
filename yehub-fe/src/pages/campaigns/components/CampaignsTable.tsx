import { useNavigate } from 'react-router-dom'
import { PlatformBadge } from '@/components/common/PlatformBadge'
import { DataTable, type Column } from '@/components/common/DataTable'
import { StatusBadge } from './StatusBadge'
import { CampaignActionsCell } from './CampaignActionsCell'
import { formatDateRange, formatNumber } from '@/lib/format'
import type { Campaign, CampaignSortField, SortOrder } from '@/api/campaigns'

interface CampaignsTableProps {
  campaigns: Campaign[]
  projectId?: string
  sortBy?: CampaignSortField
  order?: SortOrder
  onSort?: (field: CampaignSortField) => void
  canEditCampaign?: boolean
  canDeleteCampaign?: boolean
  canCreateCampaign?: boolean
}

export function CampaignsTable({
  campaigns,
  projectId,
  sortBy,
  order,
  onSort,
  canEditCampaign = false,
  canDeleteCampaign = false,
  canCreateCampaign = false,
}: CampaignsTableProps) {
  const navigate = useNavigate()
  const showActions = !!projectId

  const columns: Column<Campaign>[] = [
    {
      key: 'name',
      header: 'Campaign',
      sortable: true,
      render: (c) => (
        <div>
          <div className="font-medium">{c.name}</div>
          {c.description && <div className="text-xs text-muted-foreground truncate max-w-[300px]">{c.description}</div>}
        </div>
      ),
    },
    ...(!projectId
      ? [
          {
            key: 'project',
            header: 'Project',
            render: (c: Campaign) => <span className="text-sm">{c.project_name || '-'}</span>,
          },
        ]
      : []),
    {
      key: 'status',
      header: 'Status',
      render: (c) => <StatusBadge status={c.status} />,
    },
    {
      key: 'platforms',
      header: 'Platforms',
      render: (c) => (
        <div className="flex items-center gap-1.5">
          {c.platforms?.map((p) => (
            <PlatformBadge key={p} platform={p} size="sm" />
          ))}
        </div>
      ),
    },
    {
      key: 'date_range',
      header: 'Date Range',
      render: (c) => (
        <span className="text-sm text-muted-foreground whitespace-nowrap">
          {formatDateRange(c.start_date, c.end_date)}
        </span>
      ),
    },
    {
      key: 'post_count',
      header: 'Posts',
      sortable: true,
      className: 'text-right',
      render: (c) => <span className="font-mono">{c.post_count}</span>,
    },
    {
      key: 'comment_count',
      header: 'Comments',
      className: 'text-right',
      render: (c) => <span className="font-mono">{formatNumber(c.comment_count)}</span>,
    },
    {
      key: 'engagement',
      header: 'Engagement',
      className: 'text-right',
      render: (c) => (
        <span className="font-mono">{c.engagement_rate != null ? `${c.engagement_rate.toFixed(1)}%` : '0%'}</span>
      ),
    },
    ...(showActions
      ? [
          {
            key: 'actions',
            header: '',
            className: 'w-[50px]',
            render: (c: Campaign) => (
              <CampaignActionsCell
                campaign={c}
                projectId={projectId!}
                canEdit={canEditCampaign}
                canDelete={canDeleteCampaign}
                canCreate={canCreateCampaign}
              />
            ),
          },
        ]
      : []),
  ]

  return (
    <DataTable
      columns={columns}
      data={campaigns}
      keyExtractor={(c) => c.id}
      onRowClick={(c) => {
        const basePath = projectId
          ? `/projects/${projectId}/campaigns/${c.id}`
          : `/projects/${c.project_id}/campaigns/${c.id}`
        navigate(basePath)
      }}
      sortKey={sortBy}
      sortOrder={order}
      onSort={onSort as (key: string) => void}
    />
  )
}
