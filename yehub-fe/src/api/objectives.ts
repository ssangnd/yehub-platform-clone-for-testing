import { apiClient } from './client'

export interface Objective {
  id: string
  name: string
  campaign_count?: number
}

export const objectivesApi = {
  list: (): Promise<Objective[]> => apiClient.get<Objective[]>('/objectives').then((r) => r.data),

  create: (name: string): Promise<Objective> => apiClient.post<Objective>('/objectives', { name }).then((r) => r.data),

  update: (id: string, name: string): Promise<Objective> =>
    apiClient.put<Objective>(`/objectives/${id}`, { name }).then((r) => r.data),

  remove: (id: string) => apiClient.delete(`/objectives/${id}`),
}
