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

const POSTS_ACTOR_ID = 'apify~facebook-posts-scraper';
const COMMENTS_ACTOR_ID = 'apify~facebook-comments-scraper';
const PAGES_ACTOR_ID = 'apify~facebook-pages-scraper';

const DEFAULT_POSTS_RESULTS_LIMIT = 25;
const DEFAULT_COMMENTS_RESULTS_LIMIT = 500;

@Injectable()
export class FacebookAdapter extends BasePlatformAdapter {
  readonly platform = Platform.FACEBOOK;

  constructor(
    proxy: ScraperProxyClient,
    private readonly apify: ApifyClient,
    private readonly config: ConfigService,
  ) {
    super(proxy);
  }

  async fetchPostData(url: string): Promise<RawPostData> {
    const actorId =
      this.config.get<string>('APIFY_FACEBOOK_POSTS_ACTOR_ID') ??
      POSTS_ACTOR_ID;
    const resultsLimit =
      this.config.get<number>('APIFY_FACEBOOK_POSTS_LIMIT') ??
      DEFAULT_POSTS_RESULTS_LIMIT;

    const items = await this.apify.runSync<Record<string, unknown>>({
      actorId,
      input: { startUrls: [{ url }], resultsLimit },
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
          (item) =>
            this.readString(item, ['postId', 'facebookId']) === targetPostId,
        )) ||
      items.find(
        (item) => this.readString(item, ['url', 'facebookUrl']) === url,
      ) ||
      items[0];

    return this.toRawPostData(match);
  }

  async fetchComments(url: string, since?: Date): Promise<RawComment[]> {
    const actorId =
      this.config.get<string>('APIFY_FACEBOOK_COMMENTS_ACTOR_ID') ??
      COMMENTS_ACTOR_ID;
    const resultsLimit =
      this.config.get<number>('APIFY_FACEBOOK_COMMENTS_LIMIT') ??
      DEFAULT_COMMENTS_RESULTS_LIMIT;

    const items = await this.apify.runSync<Record<string, unknown>>({
      actorId,
      input: {
        startUrls: [{ url }],
        resultsLimit,
        includeNestedComments: true,
        viewOption: 'RANKED_UNFILTERED',
        ...(since && { onlyCommentsNewerThan: since.toISOString() }),
      },
    });

    return this.toRawComments(items, since);
  }

