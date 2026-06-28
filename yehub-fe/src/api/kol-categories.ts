import { apiClient } from './client'

export interface KolCategory {
  id: string
  name: string
  description: string | null
  color: string
  profileCount: number
  createdAt: string
  updatedAt: string
}

export interface CreateKolCategoryPayload {
  name: string
  description?: string | null
  color?: string
}

export type UpdateKolCategoryPayload = CreateKolCategoryPayload

export const kolCategoriesApi = {
  list: () => apiClient.get<KolCategory[]>('/kol-categories').then((r) => r.data),

  get: (id: string) => apiClient.get<KolCategory>(`/kol-categories/${id}`).then((r) => r.data),

  create: (data: CreateKolCategoryPayload) => apiClient.post<KolCategory>('/kol-categories', data).then((r) => r.data),

  update: (id: string, data: UpdateKolCategoryPayload) =>
    apiClient.put<KolCategory>(`/kol-categories/${id}`, data).then((r) => r.data),

  delete: (id: string) => apiClient.delete(`/kol-categories/${id}`),
}
