import { useState, useMemo } from 'react'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Pagination } from './Pagination'
import { EmptyState } from './EmptyState'
import { cn } from '@/lib/utils'

export interface Column<T> {
  key: string
  header: string
  render: (item: T) => React.ReactNode
  sortable?: boolean
  className?: string
}

interface DataTableProps<T> {
  columns: Column<T>[]
  data: T[]
  keyExtractor: (item: T) => string
  pageSize?: number
  onRowClick?: (item: T) => void
  emptyMessage?: string
  className?: string
}

export function DataTable<T>({
  columns,
  data,
  keyExtractor,
  pageSize = 10,
  onRowClick,
  emptyMessage = 'No data found',
  className,
}: DataTableProps<T>) {
  const [page, setPage] = useState(1)
  const [sortKey, setSortKey] = useState<string | null>(null)
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')

  const sortedData = useMemo(() => {
    if (!sortKey) return data
    return [...data].sort((a, b) => {
      const aVal = (a as Record<string, unknown>)[sortKey]
      const bVal = (b as Record<string, unknown>)[sortKey]
      if (aVal == null || bVal == null) return 0
      const cmp = aVal < bVal ? -1 : aVal > bVal ? 1 : 0
      return sortDir === 'asc' ? cmp : -cmp
    })
  }, [data, sortKey, sortDir])

  const paginatedData = sortedData.slice((page - 1) * pageSize, page * pageSize)

  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortDir(prev => prev === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  if (data.length === 0) {
    return <EmptyState title={emptyMessage} />
  }

  return (
    <div className={cn('space-y-4', className)}>
      <div className="rounded-md border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              {columns.map(col => (
                <TableHead key={col.key} className={col.className}>
                  {col.sortable ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="-ml-3 h-8 cursor-pointer"
                      onClick={() => handleSort(col.key)}
                    >
                      {col.header}
                      {sortKey === col.key ? (
                        sortDir === 'asc' ? <ArrowUp className="ml-1 h-3 w-3" /> : <ArrowDown className="ml-1 h-3 w-3" />
                      ) : (
                        <ArrowUpDown className="ml-1 h-3 w-3 opacity-50" />
                      )}
                    </Button>
                  ) : (
                    col.header
                  )}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {paginatedData.map(item => (
              <TableRow
                key={keyExtractor(item)}
                className={cn(onRowClick && 'cursor-pointer hover:bg-muted/50')}
                onClick={() => onRowClick?.(item)}
              >
                {columns.map(col => (
                  <TableCell key={col.key} className={col.className}>
                    {col.render(item)}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <Pagination
        page={page}
        pageSize={pageSize}
        total={data.length}
        onPageChange={setPage}
      />
    </div>
  )
}
