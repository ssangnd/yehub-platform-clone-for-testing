import { format, formatDistanceToNow, parseISO } from 'date-fns'

export function formatNumber(num: number): string {
  if (num >= 1_000_000) {
    return `${(num / 1_000_000).toFixed(1)}M`
  }
  if (num >= 1_000) {
    return `${(num / 1_000).toFixed(1)}K`
  }
  return num.toLocaleString()
}

export function formatPercentage(num: number, decimals = 1): string {
  return `${num.toFixed(decimals)}%`
}

export function formatDate(dateStr: string): string {
  return format(parseISO(dateStr), 'MMM d, yyyy')
}

export function formatDateTime(dateStr: string): string {
  return format(parseISO(dateStr), 'MMM d, yyyy HH:mm')
}

export function formatRelativeTime(dateStr: string): string {
  return formatDistanceToNow(parseISO(dateStr), { addSuffix: true })
}

export function formatDateRange(startDate: string, endDate: string): string {
  return `${format(parseISO(startDate), 'MMM d')} - ${format(parseISO(endDate), 'MMM d, yyyy')}`
}
