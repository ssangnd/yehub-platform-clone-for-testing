import { useAuth } from '@/hooks/useAuth'
import { mockMemberships } from '@/mocks/fixtures/memberships'
import type { ProjectRole } from '@/types/auth'

export function useProjectRole(projectId: string): ProjectRole | null {
  const { user } = useAuth()
  if (!user) return null

  const membership = mockMemberships.find(
    m => m.scope === 'project' && m.userId === user.id && m.scopeId === projectId
  )

  if (membership) return membership.role

  // Admins get implicit manager access (full control) to all projects
  if (user.globalRole === 'admin') return 'manager'

  return null
}
