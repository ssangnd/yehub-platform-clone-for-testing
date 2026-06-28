import { PlatformBadge } from '@/components/common/PlatformBadge'
import { DataTable, type Column } from '@/components/common/DataTable'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { formatNumber, formatDisplayUrl } from '@/lib/format'
import type { MetricsSnapshot, Platform, PostListLinkedAccount } from '@/api/posts'

interface PostBase {
  id: string
  url: string | null
  platform: Platform
  platform_post_id: string
  likes: number
  comment_count: number
  shares: number
  views: number
  engagement?: number | null
  metrics_snapshot: MetricsSnapshot | null
  linked_account?: PostListLinkedAccount | null
}

interface PostsTableProps<T extends PostBase> {
  posts: T[]
  renderCampaign?: (post: T) => React.ReactNode
  renderTrailing?: (post: T) => React.ReactNode
  trailingHeader?: string
  renderActions?: (post: T) => React.ReactNode
  hideShares?: boolean
  hideViews?: boolean
  showAccount?: boolean
  sortableEngagement?: boolean
  sortBy?: string
  sortOrder?: 'asc' | 'desc'
  onSort?: (key: string) => void
  onRowClick?: (post: T) => void
}

function getColumns<T extends PostBase>({
  renderCampaign,
  renderTrailing,
  trailingHeader,
  renderActions,
  hideShares,
  hideViews,
  showAccount,
  sortableEngagement,
}: Pick<
  PostsTableProps<T>,
  | 'renderCampaign'
  | 'renderTrailing'
  | 'trailingHeader'
  | 'renderActions'
  | 'hideShares'
  | 'hideViews'
  | 'showAccount'
  | 'sortableEngagement'
>): Column<T>[] {
  const columns: Column<T>[] = []

  if (renderCampaign) {
    columns.push({
      key: 'campaign',
      header: 'Campaign',
      render: renderCampaign,
    })
  }

  if (showAccount) {
    columns.push({
      key: 'account',
      header: 'Account',
      render: (post) => (
        <div className="flex items-center gap-1.5">
          <PlatformBadge platform={post.platform} size="sm" />
          {post.linked_account && (
            <span className="text-sm truncate">
              {post.linked_account.displayName
                ? post.linked_account.displayName
                : post.linked_account.username
                  ? `@${post.linked_account.username}`
                  : 'account'}
            </span>
          )}
        </div>
      ),
    })
  }

  columns.push({
    key: 'url',
    header: 'URL',
    className: 'max-w-[300px]',
    render: (post) =>
      post.url ? (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger
              render={<span className="block max-w-[300px] truncate text-sm font-mono text-muted-foreground" />}
            >
              {formatDisplayUrl(post.url)}
            </TooltipTrigger>
            <TooltipContent className="max-w-sm break-all">{post.url}</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      ) : (
        <span className="block max-w-[300px] truncate text-sm font-mono">{post.platform_post_id}</span>
      ),
  })

  columns.push(
    {
      key: 'likes',
      header: 'Likes',
      sortable: true,
      render: (post) => <span className="font-mono text-sm">{formatNumber(post.likes)}</span>,
    },
    {
      key: 'comment_count',
      header: 'Comments',
      sortable: true,
      render: (post) => <span className="font-mono text-sm">{formatNumber(post.comment_count)}</span>,
    },
  )

  if (!hideShares) {
    columns.push({
      key: 'shares',
      header: 'Shares',
      sortable: true,
      render: (post) => <span className="font-mono text-sm">{formatNumber(post.shares)}</span>,
    })
  }

  if (!hideViews) {
    columns.push({
      key: 'views',
      header: 'Views',
      sortable: true,
      render: (post) => <span className="font-mono text-sm">{formatNumber(post.views)}</span>,
    })
  }

  columns.push({
    key: 'engagement',
    header: 'Engagement',
    sortable: sortableEngagement,
    render: (post) => (
      <span className="font-mono text-sm">
        {formatNumber(post.engagement ?? post.likes + post.shares + post.comment_count)}
      </span>
    ),
  })

  if (renderTrailing) {
    columns.push({
      key: 'trailing',
      header: trailingHeader ?? '',
      render: renderTrailing,
    })
  }

  if (renderActions) {
    columns.push({
      key: 'actions',
      header: '',
      className: 'w-[50px]',
      render: renderActions,
    })
  }

  return columns
}

export function PostsTable<T extends PostBase>({
  posts,
  renderCampaign,
  renderTrailing,
  trailingHeader,
  renderActions,
  hideShares,
  hideViews,
  showAccount,
  sortableEngagement,
  sortBy,
  sortOrder,
  onSort,
  onRowClick,
}: PostsTableProps<T>) {
  const columns = getColumns<T>({
    renderCampaign,
    renderTrailing,
    trailingHeader,
    renderActions,
    hideShares,
    hideViews,
    showAccount,
    sortableEngagement,
  })

  return (
    <DataTable
      columns={columns}
      data={posts}
      keyExtractor={(p) => p.id}
      sortKey={sortBy}
      sortOrder={sortOrder}
      onSort={onSort}
      onRowClick={onRowClick}
    />
  )
}
