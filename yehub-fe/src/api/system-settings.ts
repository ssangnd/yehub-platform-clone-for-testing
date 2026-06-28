import { apiClient } from './client'

export type SystemSettingType = 'TEXT' | 'BOOLEAN' | 'NUMBER'

export interface SystemSetting {
  key: string
  type: SystemSettingType
  value: string | boolean | number | null
  updated_at: string
}

export interface PublicSystemSettings {
  logo: { key: string; url: string } | null
}

export interface UpsertSettingPayload {
  type: SystemSettingType
  value_text?: string | null
  value_boolean?: boolean | null
  value_number?: number | null
}

export const systemSettingsApi = {
  getPublic: () => apiClient.get<PublicSystemSettings>('/system-settings/public').then((r) => r.data),

  listAll: () => apiClient.get<SystemSetting[]>('/system-settings').then((r) => r.data),

  upsert: (key: string, data: UpsertSettingPayload) =>
    apiClient.put<SystemSetting>(`/system-settings/${encodeURIComponent(key)}`, data).then((r) => r.data),
}
