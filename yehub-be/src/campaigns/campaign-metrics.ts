// Aggregated campaign dashboard metrics, exposed one-per-request via
// GET /campaigns/:id/metrics/:metric. The keys mirror the frontend's
// CAMPAIGN_METRIC_LABELS, intentionally excluding `p2pCommentRate` — it has no
// agreed definition yet, so the UI keeps that card as "Coming Soon" and the
// endpoint rejects it with 400.
export enum CampaignMetricKey {
  posts = 'posts',
  comments = 'comments',
  buzz = 'buzz',
  interactions = 'interactions',
  view = 'view',
  engagement = 'engagement',
}

export interface CampaignMetricTotals {
  postCount: number;
  likes: number;
  shares: number;
  views: number;
  comments: number;
}

// Pure metric derivation, kept separate from Prisma so it is trivially testable.
export function computeCampaignMetric(
  metric: CampaignMetricKey,
  totals: CampaignMetricTotals,
): number {
  const { postCount, likes, shares, views, comments } = totals;
  switch (metric) {
    case CampaignMetricKey.posts:
      return postCount;
    case CampaignMetricKey.comments:
    case CampaignMetricKey.buzz:
      return comments;
    case CampaignMetricKey.interactions:
      return likes + shares + comments;
    case CampaignMetricKey.view:
      return views;
    case CampaignMetricKey.engagement:
      return likes + shares + comments + views;
  }
}
