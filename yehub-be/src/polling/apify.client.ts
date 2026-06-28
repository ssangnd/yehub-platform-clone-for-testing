import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { ApifyRunRecorder, ApifyRunUsageSnapshot } from './apify-run.recorder';
import { PlatformError, PlatformErrorCode } from './platform-error';

export interface ApifyRunOptions {
  actorId: string;
  input: Record<string, unknown>;
  timeoutMs?: number;
}

interface ApifyRunObject {
  id: string;
  status: string;
  defaultDatasetId: string;
  startedAt?: string | null;
  finishedAt?: string | null;
  stats?: { runTimeSecs?: number; computeUnits?: number };
  usageTotalUsd?: number;
  usageUsd?: Record<string, number>;
}

// Statuses after which a run can no longer change (and no longer costs money).
const TERMINAL_STATUSES = new Set([
  'SUCCEEDED',
  'FAILED',
  'TIMED-OUT',
  'ABORTED',
]);

// Maximum value the API accepts for the waitForFinish query parameter.
const MAX_WAIT_FOR_FINISH_SECS = 60;

// Extra per-request slack on top of waitForFinish, since the server holds the
// connection open for the whole wait.
const REQUEST_SLACK_MS = 10_000;

@Injectable()
export class ApifyClient {
  private readonly logger = new Logger(ApifyClient.name);
  private readonly baseUrl = 'https://api.apify.com';

  constructor(
    private readonly config: ConfigService,
    private readonly recorder: ApifyRunRecorder,
  ) {}

  // Runs the Actor via the async run API (start, poll with waitForFinish,
  // fetch dataset items) but keeps the blocking semantics callers expect.
  // Unlike run-sync-get-dataset-items this exposes the run id, so every run
  // can be recorded with its cost for the spending dashboard.
  async runSync<T = unknown>({
    actorId,
    input,
    timeoutMs,
  }: ApifyRunOptions): Promise<T[]> {
    const token = this.token();
    const resolvedTimeout =
      timeoutMs ?? this.config.get<number>('APIFY_TIMEOUT_MS') ?? 120_000;
    const deadline = Date.now() + resolvedTimeout;
    const requestId = randomUUID();

    this.logger.debug(
      `Apify request requestId=${requestId} actorId=${actorId} timeoutMs=${resolvedTimeout}`,
    );

    let run = await this.startRun(actorId, input, resolvedTimeout, requestId);
    let recorded = false;
    const record = async (current: ApifyRunObject) => {
      if (recorded) return;
      recorded = true;
      await this.recorder.record({
        apifyRunId: current.id,
        actorId,
        ...this.toSnapshot(current),
      });
    };

    try {
      while (!TERMINAL_STATUSES.has(run.status)) {
        const remainingMs = deadline - Date.now();
        if (remainingMs <= 0) {
          run = (await this.abortRun(run, token, requestId)) ?? run;
          await record(run);
          throw new PlatformError(
            PlatformErrorCode.TIMEOUT,
            `Apify run ${run.id} exceeded the ${resolvedTimeout}ms budget and was aborted`,
          );
        }
        const waitSecs = Math.min(
          MAX_WAIT_FOR_FINISH_SECS,
          Math.max(1, Math.ceil(remainingMs / 1000)),
        );
        run = await this.request<ApifyRunObject>({
          method: 'GET',
          path: `/v2/actor-runs/${run.id}?waitForFinish=${waitSecs}`,
          token,
          requestId,
          timeoutMs: waitSecs * 1000 + REQUEST_SLACK_MS,
        });
      }

      await record(run);

      if (run.status === 'TIMED-OUT') {
        throw new PlatformError(
          PlatformErrorCode.TIMEOUT,
          `Apify run ${run.id} timed out on the Apify platform`,
        );
      }
      if (run.status !== 'SUCCEEDED') {
        throw new PlatformError(
          PlatformErrorCode.PROXY_ERROR,
          `Apify run ${run.id} finished with status ${run.status}`,
        );
      }

      return this.fetchDatasetItems<T>(
        run.defaultDatasetId,
        token,
        requestId,
        Math.max(deadline - Date.now(), REQUEST_SLACK_MS),
      );
    } catch (err) {
      // Make sure the run is recorded (it cost money) even on error paths.
      await record(run);
      throw err;
    }
  }

  // Re-reads a run after it finished; used to replace the preliminary usage
  // figures with the stable ones (~10s after completion).
  async getRun(runId: string): Promise<ApifyRunUsageSnapshot> {
    const run = await this.request<ApifyRunObject>({
      method: 'GET',
      path: `/v2/actor-runs/${runId}`,
      token: this.token(),
      requestId: randomUUID(),
      timeoutMs: 30_000,
    });
    return this.toSnapshot(run);
  }

  private token(): string {
    const token = this.config.get<string>('APIFY_TOKEN');
    if (!token) {
      throw new PlatformError(
        PlatformErrorCode.AUTHENTICATION_FAILED,
        'APIFY_TOKEN is not configured',
      );
    }
    return token;
  }

