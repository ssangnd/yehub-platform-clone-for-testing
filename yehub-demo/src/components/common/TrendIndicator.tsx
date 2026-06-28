import { TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatPercentage } from '@/lib/utils/format'

interface TrendIndicatorProps {
  value: number
  className?: string
}

export function TrendIndicator({ value, className }: TrendIndicatorProps) {
  const isPositive = value > 0
  const isNeutral = value === 0

  return (
    <div className={cn(
      'flex items-center gap-1 text-sm font-medium',
      isPositive && 'text-green-500',
      !isPositive && !isNeutral && 'text-red-500',
      isNeutral && 'text-muted-foreground',
      className
    )}>
      {isPositive ? (
        <TrendingUp className="h-4 w-4" />
      ) : isNeutral ? (
        <Minus className="h-4 w-4" />
      ) : (
        <TrendingDown className="h-4 w-4" />
      )}
      <span>{isPositive ? '+' : ''}{formatPercentage(value)}</span>
    </div>
  )
}
