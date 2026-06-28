import type { ProjectRole } from '../api/projects'
import type { GlobalRole } from '../api/auth'

type ProjectAction =
  | 'edit'
  | 'manage_members'
  | 'export'
  | 'search'
  | 'create_campaign'
  | 'configure_alerts'
  | 'edit_campaign'
  | 'delete_campaign'
  | 'manage_posts'
  | 'delete_post'
  | 'view_spending'

type GlobalAction = 'create_project' | 'manage_users' | 'delete_profile' | 'view_profiles'

const projectPermissions: Record<ProjectAction, ProjectRole[]> = {
  edit: ['MANAGER'],
  manage_members: ['MANAGER'],
  create_campaign: ['MANAGER', 'EXECUTIVE'],
  configure_alerts: ['MANAGER'],
  edit_campaign: ['MANAGER', 'EXECUTIVE'],
  delete_campaign: ['MANAGER'],
  manage_posts: ['MANAGER', 'EXECUTIVE'],
  delete_post: ['MANAGER'],
  view_spending: ['MANAGER'],
  search: ['MANAGER', 'EXECUTIVE', 'ANALYST'],
  export: ['MANAGER', 'EXECUTIVE', 'ANALYST'],
}

const globalPermissions: Record<GlobalAction, GlobalRole[]> = {
  create_project: ['ADMIN', 'INTERNAL_USER'],
  manage_users: ['ADMIN'],
  delete_profile: ['ADMIN', 'INTERNAL_USER'],
  view_profiles: ['ADMIN', 'INTERNAL_USER'],
}

export function useCanProject(action: ProjectAction, myRole: ProjectRole | null): boolean {
  if (!myRole) return false
  return projectPermissions[action].includes(myRole)
}

export function useCanGlobal(action: GlobalAction, myRole: GlobalRole | null): boolean {
  if (!myRole) return false
  return globalPermissions[action].includes(myRole)
}

// Backward-compatible alias
export function useCan(action: ProjectAction, myRole: ProjectRole | null): boolean {
  return useCanProject(action, myRole)
}