  private async startRun(
    actorId: string,
    input: Record<string, unknown>,
    resolvedTimeoutMs: number,
    requestId: string,
  ): Promise<ApifyRunObject> {
    const params = new URLSearchParams();
    const memoryMb = this.config.get<number>('APIFY_MEMORY_MB');
    if (memoryMb) params.set('memory', String(memoryMb));
    // Also cap the run server-side so an orphaned run cannot accrue cost.
    params.set('timeout', String(Math.ceil(resolvedTimeoutMs / 1000)));

    return this.request<ApifyRunObject>({
      method: 'POST',
      path: `/v2/actors/${encodeURIComponent(actorId)}/runs?${params.toString()}`,
      token: this.token(),
      requestId,
      body: input,
      timeoutMs: 30_000,
    });
  }

  private async abortRun(
    run: ApifyRunObject,
    token: string,
    requestId: string,
  ): Promise<ApifyRunObject | null> {
    try {
      return await this.request<ApifyRunObject>({
        method: 'POST',
        path: `/v2/actor-runs/${run.id}/abort`,
        token,
        requestId,
        timeoutMs: 30_000,
      });
    } catch (err) {
      this.logger.warn(
        `Failed to abort Apify run runId=${run.id}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      return null;
    }
  }

  private async fetchDatasetItems<T>(
    datasetId: string,
    token: string,
    requestId: string,
    timeoutMs: number,
  ): Promise<T[]> {
    const { parsed, status } = await this.requestRaw({
      method: 'GET',
      path: `/v2/datasets/${datasetId}/items?format=json`,
      token,
      requestId,
      timeoutMs,
    });
    if (!Array.isArray(parsed)) {
      throw new PlatformError(
        PlatformErrorCode.BAD_RESPONSE,
        'Apify returned a non-array dataset',
        undefined,
        status,
      );
    }
    return parsed as T[];
  }

  // Standard envelope request: unwraps the { data } wrapper.
  private async request<T>(options: {
    method: string;
    path: string;
    token: string;
    requestId: string;
    timeoutMs: number;
    body?: Record<string, unknown>;
  }): Promise<T> {
    const { parsed, status } = await this.requestRaw(options);
    const data = (parsed as { data?: T } | null)?.data;
    if (data === undefined) {
      throw new PlatformError(
        PlatformErrorCode.BAD_RESPONSE,
        `Apify response is missing the data envelope (${options.method} ${options.path})`,
        undefined,
        status,
      );
    }
    return data;
  }

  private async requestRaw({
    method,
    path,
    token,
    requestId,
    timeoutMs,
    body,
  }: {
    method: string;
    path: string;
    token: string;
    requestId: string;
    timeoutMs: number;
    body?: Record<string, unknown>;
  }): Promise<{ parsed: unknown; status: number }> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(`${this.baseUrl}${path}`, {
        method,
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
          'x-request-id': requestId,
        },
        ...(body !== undefined && { body: JSON.stringify(body) }),
        signal: controller.signal,
      });

      const text = await response.text();
      const retryAfterMs = this.parseRetryAfterMs(response.headers);

      if (!response.ok) {
        throw this.toHttpError(response.status, text, retryAfterMs);
      }

      try {
        return {
          parsed: text ? (JSON.parse(text) as unknown) : null,
          status: response.status,
        };
      } catch {
        throw new PlatformError(
          PlatformErrorCode.BAD_RESPONSE,
          'Apify returned invalid JSON',
          undefined,
          response.status,
        );
      }
    } catch (err) {
      if (err instanceof PlatformError) throw err;
      if (err instanceof Error && err.name === 'AbortError') {
        throw new PlatformError(
          PlatformErrorCode.TIMEOUT,
          `Apify request timed out after ${timeoutMs}ms (${method} ${path})`,
        );
      }
      throw new PlatformError(
        PlatformErrorCode.PROXY_ERROR,
        err instanceof Error ? err.message : 'Apify request failed',
      );
    } finally {
      clearTimeout(timer);
    }
  }

  private toSnapshot(run: ApifyRunObject): ApifyRunUsageSnapshot {
    return {
      status: run.status,
      startedAt: run.startedAt ? new Date(run.startedAt) : null,
      finishedAt: run.finishedAt ? new Date(run.finishedAt) : null,
      runTimeSecs: run.stats?.runTimeSecs ?? null,
      computeUnits: run.stats?.computeUnits ?? null,
      usageTotalUsd: run.usageTotalUsd ?? null,
      usageUsd: run.usageUsd ?? null,
    };
  }

  private toHttpError(
    status: number,
    body: string,
    retryAfterMs?: number,
  ): PlatformError {
    if (status === 401 || status === 403) {
      return new PlatformError(
        PlatformErrorCode.AUTHENTICATION_FAILED,
        'Apify authentication failed',
        undefined,
        status,
      );
    }
    if (status === 404) {
      return new PlatformError(
        PlatformErrorCode.NOT_FOUND,
        'Apify actor or content was not found',
        undefined,
        status,
      );
    }
    if (status === 429) {
      return new PlatformError(
        PlatformErrorCode.RATE_LIMITED,
        'Apify rate limit exceeded',
        retryAfterMs,
        status,
      );
    }
    return new PlatformError(
      status >= 500
        ? PlatformErrorCode.PROXY_ERROR
        : PlatformErrorCode.BAD_RESPONSE,
      body || `Apify returned HTTP ${status}`,
      retryAfterMs,
      status,
    );
  }

  private parseRetryAfterMs(headers: Headers): number | undefined {
    const value = headers.get('retry-after');
    if (!value) return undefined;
    const seconds = Number(value);
    if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
    const dateMs = Date.parse(value);
    if (!Number.isNaN(dateMs)) return Math.max(0, dateMs - Date.now());
    return undefined;
  }
}
