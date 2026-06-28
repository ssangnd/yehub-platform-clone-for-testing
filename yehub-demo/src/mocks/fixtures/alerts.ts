import type { AlertRule, AlertNotification } from '@/types/alert'

export const mockAlertRules: AlertRule[] = [
  { id: 'rule-1', name: 'Volume Spike - Vinamilk', type: 'volume_spike', threshold: 200, thresholdUnit: 'percentage', campaignIds: ['camp-1', 'camp-2'], status: 'active', createdAt: '2026-01-10T00:00:00Z', updatedAt: '2026-02-06T00:00:00Z' },
  { id: 'rule-2', name: 'Negative Sentiment Alert', type: 'sentiment_drop', threshold: 30, thresholdUnit: 'percentage', campaignIds: ['camp-1', 'camp-6', 'camp-10'], status: 'active', createdAt: '2026-01-12T00:00:00Z', updatedAt: '2026-02-06T00:00:00Z' },
  { id: 'rule-3', name: 'Competitor Mention', type: 'keyword_detection', threshold: 10, thresholdUnit: 'count', keywords: ['TH True Milk', 'Dutch Lady', 'Abbott'], campaignIds: ['camp-1', 'camp-2', 'camp-4'], status: 'active', createdAt: '2026-01-15T00:00:00Z', updatedAt: '2026-02-06T00:00:00Z' },
  { id: 'rule-4', name: 'VinFast Negative Spike', type: 'sentiment_drop', threshold: 25, thresholdUnit: 'percentage', campaignIds: ['camp-13', 'camp-14'], status: 'active', createdAt: '2026-01-20T00:00:00Z', updatedAt: '2026-02-06T00:00:00Z' },
  { id: 'rule-5', name: 'Shopee Crisis Monitor', type: 'volume_spike', threshold: 300, thresholdUnit: 'percentage', campaignIds: ['camp-10'], status: 'paused', createdAt: '2026-01-08T00:00:00Z', updatedAt: '2026-02-01T00:00:00Z' },
]

export const mockAlertNotifications: AlertNotification[] = [
  { id: 'notif-1', ruleId: 'rule-1', ruleName: 'Volume Spike - Vinamilk', type: 'volume_spike', message: 'Comment volume tăng 250% trong 2 giờ qua', details: 'Campaign "Organic Milk TVC" nhận 450 comments trong 2 giờ, so với trung bình 180 comments/2h', isRead: false, triggeredAt: '2026-02-06T09:30:00Z', campaignId: 'camp-1', campaignName: 'Organic Milk TVC' },
  { id: 'notif-2', ruleId: 'rule-2', ruleName: 'Negative Sentiment Alert', type: 'sentiment_drop', message: 'Sentiment tiêu cực tăng lên 35%', details: 'Campaign "GrabFood Promo" có tỉ lệ negative sentiment tăng từ 12% lên 35% trong 24h qua', isRead: false, triggeredAt: '2026-02-06T08:15:00Z', campaignId: 'camp-6', campaignName: 'GrabFood Promo' },
  { id: 'notif-3', ruleId: 'rule-3', ruleName: 'Competitor Mention', type: 'keyword_detection', message: 'Phát hiện 15 mentions "TH True Milk"', details: 'Từ khóa "TH True Milk" xuất hiện 15 lần trong comments campaign "Organic Milk TVC" trong 6h qua', isRead: true, triggeredAt: '2026-02-05T16:00:00Z', campaignId: 'camp-1', campaignName: 'Organic Milk TVC' },
  { id: 'notif-4', ruleId: 'rule-4', ruleName: 'VinFast Negative Spike', type: 'sentiment_drop', message: 'Sentiment tiêu cực VF 7 tăng đột biến', details: 'Campaign "VF 7 Launch" có negative sentiment tăng lên 28% sau bài đăng công bố giá', isRead: true, triggeredAt: '2026-02-04T14:30:00Z', campaignId: 'camp-13', campaignName: 'VF 7 Launch' },
  { id: 'notif-5', ruleId: 'rule-1', ruleName: 'Volume Spike - Vinamilk', type: 'volume_spike', message: 'Comment volume spike trên TikTok', details: 'Video KOL nhận 800 comments trong 1 giờ, gấp 4 lần trung bình', isRead: true, triggeredAt: '2026-02-03T20:00:00Z', campaignId: 'camp-2', campaignName: 'KOL Collaboration Q1' },
  { id: 'notif-6', ruleId: 'rule-2', ruleName: 'Negative Sentiment Alert', type: 'sentiment_drop', message: 'Tết Sale comments tiêu cực tăng', details: 'Shopee Tết Sale campaign có 320 negative comments về giao hàng chậm trong ngày', isRead: true, triggeredAt: '2026-02-02T10:00:00Z', campaignId: 'camp-10', campaignName: 'Tết Sale 2026' },
]
