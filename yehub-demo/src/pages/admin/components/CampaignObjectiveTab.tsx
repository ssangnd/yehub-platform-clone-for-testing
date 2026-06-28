import { mockCampaignObjectives } from '@/mocks/fixtures/campaignObjectives'
import { CrudListTab } from './CrudListTab'

export function CampaignObjectiveTab() {
  return (
    <CrudListTab
      title="Campaign Objectives"
      description="Manage the list of objectives available when creating campaigns"
      initialItems={mockCampaignObjectives}
      addPlaceholder="New objective name"
      emptyMessage="No objectives yet. Add one above."
    />
  )
}
