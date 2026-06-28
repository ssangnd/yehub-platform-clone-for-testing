import { apiClient } from './client'

export type Gender = 'MALE' | 'FEMALE' | 'OTHER'
export type PlatformType = 'FACEBOOK' | 'INSTAGRAM' | 'TIKTOK' | 'YOUTUBE' | 'THREADS'

export interface ProfileAccount {
  id: string
  platform: PlatformType
  platformUserId: string
  username: string | null
  displayName: string | null
  followerCount: number
  isVerified: boolean
  createdAt: string
  lastPolledAt: string | null
  lastPollStatus: 'success' | 'failed' | 'conflict' | null
  linkedPostCount: number
}

export interface ProfileCategory {
  id: string
  name: string
  color: string
}

export interface ProfileTier {
  id: string
  name: string
  color: string
}

export interface Profile {
  id: string
  name: string
  description: string | null
  gender: Gender | null
  email: string | null
  phone: string | null
  avatar: string | null
  tags: string[]
  tier: ProfileTier | null
  categories: ProfileCategory[]
  totalFollowers: number
  accounts: ProfileAccount[]
  createdAt: string
  updatedAt: string
}

export type ProfileDetail = Profile

export interface ProfilesPage {
  data: Profile[]
  meta: {
    total: number
    page: number
    limit: number
    totalPages: number
  }
}

export interface ListProfilesParams {
  search?: string
  categoryIds?: string
  tierIds?: string
  platforms?: string
  genders?: string
  tags?: string
  page?: number
  limit?: number
  sortBy?: string
  sortOrder?: string
}

export interface CreateProfilePayload {
  name: string
  description?: string
  gender?: Gender
  email?: string
  phone?: string
  avatar?: string
  tags?: string[]
  tierId: string
  categoryIds?: string[]
  socialAccounts?: { platform: PlatformType; url: string }[]
}

export interface UpdateProfilePayload {
  name: string
  description?: string | null
  gender: Gender
  email?: string | null
  phone?: string | null
  avatar?: string | null
  tags?: string[]
  tierId: string
  categoryIds: string[]
}

export interface LinkAccountPayload {
  platform: PlatformType
  username: string
  displayName?: string
  platformUserId?: string
}

export const profilesApi = {
  list: (params?: ListProfilesParams) => apiClient.get<ProfilesPage>('/profiles', { params }).then((r) => r.data),

  listTags: () => apiClient.get<string[]>('/profiles/tags').then((r) => r.data),

  get: (id: string) => apiClient.get<ProfileDetail>(`/profiles/${id}`).then((r) => r.data),

  create: (data: CreateProfilePayload) => apiClient.post<Profile>('/profiles', data).then((r) => r.data),

  update: (id: string, data: UpdateProfilePayload) =>
    apiClient.put<Profile>(`/profiles/${id}`, data).then((r) => r.data),

  delete: (id: string) => apiClient.delete(`/profiles/${id}`),

  linkAccount: (profileId: string, data: LinkAccountPayload) =>
    apiClient.post<ProfileAccount>(`/profiles/${profileId}/accounts`, data).then((r) => r.data),

  unlinkAccount: (profileId: string, accountId: string) =>
    apiClient.delete(`/profiles/${profileId}/accounts/${accountId}`),

  moveAccount: (profileId: string, accountId: string, targetProfileId: string) =>
    apiClient.patch(`/profiles/${profileId}/accounts/${accountId}/move`, { targetProfileId }),

  pollAccount: (profileId: string, accountId: string) =>
    apiClient.post<{ queued: boolean }>(`/profiles/${profileId}/accounts/${accountId}/poll`).then((r) => r.data),
}
