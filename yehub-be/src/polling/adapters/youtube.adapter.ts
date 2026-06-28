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

const POSTS_ACTOR_ID = 'streamers~youtube-scraper';
const COMMENTS_ACTOR_ID = 'streamers~youtube-comments-scraper';
const CHANNEL_ACTOR_ID = 'streamers~youtube-channel-scraper';

const DEFAULT_POSTS_RESULTS_LIMIT = 1;
const DEFAULT_COMMENTS_RESULTS_LIMIT = 500;

@Injectable()
export class YouTubeAdapter extends BasePlatformAdapter {
  readonly platform = Platform.YOUTUBE;

  constructor(
    proxy: ScraperProxyClient,
    private readonly apify: ApifyClient,
    private readonly config: ConfigService,
  ) {
    super(proxy);
  }

  async fetchPostData(url: string): Promise<RawPostData> {
    const actorId =
      this.config.get<string>('APIFY_YOUTUBE_POSTS_ACTOR_ID') ?? POSTS_ACTOR_ID;
    const maxResults =
      this.config.get<number>('APIFY_YOUTUBE_POSTS_LIMIT') ??
      DEFAULT_POSTS_RESULTS_LIMIT;

    const items = await this.apify.runSync<Record<string, unknown>>({
      actorId,
      input: { startUrls: [{ url }], maxResults },
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
        items.find(
          (item) => this.readString(item, ['id', 'videoId']) === targetId,
        )) ||
      items.find((item) => this.readString(item, ['url']) === url) ||
      items[0];

    const data = this.toRawPostData(match);
    if (!data.authorAvatarUrl) {
      const channelUrl = this.readOptionalString(match, ['channelUrl']);
      if (channelUrl) {
        data.authorAvatarUrl = await this.fetchChannelAvatar(channelUrl);
      }
    }
    return data;
  }

  async fetchAccountProfile(username: string): Promise<RawAccountProfile> {
    const handle = username.startsWith('@') ? username : `@${username}`;
    const items = await this.fetchChannelItems(
      `https://www.youtube.com/${handle}`,
    );
    if (items.length === 0) {
      throw new PlatformError(
        PlatformErrorCode.NOT_FOUND,
        `Apify returned no channel for username=${username}`,
      );
    }
    return this.normalizeAccountProfile(items[0], items[0]);
  }

  private async fetchChannelItems(
    channelUrl: string,
  ): Promise<Record<string, unknown>[]> {
    const actorId =
      this.config.get<string>('APIFY_YOUTUBE_CHANNEL_ACTOR_ID') ??
      CHANNEL_ACTOR_ID;
    return this.apify.runSync<Record<string, unknown>>({
      actorId,
      input: { startUrls: [{ url: channelUrl }] },
    });
  }

  private async fetchChannelAvatar(channelUrl: string): Promise<string | null> {
    try {
      const items = await this.fetchChannelItems(channelUrl);
      if (items.length === 0) return null;
      return this.readOptionalString(items[0], [
        'channelAvatarUrl',
        'channelLogoUrl',
      ]);
    } catch {
      return null;
    }
  }

  async fetchComments(url: string, since?: Date): Promise<RawComment[]> {
    const actorId =
      this.config.get<string>('APIFY_YOUTUBE_COMMENTS_ACTOR_ID') ??
      COMMENTS_ACTOR_ID;
    const maxComments =
      this.config.get<number>('APIFY_YOUTUBE_COMMENTS_LIMIT') ??
      DEFAULT_COMMENTS_RESULTS_LIMIT;

    const items = await this.apify.runSync<Record<string, unknown>>({
      actorId,
      input: {
        startUrls: [{ url }],
        maxComments,
        ...(since && {
          oldestCommentDate: since.toISOString().slice(0, 10),
        }),
      },
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
      likeCount: this.readNumber(record, ['likes', 'likeCount']),
      commentCount: this.readNumber(record, [
        'commentsCount',
        'commentCount',
        'numberOfComments',
      ]),
      shareCount: 0,
      viewCount: this.readNumber(record, [
        'viewCount',
        'numberOfViews',
        'views',
      ]),
      reactionCount: 0,
      savedCount: 0,
    };

    return {
      platformPostId: this.readString(record, ['id', 'videoId']),
      platformUserId: this.readString(record, ['channelId']),
      authorUsername: this.readOptionalString(record, [
        'channelUsername',
        'channelHandle',
        'channelId',
      ]),
      authorDisplayName: this.readOptionalString(record, [
        'channelName',
        'channelTitle',
        'author',
      ]),
      authorAvatarUrl: this.readOptionalString(record, [
        'channelAvatarUrl',
        'channelThumbnail',
      ]),
      content: this.readOptionalString(record, [
        'title',
        'text',
        'description',
      ]),
      mediaUrls: this.extractMediaUrls(record),
      metrics,
      publishedAt: this.readDate(record, ['date', 'uploadDate', 'publishedAt']),
      raw: record,
    };
  }

  private extractMediaUrls(record: Record<string, unknown>): string[] {
    const urls: string[] = [];
    const url = this.readOptionalString(record, ['url']);
    if (url) urls.push(url);
    const thumbnail = this.readOptionalString(record, [
      'thumbnailUrl',
      'thumbnail',
    ]);
    if (thumbnail) urls.push(thumbnail);
    return urls;
  }

  private toRawComments(
    items: Record<string, unknown>[],
    since?: Date,
  ): RawComment[] {
    const byId = new Map<string, RawComment>();
    const orphanReplies: { reply: RawComment; parentId: string }[] = [];

    for (const item of items) {
      const comment = this.toRawComment(item);
      if (!comment) continue;
      if (since && comment.publishedAt && comment.publishedAt <= since) {
        continue;
      }
      byId.set(comment.platformCommentId, comment);

      if (comment.parentPlatformCommentId) {
        const parent = byId.get(comment.parentPlatformCommentId);
        if (parent) {
          parent.replies.push(comment);
        } else {
          orphanReplies.push({
            reply: comment,
            parentId: comment.parentPlatformCommentId,
          });
        }
      }
    }

    for (const { reply, parentId } of orphanReplies) {
      const parent = byId.get(parentId);
      if (parent) parent.replies.push(reply);
    }

    const topLevel: RawComment[] = [];
    for (const comment of byId.values()) {
      if (!comment.parentPlatformCommentId) topLevel.push(comment);
    }
    return topLevel;
  }

  private toRawComment(record: Record<string, unknown>): RawComment | null {
    const platformCommentId = this.readString(record, [
      'cid',
      'commentId',
      'id',
    ]);
    if (!platformCommentId) return null;

    const author = this.readOptionalString(record, ['author']);
    const authorUsername = author ? author.replace(/^@/, '') : null;

    return {
      platformCommentId,
      authorUsername,
      authorDisplayName: authorUsername,
      authorProfileUrl: author ? `https://www.youtube.com/${author}` : null,
      text: this.readString(record, ['comment', 'text', 'commentText']),
      likeCount: this.readNumber(record, [
        'voteCount',
        'votes',
        'likes',
        'likeCount',
      ]),
      replyCount: this.readNumber(record, ['replyCount', 'repliesCount']),
      parentPlatformCommentId: this.readOptionalString(record, ['replyToCid']),
      publishedAt:
        this.readDate(record, ['date', 'publishedTime', 'time']) ??
        this.parseRelativeTime(
          this.readOptionalString(record, ['publishedTimeText']),
        ),
      replies: [],
      raw: record,
    };
  }

  private parseRelativeTime(text: string | null | undefined): Date | null {
    if (!text) return null;
    const match = text.match(
      /(\d+)\s*(second|minute|hour|day|week|month|year)s?\s+ago/i,
    );
    if (!match) return null;
    const n = Number(match[1]);
    const unit = match[2].toLowerCase();
    const msPerUnit: Record<string, number> = {
      second: 1_000,
      minute: 60_000,
      hour: 3_600_000,
      day: 86_400_000,
      week: 604_800_000,
      month: 2_592_000_000,
      year: 31_536_000_000,
    };
    const ms = msPerUnit[unit];
    if (!ms) return null;
    return new Date(Date.now() - n * ms);
  }
}
