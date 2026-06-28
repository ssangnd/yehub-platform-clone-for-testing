import type { Platform } from './filters'

export type CampaignStatus = 'draft' | 'active' | 'paused' | 'completed' | 'stopped'

export type PollingInterval = '15min' | '1hr' | '6hr' | '12hr' | '24hr'

export type CampaignMetric = 'posts' | 'comments' | 'buzz' | 'interactions' | 'view' | 'engagement' | 'p2pCommentRate'

export const ALL_CAMPAIGN_METRICS: CampaignMetric[] = [
  'posts', 'comments', 'buzz', 'interactions', 'view', 'engagement', 'p2pCommentRate',
]

export const CAMPAIGN_METRIC_LABELS: Record<CampaignMetric, string> = {
  posts: 'Posts',
  comments: 'Comments',
  buzz: 'Buzz',
  interactions: 'Interactions',
  view: 'View',
  engagement: 'Engagement',
  p2pCommentRate: 'P2P Comment Rate',
}

export interface Campaign {
  id: string
  projectId: string
  name: string
  description: string
  status: CampaignStatus
  startDate: string
  endDate: string
  pollingInterval: PollingInterval
  commentPollingInterval?: PollingInterval
  postCount: number
  commentCount: number
  engagementCount: number
  engagementRate: number
  platforms: Platform[]
  displayMetrics?: CampaignMetric[]
  createdAt: string
  updatedAt: string
}
