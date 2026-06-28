import type { GlobalRole } from '@/api/auth'
import type { ProjectRole } from '@/api/projects'

export const GLOBAL_ROLE_CONFIG: Record<GlobalRole, { label: string; description: string }> = {
  ADMIN: {
    label: 'Admin',
    description:
      'Full access to all platform features and settings. Can manage users, configure the system, and oversee all projects.',
  },
  INTERNAL_USER: {
    label: 'Internal User',
    description: 'Manages profiles and monitors dashboards. Cannot access system settings or manage users.',
  },
  AUTHORIZED_USER: {
    label: 'Authorized User',
    description: 'Standard access limited to assigned projects only.',
  },
}

export const PROJECT_ROLE_CONFIG: Record<
  ProjectRole,
  {
    label: string
    description: string
  }
> = {
  MANAGER: {
    label: 'Manager',
    description: 'Manage campaigns and content, invite members',
  },
  EXECUTIVE: {
    label: 'Executive',
    description: 'View all data across projects, export reports',
  },
  ANALYST: {
    label: 'Analyst',
    description: 'Analyze data, create reports, manage campaigns',
  },
  VIEWER: {
    label: 'Viewer',
    description: 'View-only access to project data',
  },
}
