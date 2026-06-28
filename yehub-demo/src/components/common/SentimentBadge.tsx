import { Badge } from '@/components/ui/badge'
import type { Sentiment } from '@/types/insight'
import { cn } from '@/lib/utils'

interface SentimentBadgeProps {
  sentiment: Sentiment
  className?: string
}

const sentimentStyles: Record<Sentiment, string> = {
  positive: 'bg-green-500/10 text-green-500 border-0',
  neutral: 'bg-gray-500/10 text-gray-500 border-0',
  negative: 'bg-red-500/10 text-red-500 border-0',
}

const sentimentLabels: Record<Sentiment, string> = {
  positive: 'Positive',
  neutral: 'Neutral',
  negative: 'Negative',
}

export function SentimentBadge({ sentiment, className }: SentimentBadgeProps) {
  return (
    <Badge variant="outline" className={cn(sentimentStyles[sentiment], className)}>
      {sentimentLabels[sentiment]}
    </Badge>
  )
}
