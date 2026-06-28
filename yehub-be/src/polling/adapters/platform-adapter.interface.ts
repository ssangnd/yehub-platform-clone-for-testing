import { Platform } from '../../../generated/prisma/client';

export interface RawPostMetrics {
  likeCount: number;
  commentCount: number;
  shareCount: number;
  viewCount: number;
  reactionCount: number;
  // Number of times a post has been saved/bookmarked. Currently only
  // populated for TikTok (its `collectCount`); other platforms report 0.
  savedCount: number;
}

export interface RawPostData {
  platformPostId: string;
  platformUserId: string;
  authorUsername: string | null;
  authorDisplayName: string | null;
  authorAvatarUrl: string | null;
  content: string | null;
  mediaUrls: string[];
  metrics: RawPostMetrics;
  publishedAt: Date | null;
  raw: unknown;
}

export interface RawAccountProfile {
  platformUserId: string;
  username: string | null;
  displayName: string | null;
  followerCount: number;
  isVerified: boolean;
  avatarUrl: string | null;
  raw: unknown;
}

export interface RawComment {
  platformCommentId: string;
  authorUsername: string | null;
  authorDisplayName: string | null;
  authorProfileUrl: string | null;
  text: string;
  likeCount: number;
  replyCount: number;
  parentPlatformCommentId: string | null;
  publishedAt: Date | null;
  replies: RawComment[];
  raw: unknown;
}

export interface RawPollResult {
  post: RawPostData | null;
  comments: RawComment[];
}

export interface PlatformAdapter {
  readonly platform: Platform;

  fetchPostData(url: string): Promise<RawPostData>;
  fetchComments(url: string, since?: Date): Promise<RawComment[]>;
  fetchAccountProfile(username: string): Promise<RawAccountProfile>;
  detectPostId(url: string): string | null;
}
