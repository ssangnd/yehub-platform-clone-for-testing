import { mockProjectCategories } from '@/mocks/fixtures/projectCategories'
import { CrudListTab } from './CrudListTab'

export function ProjectCategoryTab() {
  return (
    <CrudListTab
      title="Project Categories"
      description="Manage the list of categories available when creating projects"
      initialItems={mockProjectCategories}
      addPlaceholder="New category name"
      emptyMessage="No categories yet. Add one above."
    />
  )
}
