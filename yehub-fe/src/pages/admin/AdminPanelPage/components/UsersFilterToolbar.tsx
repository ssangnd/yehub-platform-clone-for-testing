import { useEffect, useState } from 'react'
import { Check, Search, X } from 'lucide-react'
import { Button, buttonVariants } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Command, CommandGroup, CommandItem, CommandList } from '@/components/ui/command'
import type { UserStatus } from '@/api/admin'
import type { GlobalRole } from '@/api/auth'
import { GLOBAL_ROLE_CONFIG } from '@/lib/constants/roles'
import { USER_STATUS_CONFIG } from '@/lib/constants/statuses'
import { cn } from '@/lib/utils'

const ROLES: readonly GlobalRole[] = ['ADMIN', 'INTERNAL_USER', 'AUTHORIZED_USER']
const STATUSES: readonly UserStatus[] = ['INVITED', 'ACTIVE', 'INACTIVE']

export interface UsersFilterToolbarProps {
  q: string
  roles: GlobalRole[]
  statuses: UserStatus[]
  total: number
  page: number
  pageSize: number
  hasActiveFilters: boolean
  onQChange: (value: string) => void
  onToggleRole: (role: GlobalRole) => void
  onToggleStatus: (status: UserStatus) => void
  onClearFilters: () => void
}

function MultiSelectFilter<T extends string>({
  label,
  options,
  selected,
  onToggle,
  getLabel,
}: {
  label: string
  options: readonly T[]
  selected: T[]
  onToggle: (value: T) => void
  getLabel: (value: T) => string
}) {
  const triggerLabel =
    selected.length === 0
      ? label
      : selected.length === 1
        ? `${label}: ${getLabel(selected[0])}`
        : `${label}: ${selected.length}`

  return (
    <Popover>
      <PopoverTrigger className={cn(buttonVariants({ variant: 'outline' }), 'h-8 px-3 text-sm')}>
        {triggerLabel}
      </PopoverTrigger>
      <PopoverContent className="w-56 p-0" align="start">
        <Command>
          <CommandList>
            <CommandGroup>
              {options.map((option) => {
                const isSelected = selected.includes(option)
                return (
                  <CommandItem key={option} onSelect={() => onToggle(option)} className="cursor-pointer">
                    <div
                      className={cn(
                        'mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-primary',
                        isSelected ? 'bg-primary text-primary-foreground' : 'opacity-50 [&_svg]:invisible',
                      )}
                    >
                      <Check className="h-3 w-3" />
                    </div>
                    {getLabel(option)}
                  </CommandItem>
                )
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

export function UsersFilterToolbar({
  q,
  roles,
  statuses,
  total,
  page,
  pageSize,
  hasActiveFilters,
  onQChange,
  onToggleRole,
  onToggleStatus,
  onClearFilters,
}: UsersFilterToolbarProps) {
  const [localQ, setLocalQ] = useState(q)

  // Keep local input in sync when the URL changes externally (clear filters, back/forward)
  useEffect(() => {
    setLocalQ(q)
  }, [q])

  const handleChange = (value: string) => {
    setLocalQ(value)
    onQChange(value)
  }

  const rangeStart = total === 0 ? 0 : (page - 1) * pageSize + 1
  const rangeEnd = Math.min(page * pageSize, total)

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative min-w-[220px] flex-1 md:max-w-xs">
        <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          aria-label="Search users"
          placeholder="Search by name or email"
          value={localQ}
          onChange={(e) => handleChange(e.target.value)}
          className="pl-8"
        />
        {localQ && (
          <button
            type="button"
            aria-label="Clear search"
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            onClick={() => handleChange('')}
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      <MultiSelectFilter
        label="Role"
        options={ROLES}
        selected={roles}
        onToggle={onToggleRole}
        getLabel={(r) => GLOBAL_ROLE_CONFIG[r].label}
      />

      <MultiSelectFilter
        label="Status"
        options={STATUSES}
        selected={statuses}
        onToggle={onToggleStatus}
        getLabel={(s) => USER_STATUS_CONFIG[s].label}
      />

      {hasActiveFilters && (
        <Button variant="ghost" className="h-8 px-3 text-sm" onClick={onClearFilters}>
          Clear
        </Button>
      )}

      <div role="status" aria-live="polite" className="ml-auto text-sm text-muted-foreground">
        Showing {rangeStart}–{rangeEnd} of {total}
      </div>
    </div>
  )
}
