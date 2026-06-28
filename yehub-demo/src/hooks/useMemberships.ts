import { useMemo } from 'react'
import { mockMemberships } from '@/mocks/fixtures/memberships'
import { mockUsers } from '@/mocks/fixtures/users'
import { mockProjects } from '@/mocks/fixtures/projects'
import { mockCampaigns } from '@/mocks/fixtures/campaigns'
import type { User, Membership } from '@/types/auth'
import type { Project } from '@/types/project'
import type { Campaign } from '@/types/campaign'

export interface ProjectMember {
  membership: Membership
  user: User
}

export type UserMembership =
  | { scope: 'project'; membership: Membership; project: Project }
  | { scope: 'campaign'; membership: Membership; campaign: Campaign }

export function useProjectMembers(projectId: string): ProjectMember[] {
  return useMemo(
    () =>
      mockMemberships
        .filter(m => m.scope === 'project' && m.scopeId === projectId)
        .map(m => {
          const user = mockUsers.find(u => u.id === m.userId)
          return user ? { membership: m, user } : null
        })
        .filter((m): m is ProjectMember => m !== null),
    [projectId]
  )
}

export function useUserMemberships(userId: string): UserMembership[] {
  return useMemo(
    () =>
      mockMemberships
        .filter(m => m.userId === userId)
        .map(m => {
          if (m.scope === 'project') {
            const project = mockProjects.find(p => p.id === m.scopeId)
            return project ? { scope: 'project' as const, membership: m, project } : null
          } else {
            const campaign = mockCampaigns.find(c => c.id === m.scopeId)
            return campaign ? { scope: 'campaign' as const, membership: m, campaign } : null
          }
        })
        .filter((m): m is UserMembership => m !== null),
    [userId]
  )
}

export interface CampaignMemberInherited {
  membership: Membership
  user: User
  source: 'inherited'
}

export interface CampaignMemberDirect {
  membership: Membership
  user: User
  source: 'direct'
}

export type CampaignMember = CampaignMemberInherited | CampaignMemberDirect

export function useCampaignMembers(campaignId: string): { inherited: CampaignMemberInherited[]; direct: CampaignMemberDirect[] } {
  return useMemo(() => {
    const campaign = mockCampaigns.find(c => c.id === campaignId)
    if (!campaign) return { inherited: [], direct: [] }

    const inherited = mockMemberships
      .filter(m => m.scope === 'project' && m.scopeId === campaign.projectId)
      .map(m => {
        const user = mockUsers.find(u => u.id === m.userId)
        return user ? { membership: m, user, source: 'inherited' as const } : null
      })
      .filter((m): m is CampaignMemberInherited => m !== null)

    const direct = mockMemberships
      .filter(m => m.scope === 'campaign' && m.scopeId === campaignId)
      .map(m => {
        const user = mockUsers.find(u => u.id === m.userId)
        return user ? { membership: m, user, source: 'direct' as const } : null
      })
      .filter((m): m is CampaignMemberDirect => m !== null)

    return { inherited, direct }
  }, [campaignId])
}
