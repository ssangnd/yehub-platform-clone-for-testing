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

const POSTS_ACTOR_ID = 'apify~instagram-post-scraper';
const COMMENTS_ACTOR_ID = 'apify~instagram-comment-scraper';
const PROFILE_ACTOR_ID = 'apify~instagram-profile-scraper';

const DEFAULT_POSTS_RESULTS_LIMIT = 5;
const DEFAULT_COMMENTS_RESULTS_LIMIT = 500;

@Injectable()
export class InstagramAdapter extends BasePlatformAdapter {
  readonly platform = Platform.INSTAGRAM;

  constructor(
    proxy: ScraperProxyClient,
    private readonly apify: ApifyClient,
    private readonly config: ConfigService,
  ) {
    super(proxy);
  }

  async fetchPostData(url: string): Promise<RawPostData> {
    const actorId =
      this.config.get<string>('APIFY_INSTAGRAM_POSTS_ACTOR_ID') ??
      POSTS_ACTOR_ID;
    const resultsLimit =
      this.config.get<number>('APIFY_INSTAGRAM_POSTS_LIMIT') ??
      DEFAULT_POSTS_RESULTS_LIMIT;

    const items = await this.apify.runSync<Record<string, unknown>>({
      actorId,
      input: { username: [url], resultsLimit },
    });

    if (items.length === 0) {
      throw new PlatformError(
        PlatformErrorCode.NOT_FOUND,
        `Apify returned no posts for url=${url}`,
      );
    }

    const targetPostId = this.detectPostId(url);
    const match =
      (targetPostId &&
        items.find(
          (item) => this.readString(item, ['shortCode']) === targetPostId,
        )) ||
      items.find((item) => this.readString(item, ['url']) === url) ||
      items[0];

    const data = this.toRawPostData(match);
    if (!data.authorAvatarUrl && data.authorUsername) {
      data.authorAvatarUrl = await this.fetchProfileAvatar(data.authorUsername);
    }
    return data;
  }

  async fetchAccountProfile(username: string): Promise<RawAccountProfile> {
    const actorId =
      this.config.get<string>('APIFY_INSTAGRAM_PROFILE_ACTOR_ID') ??
      PROFILE_ACTOR_ID;
    const items = await this.apify.runSync<Record<string, unknown>>({
      actorId,
      input: { usernames: [username] },
    });
    if (items.length === 0) {
      throw new PlatformError(
        PlatformErrorCode.NOT_FOUND,
        `Apify returned no profile for username=${username}`,
      );
    }
    return this.normalizeAccountProfile(items[0], items[0]);
  }

  private async fetchProfileAvatar(username: string): Promise<string | null> {
    try {
      const profile = await this.fetchAccountProfile(username);
      return profile.avatarUrl;
    } catch {
      return null;
    }
  }

  async fetchComments(url: string, since?: Date): Promise<RawComment[]> {
    const actorId =
      this.config.get<string>('APIFY_INSTAGRAM_COMMENTS_ACTOR_ID') ??
      COMMENTS_ACTOR_ID;
    const resultsLimit =
      this.config.get<number>('APIFY_INSTAGRAM_COMMENTS_LIMIT') ??
      DEFAULT_COMMENTS_RESULTS_LIMIT;

    const items = await this.apify.runSync<Record<string, unknown>>({
      actorId,
      input: { directUrls: [url], resultsLimit },
    });

    return this.toRawComments(items, since);
  }

  detectPostId(url: string): string | null {
    const detection = detectPlatform(url);
    return detection?.platform === this.platform
      ? detection.platform_post_id
      : null;
  }

  private toRawPostData(record: Record<string, unknown>): RawPostData {
    const metrics: RawPostMetrics = {
      likeCount: this.readNumber(record, ['likesCount']),
      commentCount: this.readNumber(record, ['commentsCount']),
      shareCount: 0,
      viewCount: this.readNumber(record, ['videoViewCount', 'videoPlayCount']),
      reactionCount: 0,
      savedCount: 0,
    };

    const ownerUsername = this.readOptionalString(record, ['ownerUsername']);

    return {
      platformPostId:
        this.readString(record, ['id']) ||
        this.readString(record, ['shortCode']),
      platformUserId: this.readString(record, ['ownerId']),
      authorUsername: ownerUsername,
      authorDisplayName:
        this.readOptionalString(record, ['ownerFullName']) ?? ownerUsername,
      authorAvatarUrl: null,
      content: this.readOptionalString(record, ['caption']),
      mediaUrls: this.extractMediaUrls(record),
      metrics,
      publishedAt: this.readDate(record, [
        'timestamp',
        'creation_time',
        'creationTime',
      ]),
      raw: record,
    };
  }

  private toRawComments(
    items: Record<string, unknown>[],
    since?: Date,
  ): RawComment[] {
    const topLevel: RawComment[] = [];
    for (const item of items) {
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
    const platformCommentId = this.readString(record, ['id']);
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

    const userName = this.readOptionalString(record, ['ownerUsername']);

    return {
      platformCommentId,
      authorUsername: userName,
      authorDisplayName: userName,
      authorProfileUrl: userName
        ? `https://www.instagram.com/${userName}`
        : null,
      text: this.readString(record, ['text']),
      likeCount: this.readNumber(record, ['likesCount']),
      replyCount: this.readNumber(record, ['repliesCount']),
      parentPlatformCommentId,
      publishedAt: this.readDate(record, ['timestamp']),
      replies,
      raw: record,
    };
  }

  private extractMediaUrls(record: Record<string, unknown>): string[] {
    const urls: string[] = [];
    const videoUrl = this.readOptionalString(record, ['videoUrl']);
    if (videoUrl) urls.push(videoUrl);
    const displayUrl = this.readOptionalString(record, ['displayUrl']);
    if (displayUrl) urls.push(displayUrl);
    const images = record.images;
    if (Array.isArray(images)) {
      for (const item of images) {
        if (typeof item === 'string') {
          urls.push(item);
        } else if (this.isRecord(item)) {
          const url = this.readOptionalString(item, ['url']);
          if (url) urls.push(url);
        }
      }
    }
    return urls;
  }
}
