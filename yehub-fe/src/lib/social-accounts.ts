import type { PlatformType } from '@/api/profiles'

export interface ParseResult {
  ok: boolean
  username?: string
  error?: string
}

interface PlatformConfig {
  url: RegExp
  username: RegExp
  label: string
}

const PATTERNS: Record<PlatformType, PlatformConfig> = {
  FACEBOOK: {
    url: /^https?:\/\/(?:www\.)?(?:facebook|fb)\.com\/([A-Za-z0-9.]{3,})\/?$/i,
    username: /^[A-Za-z0-9.]{3,}$/,
    label: 'Facebook',
  },
  INSTAGRAM: {
    url: /^https?:\/\/(?:www\.)?instagram\.com\/@?([A-Za-z0-9._]{1,30})\/?$/i,
    username: /^[A-Za-z0-9._]{1,30}$/,
    label: 'Instagram',
  },
  TIKTOK: {
    url: /^https?:\/\/(?:www\.)?tiktok\.com\/@([A-Za-z0-9._]{2,24})\/?$/i,
    username: /^[A-Za-z0-9._]{2,24}$/,
    label: 'TikTok',
  },
  YOUTUBE: {
    url: /^https?:\/\/(?:www\.)?youtube\.com\/(?:@|channel\/|c\/|user\/)?([A-Za-z0-9._-]{1,})\/?$/i,
    username: /^[A-Za-z0-9._-]{1,}$/,
    label: 'YouTube',
  },
  THREADS: {
    url: /^https?:\/\/(?:www\.)?threads\.(?:net|com)\/@?([A-Za-z0-9._]{1,30})\/?$/i,
    username: /^[A-Za-z0-9._]{1,30}$/,
    label: 'Threads',
  },
}

export function parseSocialInput(platform: PlatformType, raw: string): ParseResult {
  const trimmed = raw.trim().replace(/^@/, '')
  if (!trimmed) return { ok: false, error: 'Required' }

  const cfg = PATTERNS[platform]

  if (/^https?:\/\//i.test(trimmed)) {
    const m = trimmed.match(cfg.url)
    if (!m) return { ok: false, error: `Invalid ${cfg.label} URL` }
    return { ok: true, username: m[1] }
  }

  if (!cfg.username.test(trimmed)) {
    return { ok: false, error: `Invalid ${cfg.label} username` }
  }
  return { ok: true, username: trimmed }
}
