import {
  CampaignMetricKey,
  computeCampaignMetric,
  type CampaignMetricTotals,
} from './campaign-metrics';

const totals: CampaignMetricTotals = {
  postCount: 5,
  likes: 100,
  shares: 20,
  views: 1000,
  comments: 30,
};

describe('computeCampaignMetric', () => {
  it('posts → post count', () => {
    expect(computeCampaignMetric(CampaignMetricKey.posts, totals)).toBe(5);
  });

  it('comments → total comments', () => {
    expect(computeCampaignMetric(CampaignMetricKey.comments, totals)).toBe(30);
  });

  it('buzz → total comments (matches the comments metric)', () => {
    expect(computeCampaignMetric(CampaignMetricKey.buzz, totals)).toBe(30);
  });

  it('interactions → likes + shares + comments', () => {
    expect(computeCampaignMetric(CampaignMetricKey.interactions, totals)).toBe(
      150,
    );
  });

  it('view → total views', () => {
    expect(computeCampaignMetric(CampaignMetricKey.view, totals)).toBe(1000);
  });

  it('engagement → likes + shares + comments + views', () => {
    expect(computeCampaignMetric(CampaignMetricKey.engagement, totals)).toBe(
      1150,
    );
  });
});
