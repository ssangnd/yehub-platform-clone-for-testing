// Hosts we recognise as social profile URLs. Matching one of these (or an
// explicit http(s):// / www. prefix) is what makes us treat the input as a URL
// to parse rather than a plain search term.
const SOCIAL_HOSTS = [
  'instagram.com',
  'tiktok.com',
  'youtube.com',
  'youtu.be',
  'facebook.com',
  'fb.com',
  'm.facebook.com',
  'threads.net',
  'threads.com',
]

// YouTube routes where the handle/name lives in the segment *after* the prefix
// (e.g. youtube.com/c/Name, youtube.com/user/Name, youtube.com/channel/ID).
const NESTED_HANDLE_PREFIXES = new Set(['c', 'user', 'channel'])

function stripHandle(segment: string): string {
  return segment.replace(/^@/, '')
}

/**
 * If the input looks like a social media profile URL, extract the account
 * username/handle from it so it can be passed to the existing profile search
 * (which matches against social account usernames). Non-URL input — a normal
 * name or a bare handle — is returned unchanged.
 *
 * Examples:
 *   "https://instagram.com/john.doe"      -> "john.doe"
 *   "tiktok.com/@john.doe"                -> "john.doe"
 *   "https://youtube.com/@johndoe"        -> "johndoe"
 *   "youtube.com/c/JohnDoe"               -> "JohnDoe"
 *   "facebook.com/johndoe/"               -> "johndoe"
 *   "John Doe"                            -> "John Doe"  (unchanged)
 */
export function parseSocialUrlToUsername(input: string): string {
  const trimmed = input.trim()
  if (!trimmed) return trimmed

  const lower = trimmed.toLowerCase()
  const looksLikeUrl =
    /^https?:\/\//.test(lower) || lower.startsWith('www.') || SOCIAL_HOSTS.some((host) => lower.includes(host))
  if (!looksLikeUrl) return trimmed

  let url: URL
  try {
    url = new URL(/^https?:\/\//.test(trimmed) ? trimmed : `https://${trimmed}`)
  } catch {
    return trimmed
  }

  const segments = url.pathname.split('/').filter(Boolean)
  if (segments.length === 0) return trimmed

  // tiktok.com/@user, youtube.com/@handle, threads.net/@user
  const handleSegment = segments.find((segment) => segment.startsWith('@'))
  if (handleSegment) return stripHandle(handleSegment)

  // youtube.com/c/Name, youtube.com/user/Name, youtube.com/channel/ID
  const [first, second] = segments
  if (NESTED_HANDLE_PREFIXES.has(first.toLowerCase())) {
    return second ? stripHandle(second) : trimmed
  }

  // facebook.com/profile.php?id=... has no username in the path
  if (first.toLowerCase() === 'profile.php') return trimmed

  // instagram.com/user, facebook.com/user, etc.
  return stripHandle(first)
}
