import { ChevronUp, ChevronDown, GripVertical } from 'lucide-react'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { ALL_CAMPAIGN_METRICS, CAMPAIGN_METRIC_LABELS } from '@/types/campaign'
import type { CampaignMetric } from '@/types/campaign'

interface MetricSelectorProps {
  selected: CampaignMetric[]
  onChange: (metrics: CampaignMetric[]) => void
}

export function MetricSelector({ selected, onChange }: MetricSelectorProps) {
  const toggle = (metric: CampaignMetric) => {
    if (selected.includes(metric)) {
      onChange(selected.filter(m => m !== metric))
    } else {
      onChange([...selected, metric])
    }
  }

  const moveUp = (index: number) => {
    if (index === 0) return
    const next = [...selected]
    ;[next[index - 1], next[index]] = [next[index], next[index - 1]]
    onChange(next)
  }

  const moveDown = (index: number) => {
    if (index === selected.length - 1) return
    const next = [...selected]
    ;[next[index], next[index + 1]] = [next[index + 1], next[index]]
    onChange(next)
  }

  return (
    <div className="space-y-3">
      <Label>Display Metrics</Label>
      <div className="grid grid-cols-2 gap-x-4 gap-y-2">
        {ALL_CAMPAIGN_METRICS.map(metric => (
          <label key={metric} className="flex items-center gap-2 cursor-pointer">
            <Checkbox
              checked={selected.includes(metric)}
              onCheckedChange={() => toggle(metric)}
            />
            <span className="text-sm">{CAMPAIGN_METRIC_LABELS[metric]}</span>
          </label>
        ))}
      </div>
      {selected.length > 0 && (
        <div className="space-y-1 rounded-lg border p-2">
          <p className="text-xs text-muted-foreground mb-1.5">Display order</p>
          {selected.map((metric, i) => (
            <div
              key={metric}
              className="flex items-center gap-2 rounded-md px-2 py-1.5 bg-muted/50"
            >
              <GripVertical className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <span className="text-sm flex-1">{CAMPAIGN_METRIC_LABELS[metric]}</span>
              <div className="flex gap-0.5">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className={cn('h-6 w-6 cursor-pointer', i === 0 && 'opacity-30 pointer-events-none')}
                  onClick={() => moveUp(i)}
                >
                  <ChevronUp className="h-3.5 w-3.5" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className={cn('h-6 w-6 cursor-pointer', i === selected.length - 1 && 'opacity-30 pointer-events-none')}
                  onClick={() => moveDown(i)}
                >
                  <ChevronDown className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
