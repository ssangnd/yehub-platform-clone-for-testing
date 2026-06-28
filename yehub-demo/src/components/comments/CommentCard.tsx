import { PlatformBadge } from '@/components/common/PlatformBadge'
import { SentimentBadge } from '@/components/common/SentimentBadge'
import { Badge } from '@/components/ui/badge'
import { Heart, MessageCircle, CornerDownRight } from 'lucide-react'
import { formatRelativeTime } from '@/lib/utils/format'
import { cn } from '@/lib/utils'
import type { Comment } from '@/types/comment'

interface CommentCardProps {
  comment: Comment
  isReply?: boolean
  showReplyBadge?: boolean
  onToggleReplies?: () => void
  repliesExpanded?: boolean
  className?: string
}

const EMOTION_LABELS: Record<string, string> = {
  joy: 'Joy', anger: 'Anger', sadness: 'Sadness',
  fear: 'Fear', surprise: 'Surprise', disgust: 'Disgust',
}

export function CommentCard({ comment, isReply = false, showReplyBadge = false, onToggleReplies, repliesExpanded, className }: CommentCardProps) {
  const commenterLabel = `Commenter ${comment.id.slice(-4)}`

  return (
    <div className={cn(
      'flex gap-3 rounded-lg p-3 transition-colors duration-150 hover:bg-muted/50',
      isReply && 'ml-10 border-l-2 border-border pl-4',
      className
    )}>
      <div className="h-8 w-8 shrink-0 rounded-full bg-muted flex items-center justify-center">
        <span className="text-xs font-medium text-muted-foreground">C</span>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium">{commenterLabel}</span>
          <PlatformBadge platform={comment.platform} size="sm" />
          {showReplyBadge && (
            <Badge variant="secondary" className="text-xs gap-1">
              <CornerDownRight className="h-3 w-3" />Reply
            </Badge>
          )}
          {comment.sentiment && <SentimentBadge sentiment={comment.sentiment} />}
          {comment.emotions && comment.emotions.length > 0 && (
            <Badge variant="outline" className="text-xs">
              {EMOTION_LABELS[comment.emotions[0].type] || comment.emotions[0].type}
            </Badge>
          )}
        </div>
        <p className="text-sm mt-1 whitespace-pre-wrap">{comment.content}</p>
        <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
          <span>{formatRelativeTime(comment.publishedAt)}</span>
          <span className="flex items-center gap-1">
            <Heart className="h-3 w-3" /> {comment.likes}
          </span>
          {comment.replyCount > 0 && onToggleReplies ? (
            <button
              type="button"
              onClick={onToggleReplies}
              className="flex items-center gap-1 text-primary hover:underline cursor-pointer"
            >
              <MessageCircle className="h-3 w-3" />
              {repliesExpanded ? 'Hide' : `${comment.replyCount}`} {comment.replyCount === 1 ? 'reply' : 'replies'}
            </button>
          ) : comment.replyCount > 0 ? (
            <span className="flex items-center gap-1">
              <MessageCircle className="h-3 w-3" /> {comment.replyCount}
            </span>
          ) : null}
        </div>
      </div>
    </div>
  )
}
