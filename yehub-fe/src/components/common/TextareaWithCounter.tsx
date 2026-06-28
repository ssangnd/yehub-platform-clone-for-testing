import * as React from 'react'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'

type TextareaWithCounterProps = React.ComponentProps<'textarea'> & {
  maxLength: number
  counterClassName?: string
}

export function TextareaWithCounter({
  maxLength,
  value,
  defaultValue,
  counterClassName,
  className,
  ...props
}: TextareaWithCounterProps) {
  const stringValue = typeof value === 'string' ? value : typeof defaultValue === 'string' ? defaultValue : ''
  const length = stringValue.length
  const isAtLimit = length >= maxLength

  return (
    <div className="grid gap-1">
      <Textarea maxLength={maxLength} value={value} defaultValue={defaultValue} className={className} {...props} />
      <div
        className={cn(
          'text-muted-foreground self-end text-xs tabular-nums',
          isAtLimit && 'text-destructive',
          counterClassName,
        )}
      >
        {length}/{maxLength}
      </div>
    </div>
  )
}
