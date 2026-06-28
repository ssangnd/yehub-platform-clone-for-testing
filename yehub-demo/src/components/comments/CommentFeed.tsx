import { useState, useMemo } from 'react'
import { CommentCard } from './CommentCard'
import { EmptyState } from '@/components/common/EmptyState'
import { MessageSquare } from 'lucide-react'
import type { Comment } from '@/types/comment'

export type CommentViewMode = 'flat' | 'threaded'

interface CommentFeedProps {
  comments: Comment[]
  allComments?: Comment[]
  mode?: CommentViewMode
  className?: string
}

function ThreadedComment({ comment, allComments }: { comment: Comment; allComments: Comment[] }) {
  const [expanded, setExpanded] = useState(false)

  const replies = useMemo(
    () => allComments.filter(c => c.parentCommentId === comment.id),
    [allComments, comment.id],
  )

  return (
    <div>
      <CommentCard
        comment={comment}
        onToggleReplies={replies.length > 0 ? () => setExpanded(prev => !prev) : undefined}
        repliesExpanded={expanded}
      />
      {expanded && replies.length > 0 && (
        <div className="space-y-1">
          {replies.map(reply => (
            <CommentCard key={reply.id} comment={reply} isReply />
          ))}
        </div>
      )}
    </div>
  )
}

export function CommentFeed({ comments, allComments, mode = 'flat', className }: CommentFeedProps) {
  if (comments.length === 0) {
    return (
      <EmptyState
        icon={<MessageSquare className="h-12 w-12" />}
        title="No comments found"
        description="Try adjusting your filters"
      />
    )
  }

  if (mode === 'threaded') {
    const pool = allComments ?? comments
    // Only render top-level comments; replies are shown nested on expand
    const topLevel = comments.filter(c => !c.parentCommentId)

    return (
      <div className={className}>
        <div className="space-y-1">
          {topLevel.map(comment => (
            <ThreadedComment key={comment.id} comment={comment} allComments={pool} />
          ))}
        </div>
      </div>
    )
  }

  // Flat mode
  return (
    <div className={className}>
      <div className="space-y-1">
        {comments.map(comment => (
          <CommentCard
            key={comment.id}
            comment={comment}
            showReplyBadge={!!comment.parentCommentId}
          />
        ))}
      </div>
    </div>
  )
}
