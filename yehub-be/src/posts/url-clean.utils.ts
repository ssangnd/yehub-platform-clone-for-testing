import { Platform } from '../../generated/prisma/client';

/**
 * Query params that carry post identity for each platform and must be kept.
 * Everything else (utm_*, _r, _t, xmt, slof, is_from_webapp, sender_device,
 * web_id, fbclid, ...) is stripped. Platforms whose identity lives entirely in
 * the path have an empty whitelist, so all params are removed.
 */
const PLATFORM_PARAM_WHITELIST: Record<Platform, string[]> = {
  YOUTUBE: ['v'],
  FACEBOOK: ['fbid', 'story_fbid', 'v'],
  INSTAGRAM: [],
  TIKTOK: [],
  THREADS: [],
};

/**
 * Remove tracking params and fragments from a post URL, keeping only the
 * params whitelisted for the given platform. Must run AFTER platform detection
 * (detection regexes read params like story_fbid / fbid / v) and AFTER any
 * redirect resolution. Returns the input unchanged if it cannot be parsed.
 */
export function cleanPostUrl(url: string, platform: Platform): string {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return url;
  }

  const allowed = new Set(PLATFORM_PARAM_WHITELIST[platform]);
  for (const key of [...parsed.searchParams.keys()]) {
    if (!allowed.has(key)) {
      parsed.searchParams.delete(key);
    }
  }

  parsed.hash = '';

  return parsed.toString();
}
