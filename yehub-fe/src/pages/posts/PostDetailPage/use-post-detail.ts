import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import axios from 'axios'
import { postsApi } from '@/api/posts'
import { commentsApi } from '@/api/comments'
import { queryKeys } from '@/lib/constants/query-keys'
import { useUrlState } from '@/hooks/use-url-state'
import { toast } from 'sonner'

export function usePostDetail(postId: string) {
  const queryClient = useQueryClient()

  const { data: post, isLoading } = useQuery({
    queryKey: queryKeys.post(postId),
    queryFn: () => postsApi.getPost(postId),
  })

  const updateMutation = useMutation({
    mutationFn: (data: Parameters<typeof postsApi.updatePostSettings>[1]) => postsApi.updatePostSettings(postId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.post(postId) })
      toast.success('Post settings updated')
    },
    onError: () => {
      toast.error('Failed to update post settings')
    },
  })

  return {
    post,
    isLoading,
    updatePost: updateMutation.mutate,
    isUpdating: updateMutation.isPending,
  }
}

type CommentSort = 'newest' | 'oldest' | 'most_likes'

function normalizeCommentSort(next: URLSearchParams) {
  if (next.get('sort') === 'newest') next.delete('sort')
}

export function usePostComments(postId: string) {
  const { searchParams, page, setPage, update } = useUrlState(normalizeCommentSort)

  const sort = (searchParams.get('sort') as CommentSort | null) ?? 'newest'

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.postComments(postId, page, sort),
    queryFn: () =>
      commentsApi.listByPost(postId, {
        page,
        limit: 20,
        sort,
      }),
  })

  const comments = data?.data ?? []
  const totalPages = data?.totalPages ?? 0

  const handleSortChange = (s: CommentSort) =>
    update((next) => {
      next.set('sort', s)
      next.set('page', '1')
    })

  return { comments, totalPages, isLoading, page, setPage, sort, handleSortChange }
}

type SyncDimensions = { metrics?: boolean; comments?: boolean }

export function useSyncPost(postId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (dimensions: SyncDimensions) => postsApi.syncPost(postId, dimensions),
    onSuccess: (_data, dimensions) => {
      const subject = dimensions.metrics ? 'metrics' : 'comments'
      toast.info(`Sync queued — ${subject} will refresh shortly`)
      ;[3000, 10000, 30000].forEach((delay) => {
        window.setTimeout(() => {
          // Both dimensions can change post-level counts, so always refresh the post.
          queryClient.invalidateQueries({ queryKey: queryKeys.post(postId) })
          if (dimensions.comments) {
            queryClient.invalidateQueries({ queryKey: ['post-comments', postId] })
          }
        }, delay)
      })
    },
    onError: (err) => {
      if (axios.isAxiosError(err)) {
        if (err.response?.status === 409) {
          toast.info('A sync is already in progress for this post')
          return
        }
        const msg = (err.response?.data as { message?: string })?.message ?? 'Failed to start sync'
        toast.error(msg)
      } else {
        toast.error('Failed to start sync')
      }
    },
  })
}

export function useDeletePost(postId: string, campaignId: string | undefined, onSuccess?: () => void) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: () => postsApi.deletePost(postId),
    onSuccess: () => {
      if (campaignId) {
        queryClient.invalidateQueries({ queryKey: queryKeys.posts.byCampaign(campaignId) })
      }
      queryClient.invalidateQueries({ queryKey: ['posts'] })
      toast.success('Post deleted')
      onSuccess?.()
    },
    onError: (err) => {
      if (axios.isAxiosError(err)) {
        const msg = (err.response?.data as { message?: string })?.message ?? 'Failed to delete post'
        toast.error(msg)
      } else {
        toast.error('Failed to delete post')
      }
    },
  })
}
