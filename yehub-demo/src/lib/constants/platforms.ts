import type { Platform } from '@/types/filters'

export const PLATFORM_CONFIG: Record<Platform, {
  label: string
  color: string
  bgColor: string
  textColor: string
}> = {
  facebook: {
    label: 'Facebook',
    color: '#1877F2',
    bgColor: 'bg-[#1877F2]',
    textColor: 'text-[#1877F2]',
  },
  instagram: {
    label: 'Instagram',
    color: '#C13584',
    bgColor: 'bg-[#C13584]',
    textColor: 'text-[#C13584]',
  },
  tiktok: {
    label: 'TikTok',
    color: '#69C9D0',
    bgColor: 'bg-[#69C9D0]',
    textColor: 'text-[#69C9D0]',
  },
  youtube: {
    label: 'YouTube',
    color: '#FF0000',
    bgColor: 'bg-[#FF0000]',
    textColor: 'text-[#FF0000]',
  },
  threads: {
    label: 'Threads',
    color: '#000000',
    bgColor: 'bg-[#000000] dark:bg-white',
    textColor: 'text-[#000000] dark:text-white',
  },
}

export const PLATFORMS: Platform[] = ['facebook', 'instagram', 'tiktok', 'youtube', 'threads']
