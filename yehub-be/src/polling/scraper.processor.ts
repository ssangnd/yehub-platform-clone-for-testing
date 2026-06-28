import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { Job } from 'bullmq';
import {
  APIFY_JOB_NAMES,
  POLLING_JOB_NAMES,
  QUEUE_NAMES,
} from '../queue/queue.constants';
import { platformBackoffStrategy } from './polling-backoff';
import { PollingRunner, type PollingJobData } from './polling-runner.service';
import { AccountPollingRunner } from './account-polling-runner.service';
import type { AccountPollingJobData } from './account-polling.service';
import { ApifyUsageRefresher } from './apify-usage-refresher';
import type { ApifyUsageRefreshJobData } from './apify-run.recorder';

@Injectable()
@Processor(QUEUE_NAMES.SCRAPER, {
  concurrency: Number(process.env.POLLING_PROCESSOR_CONCURRENCY) || 1,
  settings: { backoffStrategy: platformBackoffStrategy },
})
export class ScraperProcessor extends WorkerHost {
  constructor(
    private readonly runner: PollingRunner,
    private readonly accountRunner: AccountPollingRunner,
    private readonly usageRefresher: ApifyUsageRefresher,
  ) {
    super();
  }

  async process(job: Job): Promise<void> {
    if (job.name === POLLING_JOB_NAMES.POLL_SOCIAL_ACCOUNT) {
      return this.accountRunner.process(job as Job<AccountPollingJobData>);
    }
    if (job.name === APIFY_JOB_NAMES.REFRESH_RUN_USAGE) {
      return this.usageRefresher.process(job as Job<ApifyUsageRefreshJobData>);
    }
    return this.runner.process(job as Job<PollingJobData>);
  }
}
