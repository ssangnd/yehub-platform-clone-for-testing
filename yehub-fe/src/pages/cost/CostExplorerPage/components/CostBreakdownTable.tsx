import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { formatUsd } from '@/lib/format'

interface Row {
  key: string
  primary: string
  secondary?: string
  runCount: number
  totalUsd: number
}

function Muted({ value }: { value: string }) {
  return value === 'UNATTRIBUTED' ? <span className="text-muted-foreground">Unattributed</span> : <>{value}</>
}

export function CostBreakdownTable({
  title,
  primaryHeader,
  secondaryHeader,
  rows,
}: {
  title: string
  primaryHeader: string
  secondaryHeader?: string
  rows: Row[]
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">No data yet</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{primaryHeader}</TableHead>
                {secondaryHeader && <TableHead>{secondaryHeader}</TableHead>}
                <TableHead className="text-right">Runs</TableHead>
                <TableHead className="text-right">Cost</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.key}>
                  <TableCell className="max-w-[220px] truncate">
                    <Muted value={r.primary} />
                  </TableCell>
                  {secondaryHeader && (
                    <TableCell className="max-w-[180px] truncate text-muted-foreground">
                      <Muted value={r.secondary ?? ''} />
                    </TableCell>
                  )}
                  <TableCell className="text-right text-muted-foreground">{r.runCount}</TableCell>
                  <TableCell className="text-right">{formatUsd(r.totalUsd)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  )
}
