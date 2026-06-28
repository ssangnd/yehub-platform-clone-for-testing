import type { SentimentData, SentimentOverTime, EmotionDistribution, TopicCluster, PainPoint, CulturalSignal } from '@/types/insight'

export const mockSentimentOverall: SentimentData = {
  positive: 58,
  neutral: 28,
  negative: 14,
  total: 100,
}

export const mockSentimentOverTime: SentimentOverTime[] = [
  { date: '2026-01-01', positive: 55, neutral: 30, negative: 15 },
  { date: '2026-01-08', positive: 52, neutral: 32, negative: 16 },
  { date: '2026-01-15', positive: 60, neutral: 25, negative: 15 },
  { date: '2026-01-22', positive: 65, neutral: 22, negative: 13 },
  { date: '2026-01-29', positive: 58, neutral: 28, negative: 14 },
  { date: '2026-02-05', positive: 62, neutral: 26, negative: 12 },
]

export const mockEmotionDistribution: EmotionDistribution[] = [
  { emotion: 'joy', count: 4200, percentage: 38 },
  { emotion: 'surprise', count: 2100, percentage: 19 },
  { emotion: 'anger', count: 1650, percentage: 15 },
  { emotion: 'sadness', count: 1100, percentage: 10 },
  { emotion: 'fear', count: 1100, percentage: 10 },
  { emotion: 'disgust', count: 880, percentage: 8 },
]

export const mockTopicClusters: TopicCluster[] = [
  {
    id: 'topic-1',
    label: 'Chất lượng sản phẩm',
    commentCount: 3200,
    percentage: 28,
    trend: 'rising',
    sentimentBreakdown: { positive: 65, neutral: 20, negative: 15, total: 100 },
    sampleComments: [
      'Sản phẩm chất lượng cao, rất hài lòng',
      'Mình đã dùng thử và thấy rất tốt',
      'Chất lượng vượt mong đợi luôn',
    ],
  },
  {
    id: 'topic-2',
    label: 'Giá cả và khuyến mãi',
    commentCount: 2800,
    percentage: 24,
    trend: 'stable',
    sentimentBreakdown: { positive: 45, neutral: 35, negative: 20, total: 100 },
    sampleComments: [
      'Giá hơi cao nhưng chất lượng ok',
      'Đợt sale này giá tốt quá',
      'So với đối thủ thì giá hợp lý',
    ],
  },
  {
    id: 'topic-3',
    label: 'Dịch vụ giao hàng',
    commentCount: 1800,
    percentage: 16,
    trend: 'declining',
    sentimentBreakdown: { positive: 30, neutral: 25, negative: 45, total: 100 },
    sampleComments: [
      'Giao hàng chậm quá, đợi 3 ngày luôn',
      'Ship nhanh, đóng gói cẩn thận',
      'Giao hàng bị vỡ, không hài lòng',
    ],
  },
  {
    id: 'topic-4',
    label: 'Thiết kế và đóng gói',
    commentCount: 1500,
    percentage: 13,
    trend: 'rising',
    sentimentBreakdown: { positive: 72, neutral: 18, negative: 10, total: 100 },
    sampleComments: [
      'Thiết kế bao bì đẹp quá luôn',
      'Đóng gói sang trọng, thích hợp làm quà',
      'Bao bì mới nhìn bắt mắt hơn hẳn',
    ],
  },
  {
    id: 'topic-5',
    label: 'So sánh đối thủ',
    commentCount: 1200,
    percentage: 10,
    trend: 'stable',
    sentimentBreakdown: { positive: 40, neutral: 40, negative: 20, total: 100 },
    sampleComments: [
      'So với brand A thì sản phẩm này tốt hơn',
      'Giá tương đương nhưng chất lượng kém hơn',
      'Mình thấy cả hai đều ok, tùy sở thích',
    ],
  },
]

