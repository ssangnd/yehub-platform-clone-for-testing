import { useObjectivesTab } from '../use-objectives-tab'
import { TagListPanel } from './TagListPanel'

export function CampaignObjectivesTab() {
  const { items, isLoading, isError, createMutation, updateMutation, deleteMutation } = useObjectivesTab()

  return (
    <TagListPanel
      entityLabel="Campaign Objective"
      entityLabelPlural="Campaign Objectives"
      usageNoun="campaign"
      items={items}
      isLoading={isLoading}
      isError={isError}
      onCreate={(name) => createMutation.mutate(name)}
      onDelete={(id) => deleteMutation.mutate(id)}
      onEdit={(id, name) => updateMutation.mutate({ id, name })}
      isCreating={createMutation.isPending}
      isDeleting={deleteMutation.isPending}
      isEditing={updateMutation.isPending}
    />
  )
}
