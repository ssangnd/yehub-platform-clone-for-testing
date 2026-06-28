import { useState } from 'react'
import { SentimentChart } from '@/components/charts/SentimentChart'
import { EmotionDistributionChart } from '@/components/charts/EmotionDistributionChart'
import { TimeSeriesChart } from '@/components/charts/TimeSeriesChart'
import { MetricCard } from '@/components/common/MetricCard'
import { SentimentBadge } from '@/components/common/SentimentBadge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  ThumbsUp, ThumbsDown, Minus, Heart, Brain, TrendingUp, TrendingDown,
  Target, Sparkles, ChevronDown,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatNumber, formatDate } from '@/lib/utils/format'
import {
  mockSentimentOverall, mockSentimentOverTime,
  mockEmotionDistribution, mockTopicClusters,
  mockPainPoints, mockCulturalSignals,
} from '@/mocks/fixtures/sentiments'

// ── Emotion constants ──────────────────────────────────────────────
const EMOTION_COLORS: Record<string, string> = {
  joy: '#22c55e', anger: '#ef4444', sadness: '#3b82f6',
  fear: '#a855f7', surprise: '#f59e0b', disgust: '#6b7280',
}
const EMOTION_LABELS: Record<string, string> = {
  joy: 'Joy', anger: 'Anger', sadness: 'Sadness',
  fear: 'Fear', surprise: 'Surprise', disgust: 'Disgust',
}
const emotionSampleComments: Record<string, string[]> = {
  joy: ['Quá tuyệt vời luôn! Mua hoài không chán', 'Sản phẩm xuất sắc, 10 điểm!'],
  anger: ['Quảng cáo một đằng, thực tế một nẻo', 'Dịch vụ tệ quá, không chấp nhận được'],
  sadness: ['Buồn quá, sản phẩm bị lỗi mà không đổi được', 'Tiếc quá, hết hàng rồi'],
  fear: ['Lo ngại về chất lượng sản phẩm', 'Không biết có an toàn không'],
  surprise: ['Không ngờ chất lượng tốt đến vậy!', 'Wow, giao hàng nhanh quá'],
  disgust: ['Mùi quá khó chịu', 'Đóng gói cẩu thả, không thể chấp nhận'],
}
const emotionTimeSeries = [
  { date: '2026-01-01', joy: 35, anger: 12, sadness: 10, surprise: 18, fear: 15, disgust: 10 },
  { date: '2026-01-08', joy: 38, anger: 15, sadness: 8, surprise: 20, fear: 12, disgust: 7 },
  { date: '2026-01-15', joy: 42, anger: 10, sadness: 12, surprise: 15, fear: 13, disgust: 8 },
  { date: '2026-01-22', joy: 40, anger: 18, sadness: 9, surprise: 16, fear: 10, disgust: 7 },
  { date: '2026-01-29', joy: 36, anger: 14, sadness: 11, surprise: 19, fear: 12, disgust: 8 },
  { date: '2026-02-05', joy: 38, anger: 15, sadness: 10, surprise: 19, fear: 10, disgust: 8 },
]

// ── Topic constants ────────────────────────────────────────────────
const topicTrendIcons = {
  rising: <TrendingUp className="h-4 w-4 text-green-500" />,
  stable: <Minus className="h-4 w-4 text-gray-500" />,
  declining: <TrendingDown className="h-4 w-4 text-red-500" />,
}

// ── Pain point constants ───────────────────────────────────────────
const severityStyles = {
  high: 'bg-red-500/10 text-red-500 border-0',
  medium: 'bg-yellow-500/10 text-yellow-500 border-0',
  low: 'bg-blue-500/10 text-blue-500 border-0',
}
const painTrendConfig = {
  worsening: { icon: <TrendingUp className="h-4 w-4 text-red-500" />, label: 'Worsening', color: 'text-red-500' },
  stable: { icon: <Minus className="h-4 w-4 text-gray-500" />, label: 'Stable', color: 'text-gray-500' },
  improving: { icon: <TrendingDown className="h-4 w-4 text-green-500" />, label: 'Improving', color: 'text-green-500' },
}

// ── Collapsible section wrapper ────────────────────────────────────
function Section({
  id, icon: Icon, title, summary, expanded, onToggle, children,
}: {
  id: string
  icon: React.ComponentType<{ className?: string }>
  title: string
  summary: React.ReactNode
  expanded: boolean
  onToggle: (id: string) => void
  children: React.ReactNode
}) {
  return (
    <Card>
      <div
        className="flex items-center justify-between p-4 cursor-pointer select-none"
        onClick={() => onToggle(id)}
      >
        <div className="flex items-center gap-3 min-w-0">
          <Icon className="h-5 w-5 shrink-0 text-muted-foreground" />
          <span className="font-semibold">{title}</span>
          {!expanded && (
            <span className="text-sm text-muted-foreground hidden sm:inline">{summary}</span>
          )}
        </div>
        <ChevronDown className={cn('h-4 w-4 shrink-0 text-muted-foreground transition-transform', expanded && 'rotate-180')} />
      </div>
      {expanded && <CardContent className="pt-0">{children}</CardContent>}
    </Card>
  )
}

