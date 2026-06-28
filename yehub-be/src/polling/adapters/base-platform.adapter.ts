import { Platform } from '../../../generated/prisma/client';
import { detectPlatform } from '../../posts/platform-detect.utils';
import { ScraperProxyClient } from '../scraper-proxy.client';
import {
  PlatformAdapter,
  RawAccountProfile,
  RawComment,
  RawPostData,
  RawPostMetrics,
} from './platform-adapter.interface';

export abstract class BasePlatformAdapter implements PlatformAdapter {
  abstract readonly platform: Platform;

  constructor(protected readonly proxy: ScraperProxyClient) {}

  async fetchPostData(url: string): Promise<RawPostData> {
    const response = await this.proxy.request(this.platform, 'post', { url });
    return this.normalizePost(response.data);
  }

  async fetchComments(url: string, since?: Date): Promise<RawComment[]> {
    const comments: RawComment[] = [];
    let cursor: string | undefined;

    do {
      const response = await this.proxy.request(this.platform, 'comments', {
        url,
        cursor,
        ...(since && { since: since.toISOString() }),
      });
      comments.push(...this.normalizeComments(response.data, since));
      cursor = response.nextCursor ?? undefined;
    } while (cursor);

    return comments;
  }

  abstract fetchAccountProfile(username: string): Promise<RawAccountProfile>;

  detectPostId(url: string): string | null {
    const detection = detectPlatform(url);
    return detection?.platform === this.platform
      ? detection.platform_post_id
      : null;
  }

  protected normalizeAccountProfile(
    record: Record<string, unknown>,
    raw: unknown,
  ): RawAccountProfile {
    return {
      platformUserId: this.readString(record, [
        'platformUserId',
        'platform_user_id',
        'userId',
        'channelId',
        'facebookId',
        'pageId',
        'pk',
        'id',
      ]),
      username: this.readOptionalString(record, [
        'username',
        'uniqueId',
        'channelUsername',
        'name',
      ]),
      displayName: this.readOptionalString(record, [
        'displayName',
        'fullName',
        'full_name',
        'nickName',
        'channelName',
        'pageName',
        'title',
      ]),
      followerCount: this.readNumber(record, [
        'followerCount',
        'followersCount',
        'follower_count',
        'followers',
        'fans',
        'numberOfSubscribers',
        'subscriberCount',
      ]),
      isVerified: this.readBoolean(record, [
        'isVerified',
        'is_verified',
        'verified',
      ]),
      avatarUrl: this.readOptionalString(record, [
        'avatarUrl',
        'avatar',
        'profilePicUrlHD',
        'profilePicUrl',
        'profile_pic_url',
        'profilePictureUrl',
        'channelAvatarUrl',
      ]),
      raw,
    };
  }

  protected readBoolean(
    record: Record<string, unknown>,
    keys: string[],
  ): boolean {
    for (const key of keys) {
      const value = record[key];
      if (typeof value === 'boolean') return value;
    }
    return false;
  }

  protected normalizePost(payload: unknown): RawPostData {
    const record = this.firstRecord(payload);
    const metrics = this.normalizeMetrics(record);
    return {
      platformPostId: this.readString(record, [
        'platformPostId',
        'platform_post_id',
        'post_id',
        'video_id',
        'id',
      ]),
      platformUserId: this.readString(record, [
        'authorId',
        'authorid',
        'author_id',
        'uid',
      ]),
      authorUsername: this.readOptionalString(record, [
        'authorUsername',
        'author_username',
        'username',
        'author',
      ]),
      authorDisplayName: this.readOptionalString(record, [
        'authorDisplayName',
        'author_display_name',
        'author_name',
        'display_name',
        'channel_title',
      ]),
      authorAvatarUrl: this.readOptionalString(record, [
        'authorAvatarUrl',
        'author_avatar_url',
        'author_avatar',
        'avatar',
      ]),
      content: this.readOptionalString(record, [
        'content',
        'text',
        'caption',
        'description',
        'title',
      ]),
      mediaUrls: this.readStringArray(record, [
        'mediaUrls',
        'media_urls',
        'images',
        'videos',
      ]),
      metrics,
      publishedAt: this.readDate(record, [
        'publishedAt',
        'published_at',
        'created_at',
        'creation_time',
        'creationTime',
        'timestamp',
      ]),
      raw: payload,
    };
  }

  protected normalizeComments(payload: unknown, since?: Date): RawComment[] {
    return this.commentItems(payload)
      .map((item) => this.normalizeComment(item, null))
      .filter((comment) => {
        if (!since || !comment.publishedAt) return true;
        return comment.publishedAt > since;
      });
  }

