import type { Control, FieldPath, FieldValues } from 'react-hook-form'
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

// Manual (0) means polls are triggered manually — there is no recurring interval.
const MANUAL_VALUE = '0'

const POLLING_OPTIONS = [
  { value: '900', label: 'Every 15 minutes' },
  { value: '1800', label: 'Every 30 minutes' },
  { value: '3600', label: 'Every hour' },
  { value: '21600', label: 'Every 6 hours' },
  { value: '43200', label: 'Every 12 hours' },
  { value: '86400', label: 'Every 24 hours' },
  { value: '604800', label: 'Every 7 days' },
  { value: MANUAL_VALUE, label: 'Manual' },
]

type PollingIntervalFieldProps<T extends FieldValues> = {
  control: Control<T>
  name: FieldPath<T>
  label: string
}

export function PollingIntervalField<T extends FieldValues>({ control, name, label }: PollingIntervalFieldProps<T>) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => {
        const raw = field.value as number | undefined
        const selectValue = raw !== undefined && Number.isFinite(raw) ? String(raw) : ''

        return (
          <FormItem>
            <FormLabel>{label}</FormLabel>
            <Select
              value={selectValue}
              onValueChange={(v) => {
                if (!v) return
                field.onChange(Number(v))
              }}
            >
              <FormControl>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select interval">
                    {POLLING_OPTIONS.find((opt) => opt.value === selectValue)?.label}
                  </SelectValue>
                </SelectTrigger>
              </FormControl>
              <SelectContent>
                {POLLING_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FormMessage />
          </FormItem>
        )
      }}
    />
  )
}
