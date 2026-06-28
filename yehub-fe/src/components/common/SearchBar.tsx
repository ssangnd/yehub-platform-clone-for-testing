import { useState, useEffect } from 'react'
import { Search, X } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface SearchBarProps {
  value?: string
  onChange: (value: string) => void
  placeholder?: string
  /** Only applies in uncontrolled mode (when `value` is not provided). In controlled mode the parent is responsible for debouncing. */
  debounceMs?: number
  className?: string
}

export function SearchBar({
  value: externalValue,
  onChange,
  placeholder = 'Search...',
  debounceMs = 300,
  className,
}: SearchBarProps) {
  const isControlled = externalValue !== undefined
  // Uncontrolled internal state; ignored when controlled
  const [uncontrolled, setUncontrolled] = useState('')

  const displayValue = isControlled ? externalValue : uncontrolled

  useEffect(() => {
    if (isControlled) return
    const t = setTimeout(() => onChange(uncontrolled), debounceMs)
    return () => clearTimeout(t)
  }, [uncontrolled, debounceMs, onChange, isControlled])

  function handleChange(next: string) {
    if (isControlled) {
      onChange(next)
    } else {
      setUncontrolled(next)
    }
  }

  function handleClear() {
    if (!isControlled) setUncontrolled('')
    onChange('')
  }

  return (
    <div className={cn('relative', className)}>
      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        value={displayValue}
        onChange={(e) => handleChange(e.target.value)}
        placeholder={placeholder}
        className="pl-9 pr-8"
      />
      {displayValue && (
        <Button
          variant="ghost"
          size="icon"
          className="absolute right-1 top-1/2 -translate-y-1/2 h-6 w-6 cursor-pointer"
          onClick={handleClear}
          aria-label="Clear search"
        >
          <X className="h-3 w-3" />
        </Button>
      )}
    </div>
  )
}
