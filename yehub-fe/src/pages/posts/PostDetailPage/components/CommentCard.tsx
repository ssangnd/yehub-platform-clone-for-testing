import { PlatformBadge } from '@/components/common/PlatformBadge'
import { Badge } from '@/components/ui/badge'
import { Heart, MessageCircle, CornerDownRight } from 'lucide-react'
import { formatRelativeTime } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { CommentItem } from '@/api/comments'

interface CommentCardProps {
  comment: CommentItem
  isReply?: boolean
  showReplyBadge?: boolean
  onToggleReplies?: () => void
  repliesExpanded?: boolean
  className?: string
}

const SENTIMENT_CONFIG: Record<string, { label: string; className: string }> = {
  POSITIVE: { label: 'Positive', className: 'bg-green-500/10 text-green-600 border-0' },
  NEGATIVE: { label: 'Negative', className: 'bg-red-500/10 text-red-600 border-0' },
  NEUTRAL: { label: 'Neutral', className: 'bg-gray-500/10 text-gray-600 border-0' },
  MIXED: { label: 'Mixed', className: 'bg-yellow-500/10 text-yellow-600 border-0' },
}

const EMOTION_LABELS: Record<string, string> = {
  JOY: 'Joy',
  ANGER: 'Anger',
  SADNESS: 'Sadness',
  FEAR: 'Fear',
  SURPRISE: 'Surprise',
  DISGUST: 'Disgust',
  TRUST: 'Trust',
  ANTICIPATION: 'Anticipation',
}

export function CommentCard({
  comment,
  isReply = false,
  showReplyBadge = false,
  onToggleReplies,
  repliesExpanded,
  className,
}: CommentCardProps) {
  const authorName = comment.author_name?.trim() || `Commenter ${comment.id.slice(-4)}`
  const authorInitial = authorName[0]?.toUpperCase() ?? 'C'
  const sentimentConfig = comment.sentiment ? SENTIMENT_CONFIG[comment.sentiment] : null

  return (
    <div
      className={cn(
        'flex gap-3 rounded-lg p-3 transition-colors duration-150 hover:bg-muted/50',
        isReply && 'ml-10 border-l-2 border-border pl-4',
        className,
      )}
    >
      <div className="h-8 w-8 shrink-0 rounded-full bg-muted flex items-center justify-center">
        <span className="text-xs font-medium text-muted-foreground">{authorInitial}</span>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          {comment.author_profile_url ? (
            <a
              href={comment.author_profile_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm font-medium hover:underline"
            >
              {authorName}
            </a>
          ) : (
            <span className="text-sm font-medium">{authorName}</span>
          )}
          <PlatformBadge platform={comment.platform} size="sm" />
          {showReplyBadge && (
            <Badge variant="secondary" className="text-xs gap-1">
              <CornerDownRight className="h-3 w-3" />
              Reply
            </Badge>
          )}
          {sentimentConfig && (
            <Badge className={cn('text-xs', sentimentConfig.className)}>{sentimentConfig.label}</Badge>
          )}
          {comment.emotions && comment.emotions.length > 0 && (
            <Badge variant="outline" className="text-xs">
              {EMOTION_LABELS[comment.emotions[0]] || comment.emotions[0]}
            </Badge>
          )}
        </div>
        <p className="text-sm mt-1 whitespace-pre-wrap">{comment.content}</p>
        <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
          {comment.platform_created_at && <span>{formatRelativeTime(comment.platform_created_at)}</span>}
          <span className="flex items-center gap-1">
            <Heart className="h-3 w-3" /> {comment.like_count}
          </span>
          {comment.reply_count > 0 && onToggleReplies ? (
            <button
              type="button"
              onClick={onToggleReplies}
              className="flex items-center gap-1 text-primary hover:underline cursor-pointer"
            >
              <MessageCircle className="h-3 w-3" />
              {repliesExpanded ? 'Hide' : `${comment.reply_count}`} {comment.reply_count === 1 ? 'reply' : 'replies'}
            </button>
          ) : comment.reply_count > 0 ? (
            <span className="flex items-center gap-1">
              <MessageCircle className="h-3 w-3" /> {comment.reply_count}
            </span>
          ) : null}
        </div>
      </div>
    </div>
  )
}
