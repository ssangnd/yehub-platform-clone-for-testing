import { useCategoriesTab } from '../use-categories-tab'
import { TagListPanel } from './TagListPanel'

export function ProjectCategoriesTab() {
  const { items, isLoading, isError, createMutation, updateMutation, deleteMutation } = useCategoriesTab()

  return (
    <TagListPanel
      entityLabel="Project Category"
      entityLabelPlural="Project Categories"
      usageNoun="project"
      items={items}
      isLoading={isLoading}
      isError={isError}
      onCreate={(name) => createMutation.mutate(name)}
      onEdit={(id, name) => updateMutation.mutate({ id, name })}
      onDelete={(id) => deleteMutation.mutate(id)}
      isCreating={createMutation.isPending}
      isEditing={updateMutation.isPending}
      isDeleting={deleteMutation.isPending}
    />
  )
}