  async fetchAccountProfile(username: string): Promise<RawAccountProfile> {
    const actorId =
      this.config.get<string>('APIFY_FACEBOOK_PAGES_ACTOR_ID') ??
      PAGES_ACTOR_ID;
    const items = await this.apify.runSync<Record<string, unknown>>({
      actorId,
      input: { startUrls: [{ url: `https://www.facebook.com/${username}` }] },
    });
    if (items.length === 0) {
      throw new PlatformError(
        PlatformErrorCode.NOT_FOUND,
        `Apify returned no page for username=${username}`,
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

  private toRawPostData(record: Record<string, unknown>): RawPostData {
    // Reels nest author/media under short_form_video_context and use
    // different metric keys than regular posts.
    const reel = this.asRecord(record.short_form_video_context);
    const videoOwner = this.asRecord(reel.video_owner);

    const metrics: RawPostMetrics = {
      likeCount:
        this.readNumber(record, ['likes']) ||
        this.readNumber(this.asRecord(record.likers), ['count']),
      commentCount: this.readNumber(record, [
        'comments',
        'total_comment_count',
      ]),
      shareCount: this.readNumber(record, ['shares', 'share_count_reduced']),
      viewCount: this.readNumber(record, ['viewsCount', 'views']),
      reactionCount:
        this.readNumber(record, ['topReactionsCount']) ||
        this.readNumber(this.asRecord(record.unified_reactors), ['count']),
      savedCount: 0,
    };

    const user = this.asRecord(record.user);

    return {
      platformPostId: this.readString(record, [
        'postId',
        'facebookId',
        'feedbackId',
      ]),
      platformUserId:
        this.readString(user, ['id']) || this.readString(videoOwner, ['id']),
      authorUsername: this.readOptionalString(record, ['pageName']),
      authorDisplayName:
        this.readOptionalString(user, ['name']) ??
        this.readOptionalString(videoOwner, ['name']) ??
        this.readOptionalString(record, ['pageName', 'authorName']),
      authorAvatarUrl:
        this.readOptionalString(user, ['profilePicture', 'profilePic']) ??
        this.readOptionalString(this.asRecord(videoOwner.displayPicture), [
          'uri',
        ]) ??
        this.readOptionalString(record, ['profilePicture']),
      content:
        this.readOptionalString(record, ['text']) ??
        this.readOptionalString(this.asRecord(record.message), ['text']),
      mediaUrls: this.extractPostMediaUrls(record, reel),
      metrics,
      publishedAt:
        this.readDate(record, ['time', 'timestamp']) ??
        this.readEpochDate(record, ['creation_time']),
      raw: record,
    };
  }

  private toRawComments(
    items: Record<string, unknown>[],
    since?: Date,
  ): RawComment[] {
    const byPlatformId = new Map<string, RawComment>();
    const orphanReplies: { reply: RawComment; parentId: string }[] = [];

    for (const item of items) {
      const comment = this.toRawComment(item);
      if (!comment) continue;
      if (since && comment.publishedAt && comment.publishedAt <= since) {
        continue;
      }
      byPlatformId.set(comment.platformCommentId, comment);

      if (comment.parentPlatformCommentId) {
        const parent = byPlatformId.get(comment.parentPlatformCommentId);
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
      const parent = byPlatformId.get(parentId);
      if (parent) parent.replies.push(reply);
    }

    const topLevel: RawComment[] = [];
    for (const comment of byPlatformId.values()) {
      if (!comment.parentPlatformCommentId) topLevel.push(comment);
    }
    return topLevel;
  }

  private toRawComment(record: Record<string, unknown>): RawComment | null {
    const platformCommentId = this.readString(record, ['id', 'commentId']);
    if (!platformCommentId) return null;

    const profileId = this.readOptionalString(record, ['profileId']);

    return {
      platformCommentId,
      authorUsername: profileId,
      authorDisplayName: this.readOptionalString(record, ['profileName']),
      authorProfileUrl:
        this.readOptionalString(record, ['profileUrl']) ??
        (profileId ? `https://www.facebook.com/${profileId}` : null),
      text: this.readString(record, ['text']),
      likeCount: this.readNumber(record, ['likesCount']),
      replyCount: this.readNumber(record, ['commentsCount']),
      parentPlatformCommentId: this.readOptionalString(record, [
        'replyToCommentId',
      ]),
      publishedAt: this.readDate(record, ['date']),
      replies: [],
      raw: record,
    };
  }

  private extractPostMediaUrls(
    record: Record<string, unknown>,
    reel: Record<string, unknown>,
  ): string[] {
    const mediaUrls = this.extractMediaUrls(record.media);
    if (mediaUrls.length > 0) return mediaUrls;

    const playback = this.asRecord(reel.playback_video);
    const thumbnail =
      this.readOptionalString(this.asRecord(playback.thumbnailImage), [
        'uri',
      ]) ??
      this.readOptionalString(this.asRecord(reel.video), [
        'first_frame_thumbnail',
      ]);
    return thumbnail ? [thumbnail] : [];
  }

  private readEpochDate(
    record: Record<string, unknown>,
    keys: string[],
  ): Date | null {
    for (const key of keys) {
      const value = record[key];
      const seconds =
        typeof value === 'number'
          ? value
          : typeof value === 'string'
            ? Number(value)
            : NaN;
      if (Number.isFinite(seconds) && seconds > 0) {
        return new Date(seconds * 1000);
      }
    }
    return null;
  }

  private extractMediaUrls(media: unknown): string[] {
    if (!Array.isArray(media)) return [];
    const urls: string[] = [];
    for (const item of media) {
      if (!this.isRecord(item)) continue;
      const url =
        this.readOptionalString(item, [
          'url',
          'photoUrl',
          'videoUrl',
          'thumbnail',
        ]) ?? null;
      if (url) urls.push(url);
    }
    return urls;
  }
}
