import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { Queue } from 'bullmq';
import { CampaignStatus } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { POLLING_JOB_NAMES, QUEUE_NAMES } from '../queue/queue.constants';
import {
  DEFAULT_COMMENT_POLLING_INTERVAL_SECONDS,
  DEFAULT_METRIC_POLLING_INTERVAL_SECONDS,
  INTERVAL_TO_CRON,
  POLLING_CRON_TIMEZONE,
  SCHEDULER_TEMPLATE_OPTIONS,
  type PollingJobType,
} from './polling.constants';
import {
  isJobPending,
  schedulerId,
  workJobId,
  workJobOptions,
} from './polling-job.util';

type PollingPost = {
  id: string;
  campaign_id: string;
  polling_metric_override: number | null;
  polling_comment_override: number | null;
  campaign: {
    status: CampaignStatus;
    metric_polling_interval: number | null;
    comments_polling_interval: number | null;
  };
};

export type EffectivePollingIntervals = {
  metricIntervalSeconds: number;
  commentIntervalSeconds: number;
};

export type NextPostSyncTimes = {
  next_metric_sync_at: Date | null;
  next_comment_sync_at: Date | null;
};

const JOB_NAME_BY_DIMENSION: Record<PollingJobType, string> = {
  metrics: POLLING_JOB_NAMES.POLL_POST_METRICS,
  comments: POLLING_JOB_NAMES.POLL_POST_COMMENTS,
};

@Injectable()
export class PollingSchedulerService {
  private readonly logger = new Logger(PollingSchedulerService.name);

  constructor(
    @InjectQueue(QUEUE_NAMES.JOB_SCHEDULER)
    private readonly schedulerQueue: Queue,
    @InjectQueue(QUEUE_NAMES.SCRAPER)
    private readonly scraperQueue: Queue,
    private readonly prisma: PrismaService,
  ) {}

  resolveIntervals(post: PollingPost): EffectivePollingIntervals {
    return {
      metricIntervalSeconds:
        post.polling_metric_override ??
        post.campaign.metric_polling_interval ??
        DEFAULT_METRIC_POLLING_INTERVAL_SECONDS,
      commentIntervalSeconds:
        post.polling_comment_override ??
        post.campaign.comments_polling_interval ??
        DEFAULT_COMMENT_POLLING_INTERVAL_SECONDS,
    };
  }

  async scheduleCampaign(campaignId: string): Promise<void> {
    const posts = await this.prisma.post.findMany({
      where: { campaign_id: campaignId, deleted_at: null },
      select: this.postSelect(),
    });

    await Promise.all(posts.map((post) => this.applyPostSchedules(post)));
  }

  async removeCampaign(campaignId: string): Promise<void> {
    const prefix = `campaign:${campaignId}:`;
    const schedulers = await this.schedulerQueue.getJobSchedulers();
    await Promise.all(
      schedulers
        .filter((s) => s.key?.startsWith(prefix))
        .map((s) => this.schedulerQueue.removeJobScheduler(s.key)),
    );
    this.logger.debug(`Removed schedulers for campaignId=${campaignId}`);
  }

  async rescheduleCampaignInheritedPosts(campaignId: string): Promise<void> {
    const posts = await this.prisma.post.findMany({
      where: {
        campaign_id: campaignId,
        deleted_at: null,
        OR: [
          { polling_metric_override: null },
          { polling_comment_override: null },
        ],
      },
      select: this.postSelect(),
    });

    await Promise.all(posts.map((post) => this.applyPostSchedules(post)));
  }

  async schedulePost(postId: string): Promise<void> {
    const post = await this.loadPost(postId);
    if (!post) return;
    await this.applyPostSchedules(post);
  }

  async removePost(postId: string): Promise<void> {
    const post = await this.loadPost(postId);
    if (!post) return;
    await Promise.all([
      this.schedulerQueue.removeJobScheduler(
        schedulerId(post.campaign_id, post.id, 'metrics'),
      ),
      this.schedulerQueue.removeJobScheduler(
        schedulerId(post.campaign_id, post.id, 'comments'),
      ),
    ]);
  }

