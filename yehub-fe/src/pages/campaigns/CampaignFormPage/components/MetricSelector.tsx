import { X } from 'lucide-react'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { ALL_CAMPAIGN_METRICS, CAMPAIGN_METRIC_LABELS } from '@/lib/constants/campaign-metrics'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import { SortableContext, useSortable, rectSortingStrategy, arrayMove } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

interface MetricSelectorProps {
  selected: string[]
  onChange: (metrics: string[]) => void
}

function SortableBadge({ metric, onRemove }: { metric: string; onRemove: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: metric })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={cn(
        'inline-flex items-center gap-1 rounded-full bg-primary/10 px-3 py-1 text-sm font-medium',
        'cursor-grab active:cursor-grabbing select-none',
        isDragging && 'opacity-50 shadow-md z-10',
      )}
    >
      <span>{CAMPAIGN_METRIC_LABELS[metric as keyof typeof CAMPAIGN_METRIC_LABELS] ?? metric}</span>
      <button
        type="button"
        className="ml-0.5 rounded-full p-0.5 hover:bg-primary/20 cursor-pointer"
        onClick={(e) => {
          e.stopPropagation()
          onRemove()
        }}
        onPointerDown={(e) => e.stopPropagation()}
        aria-label={`Remove ${CAMPAIGN_METRIC_LABELS[metric as keyof typeof CAMPAIGN_METRIC_LABELS] ?? metric}`}
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  )
}

export function MetricSelector({ selected, onChange }: MetricSelectorProps) {
  const sensors = useSensors(useSensor(PointerSensor), useSensor(KeyboardSensor))

  const toggle = (metric: string) => {
    if (selected.includes(metric)) {
      onChange(selected.filter((m) => m !== metric))
    } else {
      onChange([...selected, metric])
    }
  }

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (over && active.id !== over.id) {
      const oldIndex = selected.indexOf(active.id as string)
      const newIndex = selected.indexOf(over.id as string)
      onChange(arrayMove(selected, oldIndex, newIndex))
    }
  }

  return (
    <div className="space-y-3">
      <Label>Display Metrics</Label>
      <div className="grid grid-cols-2 gap-x-4 gap-y-2">
        {ALL_CAMPAIGN_METRICS.map((metric) => (
          <label key={metric} className="flex items-center gap-2 cursor-pointer">
            <Checkbox checked={selected.includes(metric)} onCheckedChange={() => toggle(metric)} />
            <span className="text-sm">{CAMPAIGN_METRIC_LABELS[metric]}</span>
          </label>
        ))}
      </div>
      {selected.length > 0 && (
        <div className="rounded-lg border p-3">
          <p className="text-xs text-muted-foreground mb-2">Display order (drag to reorder)</p>
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={selected} strategy={rectSortingStrategy}>
              <div className="flex flex-wrap gap-2">
                {selected.map((metric) => (
                  <SortableBadge key={metric} metric={metric} onRemove={() => toggle(metric)} />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        </div>
      )}
    </div>
  )
}
