import { format, parseISO } from 'date-fns'
import { CalendarIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'

interface DatePickerProps {
  value?: string
  onChange: (value: string) => void
  placeholder?: string
}

export function DatePicker({ value, onChange, placeholder = 'Pick a date' }: DatePickerProps) {
  const date = value ? parseISO(value) : undefined

  return (
    <Popover>
      <PopoverTrigger>
        <Button
          variant="outline"
          className={cn('w-full justify-start text-left font-normal cursor-pointer', !value && 'text-muted-foreground')}
        >
          <CalendarIcon className="mr-2 h-4 w-4" />
          {date ? format(date, 'PPP') : <span>{placeholder}</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={date}
          onSelect={(d) => onChange(d ? format(d, 'yyyy-MM-dd') : '')}
          initialFocus
        />
      </PopoverContent>
    </Popover>
  )
}
