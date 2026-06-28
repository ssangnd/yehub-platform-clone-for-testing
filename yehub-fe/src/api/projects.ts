import { apiClient } from './client'
import type { GlobalRole } from './auth'
import type { Category } from './categories'

export type ProjectRole = 'MANAGER' | 'EXECUTIVE' | 'ANALYST' | 'VIEWER'

export interface Project {
  id: string
  name: string
  description: string | null
  client_name: string | null
  logo: string | null
  categories: Category[]
  active: boolean
  created_at: string
  updated_at: string
  member_count: number
  campaign_count: number
  planned_campaign_count: number
  active_campaign_count: number
  post_count: number
  comment_count: number
}

export interface ProjectsPage {
  data: Project[]
  total: number
  page: number
  totalPages: number
}

export interface ProjectMember {
  user_id: string
  email: string
  name: string
  avatar?: string
  role: ProjectRole
  joined_at: string
  global_role: GlobalRole
}

export interface CreateProjectPayload {
  name: string
  description?: string | null
  client_name?: string | null
  logo?: string | null
  category_ids?: string[]
}

export type UpdateProjectPayload = CreateProjectPayload

export const projectsApi = {
  createProject: (data: CreateProjectPayload) => apiClient.post<Project>('/projects', data),

  listProjects: (params?: { q?: string; page?: number; limit?: number; active?: boolean }) =>
    apiClient.get<ProjectsPage>('/projects', { params }).then((r) => r.data),

  getProject: (id: string) => apiClient.get<Project>(`/projects/${id}`),

  updateProject: (id: string, data: UpdateProjectPayload) => apiClient.put<Project>(`/projects/${id}`, data),

  archiveProject: (id: string) => apiClient.delete(`/projects/${id}`),

  unarchiveProject: (id: string) => apiClient.post<Project>(`/projects/${id}/unarchive`),

  getMyRole: (projectId: string) =>
    apiClient.get<{ role: ProjectRole; joined_at: string }>(`/projects/${projectId}/me`),

  listMembers: (projectId: string) => apiClient.get<ProjectMember[]>(`/projects/${projectId}/members`),

  addMember: (projectId: string, data: { user_id: string; role: ProjectRole }) =>
    apiClient.post<ProjectMember>(`/projects/${projectId}/members`, data),

  updateMember: (projectId: string, userId: string, role: ProjectRole) =>
    apiClient.patch<ProjectMember>(`/projects/${projectId}/members/${userId}`, {
      role,
    }),

  removeMember: (projectId: string, userId: string) => apiClient.delete(`/projects/${projectId}/members/${userId}`),

  getNonMembers: (projectId: string, params?: { q?: string; limit?: number }) =>
    apiClient
      .get<
        { id: string; email: string; name: string; avatar?: string; global_role: GlobalRole }[]
      >(`/projects/${projectId}/non-members`, { params })
      .then((r) => r.data),
}
