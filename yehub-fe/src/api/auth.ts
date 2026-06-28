import { apiClient } from './client'

export type GlobalRole = 'ADMIN' | 'INTERNAL_USER' | 'AUTHORIZED_USER'

export interface SessionInfo {
  id: string
  device_name: string
  os_name: string
  ip_address: string
  location: string | null
  last_active_at: string
  created_at: string
  is_current: boolean
}

interface LoginResponse {
  access_token: string
  refresh_token: string
}

interface InvitationInfo {
  email: string
  name: string
}

export const authApi = {
  login: (email: string, password: string) =>
    apiClient.post<LoginResponse>('/auth/login', { email, password }).then((r) => r.data),

  refreshToken: (refreshToken: string) =>
    apiClient
      .post<{ access_token: string }>('/auth/refresh-token', {
        refresh_token: refreshToken,
      })
      .then((r) => r.data),

  getMe: () =>
    apiClient
      .get<{ id: string; email: string; name: string; avatar?: string; role: GlobalRole }>('/auth/me')
      .then((r) => r.data),

  updateProfile: (data: { name: string; email?: string }) => apiClient.put('/auth/me', data).then((r) => r.data),

  updateAvatar: (avatar: string | null) => apiClient.put('/auth/me/avatar', { avatar }).then((r) => r.data),

  changePassword: (currentPassword: string, newPassword: string) =>
    apiClient
      .patch('/auth/me/password', {
        current_password: currentPassword,
        new_password: newPassword,
      })
      .then((r) => r.data),

  validateInvitation: (token: string) => apiClient.get<InvitationInfo>(`/auth/invitation/${token}`).then((r) => r.data),

  acceptInvitation: (token: string, password: string) =>
    apiClient
      .post<{ message: string }>(`/auth/invitation/${token}/accept`, {
        password,
      })
      .then((r) => r.data),

  forgotPassword: (email: string) =>
    apiClient.post<{ message: string }>('/auth/forgot-password', { email }).then((r) => r.data),

  resetPassword: (token: string, newPassword: string) =>
    apiClient
      .post<{ message: string }>('/auth/reset-password', {
        token,
        new_password: newPassword,
      })
      .then((r) => r.data),

  logout: () => apiClient.post<{ message: string }>('/auth/logout').then((r) => r.data),

  getSessions: () => apiClient.get<SessionInfo[]>('/auth/sessions').then((r) => r.data),

  revokeSession: (sessionId: string) =>
    apiClient.delete<{ message: string }>(`/auth/sessions/${sessionId}`).then((r) => r.data),

  revokeAllOtherSessions: () => apiClient.delete<{ message: string }>('/auth/sessions').then((r) => r.data),
}
