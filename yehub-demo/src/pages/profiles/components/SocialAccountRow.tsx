import { MoreHorizontal, ExternalLink, ArrowRightLeft, Unlink2, CheckCircle, Clock, RefreshCw } from 'lucide-react'
import { PlatformBadge } from '@/components/common/PlatformBadge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { formatNumber } from '@/lib/utils/format'
import { formatRelativeTime } from '@/lib/utils/format'
import type { SocialAccount } from '@/types/profile'

interface SocialAccountRowProps {
  account: SocialAccount
  onSync: () => void
  onOpenExternal: () => void
  onMoveToProfile: () => void
  onUnlink: () => void
}

export function SocialAccountRow({ account, onSync, onOpenExternal, onMoveToProfile, onUnlink }: SocialAccountRowProps) {
  return (
    <div className="flex items-center justify-between rounded-lg border p-3">
      <div className="flex items-center gap-3 min-w-0">
        <PlatformBadge platform={account.platform} size="md" />
        <div className="min-w-0">
          <div className="flex items-center gap-1">
            <span className="font-medium text-sm truncate">@{account.username}</span>
            {account.isVerified && <CheckCircle className="h-4 w-4 shrink-0 text-blue-500" />}
          </div>
          <p className="text-xs text-muted-foreground">{formatNumber(account.followers)} followers</p>
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <p className="flex items-center gap-1 text-xs text-muted-foreground">
          <Clock className="h-3 w-3" />
          {formatRelativeTime(account.lastSyncedAt)}
        </p>
        <Button variant="ghost" size="icon" className="h-7 w-7 cursor-pointer" onClick={onSync} aria-label="Sync account">
          <RefreshCw className="h-3.5 w-3.5" />
        </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 cursor-pointer" aria-label="Account actions">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={onOpenExternal} className="cursor-pointer">
            <ExternalLink className="h-4 w-4" />
            Open external
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onMoveToProfile} className="cursor-pointer">
            <ArrowRightLeft className="h-4 w-4" />
            Move to profile
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onClick={onUnlink} className="cursor-pointer">
            <Unlink2 className="h-4 w-4" />
            Unlink from profile
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      </div>
    </div>
  )
}
