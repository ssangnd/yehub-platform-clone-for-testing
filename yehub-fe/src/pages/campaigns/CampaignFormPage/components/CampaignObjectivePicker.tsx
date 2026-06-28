import { useQuery } from '@tanstack/react-query'
import { queryKeys } from '@/lib/constants/query-keys'
import { objectivesApi, type Objective } from '@/api/objectives'
import { MultiSelectChecklist } from '@/components/common/MultiSelectChecklist'

interface CampaignObjectivePickerProps {
  selected: { id: string; name: string }[]
  onChange: (objectives: Objective[]) => void
}

export function CampaignObjectivePicker({ selected, onChange }: CampaignObjectivePickerProps) {
  const { data: items = [] } = useQuery({
    queryKey: queryKeys.objectives,
    queryFn: objectivesApi.list,
  })

  const selectedIds = selected.map((s) => s.id)

  const handleChange = (ids: string[]) => {
    onChange(items.filter((o) => ids.includes(o.id)))
  }

  return (
    <MultiSelectChecklist
      label="Objectives"
      items={items}
      selectedIds={selectedIds}
      onChange={handleChange}
      emptyMessage="No objectives defined. Ask an admin to create one in Settings."
    />
  )
}
