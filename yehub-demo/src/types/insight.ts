export type Sentiment = 'positive' | 'neutral' | 'negative'

export type EmotionType = 'joy' | 'anger' | 'sadness' | 'fear' | 'surprise' | 'disgust' | 'trust' | 'anticipation'

export interface Emotion {
  type: EmotionType
  score: number
}

export interface SentimentData {
  positive: number
  neutral: number
  negative: number
  total: number
}

export interface SentimentOverTime {
  date: string
  positive: number
  neutral: number
  negative: number
}

export interface EmotionDistribution {
  emotion: EmotionType
  count: number
  percentage: number
}

export interface TopicCluster {
  id: string
  label: string
  commentCount: number
  percentage: number
  trend: 'rising' | 'stable' | 'declining'
  sentimentBreakdown: SentimentData
  sampleComments: string[]
}

export interface PainPoint {
  id: string
  description: string
  frequency: number
  severity: 'high' | 'medium' | 'low'
  trend: 'worsening' | 'stable' | 'improving'
  sampleQuotes: string[]
  affectedPostIds: string[]
}

export interface CulturalSignal {
  id: string
  phrase: string
  usageCount: number
  firstSeen: string
  growthTrend: number
  contextExplanation: string
  sampleComments: string[]
}
