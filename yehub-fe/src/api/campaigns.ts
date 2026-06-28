import { apiClient } from './client'
import type { GlobalRole } from './auth'

export type MemberRole = 'MANAGER' | 'EXECUTIVE' | 'ANALYST' | 'VIEWER'

export type CampaignStatus = 'DRAFT' | 'ACTIVE' | 'PAUSED' | 'COMPLETED'
export type CampaignSortField = 'name' | 'created_at' | 'post_count'
export type SortOrder = 'asc' | 'desc'

export interface Campaign {
  id: string
  project_id: string
  project_name: string
  name: string
  description: string | null
  status: CampaignStatus
  start_date: string | null
  end_date: string | null
  metric_polling_interval: number | null
  comments_polling_interval: number | null
  display_metrics: string[]
  platforms: string[]
  created_at: string
  updated_at: string
  post_count: number
  comment_count: number
  engagement_rate: number | null
  objectives: { id: string; name: string }[]
}

export interface CampaignsPage {
  data: Campaign[]
  total: number
  page: number
  totalPages: number
}

export interface CreateCampaignPayload {
  name: string
  description?: string | null
  start_date: string
  end_date: string
  metric_polling_interval?: number | null
  comments_polling_interval?: number | null
  display_metrics?: string[]
  platforms: string[]
  objective_ids?: string[]
}

export type UpdateCampaignPayload = CreateCampaignPayload

export interface CampaignMemberUser {
  id: string
  email: string
  name: string
  avatar?: string
}

export interface CampaignInheritedMember {
  user: CampaignMemberUser
  role: MemberRole
  source: 'project'
  global_role: GlobalRole
}

export interface CampaignDirectMember {
  user: CampaignMemberUser
  role: MemberRole
  source: 'campaign'
  added_by: string | null
  added_by_user: CampaignMemberUser | null
  created_at: string
  global_role: GlobalRole
}

export interface CampaignMembersResponse {
  inherited: CampaignInheritedMember[]
  direct: CampaignDirectMember[]
}

export interface CampaignMetricResult {
  metric: string
  value: number
}

export type Platform = 'FACEBOOK' | 'INSTAGRAM' | 'TIKTOK' | 'YOUTUBE' | 'THREADS'

export type CommentVolumeGranularity = 'day' | 'week'

export type CampaignCommentVolume = {
  granularity: CommentVolumeGranularity
  points: { date: string; count: number }[]
}

export type CampaignPlatformDistribution = {
  distribution: { platform: Platform; count: number }[]
}

export type CampaignSpending = {
  currency: 'USD'
  total_usd: number
  run_count: number
  finalized_count: number
  pending_count: number
  by_job_type: { job_type: string; run_count: number; total_usd: number }[]
  series: {
    granularity: CommentVolumeGranularity
    points: { date: string; usd: number }[]
  }
  top_posts: { post_id: string; label: string; run_count: number; total_usd: number }[]
  top_accounts: { social_account_id: string; label: string; run_count: number; total_usd: number }[]
  recent_runs: {
    id: string
    job_type: string
    status: string
    started_at: string | null
    usage_total_usd: number | null
    usage_finalized: boolean
    label: string | null
  }[]
}

export const campaignsApi = {
  createCampaign: (projectId: string, data: CreateCampaignPayload) =>
    apiClient.post<Campaign>(`/projects/${projectId}/campaigns`, data),

  listCampaignsByProject: (
    projectId: string,
    params?: {
      q?: string
      status?: CampaignStatus
      page?: number
      limit?: number
      sort_by?: CampaignSortField
      order?: SortOrder
    },
  ) => apiClient.get<CampaignsPage>(`/projects/${projectId}/campaigns`, { params }).then((r) => r.data),

  listAllCampaigns: (params?: {
    q?: string
    status?: CampaignStatus
    page?: number
    limit?: number
    sort_by?: CampaignSortField
    order?: SortOrder
  }) => apiClient.get<CampaignsPage>('/campaigns', { params }).then((r) => r.data),

  getCampaign: (id: string) => apiClient.get<Campaign>(`/campaigns/${id}`).then((r) => r.data),

  // One request per dashboard metric (e.g. posts, comments, buzz, interactions, view, engagement).
  getMetric: (id: string, metric: string) =>
    apiClient.get<CampaignMetricResult>(`/campaigns/${id}/metrics/${metric}`).then((r) => r.data),

  getCommentVolume: (id: string) =>
    apiClient.get<CampaignCommentVolume>(`/campaigns/${id}/analytics/comments-by-date`).then((r) => r.data),

  getCommentsByPlatform: (id: string) =>
    apiClient.get<CampaignPlatformDistribution>(`/campaigns/${id}/analytics/comments-by-platform`).then((r) => r.data),

  getSpending: (id: string) =>
    apiClient.get<CampaignSpending>(`/campaigns/${id}/analytics/spending`).then((r) => r.data),

  updateCampaign: (id: string, data: UpdateCampaignPayload) => apiClient.put<Campaign>(`/campaigns/${id}`, data),

  changeCampaignStatus: (id: string, status: CampaignStatus) =>
    apiClient.post<Campaign>(`/campaigns/${id}/status`, { status }),

  deleteCampaign: (id: string) => apiClient.delete(`/campaigns/${id}`),

  // Campaign members
  listMembers: (campaignId: string) =>
    apiClient.get<CampaignMembersResponse>(`/campaigns/${campaignId}/members`).then((r) => r.data),

  addMember: (campaignId: string, data: { user_id: string; role: MemberRole }) =>
    apiClient.post<CampaignDirectMember>(`/campaigns/${campaignId}/members`, data),

  updateMember: (campaignId: string, userId: string, role: MemberRole) =>
    apiClient.patch<CampaignDirectMember>(`/campaigns/${campaignId}/members/${userId}`, { role }),

  removeMember: (campaignId: string, userId: string) => apiClient.delete(`/campaigns/${campaignId}/members/${userId}`),

  getNonMembers: (campaignId: string, params?: { q?: string; limit?: number }) =>
    apiClient
      .get<
        { id: string; email: string; name: string; avatar?: string; global_role: GlobalRole }[]
      >(`/campaigns/${campaignId}/non-members`, { params })
      .then((r) => r.data),

  getMyRole: (campaignId: string) =>
    apiClient
      .get<{ role: MemberRole; source: 'project' | 'campaign' }>(`/campaigns/${campaignId}/me`)
      .then((r) => r.data),
}
