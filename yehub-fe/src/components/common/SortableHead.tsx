import { ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react'
import { TableHead } from '@/components/ui/table'
import { cn } from '@/lib/utils'

interface SortableHeadProps<T extends string> {
  field: T
  label: string
  currentSort?: T
  currentOrder?: 'asc' | 'desc'
  onSort?: (field: T) => void
  className?: string
}

export function SortableHead<T extends string>({
  field,
  label,
  currentSort,
  currentOrder,
  onSort,
  className,
}: SortableHeadProps<T>) {
  const isActive = currentSort === field
  const icon = isActive ? (
    currentOrder === 'asc' ? (
      <ArrowUp className="h-3.5 w-3.5" />
    ) : (
      <ArrowDown className="h-3.5 w-3.5" />
    )
  ) : (
    <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground" />
  )

  return (
    <TableHead className={cn(onSort && 'cursor-pointer select-none', className)} onClick={() => onSort?.(field)}>
      <span className="inline-flex items-center gap-1">
        {label} {icon}
      </span>
    </TableHead>
  )
}
