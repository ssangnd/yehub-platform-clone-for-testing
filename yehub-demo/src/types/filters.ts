export type Platform = 'facebook' | 'instagram' | 'tiktok' | 'youtube' | 'threads'

export interface DateRange {
  from: Date | undefined
  to: Date | undefined
}

export interface FilterState {
  platforms: Platform[]
  dateRange: DateRange
  search: string
  campaignId?: string
  postId?: string
  sentiment?: 'positive' | 'neutral' | 'negative'
  status?: string
}
