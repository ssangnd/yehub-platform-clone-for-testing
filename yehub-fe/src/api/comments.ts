import { apiClient } from './client'
import type { Platform } from './posts'

export type Sentiment = 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL' | 'MIXED'

export type Emotion = 'JOY' | 'SADNESS' | 'ANGER' | 'FEAR' | 'SURPRISE' | 'DISGUST' | 'TRUST' | 'ANTICIPATION'

export interface CommentItem {
  id: string
  post_id: string
  social_account_id: string | null
  platform: Platform
  author_name: string | null
  author_profile_url: string | null
  platform_comment_id: string
  content: string
  language: string | null
  like_count: number
  reply_count: number
  parent_comment_id: string | null
  is_noise: boolean
  mentions: unknown[] | null
  hashtags: unknown[] | null
  sentiment: Sentiment | null
  emotions: Emotion[]
  confidence_score: number | null
  platform_created_at: string | null
  created_at: string
}

export interface CommentWithReplies extends CommentItem {
  childComments: CommentItem[]
}

export interface CommentWithPost extends CommentItem {
  post: {
    id: string
    url: string | null
    platform: Platform
  }
}

export interface CommentsPage {
  data: CommentItem[]
  total: number
  page: number
  totalPages: number
}

export interface CampaignCommentsPage {
  data: CommentWithPost[]
  total: number
  page: number
  totalPages: number
}

export interface ListCommentsParams {
  q?: string
  platform?: Platform
  sentiment?: Sentiment
  is_noise?: boolean
  from?: string
  to?: string
  sort?: 'newest' | 'oldest' | 'most_likes'
  page?: number
  limit?: number
}

export const commentsApi = {
  listByPost: (postId: string, params?: ListCommentsParams) =>
    apiClient.get<CommentsPage>(`/posts/${postId}/comments`, { params }).then((r) => r.data),

  listByCampaign: (campaignId: string, params?: ListCommentsParams) =>
    apiClient.get<CampaignCommentsPage>(`/campaigns/${campaignId}/comments`, { params }).then((r) => r.data),

  getComment: (commentId: string) => apiClient.get<CommentWithReplies>(`/comments/${commentId}`).then((r) => r.data),
}
