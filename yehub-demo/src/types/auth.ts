export type GlobalRole = 'admin' | 'internal_user' | 'authorized_user'

export type ProjectRole = 'manager' | 'executive' | 'analyst' | 'viewer'

export interface User {
  id: string
  name: string
  email: string
  globalRole: GlobalRole
  avatar?: string
  lastLogin: string
  status: 'active' | 'inactive'
  createdAt: string
}

export type MembershipScope = 'project' | 'campaign'

export interface Membership {
  id: string
  userId: string
  scope: MembershipScope
  scopeId: string
  role: ProjectRole
  addedAt: string
  addedBy: string
}

export interface AuthState {
  user: User | null
  token: string | null
  isAuthenticated: boolean
}
