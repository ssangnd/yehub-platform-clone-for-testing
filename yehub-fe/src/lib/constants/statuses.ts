import type { UserStatus } from '@/api/admin'

export const USER_STATUS_CONFIG: Record<UserStatus, { label: string }> = {
  INVITED: { label: 'Invited' },
  ACTIVE: { label: 'Active' },
  INACTIVE: { label: 'Inactive' },
}
