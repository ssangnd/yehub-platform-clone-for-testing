import { format, parseISO } from 'date-fns'

export function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return n.toString()
}

export function formatDisplayUrl(url: string): string {
  return url.replace(/^https?:\/\/(www\.)?/, '')
}

// Apify run costs are tiny (fractions of a cent), so keep up to 4 decimals.
const usdFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 4,
})

export function formatUsd(amount: number): string {
  return usdFormatter.format(amount)
}

export function formatInterval(seconds: number | null): string {
  if (seconds == null) return '—'
  if (seconds === 0) return 'Manual'
  if (seconds < 3600) return `${Math.round(seconds / 60)}min`
  if (seconds < 86400) return `${Math.round(seconds / 3600)}hr`
  return `${Math.round(seconds / 86400)}d`
}

export function formatDate(dateStr: string): string {
  return format(parseISO(dateStr), 'MMM d, yyyy')
}

export function formatDateRange(start: string | null, end: string | null): string {
  if (!start && !end) return '—'
  if (start && end) {
    const s = parseISO(start)
    const e = parseISO(end)
    if (s.getFullYear() === e.getFullYear()) {
      return `${format(s, 'MMM d')} - ${format(e, 'MMM d, yyyy')}`
    }
    return `${formatDate(start)} - ${formatDate(end)}`
  }
  if (start) return `From ${formatDate(start)}`
  return `Until ${formatDate(end!)}`
}

const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })

const MINUTE = 60
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR
const MONTH = 30 * DAY
const YEAR = 365 * DAY

export function formatRelativeTime(dateString: string): string {
  const diffSecs = Math.round((Date.now() - new Date(dateString).getTime()) / 1000)

  if (diffSecs < MINUTE) return 'just now'
  if (diffSecs < HOUR) return rtf.format(-Math.floor(diffSecs / MINUTE), 'minute')
  if (diffSecs < DAY) return rtf.format(-Math.floor(diffSecs / HOUR), 'hour')
  if (diffSecs < MONTH) return rtf.format(-Math.floor(diffSecs / DAY), 'day')
  if (diffSecs < YEAR) return rtf.format(-Math.floor(diffSecs / MONTH), 'month')
  return rtf.format(-Math.floor(diffSecs / YEAR), 'year')
}
