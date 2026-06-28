import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Platform } from '../../../generated/prisma/client';
import { ApifyClient } from '../apify.client';
import { ScraperProxyClient } from '../scraper-proxy.client';
import { PlatformError, PlatformErrorCode } from '../platform-error';
import { detectPlatform } from '../../posts/platform-detect.utils';
import { BasePlatformAdapter } from './base-platform.adapter';
import {
  RawAccountProfile,
  RawComment,
  RawPostData,
  RawPostMetrics,
} from './platform-adapter.interface';

const POSTS_ACTOR_ID = 'logical_scrapers~threads-post-scraper';
const PROFILE_ACTOR_ID = 'apify~threads-profile-api-scraper';

@Injectable()
export class ThreadsAdapter extends BasePlatformAdapter {
  readonly platform = Platform.THREADS;

  constructor(
    proxy: ScraperProxyClient,
    private readonly apify: ApifyClient,
    private readonly config: ConfigService,
  ) {
    super(proxy);
  }

  async fetchPostData(url: string): Promise<RawPostData> {
    const root = await this.runActor(url);
    const thread = this.asRecord(root.thread);
    return this.toRawPostData(thread);
  }

  async fetchComments(url: string, since?: Date): Promise<RawComment[]> {
    const root = await this.runActor(url);
    return this.toRawComments(root, since);
  }

  async fetchAccountProfile(username: string): Promise<RawAccountProfile> {
    const actorId =
      this.config.get<string>('APIFY_THREADS_PROFILE_ACTOR_ID') ??
      PROFILE_ACTOR_ID;
    // The actor takes bare Threads usernames and returns a flat profile object
    // (pk/id, username, full_name, follower_count, is_verified, profile_pic_url)
    // that the base normalizer reads directly.
    const handle = username.replace(/^@/, '');
    const items = await this.apify.runSync<Record<string, unknown>>({
      actorId,
      input: { usernames: [handle] },
    });
    if (items.length === 0) {
      throw new PlatformError(
        PlatformErrorCode.NOT_FOUND,
        `Apify returned no profile for username=${username}`,
      );
    }
    return this.normalizeAccountProfile(items[0], items[0]);
  }

  detectPostId(url: string): string | null {
    const detection = detectPlatform(url);
    return detection?.platform === this.platform
      ? detection.platform_post_id
      : null;
  }

  private async runActor(url: string): Promise<Record<string, unknown>> {
    const actorId =
      this.config.get<string>('APIFY_THREADS_POSTS_ACTOR_ID') ?? POSTS_ACTOR_ID;

    const items = await this.apify.runSync<Record<string, unknown>>({
      actorId,
      input: { startUrls: [{ url }] },
    });

    if (items.length === 0) {
      throw new PlatformError(
        PlatformErrorCode.NOT_FOUND,
        `Apify returned no posts for url=${url}`,
      );
    }

    return items[0];
  }

  private toRawPostData(record: Record<string, unknown>): RawPostData {
    const metrics: RawPostMetrics = {
      likeCount: this.readNumber(record, ['like_count']),
      commentCount: this.readNumber(record, ['reply_count']),
      shareCount: this.readNumber(record, ['repost_count', 'share_count']),
      viewCount: this.readNumber(record, ['view_count']),
      reactionCount: 0,
      savedCount: 0,
    };

    const username = this.readOptionalString(record, ['username']);

    return {
      platformPostId:
        this.readString(record, ['code']) ||
        this.readString(record, ['id']) ||
        this.readString(record, ['pk']),
      platformUserId: this.readString(record, ['user_id', 'user_pk']),
      authorUsername: username,
      authorDisplayName: this.readOptionalString(record, ['user_full_name']),
      authorAvatarUrl: this.readOptionalString(record, ['user_pic']),
      content: this.readOptionalString(record, ['text']),
      mediaUrls: this.extractMediaUrls(record),
      metrics,
      publishedAt: this.parseThreadsDate(record.published_on),
      raw: record,
    };
  }

  private parseThreadsDate(value: unknown): Date | null {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return new Date(value * 1000);
    }
    if (typeof value === 'string') {
      const d = new Date(value);
      return Number.isNaN(d.getTime()) ? null : d;
    }
    return null;
  }

  private toRawComments(
    record: Record<string, unknown>,
    since?: Date,
  ): RawComment[] {
    const replies = record.replies;
    if (!Array.isArray(replies)) return [];

    const topLevel: RawComment[] = [];
    for (const item of replies) {
      if (!this.isRecord(item)) continue;
      const comment = this.toRawComment(item, null);
      if (!comment) continue;
      if (since && comment.publishedAt && comment.publishedAt <= since) {
        continue;
      }
      topLevel.push(comment);
    }
    return topLevel;
  }

  private toRawComment(
    record: Record<string, unknown>,
    parentPlatformCommentId: string | null,
  ): RawComment | null {
    const platformCommentId =
      this.readString(record, ['code']) ||
      this.readString(record, ['id']) ||
      this.readString(record, ['pk']);
    if (!platformCommentId) return null;

    const replies: RawComment[] = [];
    const nested = record.replies;
    if (Array.isArray(nested)) {
      for (const child of nested) {
        if (!this.isRecord(child)) continue;
        const reply = this.toRawComment(child, platformCommentId);
        if (reply) replies.push(reply);
      }
    }

    const username = this.readOptionalString(record, ['username']);

    return {
      platformCommentId,
      authorUsername: username,
      authorDisplayName: this.readOptionalString(record, [
        'user_full_name',
        'username',
      ]),
      authorProfileUrl: username
        ? `https://www.threads.com/@${username}`
        : null,
      text: this.readString(record, ['text']),
      likeCount: this.readNumber(record, ['like_count']),
      replyCount: this.readNumber(record, ['reply_count']),
      parentPlatformCommentId,
      publishedAt: this.parseThreadsDate(record.published_on),
      replies,
      raw: record,
    };
  }

  private extractMediaUrls(record: Record<string, unknown>): string[] {
    const urls: string[] = [];
    for (const key of ['images', 'videos']) {
      const value = record[key];
      if (!Array.isArray(value)) continue;
      for (const item of value) {
        if (typeof item === 'string') {
          urls.push(item);
        } else if (this.isRecord(item)) {
          const url = this.readOptionalString(item, ['url', 'src']);
          if (url) urls.push(url);
        }
      }
    }
    return urls;
  }
}
