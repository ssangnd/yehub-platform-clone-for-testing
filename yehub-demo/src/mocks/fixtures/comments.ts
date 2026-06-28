import type { Comment } from '@/types/comment'
import { generateComments } from '../generators/generateComments'
import { mockPosts } from './posts'

function buildComments(): Comment[] {
  const allComments: Comment[] = []

  for (const post of mockPosts.slice(0, 30)) {
    const count = Math.min(Math.ceil(post.comments / 50), 20)
    const comments = generateComments(count, post.id, post.campaignId, post.platform)
    allComments.push(...comments)
  }

  return allComments.sort((a, b) =>
    new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
  )
}

export const mockComments: Comment[] = buildComments()
