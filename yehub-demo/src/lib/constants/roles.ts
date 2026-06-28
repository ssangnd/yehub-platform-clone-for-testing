import type { GlobalRole, ProjectRole } from '@/types/auth'

export type GlobalModule = 'profiles' | 'dashboard' | 'users'
export type ModuleAction = 'read' | 'write'

export const GLOBAL_ROLE_CONFIG: Record<GlobalRole, {
  label: string
  description: string
}> = {
  admin: {
    label: 'Admin',
    description: 'Full access to all platform features and settings. Can manage users, configure the system, and oversee all projects and global modules.',
  },
  internal_user: {
    label: 'Internal User',
    description: 'Manages profiles across the platform and monitors performance through dashboards and trending content. Cannot access system settings or manage users.',
  },
  authorized_user: {
    label: 'Authorized User',
    description: 'Standard access with no global module permissions. Can only work within the projects and campaigns they are assigned to.',
  },
}

const GLOBAL_MODULE_PERMISSIONS: Record<GlobalRole, Record<GlobalModule, ModuleAction[]>> = {
  admin: {
    profiles: ['read', 'write'],
    dashboard: ['read'],
    users: ['read', 'write'],
  },
  internal_user: {
    profiles: ['read', 'write'],
    dashboard: ['read'],
    users: [],
  },
  authorized_user: {
    profiles: ['read'],
    dashboard: [],
    users: [],
  },
}

export function hasGlobalModuleAccess(
  role: GlobalRole,
  module: GlobalModule,
  action: ModuleAction
): boolean {
  return GLOBAL_MODULE_PERMISSIONS[role][module].includes(action)
}

export const PROJECT_ROLE_CONFIG: Record<ProjectRole, {
  label: string
  description: string
  permissions: string[]
}> = {
  manager: {
    label: 'Manager',
    description: 'Manage campaigns and content, invite members',
    permissions: ['manage_members', 'manage_campaigns', 'view_all', 'export', 'manage_alerts'],
  },
  executive: {
    label: 'Executive',
    description: 'View all data across projects, export reports',
    permissions: ['view_all', 'export'],
  },
  analyst: {
    label: 'Analyst',
    description: 'Analyze data, create reports, manage campaigns',
    permissions: ['manage_campaigns', 'view_all', 'export'],
  },
  viewer: {
    label: 'Viewer',
    description: 'View-only access to project data',
    permissions: ['view_all'],
  },
}

export function hasPermission(role: ProjectRole, permission: string): boolean {
  return PROJECT_ROLE_CONFIG[role].permissions.includes(permission)
}
