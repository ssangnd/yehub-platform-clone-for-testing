import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { SortableHead } from '@/components/common/SortableHead'
import { cn } from '@/lib/utils'

export interface Column<T> {
  key: string
  header: string | React.ReactNode
  render: (item: T) => React.ReactNode
  sortable?: boolean
  className?: string
}

interface DataTableProps<T> {
  columns: Column<T>[]
  data: T[]
  keyExtractor: (item: T) => string
  onRowClick?: (item: T) => void
  emptyMessage?: string
  className?: string
  sortKey?: string
  sortOrder?: 'asc' | 'desc'
  onSort?: (key: string) => void
}

export function DataTable<T>({
  columns,
  data,
  keyExtractor,
  onRowClick,
  emptyMessage = 'No data found',
  className,
  sortKey,
  sortOrder,
  onSort,
}: DataTableProps<T>) {
  return (
    <div className={cn('rounded-lg border', className)}>
      <Table>
        <TableHeader>
          <TableRow>
            {columns.map((col) =>
              col.sortable && onSort ? (
                <SortableHead
                  key={col.key}
                  field={col.key}
                  label={typeof col.header === 'string' ? col.header : ''}
                  currentSort={sortKey}
                  currentOrder={sortOrder}
                  onSort={onSort}
                  className={col.className}
                />
              ) : (
                <TableHead key={col.key} className={col.className}>
                  {col.header}
                </TableHead>
              ),
            )}
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.length === 0 ? (
            <TableRow>
              <TableCell colSpan={columns.length} className="py-8 text-center text-muted-foreground text-sm">
                {emptyMessage}
              </TableCell>
            </TableRow>
          ) : (
            data.map((item) => (
              <TableRow
                key={keyExtractor(item)}
                className={cn(onRowClick && 'cursor-pointer hover:bg-muted/50')}
                onClick={() => onRowClick?.(item)}
              >
                {columns.map((col) => (
                  <TableCell key={col.key} className={col.className}>
                    {col.render(item)}
                  </TableCell>
                ))}
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  )
}
