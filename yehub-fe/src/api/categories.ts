import { apiClient } from './client'

export interface Category {
  id: string
  name: string
  project_count?: number
}

export const categoriesApi = {
  list: (): Promise<Category[]> => apiClient.get<Category[]>('/categories').then((r) => r.data),

  create: (name: string): Promise<Category> => apiClient.post<Category>('/categories', { name }).then((r) => r.data),

  update: (id: string, name: string): Promise<Category> =>
    apiClient.put<Category>(`/categories/${id}`, { name }).then((r) => r.data),

  remove: (id: string) => apiClient.delete(`/categories/${id}`),
}
