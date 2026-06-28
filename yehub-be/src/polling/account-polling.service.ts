import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { Queue } from 'bullmq';
import { POLLING_JOB_NAMES, QUEUE_NAMES } from '../queue/queue.constants';
import {
  accountWorkJobId,
  accountWorkJobOptions,
  isJobPending,
} from './polling-job.util';

export type AccountPollingJobData = {
  socialAccountId: string;
  manual?: boolean;
};

// Enqueue-only surface for social-account profile polls. Lives in
// PollingModule so both the API (profiles endpoints) and the worker
// (auto-link in PollingRunner) can queue account polls.
@Injectable()
export class AccountPollingService {
  private readonly logger = new Logger(AccountPollingService.name);

  constructor(
    @InjectQueue(QUEUE_NAMES.SCRAPER)
    private readonly scraperQueue: Queue,
  ) {}

  async enqueue(
    socialAccountId: string,
    opts?: { manual?: boolean },
  ): Promise<boolean> {
    const existing = await this.scraperQueue.getJob(
      accountWorkJobId(socialAccountId),
    );
    if (await isJobPending(existing)) return false;

    await this.scraperQueue.add(
      POLLING_JOB_NAMES.POLL_SOCIAL_ACCOUNT,
      { socialAccountId, manual: opts?.manual === true },
      accountWorkJobOptions(socialAccountId),
    );
    this.logger.debug(`Queued account poll socialAccountId=${socialAccountId}`);
    return true;
  }

  // For creation paths: a failed enqueue must never fail the request.
  async enqueueSafe(socialAccountId: string): Promise<boolean> {
    try {
      return await this.enqueue(socialAccountId);
    } catch (error) {
      this.logger.warn(
        `Failed to queue account poll socialAccountId=${socialAccountId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return false;
    }
  }
}
