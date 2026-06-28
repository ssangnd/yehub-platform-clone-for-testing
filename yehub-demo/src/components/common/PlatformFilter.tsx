import { useState } from 'react'
import { Filter } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Checkbox } from '@/components/ui/checkbox'
import { PlatformBadge } from './PlatformBadge'
import { PLATFORMS } from '@/lib/constants/platforms'
import type { Platform } from '@/types/filters'
import { cn } from '@/lib/utils'

interface PlatformFilterProps {
  value: Platform[]
  onChange: (platforms: Platform[]) => void
  className?: string
}

export function PlatformFilter({ value, onChange, className }: PlatformFilterProps) {
  const [open, setOpen] = useState(false)

  const togglePlatform = (platform: Platform) => {
    if (value.includes(platform)) {
      onChange(value.filter(p => p !== platform))
    } else {
      onChange([...value, platform])
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" className={cn('cursor-pointer', className)}>
          <Filter className="mr-2 h-4 w-4" />
          Platforms
          {value.length > 0 && value.length < PLATFORMS.length && (
            <span className="ml-1 rounded-full bg-primary px-1.5 py-0.5 text-xs text-primary-foreground">
              {value.length}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-48 p-2" align="start">
        <div className="space-y-1">
          {PLATFORMS.map(platform => (
            <label
              key={platform}
              className="flex items-center gap-2 rounded-md p-2 hover:bg-accent cursor-pointer transition-colors duration-150"
            >
              <Checkbox
                checked={value.includes(platform)}
                onCheckedChange={() => togglePlatform(platform)}
              />
              <PlatformBadge platform={platform} showLabel size="sm" />
            </label>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}
