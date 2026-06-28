import { Label } from '@/components/ui/label'
import { COLOR_PRESETS, type ColorKey } from '@/lib/constants/colors'
import { cn } from '@/lib/utils'

interface ColorSwatchPickerProps {
  value: ColorKey
  onChange: (color: ColorKey) => void
}

export function ColorSwatchPicker({ value, onChange }: ColorSwatchPickerProps) {
  return (
    <div className="space-y-2">
      <Label>Color</Label>
      <div className="flex flex-wrap gap-2">
        {(Object.entries(COLOR_PRESETS) as [ColorKey, (typeof COLOR_PRESETS)[ColorKey]][]).map(([key, preset]) => (
          <button
            key={key}
            type="button"
            onClick={() => onChange(key)}
            className={cn(
              'h-6 w-6 rounded-full cursor-pointer transition-all',
              preset.swatch,
              value === key ? 'ring-2 ring-offset-2 ring-current' : 'hover:scale-110',
            )}
            aria-label={preset.label}
          />
        ))}
      </div>
    </div>
  )
}
