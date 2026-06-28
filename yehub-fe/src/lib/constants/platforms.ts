export const PLATFORM_COLORS: Record<string, string> = {
  FACEBOOK: 'bg-blue-100 text-blue-700',
  INSTAGRAM: 'bg-pink-100 text-pink-700',
  TIKTOK: 'bg-gray-100 text-gray-700',
  YOUTUBE: 'bg-red-100 text-red-700',
  THREADS: 'bg-purple-100 text-purple-700',
}

export const PLATFORMS = [
  { value: 'FACEBOOK', label: 'Facebook' },
  { value: 'INSTAGRAM', label: 'Instagram' },
  { value: 'TIKTOK', label: 'TikTok' },
  { value: 'YOUTUBE', label: 'YouTube' },
  { value: 'THREADS', label: 'Threads' },
] as const

export const PLATFORM_OPTIONS = [
  { value: '', label: 'All platforms' },
  { value: 'FACEBOOK', label: 'Facebook' },
  { value: 'INSTAGRAM', label: 'Instagram' },
  { value: 'TIKTOK', label: 'TikTok' },
  { value: 'YOUTUBE', label: 'YouTube' },
  { value: 'THREADS', label: 'Threads' },
] as const

export const PLATFORM_BRAND: Record<string, { label: string; color: string }> = {
  FACEBOOK: { label: 'Facebook', color: '#1877F2' },
  INSTAGRAM: { label: 'Instagram', color: '#C13584' },
  TIKTOK: { label: 'TikTok', color: '#69C9D0' },
  YOUTUBE: { label: 'YouTube', color: '#FF0000' },
  THREADS: { label: 'Threads', color: '#000000' },
}
