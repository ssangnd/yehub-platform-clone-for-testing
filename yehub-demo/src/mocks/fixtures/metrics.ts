export interface DailyMetrics {
  date: string
  comments: number
  engagements: number
  posts: number
}

export interface PlatformMetrics {
  platform: string
  comments: number
  engagements: number
  percentage: number
}

function generateDailyMetrics(): DailyMetrics[] {
  const metrics: DailyMetrics[] = []
  const startDate = new Date('2026-01-01')

  for (let i = 0; i < 37; i++) {
    const date = new Date(startDate)
    date.setDate(date.getDate() + i)

    const baseComments = 300 + Math.floor(Math.random() * 200)
    const spike = i >= 10 && i <= 15 ? 2.5 : i >= 25 && i <= 30 ? 1.8 : 1

    metrics.push({
      date: date.toISOString().split('T')[0],
      comments: Math.floor(baseComments * spike),
      engagements: Math.floor(baseComments * spike * 12),
      posts: Math.floor(Math.random() * 5) + 1,
    })
  }

  return metrics
}

export const mockDailyMetrics: DailyMetrics[] = generateDailyMetrics()

export const mockPlatformMetrics: PlatformMetrics[] = [
  { platform: 'facebook', comments: 35200, engagements: 420000, percentage: 32 },
  { platform: 'tiktok', comments: 28500, engagements: 680000, percentage: 26 },
  { platform: 'instagram', comments: 22100, engagements: 310000, percentage: 20 },
  { platform: 'youtube', comments: 18400, engagements: 520000, percentage: 17 },
  { platform: 'threads', comments: 5800, engagements: 45000, percentage: 5 },
]

export const mockOverviewMetrics = {
  totalComments: { value: 110000, trend: 12.5, previousValue: 97778 },
  totalEngagements: { value: 1975000, trend: 8.3, previousValue: 1823640 },
  activeCampaigns: { value: 14, trend: 0, previousValue: 14 },
  monitoredPosts: { value: 245, trend: 5.2, previousValue: 233 },
}
