import type { KpiTargets } from '@/api/posts'

export interface PostMetricCounts {
  likes: number
  comments: number
  shares: number
  views: number
}

export function deriveRecordedKpiMetrics(metrics: PostMetricCounts): KpiTargets {
  return {
    engagement: metrics.likes + metrics.shares + metrics.comments,
    buzz: metrics.comments + metrics.shares,
    interaction: metrics.likes + metrics.shares + metrics.comments + metrics.views,
    view: metrics.views,
  }
}

export interface OverallKpi {
  /** Sum of each metric's achieved value capped at its own target. */
  totalAchieved: number
  /** Sum of all metric targets. */
  totalTarget: number
  /** Overall completion percent: round(totalAchieved / totalTarget * 100). */
  pct: number
}

/**
 * Overall KPI = sum(min(actual, target)) / sum(target).
 *
 * Each metric is capped at its own target before summing, so an over-achieving
 * metric cannot compensate for one that falls short. Metrics with a zero target
 * contribute to neither the numerator nor the denominator.
 */
export function computeOverallKpi(metrics: PostMetricCounts, kpiTargets: KpiTargets): OverallKpi {
  const current = deriveRecordedKpiMetrics(metrics)
  const totalTarget = kpiTargets.engagement + kpiTargets.buzz + kpiTargets.interaction + kpiTargets.view
  const totalAchieved =
    Math.min(current.engagement, kpiTargets.engagement) +
    Math.min(current.buzz, kpiTargets.buzz) +
    Math.min(current.interaction, kpiTargets.interaction) +
    Math.min(current.view, kpiTargets.view)
  const pct = totalTarget > 0 ? Math.round((totalAchieved / totalTarget) * 100) : 0
  return { totalAchieved, totalTarget, pct }
}
