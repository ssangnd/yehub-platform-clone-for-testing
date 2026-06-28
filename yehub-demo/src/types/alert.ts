export type AlertType = 'volume_spike' | 'sentiment_drop' | 'keyword_detection'

export type AlertStatus = 'active' | 'paused'

export interface AlertRule {
  id: string
  name: string
  type: AlertType
  threshold: number
  thresholdUnit: 'count' | 'percentage'
  keywords?: string[]
  campaignIds: string[]
  status: AlertStatus
  createdAt: string
  updatedAt: string
}

export interface AlertNotification {
  id: string
  ruleId: string
  ruleName: string
  type: AlertType
  message: string
  details: string
  isRead: boolean
  triggeredAt: string
  campaignId: string
  campaignName: string
}
