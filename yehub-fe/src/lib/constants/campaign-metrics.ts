export type CampaignMetric = 'posts' | 'comments' | 'buzz' | 'interactions' | 'view' | 'engagement' | 'p2pCommentRate'

export const ALL_CAMPAIGN_METRICS: CampaignMetric[] = [
  'posts',
  'comments',
  'buzz',
  'interactions',
  'view',
  'engagement',
  'p2pCommentRate',
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
