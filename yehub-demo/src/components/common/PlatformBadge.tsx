import { Facebook, Instagram, Youtube } from 'lucide-react'
import { cn } from '@/lib/utils'
import { PLATFORM_CONFIG } from '@/lib/constants/platforms'
import type { Platform } from '@/types/filters'

interface PlatformBadgeProps {
  platform: Platform
  showLabel?: boolean
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

function PlatformIcon({ platform, className, style }: { platform: Platform; className?: string; style?: React.CSSProperties }) {
  switch (platform) {
    case 'facebook':
      return <Facebook className={className} style={style} />
    case 'instagram':
      return <Instagram className={className} style={style} />
    case 'youtube':
      return <Youtube className={className} style={style} />
    case 'tiktok':
      return (
        <svg className={className} style={style} viewBox="0 0 24 24" fill="currentColor">
          <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1v-3.5a6.37 6.37 0 0 0-.79-.05A6.34 6.34 0 0 0 3.16 15a6.34 6.34 0 0 0 6.33 6.33 6.34 6.34 0 0 0 6.33-6.33V8.28a8.28 8.28 0 0 0 4.82 1.55V6.37a4.85 4.85 0 0 1-1.05.32z"/>
        </svg>
      )
    case 'threads':
      return (
        <svg className={className} style={style} viewBox="0 0 24 24" fill="currentColor">
          <path d="M12.186 24h-.007c-3.581-.024-6.334-1.205-8.184-3.509C2.35 18.44 1.5 15.586 1.472 12.01v-.017c.03-3.579.879-6.43 2.525-8.482C5.845 1.205 8.6.024 12.18 0h.014c2.746.02 5.043.725 6.826 2.098 1.677 1.29 2.858 3.13 3.509 5.467l-2.773.726c-1.07-3.85-3.522-5.573-7.562-5.6-2.612.02-4.583.891-5.862 2.587-1.2 1.592-1.83 3.892-1.854 6.727.025 2.834.655 5.132 1.854 6.726 1.28 1.698 3.25 2.569 5.862 2.587 2.157-.013 3.788-.543 4.989-1.62 1.37-1.228 1.986-2.953 1.832-5.127-.09-1.263-.498-2.246-1.201-2.896-.665-.614-1.543-.942-2.594-.975a4.2 4.2 0 0 0-.407.02c-.9.084-1.63.395-2.13.93-.444.474-.7 1.09-.745 1.789.07.93.468 1.554 1.212 1.903.367.17.792.263 1.242.28l-.188 2.694c-.84-.058-1.626-.27-2.318-.63-1.594-.834-2.5-2.33-2.641-4.29.078-1.308.508-2.455 1.302-3.387.934-1.098 2.235-1.727 3.798-1.86.204-.02.41-.03.617-.027 1.67.047 3.09.564 4.176 1.564 1.124 1.035 1.78 2.507 1.908 4.29.197 2.83-.717 5.185-2.645 6.914-1.626 1.46-3.794 2.24-6.448 2.26z"/>
        </svg>
      )
  }
}

const sizeMap = {
  sm: { icon: 'h-3 w-3', badge: 'h-5 px-1.5 text-xs gap-1' },
  md: { icon: 'h-4 w-4', badge: 'h-6 px-2 text-xs gap-1.5' },
  lg: { icon: 'h-5 w-5', badge: 'h-8 px-3 text-sm gap-2' },
}

export function PlatformBadge({ platform, showLabel = false, size = 'md', className }: PlatformBadgeProps) {
  const config = PLATFORM_CONFIG[platform]
  const sizes = sizeMap[size]

  return (
    <div
      className={cn(
        'inline-flex items-center rounded-full font-medium',
        sizes.badge,
        className
      )}
      style={{ backgroundColor: `${config.color}15`, color: config.color }}
    >
      <PlatformIcon platform={platform} className={sizes.icon} />
      {showLabel && <span>{config.label}</span>}
    </div>
  )
}

export { PlatformIcon }