// ── Main page ──────────────────────────────────────────────────────
export default function AnalyticsPage() {
  const [expanded, setExpanded] = useState<Set<string>>(new Set(['sentiment']))
  const [expandedTopicId, setExpandedTopicId] = useState<string | null>(null)

  const toggle = (id: string) => {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const sentimentSeries = [
    { key: 'positive', label: 'Positive', color: '#22c55e' },
    { key: 'neutral', label: 'Neutral', color: '#6b7280' },
    { key: 'negative', label: 'Negative', color: '#ef4444' },
  ]

  const emotionSeries = mockEmotionDistribution.map(e => ({
    key: e.emotion,
    label: EMOTION_LABELS[e.emotion] || e.emotion,
    color: EMOTION_COLORS[e.emotion] || '#6b7280',
  }))

  const topEmotion = mockEmotionDistribution[0]
  const highSeverityCount = mockPainPoints.filter(p => p.severity === 'high').length
  const topSignal = mockCulturalSignals[0]

  return (
    <div className="space-y-4">
      {/* ─── Sentiment ─── */}
      <Section
        id="sentiment"
        icon={Heart}
        title="Sentiment"
        summary={
          <span className="flex items-center gap-2">
            <Badge className="bg-green-500/10 text-green-500 border-0">{mockSentimentOverall.positive}% Positive</Badge>
            <Badge className="bg-gray-500/10 text-gray-500 border-0">{mockSentimentOverall.neutral}% Neutral</Badge>
            <Badge className="bg-red-500/10 text-red-500 border-0">{mockSentimentOverall.negative}% Negative</Badge>
          </span>
        }
        expanded={expanded.has('sentiment')}
        onToggle={toggle}
      >
        <div className="space-y-6">
          <div className="grid gap-4 md:grid-cols-3">
            <MetricCard label="Positive" value={`${mockSentimentOverall.positive}%`} icon={<ThumbsUp className="h-5 w-5 text-green-500" />} />
            <MetricCard label="Neutral" value={`${mockSentimentOverall.neutral}%`} icon={<Minus className="h-5 w-5 text-gray-500" />} />
            <MetricCard label="Negative" value={`${mockSentimentOverall.negative}%`} icon={<ThumbsDown className="h-5 w-5 text-red-500" />} />
          </div>
          <div className="grid gap-6 lg:grid-cols-3">
            <TimeSeriesChart data={mockSentimentOverTime} series={sentimentSeries} title="Sentiment Over Time" type="area" className="lg:col-span-2" />
            <SentimentChart data={mockSentimentOverall} />
          </div>
          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader><CardTitle className="text-base">Most Positive Comments</CardTitle></CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {['Quá tuyệt vời luôn! Sản phẩm chất lượng quá', 'Ủng hộ mãi! Sản phẩm Việt Nam chất lượng cao', 'Đã mua thử và rất thích! Sẽ giới thiệu cho bạn bè', 'Best sản phẩm trong tầm giá! Recommend cho mọi người'].map((text, i) => (
                    <div key={i} className="flex items-start gap-2 p-2 rounded-lg bg-green-500/5">
                      <SentimentBadge sentiment="positive" />
                      <p className="text-sm">{text}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-base">Most Negative Comments</CardTitle></CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {['Sản phẩm không như quảng cáo, rất thất vọng', 'Giá quá đắt mà chất lượng không tương xứng', 'Dịch vụ khách hàng tệ quá, gọi mãi không được', 'Giao hàng chậm, đóng gói cẩu thả'].map((text, i) => (
                    <div key={i} className="flex items-start gap-2 p-2 rounded-lg bg-red-500/5">
                      <SentimentBadge sentiment="negative" />
                      <p className="text-sm">{text}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </Section>

      {/* ─── Emotions ─── */}
      <Section
        id="emotions"
        icon={Brain}
        title="Emotions"
        summary={
          <span>
            Top: {EMOTION_LABELS[topEmotion.emotion]} {topEmotion.percentage}% · {mockEmotionDistribution.length} emotions detected
          </span>
        }
        expanded={expanded.has('emotions')}
        onToggle={toggle}
      >
        <div className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-2">
            <EmotionDistributionChart data={mockEmotionDistribution} />
            <TimeSeriesChart data={emotionTimeSeries} series={emotionSeries} title="Emotions Over Time" type="line" />
          </div>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {mockEmotionDistribution.map(emotion => (
              <Card key={emotion.emotion}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base">
                      <Badge style={{ backgroundColor: `${EMOTION_COLORS[emotion.emotion]}20`, color: EMOTION_COLORS[emotion.emotion] }} className="border-0">
                        {EMOTION_LABELS[emotion.emotion]}
                      </Badge>
                    </CardTitle>
                    <span className="text-sm font-mono font-bold">{emotion.percentage}%</span>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground mb-2">{emotion.count} comments</p>
                  <div className="space-y-2">
                    {(emotionSampleComments[emotion.emotion] || []).map((comment, i) => (
                      <p key={i} className="text-xs text-muted-foreground bg-muted/50 rounded p-2">"{comment}"</p>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </Section>

      {/* ─── Topics ─── */}
      <Section
        id="topics"
        icon={TrendingUp}
        title="Topics"
        summary={<span>{mockTopicClusters.length} topics · Top: {mockTopicClusters[0]?.label}</span>}
        expanded={expanded.has('topics')}
        onToggle={toggle}
      >
        <div className="space-y-4">
          {mockTopicClusters.map(topic => (
            <Card key={topic.id}>
              <CardHeader className="pb-2 cursor-pointer" onClick={(e) => { e.stopPropagation(); setExpandedTopicId(expandedTopicId === topic.id ? null : topic.id) }}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <CardTitle className="text-base">{topic.label}</CardTitle>
                    <div className="flex items-center gap-1">{topicTrendIcons[topic.trend]}<span className="text-xs text-muted-foreground capitalize">{topic.trend}</span></div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-mono font-bold">{topic.percentage}%</span>
                    <Badge variant="outline">{formatNumber(topic.commentCount)} comments</Badge>
                    <ChevronDown className={cn('h-4 w-4 transition-transform', expandedTopicId === topic.id && 'rotate-180')} />
                  </div>
                </div>
              </CardHeader>
              {expandedTopicId === topic.id && (
                <CardContent className="pt-0">
                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <p className="text-sm font-medium mb-2">Sentiment Breakdown</p>
                      <div className="flex gap-2">
                        <Badge className="bg-green-500/10 text-green-500 border-0">{topic.sentimentBreakdown.positive}% Positive</Badge>
                        <Badge className="bg-gray-500/10 text-gray-500 border-0">{topic.sentimentBreakdown.neutral}% Neutral</Badge>
                        <Badge className="bg-red-500/10 text-red-500 border-0">{topic.sentimentBreakdown.negative}% Negative</Badge>
                      </div>
                    </div>
                    <div>
                      <p className="text-sm font-medium mb-2">Sample Comments</p>
                      <div className="space-y-2">
                        {topic.sampleComments.map((comment, i) => (
                          <p key={i} className="text-xs text-muted-foreground bg-muted/50 rounded p-2">"{comment}"</p>
                        ))}
                      </div>
                    </div>
                  </div>
                </CardContent>
              )}
            </Card>
          ))}
        </div>
      </Section>

      {/* ─── Pain Points ─── */}
      <Section
        id="pain-points"
        icon={Target}
        title="Pain Points"
        summary={<span>{mockPainPoints.length} issues · {highSeverityCount} high severity</span>}
        expanded={expanded.has('pain-points')}
        onToggle={toggle}
      >
        <div className="space-y-4">
          {mockPainPoints.map((point, index) => {
            const trend = painTrendConfig[point.trend]
            return (
              <Card key={point.id}>
                <CardContent className="p-4">
                  <div className="flex items-start gap-4">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-bold font-mono">
                      {index + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-2">
                        <p className="font-medium">{point.description}</p>
                        <Badge variant="outline" className={severityStyles[point.severity]}>{point.severity}</Badge>
                        <div className={`flex items-center gap-1 text-xs ${trend.color}`}>
                          {trend.icon}
                          <span>{trend.label}</span>
                        </div>
                      </div>
                      <p className="text-sm text-muted-foreground mb-2">Reported {point.frequency} times</p>
                      <div className="space-y-1">
                        {point.sampleQuotes.map((quote, i) => (
                          <p key={i} className="text-xs text-muted-foreground bg-muted/50 rounded p-2">"{quote}"</p>
                        ))}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      </Section>

      {/* ─── Cultural Signals ─── */}
      <Section
        id="cultural-signals"
        icon={Sparkles}
        title="Cultural Signals"
        summary={<span>{mockCulturalSignals.length} phrases · Top: {topSignal?.phrase} (+{topSignal?.growthTrend}%)</span>}
        expanded={expanded.has('cultural-signals')}
        onToggle={toggle}
      >
        <div className="grid gap-4 md:grid-cols-2">
          {mockCulturalSignals.map(signal => (
            <Card key={signal.id} className="transition-shadow duration-200 hover:shadow-md">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg">"{signal.phrase}"</CardTitle>
                  <div className="flex items-center gap-1 text-green-500">
                    <TrendingUp className="h-4 w-4" />
                    <span className="text-sm font-medium">+{signal.growthTrend}%</span>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex gap-2 mb-3">
                  <Badge variant="outline">{formatNumber(signal.usageCount)} uses</Badge>
                  <Badge variant="secondary">First seen: {formatDate(signal.firstSeen)}</Badge>
                </div>
                <p className="text-sm text-muted-foreground mb-3">{signal.contextExplanation}</p>
                <div className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground">Sample comments:</p>
                  {signal.sampleComments.map((comment, i) => (
                    <p key={i} className="text-xs text-muted-foreground bg-muted/50 rounded p-2">"{comment}"</p>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </Section>
    </div>
  )
}
