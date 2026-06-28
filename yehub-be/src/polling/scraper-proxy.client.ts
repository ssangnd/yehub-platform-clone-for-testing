import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { Platform } from '../../generated/prisma/client';
import { PlatformError, PlatformErrorCode } from './platform-error';

export type ScraperProxyOperation = 'post' | 'comments';

export interface ScraperProxyRequest {
  url: string;
  since?: string;
  cursor?: string;
}

export interface ScraperProxyResponse {
  data: unknown;
  nextCursor: string | null;
}

@Injectable()
export class ScraperProxyClient {
  private readonly logger = new Logger(ScraperProxyClient.name);

  constructor(private readonly config: ConfigService) {}

  async request(
    platform: Platform,
    operation: ScraperProxyOperation,
    payload: ScraperProxyRequest,
    timeoutMs = this.getTimeoutMs(platform),
  ): Promise<ScraperProxyResponse> {
    const baseUrl = this.config.get<string>('SCRAPER_PROXY_BASE_URL');
    const apiKey = this.config.get<string>('SCRAPER_PROXY_API_KEY');

    if (!baseUrl || !apiKey) {
      throw new PlatformError(
        PlatformErrorCode.AUTHENTICATION_FAILED,
        'Scraper proxy is not configured',
      );
    }

    const endpoint = new URL(
      `${this.platformPath(platform)}/${operation}`,
      this.normalizeBaseUrl(baseUrl),
    );
    const requestId = randomUUID();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    this.logger.debug(
      `Scraper proxy request requestId=${requestId} platform=${platform} operation=${operation} timeoutMs=${timeoutMs} url=${payload.url}`,
    );

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${apiKey}`,
          'content-type': 'application/json',
          'x-request-id': requestId,
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      const text = await response.text();
      const retryAfterMs = this.parseRetryAfterMs(response.headers);

      if (!response.ok) {
        throw this.toHttpError(response.status, text, retryAfterMs);
      }

      let parsed: unknown;
      try {
        parsed = text ? JSON.parse(text) : null;
      } catch {
        throw new PlatformError(
          PlatformErrorCode.BAD_RESPONSE,
          'Scraper proxy returned invalid JSON',
          undefined,
          response.status,
        );
      }

      return {
        data: this.unwrapData(parsed),
        nextCursor: this.readCursor(parsed),
      };
    } catch (err) {
      if (err instanceof PlatformError) throw err;
      if (err instanceof Error && err.name === 'AbortError') {
        throw new PlatformError(
          PlatformErrorCode.TIMEOUT,
          `Scraper proxy request timed out after ${timeoutMs}ms`,
        );
      }
      throw new PlatformError(
        PlatformErrorCode.PROXY_ERROR,
        err instanceof Error ? err.message : 'Scraper proxy request failed',
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  private getTimeoutMs(platform: Platform): number {
    const platformValue = this.config.get<number>(
      `SCRAPER_PROXY_TIMEOUT_${platform}_MS`,
    );
    return (
      platformValue ??
      this.config.get<number>('SCRAPER_PROXY_TIMEOUT_MS') ??
      30_000
    );
  }

  private platformPath(platform: Platform): string {
    return platform.toLowerCase();
  }

  private normalizeBaseUrl(baseUrl: string): string {
    return baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  }

  private toHttpError(
    status: number,
    body: string,
    retryAfterMs?: number,
  ): PlatformError {
    if (status === 401 || status === 403) {
      return new PlatformError(
        PlatformErrorCode.AUTHENTICATION_FAILED,
        'Scraper proxy authentication failed',
        undefined,
        status,
      );
    }
    if (status === 404) {
      return new PlatformError(
        PlatformErrorCode.NOT_FOUND,
        'Platform content was not found',
        undefined,
        status,
      );
    }
    if (status === 429) {
      return new PlatformError(
        PlatformErrorCode.RATE_LIMITED,
        'Scraper proxy rate limit exceeded',
        retryAfterMs,
        status,
      );
    }
    return new PlatformError(
      status >= 500
        ? PlatformErrorCode.PROXY_ERROR
        : PlatformErrorCode.BAD_RESPONSE,
      body || `Scraper proxy returned HTTP ${status}`,
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

  private unwrapData(parsed: unknown): unknown {
    if (this.isRecord(parsed) && 'data' in parsed) return parsed.data;
    return parsed;
  }

  private readCursor(parsed: unknown): string | null {
    if (!this.isRecord(parsed)) return null;
    const cursor =
      parsed.nextCursor ??
      parsed.next_cursor ??
      parsed.cursor ??
      (this.isRecord(parsed.pagination) ? parsed.pagination.next_cursor : null);
    return typeof cursor === 'string' && cursor.length > 0 ? cursor : null;
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
  }
}
