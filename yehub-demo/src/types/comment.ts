import type { Platform } from './filters'
import type { Sentiment, Emotion } from './insight'

export interface Comment {
  id: string
  postId: string
  campaignId: string
  platform: Platform
  authorProfileUrl?: string
  content: string
  language?: string
  publishedAt: string
  likes: number
  replyCount: number
  parentCommentId?: string
  isNoise?: boolean
  mentions?: unknown[]
  hashtags?: unknown[]
  sentiment?: Sentiment
  emotions?: Emotion[]
  confidenceScore?: number
  createdAt: string
}