  async getNextSyncTimes(postId: string): Promise<NextPostSyncTimes> {
    const empty = { next_metric_sync_at: null, next_comment_sync_at: null };
    const post = await this.loadPost(postId);
    if (!post || !this.canSchedule(post)) return empty;

    const [metricScheduler, commentScheduler] = await Promise.all([
      this.schedulerQueue.getJobScheduler(
        schedulerId(post.campaign_id, post.id, 'metrics'),
      ),
      this.schedulerQueue.getJobScheduler(
        schedulerId(post.campaign_id, post.id, 'comments'),
      ),
    ]);

    const now = Date.now();
    return {
      next_metric_sync_at: this.toFutureDate(metricScheduler?.next, now),
      next_comment_sync_at: this.toFutureDate(commentScheduler?.next, now),
    };
  }

  // BullMQ's `next` can lag into the past when the worker hasn't advanced the
  // scheduler yet. A past time isn't a real upcoming sync, so surface it as
  // unscheduled ("Not scheduled") rather than a stale timestamp.
  private toFutureDate(next: number | undefined, now: number): Date | null {
    return next && next > now ? new Date(next) : null;
  }

  async triggerImmediate(
    postId: string,
    dimensions: { metrics?: boolean; comments?: boolean },
  ): Promise<{ metrics: boolean; comments: boolean }> {
    const [metrics, comments] = await Promise.all([
      dimensions.metrics
        ? this.enqueueManualPoll(postId, 'metrics')
        : Promise.resolve(false),
      dimensions.comments
        ? this.enqueueManualPoll(postId, 'comments')
        : Promise.resolve(false),
    ]);
    if (metrics || comments) {
      this.logger.debug(
        `Queued manual poll postId=${postId} metrics=${metrics} comments=${comments}`,
      );
    }
    return { metrics, comments };
  }

  private async applyPostSchedules(post: PollingPost): Promise<void> {
    const intervals = this.resolveIntervals(post);
    await Promise.all([
      this.applyDimension(post, 'metrics', intervals.metricIntervalSeconds),
      this.applyDimension(post, 'comments', intervals.commentIntervalSeconds),
    ]);
  }

  private async applyDimension(
    post: PollingPost,
    dimension: PollingJobType,
    intervalSeconds: number,
  ): Promise<void> {
    const id = schedulerId(post.campaign_id, post.id, dimension);
    const pattern = INTERVAL_TO_CRON[intervalSeconds];
    if (
      this.canSchedule(post) &&
      this.isRecurringInterval(intervalSeconds) &&
      pattern
    ) {
      await this.schedulerQueue.upsertJobScheduler(
        id,
        { pattern, tz: POLLING_CRON_TIMEZONE },
        {
          name: JOB_NAME_BY_DIMENSION[dimension],
          data: { postId: post.id },
          opts: SCHEDULER_TEMPLATE_OPTIONS,
        },
      );
    } else {
      await this.schedulerQueue.removeJobScheduler(id);
    }
  }

  private async enqueueManualPoll(
    postId: string,
    dimension: PollingJobType,
  ): Promise<boolean> {
    const existing = await this.scraperQueue.getJob(
      workJobId(postId, dimension),
    );
    if (await isJobPending(existing)) {
      return false;
    }
    await this.scraperQueue.add(
      JOB_NAME_BY_DIMENSION[dimension],
      { postId, manual: true },
      workJobOptions(postId, dimension),
    );
    return true;
  }

  private async loadPost(postId: string): Promise<PollingPost | null> {
    return this.prisma.post.findUnique({
      where: { id: postId },
      select: this.postSelect(),
    });
  }

  private canSchedule(post: PollingPost): boolean {
    return post.campaign.status === CampaignStatus.ACTIVE;
  }

  private isRecurringInterval(intervalSeconds: number): boolean {
    return intervalSeconds > 0;
  }

  private postSelect() {
    return {
      id: true,
      campaign_id: true,
      polling_metric_override: true,
      polling_comment_override: true,
      campaign: {
        select: {
          status: true,
          metric_polling_interval: true,
          comments_polling_interval: true,
        },
      },
    } as const;
  }
}
