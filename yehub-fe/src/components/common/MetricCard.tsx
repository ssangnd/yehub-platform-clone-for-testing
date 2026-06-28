import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import type { ReactNode } from 'react'

interface MetricCardProps {
  label: string
  value: number | string
  icon?: ReactNode
  className?: string
}

export function MetricCard({ label, value, icon, className }: MetricCardProps) {
  return (
    <Card className={cn('transition-shadow hover:shadow-md cursor-default', className)}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <p className="text-sm font-medium text-muted-foreground">{label}</p>
            <p className="text-2xl font-bold font-mono">{value}</p>
          </div>
          {icon && <div className="text-muted-foreground">{icon}</div>}
        </div>
      </CardContent>
    </Card>
  )
}
