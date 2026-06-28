import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { APIFY_JOB_NAMES, QUEUE_NAMES } from '../queue/queue.constants';
import { ApifyRunContext } from './apify-run-context';

export interface ApifyRunUsageSnapshot {
  status: string;
  startedAt?: Date | null;
  finishedAt?: Date | null;
  runTimeSecs?: number | null;
  computeUnits?: number | null;
  usageTotalUsd?: number | null;
  usageUsd?: unknown;
}

export interface ApifyRunRecord extends ApifyRunUsageSnapshot {
  apifyRunId: string | null;
  actorId: string;
}

export type ApifyUsageRefreshJobData = {
  apifyRunRowId: string;
  apifyRunId: string;
};

const DEFAULT_USAGE_REFRESH_DELAY_MS = 15_000;

// Persists one row per Apify Actor run for the spending dashboard,
// attributing the cost to the post/campaign/account taken from the active
// ApifyRunContext. Recording must never break the scrape itself, so all
// failures are swallowed and logged.
@Injectable()
export class ApifyRunRecorder {
  private readonly logger = new Logger(ApifyRunRecorder.name);

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(QUEUE_NAMES.SCRAPER) private readonly scraperQueue: Queue,
    private readonly context: ApifyRunContext,
    private readonly config: ConfigService,
  ) {}

  async record(record: ApifyRunRecord): Promise<void> {
    try {
      const meta = this.context.get();
      const row = await this.prisma.apifyRun.create({
        data: {
          apify_run_id: record.apifyRunId,
          actor_id: record.actorId,
          job_type: meta?.jobType ?? 'unknown',
          status: record.status,
          post_id: meta?.postId ?? null,
          campaign_id: meta?.campaignId ?? null,
          social_account_id: meta?.socialAccountId ?? null,
          started_at: record.startedAt ?? null,
          finished_at: record.finishedAt ?? null,
          run_time_secs: record.runTimeSecs ?? null,
          compute_units: record.computeUnits ?? null,
          usage_total_usd: record.usageTotalUsd ?? null,
          usage_usd: this.toJson(record.usageUsd),
        },
        select: { id: true },
      });

      // Usage figures right after a run finishes are preliminary (Apify
      // recommends re-reading the run ~10s later), so refresh them async.
      if (record.apifyRunId) {
        const data: ApifyUsageRefreshJobData = {
          apifyRunRowId: row.id,
          apifyRunId: record.apifyRunId,
        };
        await this.scraperQueue.add(APIFY_JOB_NAMES.REFRESH_RUN_USAGE, data, {
          delay:
            this.config.get<number>('APIFY_USAGE_REFRESH_DELAY_MS') ??
            DEFAULT_USAGE_REFRESH_DELAY_MS,
        });
      }
    } catch (err) {
      this.logger.warn(
        `Failed to record Apify run apifyRunId=${record.apifyRunId ?? ''} actorId=${record.actorId}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  async updateUsage(
    rowId: string,
    snapshot: ApifyRunUsageSnapshot,
  ): Promise<void> {
    await this.prisma.apifyRun.update({
      where: { id: rowId },
      data: {
        status: snapshot.status,
        finished_at: snapshot.finishedAt ?? null,
        run_time_secs: snapshot.runTimeSecs ?? null,
        compute_units: snapshot.computeUnits ?? null,
        usage_total_usd: snapshot.usageTotalUsd ?? null,
        usage_usd: this.toJson(snapshot.usageUsd),
        usage_finalized: true,
      },
    });
  }

  private toJson(
    value: unknown,
  ): Prisma.InputJsonValue | typeof Prisma.JsonNull {
    if (value === undefined || value === null) return Prisma.JsonNull;
    return value as Prisma.InputJsonValue;
  }
}
