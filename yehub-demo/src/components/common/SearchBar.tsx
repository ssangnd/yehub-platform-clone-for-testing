import { useState, useEffect } from 'react'
import { Search, X } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface SearchBarProps {
  value?: string
  onChange: (value: string) => void
  placeholder?: string
  debounceMs?: number
  className?: string
}

export function SearchBar({ value: externalValue, onChange, placeholder = 'Search...', debounceMs = 300, className }: SearchBarProps) {
  const [internalValue, setInternalValue] = useState(externalValue || '')

  useEffect(() => {
    if (externalValue !== undefined) {
      setInternalValue(externalValue)
    }
  }, [externalValue])

  useEffect(() => {
    const timer = setTimeout(() => {
      onChange(internalValue)
    }, debounceMs)
    return () => clearTimeout(timer)
  }, [internalValue, debounceMs, onChange])

  return (
    <div className={cn('relative', className)}>
      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        value={internalValue}
        onChange={(e) => setInternalValue(e.target.value)}
        placeholder={placeholder}
        className="pl-9 pr-8"
      />
      {internalValue && (
        <Button
          variant="ghost"
          size="icon"
          className="absolute right-1 top-1/2 -translate-y-1/2 h-6 w-6 cursor-pointer"
          onClick={() => { setInternalValue(''); onChange('') }}
          aria-label="Clear search"
        >
          <X className="h-3 w-3" />
        </Button>
      )}
    </div>
  )
}
