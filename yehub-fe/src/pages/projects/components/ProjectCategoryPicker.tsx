import { useQuery } from '@tanstack/react-query'
import { queryKeys } from '@/lib/constants/query-keys'
import { categoriesApi, type Category } from '@/api/categories'
import { MultiSelectChecklist } from '@/components/common/MultiSelectChecklist'

interface ProjectCategoryPickerProps {
  selected: Category[]
  onChange: (categories: Category[]) => void
}

export function ProjectCategoryPicker({ selected, onChange }: ProjectCategoryPickerProps) {
  const { data: items = [] } = useQuery({
    queryKey: queryKeys.categories,
    queryFn: categoriesApi.list,
  })

  const selectedIds = selected.map((s) => s.id)

  const handleChange = (ids: string[]) => {
    onChange(items.filter((c) => ids.includes(c.id)))
  }

  return (
    <MultiSelectChecklist
      label="Categories"
      items={items}
      selectedIds={selectedIds}
      onChange={handleChange}
      emptyMessage="No project categories defined. Ask an admin to create one in Settings."
    />
  )
}
