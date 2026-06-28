import type { Platform } from './filters'

export interface SocialAccount {
  id: string
  platform: Platform
  username: string
  profileUrl: string
  followers: number
  isVerified: boolean
  avatarUrl: string
  lastSyncedAt: string
}

export type Gender = 'male' | 'female' | 'other'

export interface Profile {
  id: string
  name: string
  gender: Gender | null
  tags: string[]
  categories: string[]
  tier: string | null
  email: string | null
  phone: string | null
  totalFollowers: number
  accounts: SocialAccount[]
  linkedPosts: number
  createdAt: string
  updatedAt: string
}
