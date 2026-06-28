import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { CommentCard } from './CommentCard'
import { EmptyState } from '@/components/common/EmptyState'
import { MessageSquare } from 'lucide-react'
import { commentsApi, type CommentItem } from '@/api/comments'

export type CommentViewMode = 'flat' | 'threaded'

function ThreadedComment({ comment, allComments }: { comment: CommentItem; allComments: CommentItem[] }) {
  const [expanded, setExpanded] = useState(false)

  const replies = useMemo(
    () => allComments.filter((c) => c.parent_comment_id === comment.id),
    [allComments, comment.id],
  )

  // If no local replies, try fetching from API when expanded
  const { data: fetchedReplies } = useQuery({
    queryKey: ['comment-replies', comment.id],
    queryFn: () => commentsApi.getComment(comment.id),
    enabled: expanded && replies.length === 0 && comment.reply_count > 0,
  })

  const displayReplies = replies.length > 0 ? replies : (fetchedReplies?.childComments ?? [])

  return (
    <div>
      <CommentCard
        comment={comment}
        onToggleReplies={comment.reply_count > 0 ? () => setExpanded((prev) => !prev) : undefined}
        repliesExpanded={expanded}
      />
      {expanded && displayReplies.length > 0 && (
        <div className="space-y-1">
          {displayReplies.map((reply) => (
            <CommentCard key={reply.id} comment={reply} isReply />
          ))}
        </div>
      )}
    </div>
  )
}

interface CommentFeedProps {
  comments: CommentItem[]
  mode: CommentViewMode
  className?: string
}

export function CommentFeed({ comments, mode, className }: CommentFeedProps) {
  if (comments.length === 0) {
    return (
      <EmptyState
        icon={<MessageSquare className="h-12 w-12" />}
        title="No comments found"
        description="Comments will appear once collected."
      />
    )
  }

  if (mode === 'threaded') {
    const topLevel = comments.filter((c) => !c.parent_comment_id)

    return (
      <div className={className}>
        <div className="space-y-1">
          {topLevel.map((comment) => (
            <ThreadedComment key={comment.id} comment={comment} allComments={comments} />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className={className}>
      <div className="space-y-1">
        {comments.map((comment) => (
          <CommentCard key={comment.id} comment={comment} showReplyBadge={!!comment.parent_comment_id} />
        ))}
      </div>
    </div>
  )
}
