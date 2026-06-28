import { apiClient } from './client'
import type { GlobalRole } from './auth'
import type { ProjectRole } from './projects'

export type UserStatus = 'INVITED' | 'ACTIVE' | 'INACTIVE'

export interface AdminUser {
  id: string
  email: string
  name: string
  role: GlobalRole
  status: UserStatus
  last_login_at: string | null
  created_at: string
  project_count: number
  avatar?: string
}

export interface AdminUserDetail {
  id: string
  email: string
  name: string
  role: GlobalRole
  status: UserStatus
  last_login_at: string | null
  created_at: string
  avatar?: string
  memberships: {
    project_id: string
    project_name: string
    role: ProjectRole
    joined_at: string
  }[]
}

export interface PaginatedUsers {
  data: AdminUser[]
  total: number
  page: number
  totalPages: number
}

export const adminApi = {
  listUsers: (params?: {
    sortBy?: 'name' | 'role' | 'last_login_at'
    sortDir?: 'asc' | 'desc'
    page?: number
    limit?: number
    q?: string
    role?: GlobalRole[]
    status?: UserStatus[]
  }) => {
    const search = new URLSearchParams()
    if (params?.sortBy) search.set('sortBy', params.sortBy)
    if (params?.sortDir) search.set('sortDir', params.sortDir)
    if (params?.page !== undefined) search.set('page', String(params.page))
    if (params?.limit !== undefined) search.set('limit', String(params.limit))
    if (params?.q) search.set('q', params.q)
    params?.role?.forEach((r) => search.append('role', r))
    params?.status?.forEach((s) => search.append('status', s))
    const qs = search.toString()
    return apiClient.get<PaginatedUsers>(`/admin/users${qs ? `?${qs}` : ''}`).then((r) => r.data)
  },

  getUser: (id: string) => apiClient.get<AdminUserDetail>(`/admin/users/${id}`).then((r) => r.data),

  inviteUser: (data: { name: string; email: string; role: GlobalRole }) =>
    apiClient.post('/admin/users/invite', data).then((r) => r.data),

  updateRole: (id: string, role: GlobalRole) =>
    apiClient.patch(`/admin/users/${id}/role`, { role }).then((r) => r.data),

  disableUser: (id: string) => apiClient.patch(`/admin/users/${id}/disable`).then((r) => r.data),

  enableUser: (id: string) => apiClient.patch(`/admin/users/${id}/enable`).then((r) => r.data),

  removeUser: (id: string) => apiClient.delete(`/admin/users/${id}`).then((r) => r.data),

  removeUserMembership: (userId: string, projectId: string) =>
    apiClient.delete(`/admin/users/${userId}/memberships/${projectId}`).then((r) => r.data),

  resendInvitation: (id: string) =>
    apiClient.post<{ message: string }>(`/admin/users/${id}/resend-invitation`).then((r) => r.data),
}
