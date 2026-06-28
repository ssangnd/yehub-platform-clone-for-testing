import type { CampaignStatus } from '@/types/campaign'

export const STATUS_CONFIG: Record<CampaignStatus, {
  label: string
  color: string
  bgClass: string
}> = {
  draft: { label: 'Draft', color: '#6B7280', bgClass: 'bg-gray-500/10 text-gray-500' },
  active: { label: 'Active', color: '#22C55E', bgClass: 'bg-green-500/10 text-green-500' },
  paused: { label: 'Paused', color: '#F59E0B', bgClass: 'bg-yellow-500/10 text-yellow-500' },
  completed: { label: 'Completed', color: '#3B82F6', bgClass: 'bg-blue-500/10 text-blue-500' },
  stopped: { label: 'Stopped', color: '#EF4444', bgClass: 'bg-red-500/10 text-red-500' },
}
