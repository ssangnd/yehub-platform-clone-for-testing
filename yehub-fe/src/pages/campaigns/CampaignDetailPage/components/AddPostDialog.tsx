import { useState, useMemo, useEffect } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import axios from 'axios'
import { toast } from 'sonner'
import { postsApi } from '@/api/posts'
import { queryKeys } from '@/lib/constants/query-keys'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { Check, X } from 'lucide-react'

interface AddPostDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  campaignId: string
  campaignPlatforms: string[]
}

type PlatformValue = 'FACEBOOK' | 'INSTAGRAM' | 'TIKTOK' | 'YOUTUBE' | 'THREADS'

const PLATFORM_PATTERNS: { value: PlatformValue; label: string; regex: RegExp }[] = [
  {
    value: 'FACEBOOK',
    label: 'Facebook',
    regex:
      /facebook\.com\/[^/]+\/posts\/|facebook\.com\/groups\/[^/]+\/permalink\/|facebook\.com\/reel\/|facebook\.com\/[^/]+\/videos\/|facebook\.com\/stories\/\d+\/[^/?#]+|facebook\.com\/photo\/?\?fbid=|facebook\.com\/watch\/?\?v=|facebook\.com\/share\/[prv]\/|facebook\.com\/(?:permalink|story)\.php\?[^#]*story_fbid=|fb\.watch\//i,
  },
  { value: 'INSTAGRAM', label: 'Instagram', regex: /instagram\.com\/(?:p|reel)\//i },
  {
    value: 'TIKTOK',
    label: 'TikTok',
    regex:
      /tiktok\.com\/@[^/]*\/(?:video|photo)\/|t\.tiktok\.com\/i18n\/share\/(?:video|photo)\/|v[mt]\.tiktok\.com\//i,
  },
  { value: 'YOUTUBE', label: 'YouTube', regex: /youtube\.com\/watch\?.*v=|youtube\.com\/shorts\/|youtu\.be\//i },
  { value: 'THREADS', label: 'Threads', regex: /threads\.(?:net|com)\/@[^/]+\/post\//i },
]

const PLATFORM_LABEL: Record<PlatformValue, string> = {
  FACEBOOK: 'Facebook',
  INSTAGRAM: 'Instagram',
  TIKTOK: 'TikTok',
  YOUTUBE: 'YouTube',
  THREADS: 'Threads',
}

function detectPlatform(url: string): { value: PlatformValue; label: string } | null {
  try {
    new URL(url)
  } catch {
    return null
  }
  for (const p of PLATFORM_PATTERNS) {
    if (p.regex.test(url)) return { value: p.value, label: p.label }
  }
  return null
}

function isValidUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}

function extractApiErrorMessage(err: unknown): string {
  if (axios.isAxiosError(err)) {
    const data = err.response?.data as { message?: string | string[] } | undefined
    const msg = data?.message
    if (Array.isArray(msg)) return msg.join(' ')
    if (typeof msg === 'string' && msg.length > 0) return msg
    if (err.response?.status === 409) return 'This post is already in the campaign.'
    return 'Failed to add this post. Please check the URL and try again.'
  }
  return 'Unexpected error while adding this post.'
}

export function AddPostDialog({ open, onOpenChange, campaignId, campaignPlatforms }: AddPostDialogProps) {
  const queryClient = useQueryClient()
  const [text, setText] = useState('')
  const [serverErrors, setServerErrors] = useState<Record<string, string>>({})

  const allowed = useMemo(() => new Set(campaignPlatforms), [campaignPlatforms])
  const allowedLabels = useMemo(
    () => campaignPlatforms.map((p) => PLATFORM_LABEL[p as PlatformValue] ?? p).join(', '),
    [campaignPlatforms],
  )

  const lines = useMemo(() => {
    return text
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0)
  }, [text])

  type Detection = {
    url: string
    platform: { value: PlatformValue; label: string } | null
    clientError: string | null
  }

  const detections: Detection[] = useMemo(() => {
    return lines.map((url) => {
      const platform = detectPlatform(url)
      if (!isValidUrl(url)) {
        return {
          url,
          platform: null,
          clientError: 'Enter a valid http or https URL.',
        }
      }
      if (!platform) {
        return { url, platform: null, clientError: 'Unsupported post URL.' }
      }
      if (campaignPlatforms.length > 0 && !allowed.has(platform.value)) {
        return {
          url,
          platform,
          clientError: `${platform.label} is not enabled for this campaign. Allowed: ${allowedLabels || 'none'}.`,
        }
      }
      return { url, platform, clientError: null }
    })
  }, [lines, allowed, allowedLabels, campaignPlatforms.length])

  const submittable = detections.filter((d) => d.platform && !d.clientError)
  const validCount = submittable.length

  // Clear stale server errors for any URL the user has edited away.
  useEffect(() => {
    setServerErrors((prev) => {
      const urlSet = new Set(lines)
      const next: Record<string, string> = {}
      for (const [url, msg] of Object.entries(prev)) {
        if (urlSet.has(url)) next[url] = msg
      }
      return next
    })
  }, [lines])

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      setText('')
      setServerErrors({})
    }
    onOpenChange(next)
  }

  const mutation = useMutation({
    mutationFn: async () => {
      const BATCH_SIZE = 5
      const failures: Record<string, string> = {}
      let successCount = 0

      for (let i = 0; i < submittable.length; i += BATCH_SIZE) {
        const batch = submittable.slice(i, i + BATCH_SIZE)
        const batchResults = await Promise.allSettled(
          batch.map(async (d) => {
            return postsApi.addPost(campaignId, d.url)
          }),
        )
        batchResults.forEach((r, idx) => {
          if (r.status === 'fulfilled') {
            successCount++
          } else {
            failures[batch[idx].url] = extractApiErrorMessage(r.reason)
          }
        })
      }
      return { successCount, failures, attempted: submittable.length }
    },
    onSuccess: ({ successCount, failures, attempted }) => {
      if (successCount > 0) {
        queryClient.invalidateQueries({ queryKey: queryKeys.posts.byCampaign(campaignId) })
        queryClient.invalidateQueries({ queryKey: queryKeys.campaigns.all })
        queryClient.invalidateQueries({ queryKey: queryKeys.campaign(campaignId) })
      }

      const failureCount = Object.keys(failures).length

      if (failureCount === 0) {
        toast.success(`${successCount} post(s) added`)
        handleOpenChange(false)
        return
      }

      setServerErrors(failures)
      // Keep only the failed lines in the textarea so the user can amend them.
      setText(Object.keys(failures).join('\n'))

      if (successCount === 0) {
        toast.error(`Failed to add ${failureCount} of ${attempted} post(s). See details below.`)
      } else {
        toast.warning(`${successCount} added, ${failureCount} failed. Fix the errors below to retry.`)
      }
    },
    onError: () => {
      toast.error('Failed to add posts')
    },
  })

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add Posts</DialogTitle>
          <DialogDescription>
            Paste social media post URLs, one per line.
            {campaignPlatforms.length > 0 && <> Allowed platforms: {allowedLabels}.</>}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 max-h-100 overflow-y-auto">
          <Textarea
            placeholder={`https://www.facebook.com/page/posts/123\nhttps://www.tiktok.com/@user/video/456\nhttps://www.youtube.com/watch?v=abc`}
            rows={6}
            value={text}
            onChange={(e) => setText(e.target.value)}
            className="break-all"
          />

          {lines.length > 0 && (
            <div className="space-y-1.5 overflow-y-auto">
              {detections.map((d, i) => {
                const serverError = serverErrors[d.url]
                const errorMessage = serverError ?? d.clientError
                const isOk = !errorMessage
                return (
                  <div key={i} className="space-y-0.5">
                    <div className="flex items-center gap-2 text-sm">
                      {isOk ? (
                        <Check className="h-3.5 w-3.5 text-green-600 shrink-0" />
                      ) : (
                        <X className="h-3.5 w-3.5 text-red-500 shrink-0" />
                      )}
                      <span className="flex-1 text-muted-foreground break-all">{d.url}</span>
                      {d.platform && (
                        <Badge variant="outline" className="text-xs shrink-0">
                          {d.platform.label}
                        </Badge>
                      )}
                    </div>
                    {errorMessage && <p className="pl-5.5 text-xs text-red-600 break-words">{errorMessage}</p>}
                  </div>
                )
              })}
              <p className="text-xs text-muted-foreground mt-2">
                {validCount} of {lines.length} URLs ready to add
              </p>
            </div>
          )}

          <Button
            className="w-full cursor-pointer"
            disabled={validCount === 0 || mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending ? 'Adding…' : `Add ${validCount} Post(s)`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
