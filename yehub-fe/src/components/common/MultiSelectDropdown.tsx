import { Check, ChevronsUpDown } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { cn } from '@/lib/utils'

interface MultiSelectDropdownItem {
  id: string
  name: string
}

interface MultiSelectDropdownProps {
  label: string
  items: MultiSelectDropdownItem[]
  selectedIds: string[]
  onChange: (ids: string[]) => void
  placeholder?: string
  searchPlaceholder?: string
  emptyMessage?: string
  disabled?: boolean
}

export function MultiSelectDropdown({
  label,
  items,
  selectedIds,
  onChange,
  placeholder = 'All',
  searchPlaceholder = 'Search…',
  emptyMessage = 'No items available.',
  disabled = false,
}: MultiSelectDropdownProps) {
  const toggle = (id: string) => {
    if (selectedIds.includes(id)) {
      onChange(selectedIds.filter((sid) => sid !== id))
    } else {
      onChange([...selectedIds, id])
    }
  }

  // Summarize the current selection on the trigger: nothing → placeholder,
  // one → its name, many → a count.
  const triggerLabel =
    selectedIds.length === 0
      ? placeholder
      : selectedIds.length === 1
        ? (items.find((i) => i.id === selectedIds[0])?.name ?? '1 selected')
        : `${selectedIds.length} selected`

  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Popover>
        <PopoverTrigger
          disabled={disabled}
          className={cn(
            buttonVariants({ variant: 'outline' }),
            'w-full justify-between font-normal',
            selectedIds.length === 0 && 'text-muted-foreground',
          )}
        >
          <span className="truncate">{triggerLabel}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </PopoverTrigger>
        <PopoverContent className="w-(--anchor-width) min-w-48 p-0" align="start">
          <Command>
            <CommandInput placeholder={searchPlaceholder} />
            <CommandList>
              <CommandEmpty>{emptyMessage}</CommandEmpty>
              <CommandGroup>
                {items.map((item) => {
                  const isSelected = selectedIds.includes(item.id)
                  return (
                    <CommandItem
                      key={item.id}
                      value={item.name}
                      onSelect={() => toggle(item.id)}
                      className="cursor-pointer"
                    >
                      <div
                        className={cn(
                          'mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-primary',
                          isSelected ? 'bg-primary text-primary-foreground' : 'opacity-50 [&_svg]:invisible',
                        )}
                      >
                        <Check className="h-3 w-3" />
                      </div>
                      <span className="truncate">{item.name}</span>
                    </CommandItem>
                  )
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  )
}
