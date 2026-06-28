import { useNavigate } from 'react-router-dom'
import { MegaphoneIcon, Plus } from 'lucide-react'
import { SearchBar } from '@/components/common/SearchBar'
import { EmptyState } from '@/components/common/EmptyState'
import { PaginationBar } from '@/components/common/PaginationBar'
import { Button } from '@/components/ui/button'
import { useCan } from '@/hooks/use-can'
import { useAuthStore } from '@/store/auth.store'
import { useCampaignsList } from '@/pages/campaigns/hooks/use-campaigns-list'
import { CampaignsTable } from '@/pages/campaigns/components/CampaignsTable'
import type { ProjectRole } from '@/api/projects'

export function ProjectCampaignsTab({
  projectId,
  myRole,
  isArchived = false,
}: {
  projectId: string
  myRole: ProjectRole | null
  isArchived?: boolean
}) {
  const navigate = useNavigate()
  const isAdmin = useAuthStore((s) => s.user?.role === 'ADMIN')
  const canCreateByRole = useCan('create_campaign', myRole)
  const canEditByRole = useCan('edit_campaign', myRole)
  const canDeleteByRole = useCan('delete_campaign', myRole)
  const canCreate = (isAdmin || canCreateByRole) && !isArchived
  const canEditCampaign = isAdmin || canEditByRole
  const canDeleteCampaign = isAdmin || canDeleteByRole

  const { campaigns, totalPages, isLoading, page, setPage, search, handleSearchChange, sortBy, order, handleSort } =
    useCampaignsList({ projectId })

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <SearchBar value={search} onChange={handleSearchChange} placeholder="Search campaigns…" className="max-w-md" />
        {canCreate && (
          <Button
            size="sm"
            className="ml-auto cursor-pointer"
            onClick={() => navigate(`/projects/${projectId}/campaigns/new`)}
          >
            <Plus className="mr-1 h-3 w-3" /> New Campaign
          </Button>
        )}
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading campaigns…</p>
      ) : campaigns.length === 0 ? (
        <EmptyState
          icon={<MegaphoneIcon className="h-10 w-10" />}
          title="No campaigns yet"
          description="Create your first campaign to start monitoring posts."
          action={
            canCreate ? (
              <Button
                size="sm"
                className="cursor-pointer"
                onClick={() => navigate(`/projects/${projectId}/campaigns/new`)}
              >
                <Plus className="mr-1 h-3 w-3" /> New Campaign
              </Button>
            ) : undefined
          }
        />
      ) : (
        <CampaignsTable
          campaigns={campaigns}
          projectId={projectId}
          sortBy={sortBy}
          order={order}
          onSort={handleSort}
          canEditCampaign={canEditCampaign}
          canDeleteCampaign={canDeleteCampaign}
          canCreateCampaign={canCreate}
        />
      )}

      <PaginationBar page={page} setPage={setPage} totalPages={totalPages} />
    </div>
  )
}
