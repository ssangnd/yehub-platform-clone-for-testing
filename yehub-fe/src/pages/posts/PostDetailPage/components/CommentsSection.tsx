import { useState } from 'react'
import { List, GitBranch } from 'lucide-react'
import { PaginationBar } from '@/components/common/PaginationBar'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip'
import { usePostComments } from '../use-post-detail'
import { CommentFeed, type CommentViewMode } from './CommentFeed'

type Props = {
  postId: string
}

export function CommentsSection({ postId }: Props) {
  const {
    comments,
    totalPages,
    isLoading: commentsLoading,
    page,
    setPage,
    sort,
    handleSortChange,
  } = usePostComments(postId)
  const [viewMode, setViewMode] = useState<CommentViewMode>('threaded')

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold">Comments</h3>
        <div className="flex items-center gap-2">
          <TooltipProvider>
            <div className="flex items-center border rounded-md">
              <Tooltip>
                <TooltipTrigger>
                  <Button
                    variant="ghost"
                    size="icon"
                    className={`h-8 w-8 rounded-r-none cursor-pointer ${viewMode === 'threaded' ? 'bg-muted' : ''}`}
                    onClick={() => {
                      setViewMode('threaded')
                      setPage(1)
                    }}
                    aria-label="Threaded view"
                  >
                    <GitBranch className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Threaded</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger>
                  <Button
                    variant="ghost"
                    size="icon"
                    className={`h-8 w-8 rounded-l-none cursor-pointer ${viewMode === 'flat' ? 'bg-muted' : ''}`}
                    onClick={() => {
                      setViewMode('flat')
                      setPage(1)
                    }}
                    aria-label="Flat view"
                  >
                    <List className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Flat</TooltipContent>
              </Tooltip>
            </div>
          </TooltipProvider>
          <Select value={sort} onValueChange={(v) => handleSortChange(v as 'newest' | 'oldest' | 'most_likes')}>
            <SelectTrigger className="w-44 h-8 text-sm cursor-pointer">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="newest">Newest First</SelectItem>
              <SelectItem value="oldest">Oldest First</SelectItem>
              <SelectItem value="most_likes">Most Likes</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      {commentsLoading ? (
        <p className="text-sm text-muted-foreground">Loading comments...</p>
      ) : (
        <CommentFeed comments={comments} mode={viewMode} />
      )}
      <PaginationBar page={page} setPage={setPage} totalPages={totalPages} />
    </div>
  )
}
