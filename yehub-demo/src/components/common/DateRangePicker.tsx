import { useState } from 'react'
import { format } from 'date-fns'
import { CalendarDays } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import type { DateRange } from '@/types/filters'

interface DateRangePickerProps {
  value: DateRange
  onChange: (range: DateRange) => void
  className?: string
}

export function DateRangePicker({ value, onChange, className }: DateRangePickerProps) {
  const [open, setOpen] = useState(false)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            'justify-start text-left font-normal cursor-pointer',
            !value.from && 'text-muted-foreground',
            className
          )}
        >
          <CalendarDays className="mr-2 h-4 w-4" />
          {value.from ? (
            value.to ? (
              <>
                {format(value.from, 'MMM d, yyyy')} - {format(value.to, 'MMM d, yyyy')}
              </>
            ) : (
              format(value.from, 'MMM d, yyyy')
            )
          ) : (
            'Select date range'
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="range"
          selected={{ from: value.from, to: value.to }}
          onSelect={(range) => {
            onChange({ from: range?.from, to: range?.to })
            if (range?.from && range?.to) setOpen(false)
          }}
          numberOfMonths={2}
        />
      </PopoverContent>
    </Popover>
  )
}
