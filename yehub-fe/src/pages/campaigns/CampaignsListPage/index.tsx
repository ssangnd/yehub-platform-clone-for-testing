import { MegaphoneIcon } from 'lucide-react'
import { PageHeader } from '@/components/common/PageHeader'
import { SearchBar } from '@/components/common/SearchBar'
import { EmptyState } from '@/components/common/EmptyState'
import { PageWrapper } from '@/components/common/PageWrapper'
import { PaginationBar } from '@/components/common/PaginationBar'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useCampaignsList } from '../hooks/use-campaigns-list'
import { CampaignsTable } from '../components/CampaignsTable'

export function CampaignsListPage() {
  const {
    campaigns,
    totalPages,
    isLoading,
    page,
    setPage,
    search,
    handleSearchChange,
    statusFilter,
    handleStatusChange,
    sortBy,
    order,
    handleSort,
  } = useCampaignsList()

  return (
    <PageWrapper>
      <PageHeader title="Campaigns" description="Browse all campaigns across projects" />

      <div className="flex items-center gap-3">
        <SearchBar value={search} onChange={handleSearchChange} placeholder="Search campaigns…" className="max-w-md" />
        <Select value={statusFilter} onValueChange={handleStatusChange}>
          <SelectTrigger className="w-35">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">All statuses</SelectItem>
            <SelectItem value="DRAFT">Draft</SelectItem>
            <SelectItem value="ACTIVE">Active</SelectItem>
            <SelectItem value="PAUSED">Paused</SelectItem>
            <SelectItem value="COMPLETED">Completed</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading campaigns…</p>
      ) : campaigns.length === 0 ? (
        <EmptyState
          icon={<MegaphoneIcon className="h-12 w-12" />}
          title="No campaigns found"
          description={
            search ? 'Try a different search term.' : 'Campaigns will appear here once created within projects.'
          }
        />
      ) : (
        <CampaignsTable campaigns={campaigns} sortBy={sortBy} order={order} onSort={handleSort} />
      )}

      <PaginationBar page={page} setPage={setPage} totalPages={totalPages} />
    </PageWrapper>
  )
}
