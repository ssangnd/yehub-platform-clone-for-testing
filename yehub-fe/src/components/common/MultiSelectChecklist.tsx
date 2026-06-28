import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'

interface MultiSelectChecklistItem {
  id: string
  name: string
}

interface MultiSelectChecklistProps {
  label: string
  items: MultiSelectChecklistItem[]
  selectedIds: string[]
  onChange: (ids: string[]) => void
  emptyMessage?: string
  disabled?: boolean
}

export function MultiSelectChecklist({
  label,
  items,
  selectedIds,
  onChange,
  emptyMessage = 'No items available.',
  disabled = false,
}: MultiSelectChecklistProps) {
  const toggle = (id: string) => {
    if (selectedIds.includes(id)) {
      onChange(selectedIds.filter((sid) => sid !== id))
    } else {
      onChange([...selectedIds, id])
    }
  }

  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {items.length === 0 ? (
        <p className="text-xs text-muted-foreground">{emptyMessage}</p>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {items.map((item) => (
            <label key={item.id} className="flex items-center gap-2 cursor-pointer">
              <Checkbox
                checked={selectedIds.includes(item.id)}
                onCheckedChange={() => toggle(item.id)}
                disabled={disabled}
              />
              <span className="text-sm">{item.name}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  )
}
