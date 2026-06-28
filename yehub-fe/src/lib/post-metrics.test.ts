import { computeOverallKpi, deriveRecordedKpiMetrics } from './post-metrics.ts'

function expectEqual(actual: unknown, expected: unknown, message: string) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
  }
}

const metrics = deriveRecordedKpiMetrics({
  likes: 10,
  shares: 5,
  comments: 3,
  views: 100,
})

expectEqual(
  metrics,
  {
    engagement: 18,
    buzz: 8,
    interaction: 118,
    view: 100,
  },
  'recorded KPI metrics should match the post detail formula',
)

// Overall KPI = sum(min(actual, kpi)) / sum(kpi).
// metrics: likes=10, shares=5, comments=3, views=100 ->
//   engagement=18, buzz=8, interaction=118, view=100
// targets:  engagement=20, buzz=4, interaction=50, view=100
//   capped:  min(18,20)=18, min(8,4)=4, min(118,50)=50, min(100,100)=100 => 172
//   total target = 20+4+50+100 = 174 => round(172/174*100) = 99
expectEqual(
  computeOverallKpi(
    { likes: 10, shares: 5, comments: 3, views: 100 },
    { engagement: 20, buzz: 4, interaction: 50, view: 100 },
  ),
  { totalAchieved: 172, totalTarget: 174, pct: 99 },
  'overall KPI caps each metric at its own target before summing',
)

// Metrics with a zero target are excluded from both numerator and denominator.
expectEqual(
  computeOverallKpi(
    { likes: 10, shares: 5, comments: 3, views: 100 },
    { engagement: 20, buzz: 0, interaction: 0, view: 0 },
  ),
  { totalAchieved: 18, totalTarget: 20, pct: 90 },
  'overall KPI ignores metrics with no target',
)

// No targets at all -> 0% (avoids divide-by-zero).
expectEqual(
  computeOverallKpi(
    { likes: 10, shares: 5, comments: 3, views: 100 },
    { engagement: 0, buzz: 0, interaction: 0, view: 0 },
  ),
  { totalAchieved: 0, totalTarget: 0, pct: 0 },
  'overall KPI is 0 when there are no targets',
)
