import { SearchBar } from '@/components/common/SearchBar'
import { PlatformFilter } from '@/components/common/PlatformFilter'
import { DateRangePicker } from '@/components/common/DateRangePicker'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { Platform, DateRange } from '@/types/filters'
import type { Sentiment } from '@/types/insight'

interface CommentFiltersProps {
  search: string
  onSearchChange: (value: string) => void
  platforms: Platform[]
  onPlatformsChange: (platforms: Platform[]) => void
  dateRange: DateRange
  onDateRangeChange: (range: DateRange) => void
  sentiment?: Sentiment | 'all'
  onSentimentChange?: (sentiment: Sentiment | 'all') => void
}

export function CommentFilters({
  search, onSearchChange,
  platforms, onPlatformsChange,
  dateRange, onDateRangeChange,
  sentiment, onSentimentChange,
}: CommentFiltersProps) {
  return (
    <div className="flex flex-wrap gap-3">
      <SearchBar value={search} onChange={onSearchChange} placeholder="Search comments..." className="w-64" />
      <PlatformFilter value={platforms} onChange={onPlatformsChange} />
      <DateRangePicker value={dateRange} onChange={onDateRangeChange} />
      {onSentimentChange && (
        <Select value={sentiment || 'all'} onValueChange={(v) => onSentimentChange(v as Sentiment | 'all')}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="Sentiment" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Sentiment</SelectItem>
            <SelectItem value="positive">Positive</SelectItem>
            <SelectItem value="neutral">Neutral</SelectItem>
            <SelectItem value="negative">Negative</SelectItem>
          </SelectContent>
        </Select>
      )}
    </div>
  )
}
