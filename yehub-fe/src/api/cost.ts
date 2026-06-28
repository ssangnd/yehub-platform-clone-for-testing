import { apiClient } from './client'
import type { Platform, CommentVolumeGranularity } from './campaigns'

export interface CostFilters {
  from: string
  to: string
  platforms: Platform[]
  project_ids: string[]
  campaign_ids: string[]
}

export interface CostFilterOptions {
  projects: { id: string; name: string }[]
  campaigns: { id: string; name: string; project_id: string }[]
}

export interface CostOverview {
  currency: 'USD'
  summary: {
    total_usd: number
    run_count: number
    success_count: number
    failure_count: number
  }
  series: {
    granularity: CommentVolumeGranularity
    points: { date: string; usd: number }[]
  }
  by_platform: { platform: string; run_count: number; total_usd: number }[]
  by_project: {
    project_id: string | null
    project_name: string
    run_count: number
    total_usd: number
  }[]
  by_campaign: {
    campaign_id: string | null
    campaign_name: string
    project_name: string
    run_count: number
    total_usd: number
  }[]
  by_job_type: { job_type: string; run_count: number; total_usd: number }[]
  recent_runs: {
    id: string
    job_type: string
    status: string
    started_at: string | null
    usage_total_usd: number | null
    usage_finalized: boolean
    platform: string
    project_name: string
    label: string | null
  }[]
}

// Builds the query params, omitting empty arrays so the URL stays clean.
function toParams(filters: CostFilters): Record<string, string> {
  const params: Record<string, string> = { from: filters.from, to: filters.to }
  if (filters.platforms.length) params.platforms = filters.platforms.join(',')
  if (filters.project_ids.length) params.project_ids = filters.project_ids.join(',')
  if (filters.campaign_ids.length) params.campaign_ids = filters.campaign_ids.join(',')
  return params
}

export const costApi = {
  getFilterOptions: () => apiClient.get<CostFilterOptions>('/cost/filter-options').then((r) => r.data),

  getOverview: (filters: CostFilters) =>
    apiClient.get<CostOverview>('/cost', { params: toParams(filters) }).then((r) => r.data),
}
