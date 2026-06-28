import { useEffect, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { MoreHorizontal, ArrowRightLeft, CheckCircle, RefreshCw, AlertTriangle, Trash2 } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { formatNumber, formatRelativeTime } from '@/lib/format'
import { PlatformBadge } from '@/components/common/PlatformBadge'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { queryKeys } from '@/lib/constants/query-keys'
import { profilesApi, type ProfileAccount } from '@/api/profiles'
import { showApiError } from '@/lib/errors'
import { cn } from '@/lib/utils'
import { MoveAccountDialog } from './MoveAccountDialog'

interface SocialAccountRowProps {
  account: ProfileAccount
  profileId: string
}

export function SocialAccountRow({ account, profileId }: SocialAccountRowProps) {
  const queryClient = useQueryClient()
  const [moveOpen, setMoveOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const hasLinkedPosts = account.linkedPostCount > 0

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.profile(profileId) })
    queryClient.invalidateQueries({ queryKey: queryKeys.profiles.all })
  }

  const moveMutation = useMutation({
    mutationFn: (targetProfileId: string) => profilesApi.moveAccount(profileId, account.id, targetProfileId),
    onSuccess: () => {
      invalidate()
      setMoveOpen(false)
      toast.success('Account moved')
    },
    onError: (error) => showApiError(error, { fallback: 'Failed to move account' }),
  })

  const deleteMutation = useMutation({
    mutationFn: () => profilesApi.unlinkAccount(profileId, account.id),
    onSuccess: () => {
      invalidate()
      setDeleteOpen(false)
      toast.success('Account deleted')
    },
    onError: (error) => showApiError(error, { fallback: 'Failed to delete account' }),
  })

  // A freshly linked account has an auto-poll in flight: watch for its result.
  const [refreshStartedAt, setRefreshStartedAt] = useState<number | null>(() => {
    const isAwaitingFirstPoll =
      account.lastPollStatus === null && Date.now() - new Date(account.createdAt).getTime() < 2 * 60_000
    return isAwaitingFirstPoll ? Date.now() : null
  })

  const pollMutation = useMutation({
    mutationFn: () => profilesApi.pollAccount(profileId, account.id),
    onSuccess: ({ queued }) => {
      setRefreshStartedAt(Date.now())
      toast.success(queued ? 'Account refresh queued' : 'A refresh is already in progress')
    },
    onError: (error) => showApiError(error, { fallback: 'Failed to refresh account' }),
  })

  const lastPolledAtMs = account.lastPolledAt ? new Date(account.lastPolledAt).getTime() : null
  const isAwaitingResult = refreshStartedAt !== null && (lastPolledAtMs === null || lastPolledAtMs < refreshStartedAt)

  useEffect(() => {
    if (!isAwaitingResult || refreshStartedAt === null) return
    const timer = setInterval(() => {
      if (Date.now() - refreshStartedAt > 90_000) {
        setRefreshStartedAt(null)
        return
      }
      queryClient.invalidateQueries({ queryKey: queryKeys.profile(profileId) })
    }, 5000)
    return () => clearInterval(timer)
  }, [isAwaitingResult, refreshStartedAt, profileId, queryClient])

  const isRefreshing = pollMutation.isPending || isAwaitingResult

  return (
    <>
      <div className="flex items-center justify-between rounded-lg border p-3">
        <div className="flex items-center gap-3 min-w-0">
          <PlatformBadge platform={account.platform} size="md" />
          <div className="min-w-0">
            <div className="flex items-center gap-1">
              <span className="font-medium text-sm truncate">
                @{account.username ?? account.displayName ?? account.platformUserId}
              </span>
              {account.isVerified && <CheckCircle className="h-4 w-4 shrink-0 text-blue-500" />}
            </div>
            <div className="flex items-center gap-1.5">
              <p
                className="text-xs text-muted-foreground"
                title={account.lastPolledAt ? `Updated ${formatRelativeTime(account.lastPolledAt)}` : 'Not updated yet'}
              >
                {formatNumber(account.followerCount)} followers
              </p>
              {account.lastPollStatus === 'conflict' && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger>
                      <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-500" aria-label="Refresh conflict" />
                    </TooltipTrigger>
                    <TooltipContent>This account's platform ID is already linked to another account</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
              {account.lastPollStatus === 'failed' && <span className="text-xs text-destructive">update failed</span>}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0 cursor-pointer"
            aria-label="Refresh account info"
            disabled={isRefreshing}
            onClick={() => pollMutation.mutate()}
          >
            <RefreshCw className={cn('h-4 w-4', isRefreshing && 'animate-spin')} />
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0 cursor-pointer"
                  aria-label="Account actions"
                />
              }
            >
              <MoreHorizontal className="h-4 w-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-fit">
              <DropdownMenuItem onClick={() => setMoveOpen(true)} className="cursor-pointer">
                <ArrowRightLeft className="h-4 w-4" />
                Move to profile
              </DropdownMenuItem>
              {hasLinkedPosts ? (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger render={<span className="block" />}>
                      <DropdownMenuItem variant="destructive" disabled className="w-full">
                        <Trash2 className="h-4 w-4" />
                        Delete account
                      </DropdownMenuItem>
                    </TooltipTrigger>
                    <TooltipContent>
                      This account has {account.linkedPostCount} linked post
                      {account.linkedPostCount === 1 ? '' : 's'} — unlink them first.
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              ) : (
                <DropdownMenuItem variant="destructive" onClick={() => setDeleteOpen(true)} className="cursor-pointer">
                  <Trash2 className="h-4 w-4" />
                  Delete account
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <MoveAccountDialog
        open={moveOpen}
        onOpenChange={setMoveOpen}
        currentProfileId={profileId}
        onSelect={(targetProfileId) => moveMutation.mutate(targetProfileId)}
      />

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete account?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes @{account.username ?? account.displayName ?? account.platformUserId} from this
              profile. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleteMutation.isPending}
              onClick={(e) => {
                e.preventDefault()
                deleteMutation.mutate()
              }}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
