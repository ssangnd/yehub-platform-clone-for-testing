import type { Platform } from './filters'

export type KpiType = 'engagement' | 'buzz' | 'interaction' | 'view'

export interface KpiTargets {
  engagement: number
  buzz: number
  interaction: number
  view: number
}

export const KPI_LABELS: Record<KpiType, string> = {
  engagement: 'Engagement',
  buzz: 'Buzz',
  interaction: 'Interaction',
  view: 'View',
}

export interface Post {
  id: string
  campaignId: string
  url: string
  platform: Platform
  authorName: string
  authorAvatar: string
  content: string
  publishedAt: string
  likes: number
  comments: number
  shares: number
  views: number
  engagementRate: number
  kpiTargets: KpiTargets
  kpiCurrents: KpiTargets
  mediaType: 'image' | 'video' | 'text' | 'carousel'
  mediaUrl?: string
  mediaUrls?: string[]
  createdAt: string
  updatedAt: string
}
