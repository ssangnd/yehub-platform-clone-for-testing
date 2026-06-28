import type { Platform } from '@/types/filters'

const PLATFORM_PATTERNS: Record<Platform, RegExp> = {
  facebook: /(?:facebook\.com|fb\.com|fb\.watch)/i,
  instagram: /(?:instagram\.com|instagr\.am)/i,
  tiktok: /(?:tiktok\.com|vm\.tiktok\.com)/i,
  youtube: /(?:youtube\.com|youtu\.be)/i,
  threads: /(?:threads\.net|threads\.com)/i,
}

export function detectPlatform(url: string): Platform | null {
  for (const [platform, pattern] of Object.entries(PLATFORM_PATTERNS)) {
    if (pattern.test(url)) {
      return platform as Platform
    }
  }
  return null
}

export function isValidPostUrl(url: string): boolean {
  try {
    new URL(url)
    return detectPlatform(url) !== null
  } catch {
    return false
  }
}
