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

const POSTS_ACTOR_ID = 'clockworks~tiktok-scraper';
const COMMENTS_ACTOR_ID = 'clockworks~tiktok-comments-scraper';

const DEFAULT_POSTS_RESULTS_LIMIT = 1;
const DEFAULT_COMMENTS_RESULTS_LIMIT = 500;
const PROFILE_RESULTS_PER_PAGE = 1;

@Injectable()
export class TikTokAdapter extends BasePlatformAdapter {
  readonly platform = Platform.TIKTOK;

  constructor(
    proxy: ScraperProxyClient,
    private readonly apify: ApifyClient,
    private readonly config: ConfigService,
  ) {
    super(proxy);
  }

  async fetchPostData(url: string): Promise<RawPostData> {
    const actorId =
      this.config.get<string>('APIFY_TIKTOK_POSTS_ACTOR_ID') ?? POSTS_ACTOR_ID;
    const resultsPerPage =
      this.config.get<number>('APIFY_TIKTOK_POSTS_LIMIT') ??
      DEFAULT_POSTS_RESULTS_LIMIT;

    const items = await this.apify.runSync<Record<string, unknown>>({
      actorId,
      input: { postURLs: [url], resultsPerPage },
    });

    if (items.length === 0) {
      throw new PlatformError(
        PlatformErrorCode.NOT_FOUND,
        `Apify returned no videos for url=${url}`,
      );
    }

    const targetId = this.detectPostId(url);
    const match =
      (targetId &&
        items.find((item) => this.readString(item, ['id']) === targetId)) ||
      items.find(
        (item) =>
          this.readString(item, ['webVideoUrl', 'videoUrl', 'url']) === url,
      ) ||
      items[0];

    return this.toRawPostData(match);
  }

  async fetchComments(url: string, since?: Date): Promise<RawComment[]> {
    const actorId =
      this.config.get<string>('APIFY_TIKTOK_COMMENTS_ACTOR_ID') ??
      COMMENTS_ACTOR_ID;
    const commentsPerPost =
      this.config.get<number>('APIFY_TIKTOK_COMMENTS_LIMIT') ??
      DEFAULT_COMMENTS_RESULTS_LIMIT;

    const items = await this.apify.runSync<Record<string, unknown>>({
      actorId,
      input: {
        postURLs: [url],
        commentsPerPost,
        maxRepliesPerComment: 0,
      },
    });

    return this.toRawComments(items, since);
  }

  async fetchAccountProfile(username: string): Promise<RawAccountProfile> {
    const actorId =
      this.config.get<string>('APIFY_TIKTOK_PROFILE_ACTOR_ID') ??
      POSTS_ACTOR_ID;
    const items = await this.apify.runSync<Record<string, unknown>>({
      actorId,
      input: { profiles: [username], resultsPerPage: PROFILE_RESULTS_PER_PAGE },
    });
    if (items.length === 0) {
      throw new PlatformError(
        PlatformErrorCode.NOT_FOUND,
        `Apify returned no profile for username=${username}`,
      );
    }
    const record = this.isRecord(items[0].authorMeta)
      ? items[0].authorMeta
      : items[0];
    return this.normalizeAccountProfile(record, items[0]);
  }

  detectPostId(url: string): string | null {
    const detection = detectPlatform(url);
    return detection?.platform === this.platform
      ? detection.platform_post_id
      : null;
  }

  private toRawPostData(record: Record<string, unknown>): RawPostData {
    const metrics: RawPostMetrics = {
      likeCount: this.readNumber(record, ['diggCount', 'likeCount', 'likes']),
      commentCount: this.readNumber(record, ['commentCount', 'comments']),
      shareCount: this.readNumber(record, ['shareCount', 'shares']),
      viewCount: this.readNumber(record, ['playCount', 'viewCount', 'views']),
      reactionCount: 0,
      savedCount: this.readNumber(record, ['collectCount']),
    };

    const authorMeta = this.asRecord(record.authorMeta);
    const videoMeta = this.asRecord(record.videoMeta);

    return {
      platformPostId: this.readString(record, ['id']),
      platformUserId:
        this.readOptionalString(authorMeta, ['id']) ??
        this.readString(record, ['authorMeta.id']),
      authorUsername:
        this.readOptionalString(authorMeta, ['name', 'uniqueId']) ??
        this.readOptionalString(record, ['authorMeta.name']),
      authorDisplayName:
        this.readOptionalString(authorMeta, ['nickName', 'nickname']) ?? null,
      authorAvatarUrl:
        this.readOptionalString(authorMeta, ['avatar', 'avatarThumb']) ?? null,
      content: this.readOptionalString(record, ['text']),
      mediaUrls: this.extractMediaUrls(record, videoMeta),
      metrics,
      publishedAt: this.readDate(record, [
        'createTimeISO',
        'createTime',
        'publishedAt',
      ]),
      raw: record,
    };
  }

  private extractMediaUrls(
    record: Record<string, unknown>,
    videoMeta: Record<string, unknown>,
  ): string[] {
    const urls: string[] = [];
    const webUrl = this.readOptionalString(record, [
      'webVideoUrl',
      'videoUrl',
      'url',
    ]);
    if (webUrl) urls.push(webUrl);
    const cover = this.readOptionalString(videoMeta, [
      'coverUrl',
      'cover',
      'originCover',
    ]);
    if (cover) urls.push(cover);
    return urls;
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
    const platformCommentId = this.readString(record, ['cid', 'id']);
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

    const uniqueId = this.readOptionalString(record, ['uniqueId', 'username']);

    return {
      platformCommentId,
      authorUsername: uniqueId,
      authorDisplayName: this.readOptionalString(record, [
        'nickname',
        'nickName',
        'uniqueId',
      ]),
      authorProfileUrl: uniqueId ? `https://www.tiktok.com/@${uniqueId}` : null,
      text: this.readString(record, ['text', 'comment']),
      likeCount: this.readNumber(record, ['diggCount', 'likeCount', 'likes']),
      replyCount: this.readNumber(record, [
        'replyCommentTotal',
        'replyCount',
        'repliesCount',
      ]),
      parentPlatformCommentId,
      publishedAt: this.readDate(record, ['createTimeISO', 'createTime']),
      replies,
      raw: record,
    };
  }
}