export const mockPainPoints: PainPoint[] = [
  {
    id: 'pain-1',
    description: 'Thời gian giao hàng chậm, đặc biệt vùng xa trung tâm',
    frequency: 420,
    severity: 'high',
    trend: 'worsening',
    sampleQuotes: [
      'Đợi 5 ngày mới nhận được hàng, ở Q7 mà giao lâu thế',
      'Ship từ HN vào SG mất 1 tuần, quá chậm',
    ],
    affectedPostIds: ['post-8', 'post-9', 'post-10'],
  },
  {
    id: 'pain-2',
    description: 'Chất lượng sản phẩm không đồng nhất giữa các lô',
    frequency: 280,
    severity: 'medium',
    trend: 'stable',
    sampleQuotes: [
      'Lần trước mua ok mà lần này bị lỗi',
      'Chất lượng không đều, hên xui quá',
    ],
    affectedPostIds: ['post-1', 'post-4'],
  },
  {
    id: 'pain-3',
    description: 'Hotline hỗ trợ khó liên lạc trong giờ cao điểm',
    frequency: 195,
    severity: 'medium',
    trend: 'improving',
    sampleQuotes: [
      'Gọi hotline 30 phút không ai nghe máy',
      'Chat support phản hồi chậm vào cuối tuần',
    ],
    affectedPostIds: ['post-6', 'post-7'],
  },
  {
    id: 'pain-4',
    description: 'Giá sản phẩm tăng so với đợt trước',
    frequency: 165,
    severity: 'low',
    trend: 'worsening',
    sampleQuotes: [
      'Tháng trước giá rẻ hơn mà nay tăng rồi',
      'Giá cứ tăng đều mà chất lượng thì không đổi',
    ],
    affectedPostIds: ['post-8', 'post-37'],
  },
  {
    id: 'pain-5',
    description: 'Thông tin sản phẩm trên app không chính xác',
    frequency: 120,
    severity: 'low',
    trend: 'stable',
    sampleQuotes: [
      'Ảnh trên app khác thực tế nhiều quá',
      'Mô tả sản phẩm thiếu thông tin quan trọng',
    ],
    affectedPostIds: ['post-9', 'post-10'],
  },
]

export const mockCulturalSignals: CulturalSignal[] = [
  {
    id: 'signal-1',
    phrase: 'xịn sò',
    usageCount: 340,
    firstSeen: '2026-01-05T00:00:00Z',
    growthTrend: 25,
    contextExplanation: 'Slang Việt Nam nghĩa là "rất tốt, chất lượng cao". Thường dùng để khen sản phẩm hoặc dịch vụ.',
    sampleComments: ['Sản phẩm xịn sò luôn, mua hoài không chán', 'Đóng gói xịn sò, thích quá'],
  },
  {
    id: 'signal-2',
    phrase: 'đỉnh nóc kịch trần',
    usageCount: 280,
    firstSeen: '2026-01-10T00:00:00Z',
    growthTrend: 45,
    contextExplanation: 'Cụm từ viral Gen Z Việt Nam, nghĩa là "cực kỳ tuyệt vời, không thể tốt hơn". Xu hướng từ TikTok.',
    sampleComments: ['Chất lượng đỉnh nóc kịch trần luôn!', 'Review này đỉnh nóc kịch trần'],
  },
  {
    id: 'signal-3',
    phrase: 'out trình',
    usageCount: 195,
    firstSeen: '2026-01-08T00:00:00Z',
    growthTrend: 30,
    contextExplanation: 'Từ gaming Việt Nam nghĩa là "vượt trội, giỏi hơn đối thủ". Được dùng rộng rãi ngoài gaming.',
    sampleComments: ['Sản phẩm này out trình tất cả đối thủ', 'Camera out trình flagship khác'],
  },
  {
    id: 'signal-4',
    phrase: 'real G',
    usageCount: 150,
    firstSeen: '2026-01-12T00:00:00Z',
    growthTrend: 15,
    contextExplanation: 'Từ tiếng lóng nghĩa là "người thật, đáng tin". Dùng để khen reviewer/người chia sẻ thật.',
    sampleComments: ['Reviewer này là real G luôn, review thật', 'Brand này real G, không fake review'],
  },
  {
    id: 'signal-5',
    phrase: 'flex',
    usageCount: 420,
    firstSeen: '2025-12-20T00:00:00Z',
    growthTrend: 10,
    contextExplanation: 'Từ tiếng Anh được Việt hóa, nghĩa là "khoe, thể hiện". Phổ biến trên TikTok và Instagram.',
    sampleComments: ['Flex xe mới nhé mọi người', 'Ai flex deal Shopee được nào'],
  },
]
