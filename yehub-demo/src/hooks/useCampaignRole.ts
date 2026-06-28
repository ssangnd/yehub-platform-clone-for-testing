import { useAuth } from '@/hooks/useAuth'
import { mockMemberships } from '@/mocks/fixtures/memberships'
import { mockCampaigns } from '@/mocks/fixtures/campaigns'
import type { ProjectRole } from '@/types/auth'

export function useCampaignRole(campaignId: string): ProjectRole | null {
  const { user } = useAuth()
  if (!user) return null

  const campaign = mockCampaigns.find(c => c.id === campaignId)
  if (!campaign) return null

  // 1. Check project-level membership (inherited, takes precedence)
  const projectMembership = mockMemberships.find(
    m => m.scope === 'project' && m.userId === user.id && m.scopeId === campaign.projectId
  )
  if (projectMembership) return projectMembership.role

  // 2. Check campaign-level membership (direct)
  const campaignMembership = mockMemberships.find(
    m => m.scope === 'campaign' && m.userId === user.id && m.scopeId === campaignId
  )
  if (campaignMembership) return campaignMembership.role

  // 3. Admin fallback
  if (user.globalRole === 'admin') return 'manager'

  return null
}
