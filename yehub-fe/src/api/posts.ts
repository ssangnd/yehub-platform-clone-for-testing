import { apiClient } from './client'

export type Platform = 'FACEBOOK' | 'INSTAGRAM' | 'TIKTOK' | 'YOUTUBE' | 'THREADS'

export type MediaType = 'TEXT' | 'IMAGE' | 'VIDEO' | 'CAROUSEL' | 'STORY' | 'REEL'

export interface KpiTargets {
  engagement: number
  buzz: number
  interaction: number
  view: number
}

export interface MetricsSnapshot {
  likes: number
  shares: number
  views: number
  comments: number
  engagement_rate: number
}

export interface PostItem {
  id: string
  campaign_id: string
  url: string | null
  platform: Platform
  platform_post_id: string
  content: string | null
  author_name: string | null
  author_avatar: string | null
  media_type: MediaType
  published_at: string | null
  likes: number
  shares: number
  views: number
  comment_count: number
  engagement: number
  metrics_snapshot: MetricsSnapshot | null
  kpi_targets: KpiTargets | null
  polling_metric_override: number | null
  polling_comment_override: number | null
  last_polled_at: string | null
  last_poll_status: string | null
  created_at: string
  updated_at: string
  linked_account: PostListLinkedAccount | null
}

export interface PostsPage {
  data: PostItem[]
  total: number
  page: number
  totalPages: number
}

export interface BulkUploadResult {
  total: number
  success_count: number
  failed_count: number
  failures: { url: string; reason: string }[]
}

export interface PostListLinkedAccount {
  id: string
  platform: Platform
  username: string | null
  displayName: string | null
}

export interface PostListItem {
  id: string
  campaign_id: string
  campaign_name: string
  project_id: string
  project_name: string
  url: string | null
  platform: Platform
  platform_post_id: string
  content: string | null
  author_name: string | null
  author_avatar: string | null
  media_type: MediaType
  published_at: string | null
  likes: number
  shares: number
  views: number
  comment_count: number
  engagement: number
  metrics_snapshot: MetricsSnapshot | null
  kpi_targets: KpiTargets | null
  polling_metric_override: number | null
  polling_comment_override: number | null
  last_polled_at: string | null
  last_poll_status: string | null
  created_at: string
  updated_at: string
  linked_account: PostListLinkedAccount | null
}

export interface LinkedAccountProfileSummary {
  id: string
  name: string
  gender: string | null
  tier: { id: string; name: string; color: string } | null
  categories: { id: string; name: string; color: string }[]
  totalFollowers: number
  accountCount: number
}

export interface LinkedAccountSummary {
  id: string
  platform: Platform
  username: string | null
  displayName: string | null
  followerCount: number
  isVerified: boolean
  linkedBy: 'AUTO' | 'MANUAL'
  profile: LinkedAccountProfileSummary
}

export interface PostDetail extends PostItem {
  campaign_name: string
  campaign_status: 'DRAFT' | 'ACTIVE' | 'PAUSED' | 'COMPLETED'
  campaign_start_date: string | null
  campaign_end_date: string | null
  last_metric_polled_at: string | null
  last_comment_polled_at: string | null
  next_metric_sync_at: string | null
  next_comment_sync_at: string | null
  project_id: string
  project_name: string
  linked_account: LinkedAccountSummary | null
}

export interface AllPostsPage {
  data: PostListItem[]
  total: number
  page: number
  totalPages: number
}

export const postsApi = {
  getPost: (postId: string) => apiClient.get<PostDetail>(`/posts/${postId}`).then((r) => r.data),

  listAllPosts: (params?: {
    q?: string
    platform?: Platform
    social_account_id?: string[]
    page?: number
    limit?: number
    sort_by?: string
    order?: 'asc' | 'desc'
  }) => apiClient.get<AllPostsPage>('/posts', { params }).then((r) => r.data),

  addPost: (campaignId: string, url: string) => apiClient.post<PostItem>(`/campaigns/${campaignId}/posts`, { url }),

  bulkUploadPosts: (
    campaignId: string,
    file: File,
    options?: {
      onUploadProgress?: (pct: number) => void
      signal?: AbortSignal
    },
  ) => {
    const formData = new FormData()
    formData.append('file', file)
    return apiClient.post<BulkUploadResult>(`/campaigns/${campaignId}/posts/bulk`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      signal: options?.signal,
      onUploadProgress: (e) => {
        if (options?.onUploadProgress && e.total) {
          options.onUploadProgress(Math.round((e.loaded / e.total) * 100))
        }
      },
    })
  },

  exportPosts: (campaignId: string, params?: { q?: string; platform?: Platform }) =>
    apiClient.get<Blob>(`/campaigns/${campaignId}/posts/export`, { params, responseType: 'blob' }).then((r) => r.data),

  listPosts: (
    campaignId: string,
    params?: {
      q?: string
      platform?: Platform
      page?: number
      limit?: number
      sort_by?: string
      order?: 'asc' | 'desc'
    },
  ) => apiClient.get<PostsPage>(`/campaigns/${campaignId}/posts`, { params }).then((r) => r.data),

  updatePostSettings: (
    postId: string,
    data: {
      polling_metric_override: number | null
      polling_comment_override: number | null
      kpi_targets: KpiTargets
    },
  ) => apiClient.put<PostItem>(`/posts/${postId}/settings`, data),

  syncPost: (postId: string, dimensions?: { metrics?: boolean; comments?: boolean }) =>
    apiClient.post<void>(`/posts/${postId}/sync`, dimensions),

  deletePost: (postId: string) => apiClient.delete(`/posts/${postId}`),
}
