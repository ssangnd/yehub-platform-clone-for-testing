import { apiClient } from './client'

export interface KolTier {
  id: string
  name: string
  description: string | null
  color: string
  minFollowers: number
  maxFollowers: number | null
  profileCount: number
  createdAt: string
  updatedAt: string
}

export interface CreateKolTierPayload {
  name: string
  description?: string | null
  color?: string
  minFollowers: number
  maxFollowers?: number | null
}

export type UpdateKolTierPayload = CreateKolTierPayload

export const kolTiersApi = {
  list: () => apiClient.get<KolTier[]>('/kol-tiers').then((r) => r.data),

  get: (id: string) => apiClient.get<KolTier>(`/kol-tiers/${id}`).then((r) => r.data),

  create: (data: CreateKolTierPayload) => apiClient.post<KolTier>('/kol-tiers', data).then((r) => r.data),

  update: (id: string, data: UpdateKolTierPayload) =>
    apiClient.put<KolTier>(`/kol-tiers/${id}`, data).then((r) => r.data),

  delete: (id: string) => apiClient.delete(`/kol-tiers/${id}`),
}