  protected normalizeComment(
    payload: unknown,
    parentPlatformCommentId: string | null,
  ): RawComment {
    const record = this.asRecord(payload);
    const platformCommentId = this.readString(record, [
      'platformCommentId',
      'platform_comment_id',
      'comment_id',
      'id',
    ]);
    const replies = this.commentItems(record.replies).map((reply) =>
      this.normalizeComment(reply, platformCommentId),
    );

    return {
      platformCommentId,
      authorUsername: this.readOptionalString(record, [
        'authorUsername',
        'author_username',
        'username',
        'author',
      ]),
      authorDisplayName: this.readOptionalString(record, [
        'authorDisplayName',
        'author_display_name',
        'author_name',
        'display_name',
      ]),
      authorProfileUrl: this.readOptionalString(record, [
        'authorProfileUrl',
        'author_profile_url',
        'profile_url',
      ]),
      text: this.readString(record, ['text', 'content', 'comment']),
      likeCount: this.readNumber(record, ['likeCount', 'like_count', 'likes']),
      replyCount:
        this.readNumber(record, ['replyCount', 'reply_count']) ||
        replies.length,
      parentPlatformCommentId:
        this.readOptionalString(record, [
          'parentPlatformCommentId',
          'parent_platform_comment_id',
          'parent_id',
        ]) ?? parentPlatformCommentId,
      publishedAt: this.readDate(record, [
        'publishedAt',
        'published_at',
        'created_at',
        'timestamp',
      ]),
      replies,
      raw: payload,
    };
  }

  protected normalizeMetrics(record: Record<string, unknown>): RawPostMetrics {
    return {
      likeCount: this.readNumber(record, ['likeCount', 'like_count', 'likes']),
      commentCount: this.readNumber(record, [
        'commentCount',
        'comment_count',
        'comments',
      ]),
      shareCount: this.readNumber(record, [
        'shareCount',
        'share_count',
        'shares',
      ]),
      viewCount: this.readNumber(record, ['viewCount', 'view_count', 'views']),
      reactionCount: this.readNumber(record, [
        'reactionCount',
        'reaction_count',
        'reactions',
      ]),
      savedCount: this.readNumber(record, [
        'collectCount',
        'savedCount',
        'saved_count',
      ]),
    };
  }

  protected commentItems(payload: unknown): unknown[] {
    if (Array.isArray(payload)) return payload;
    if (!this.isRecord(payload)) return [];
    for (const key of ['comments', 'items', 'data', 'results']) {
      const value = payload[key];
      if (Array.isArray(value)) return value;
    }
    return [];
  }

  protected firstRecord(payload: unknown): Record<string, unknown> {
    if (Array.isArray(payload)) return this.asRecord(payload[0]);
    if (this.isRecord(payload)) {
      for (const key of ['post', 'video', 'thread']) {
        if (this.isRecord(payload[key])) return payload[key];
      }
    }
    return this.asRecord(payload);
  }

  protected readString(
    record: Record<string, unknown>,
    keys: string[],
  ): string {
    return this.readOptionalString(record, keys) ?? '';
  }

  protected readOptionalString(
    record: Record<string, unknown>,
    keys: string[],
  ): string | null {
    for (const key of keys) {
      const value = record[key];
      if (typeof value === 'string' && value.trim()) return value.trim();
      if (typeof value === 'number') return String(value);
    }
    return null;
  }

  protected readNumber(
    record: Record<string, unknown>,
    keys: string[],
  ): number {
    for (const key of keys) {
      const value = record[key];
      if (typeof value === 'number' && Number.isFinite(value)) return value;
      if (typeof value === 'string') {
        const parsed = Number(value.replace(/,/g, ''));
        if (Number.isFinite(parsed)) return parsed;
      }
    }
    return 0;
  }

  protected readDate(
    record: Record<string, unknown>,
    keys: string[],
  ): Date | null {
    for (const key of keys) {
      const date = this.parseDate(record[key]);
      if (date) return date;
    }
    return null;
  }

  /**
   * Parse a date from a scraper field. Accepts ISO/parseable date strings as
   * well as numeric Unix timestamps (e.g. reels report
   * `creation_time: 1781080306`), in either seconds or milliseconds.
   */
  protected parseDate(value: unknown): Date | null {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return this.fromUnixTimestamp(value);
    }
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (!trimmed) return null;
      if (/^\d+$/.test(trimmed)) {
        return this.fromUnixTimestamp(Number(trimmed));
      }
      const date = new Date(trimmed);
      return Number.isNaN(date.getTime()) ? null : date;
    }
    return null;
  }

  private fromUnixTimestamp(value: number): Date | null {
    // Seconds are ~10 digits (< 1e12); anything larger is already in ms.
    const ms = value < 1e12 ? value * 1000 : value;
    const date = new Date(ms);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  protected readStringArray(
    record: Record<string, unknown>,
    keys: string[],
  ): string[] {
    for (const key of keys) {
      const value = record[key];
      if (Array.isArray(value)) {
        return value.filter((item): item is string => typeof item === 'string');
      }
      if (typeof value === 'string' && value.trim()) return [value.trim()];
    }
    return [];
  }

  protected asRecord(value: unknown): Record<string, unknown> {
    return this.isRecord(value) ? value : {};
  }

  protected isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
  }
}
