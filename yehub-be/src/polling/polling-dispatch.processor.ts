import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { Job, Queue } from 'bullmq';
import { CampaignStatus } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { QUEUE_NAMES } from '../queue/queue.constants';
import { isJobPending, workJobId, workJobOptions } from './polling-job.util';
import { POLLING_JOB_TYPES } from './polling.constants';

type DispatchJobData = { postId: string };

@Injectable()
@Processor(QUEUE_NAMES.JOB_SCHEDULER)
export class PollingDispatchProcessor extends WorkerHost {
  private readonly logger = new Logger(PollingDispatchProcessor.name);

  constructor(
    @InjectQueue(QUEUE_NAMES.SCRAPER)
    private readonly scraperQueue: Queue,
    private readonly prisma: PrismaService,
  ) {
    super();
  }

  async process(job: Job<DispatchJobData>): Promise<void> {
    const jobType = POLLING_JOB_TYPES[job.name];
    if (!jobType) {
      this.logger.warn(`Ignoring unknown dispatch job jobName=${job.name}`);
      return;
    }

    const { postId } = job.data;
    const post = await this.prisma.post.findUnique({
      where: { id: postId },
      select: {
        url: true,
        deleted_at: true,
        campaign: { select: { status: true } },
      },
    });

    if (
      !post ||
      post.deleted_at ||
      !post.url ||
      post.campaign.status !== CampaignStatus.ACTIVE
    ) {
      this.logger.debug(`Dispatch skipped postId=${postId} jobType=${jobType}`);
      return;
    }

    const existing = await this.scraperQueue.getJob(workJobId(postId, jobType));
    if (await isJobPending(existing)) {
      this.logger.debug(`Dispatch deduped postId=${postId} jobType=${jobType}`);
      return;
    }

    await this.scraperQueue.add(
      job.name,
      { postId },
      workJobOptions(postId, jobType),
    );
    this.logger.debug(`Dispatched postId=${postId} jobType=${jobType}`);
  }
}
