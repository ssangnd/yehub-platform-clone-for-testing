import { Injectable, Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import {
  CampaignStatus,
  LinkedBy,
  Platform,
  Prisma,
} from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UploadsService } from '../uploads/uploads.service';
import { PlatformAdapterRegistry } from './adapters/platform-adapter.registry';
import { RawComment, RawPostData } from './adapters/platform-adapter.interface';
import { POLLING_JOB_TYPES } from './polling.constants';
import { PlatformError } from './platform-error';
import { AccountPollingService } from './account-polling.service';
import { ApifyRunContext } from './apify-run-context';

export type PollingJobData = {
  postId: string;
  manual?: boolean;
};

@Injectable()
export class PollingRunner {
  private readonly logger = new Logger(PollingRunner.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly adapters: PlatformAdapterRegistry,
    private readonly uploads: UploadsService,
    private readonly accountPolling: AccountPollingService,
    private readonly runContext: ApifyRunContext,
  ) {}

  async process(job: Job<PollingJobData>): Promise<void> {
    const jobType = POLLING_JOB_TYPES[job.name];
    if (!jobType) {
      this.logger.warn(`Ignoring unknown polling job jobName=${job.name}`);
      return;
    }

    const post = await this.prisma.post.findUnique({
      where: { id: job.data.postId },
      include: {
        campaign: { select: { status: true } },
      },
    });

    const manual = job.data.manual === true;
    if (
      !post ||
      post.deleted_at ||
      !post.url ||
      (!manual && post.campaign.status !== CampaignStatus.ACTIVE)
    ) {
      this.logger.debug(
        `Polling no-op postId=${job.data.postId} jobType=${jobType} manual=${manual}`,
      );
      return;
    }

    const url = post.url;
    // Attribute any Apify run triggered by the adapters to this post/campaign.
    const runMeta = {
      jobType: job.name,
      postId: post.id,
      campaignId: post.campaign_id,
    };

    try {
      const adapter = this.adapters.get(post.platform);
      if (jobType === 'metrics') {
        const data = await this.runContext.run(runMeta, () =>
          adapter.fetchPostData(url),
        );
        if (data.authorAvatarUrl) {
          const mirrored = await this.uploads.mirrorRemoteImage(
            data.authorAvatarUrl,
            `avatars/posts/${post.id}`,
          );
          if (mirrored) data.authorAvatarUrl = mirrored;
        }
        await this.prisma.post.update({
          where: { id: post.id },
          data: {
            // platform_post_id is intentionally NOT updated here: it is the
            // URL-derived dedup key (see addPost/bulkUpload) and must stay
            // immutable, otherwise re-adding the same URL is no longer detected
            // as a duplicate. Polling is URL-driven and never reads this value.
            content: data.content,
            author_name: data.authorDisplayName ?? data.authorUsername,
            author_avatar: data.authorAvatarUrl,
            likes: data.metrics.likeCount || data.metrics.reactionCount,
            shares: data.metrics.shareCount,
            views: data.metrics.viewCount,
            comment_count: data.metrics.commentCount,
            saved_count: data.metrics.savedCount,
            published_at: data.publishedAt,
            metrics_snapshot: {
              likeCount: data.metrics.likeCount,
              commentCount: data.metrics.commentCount,
              shareCount: data.metrics.shareCount,
              viewCount: data.metrics.viewCount,
              reactionCount: data.metrics.reactionCount,
              savedCount: data.metrics.savedCount,
              mediaUrls: data.mediaUrls,
              raw: data.raw,
            } as Prisma.JsonObject,
            last_polled_at: new Date(),
            last_metric_polled_at: new Date(),
            last_poll_status: 'success',
          },
        });
        try {
          await this.ensureAuthorLinked(post.id, post.platform, data);
        } catch (error) {
          this.logger.warn(
            `Author auto-link failed postId=${post.id}: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        }
      } else {
        const latest = await this.prisma.comment.findFirst({
          where: { post_id: post.id, platform_created_at: { not: null } },
          orderBy: { platform_created_at: 'desc' },
          select: { platform_created_at: true },
        });
        const comments = await this.runContext.run(runMeta, () =>
          adapter.fetchComments(url, latest?.platform_created_at ?? undefined),
        );
        await this.persistComments(post.id, post.platform, comments);
        const commentCount = await this.prisma.comment.count({
          where: { post_id: post.id },
        });
        await this.prisma.post.update({
          where: { id: post.id },
          data: {
            comment_count: commentCount,
            last_polled_at: new Date(),
            last_comment_polled_at: new Date(),
            last_poll_status: 'success',
          },
        });
      }
    } catch (err) {
      await this.prisma.post.update({
        where: { id: post.id },
        data: {
          last_polled_at: new Date(),
          last_poll_status: 'failed',
        },
      });
      this.logger.error(
        `Polling failed postId=${post.id} jobType=${jobType} code=${
          err instanceof PlatformError ? err.code : 'UNKNOWN'
        } retryAfterMs=${
          err instanceof PlatformError ? (err.retryAfterMs ?? '') : ''
        }: ${err instanceof Error ? err.message : 'Unknown error'}`,
      );
      throw err;
    }
  }

  private async persistComments(
    postId: string,
    platform: Platform,
    comments: RawComment[],
  ): Promise<void> {
    const topLevelComments = this.flatten(comments).filter(
      (comment) => !comment.parentPlatformCommentId,
    );
    const replies = this.flatten(comments).filter(
      (comment) => comment.parentPlatformCommentId,
    );
    const idByPlatformCommentId = new Map<string, string>();

    for (const comment of topLevelComments) {
      const saved = await this.saveComment(postId, platform, comment, null);
      idByPlatformCommentId.set(comment.platformCommentId, saved.id);
    }

    for (const reply of replies) {
      const parentId = reply.parentPlatformCommentId
        ? (idByPlatformCommentId.get(reply.parentPlatformCommentId) ??
          (await this.findCommentId(postId, reply.parentPlatformCommentId)))
        : null;
      const saved = await this.saveComment(postId, platform, reply, parentId);
      idByPlatformCommentId.set(reply.platformCommentId, saved.id);
    }
  }

  private flatten(comments: RawComment[]): RawComment[] {
    return comments.flatMap((comment) => [
      comment,
      ...this.flatten(comment.replies),
    ]);
  }

  /**
   * If the post has no linked social account yet, create one (and a profile)
   * from the post's author and link it with linked_by=AUTO. Reuses an existing
   * account when one already matches [platform, platform_user_id], so
   * auto-created accounts dedupe against manually-added KOLs.
   */
  private async ensureAuthorLinked(
    postId: string,
    platform: Platform,
    data: RawPostData,
  ): Promise<void> {
    const existingLink = await this.prisma.socialAccountPost.findUnique({
      where: { post_id: postId },
      select: { post_id: true },
    });
    if (existingLink) return;

    const username = data.authorUsername;
    if (!username) {
      this.logger.debug(
        `Skipping author auto-link, no author username postId=${postId}`,
      );
      return;
    }

    if (!data.platformUserId) {
      this.logger.debug(
        `Skipping author auto-link, no platform user id postId=${postId}`,
      );
      return;
    }

    const name = data.authorDisplayName ?? username;

    let accountId: string;
    let createdNewAccount = false;
    const existingAccount = await this.prisma.socialAccount.findFirst({
      where: { platform, platform_user_id: data.platformUserId },
      select: { id: true },
    });

    if (existingAccount) {
      accountId = existingAccount.id;
    } else {
      try {
        const created = await this.prisma.socialAccount.create({
          data: {
            platform,
            platform_user_id: data.platformUserId,
            username,
            display_name: data.authorDisplayName,
            profile: { create: { name, avatar: data.authorAvatarUrl } },
          },
          select: { id: true },
        });
        accountId = created.id;
        createdNewAccount = true;
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002'
        ) {
          const refetched = await this.prisma.socialAccount.findFirst({
            where: { platform, platform_user_id: data.platformUserId },
            select: { id: true },
          });
          if (!refetched) throw error;
          accountId = refetched.id;
        } else {
          throw error;
        }
      }
    }

    if (createdNewAccount) {
      // Fill in follower count / verified flag for the account we just made.
      // Reused accounts were already polled when they were created.
      await this.accountPolling.enqueueSafe(accountId);
    }

    try {
      await this.prisma.socialAccountPost.create({
        data: {
          post_id: postId,
          social_account_id: accountId,
          linked_by: LinkedBy.AUTO,
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        return; // linked concurrently by another job
      }
      throw error;
    }
  }

  private async findCommentId(
    postId: string,
    platformCommentId: string,
  ): Promise<string | null> {
    const comment = await this.prisma.comment.findFirst({
      where: { post_id: postId, platform_comment_id: platformCommentId },
      select: { id: true },
    });
    return comment?.id ?? null;
  }

  private async saveComment(
    postId: string,
    platform: Platform,
    comment: RawComment,
    parentCommentId: string | null,
  ): Promise<{ id: string }> {
    const existing = await this.prisma.comment.findFirst({
      where: {
        post_id: postId,
        platform_comment_id: comment.platformCommentId,
      },
      select: { id: true },
    });

    const data = {
      content: comment.text,
      parent_comment_id: parentCommentId,
      author_name: comment.authorDisplayName ?? comment.authorUsername,
      author_profile_url: comment.authorProfileUrl,
      platform_created_at: comment.publishedAt,
      like_count: comment.likeCount,
      reply_count: comment.replyCount,
    };

    if (existing) {
      return this.prisma.comment.update({
        where: { id: existing.id },
        data,
        select: { id: true },
      });
    }

    return this.prisma.comment.create({
      data: {
        post_id: postId,
        platform_comment_id: comment.platformCommentId,
        platform,
        ...data,
      },
      select: { id: true },
    });
  }
}
