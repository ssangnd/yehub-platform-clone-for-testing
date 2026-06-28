import { Injectable } from '@nestjs/common';
import { Job } from 'bullmq';
import { ApifyClient } from './apify.client';
import {
  ApifyRunRecorder,
  ApifyUsageRefreshJobData,
} from './apify-run.recorder';

// Handles the delayed refresh-apify-run-usage jobs: replaces the preliminary
// usage figures recorded right after a run finished with the stable ones.
@Injectable()
export class ApifyUsageRefresher {
  constructor(
    private readonly client: ApifyClient,
    private readonly recorder: ApifyRunRecorder,
  ) {}

  async process(job: Job<ApifyUsageRefreshJobData>): Promise<void> {
    const snapshot = await this.client.getRun(job.data.apifyRunId);
    await this.recorder.updateUsage(job.data.apifyRunRowId, snapshot);
  }
}
