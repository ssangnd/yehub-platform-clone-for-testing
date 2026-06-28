import { Inject, Injectable, Logger } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import { PrismaService } from './prisma/prisma.service';

type HealthStatus = 'ok' | 'error';

const CHECK_TIMEOUT_MS = 5000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`Timed out after ${ms}ms`)), ms),
    ),
  ]);
}

@Injectable()
export class AppService {
  private readonly logger = new Logger(AppService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
  ) {}

  async checkReadiness(): Promise<{
    status: HealthStatus;
    checks: Record<string, HealthStatus>;
  }> {
    const checks: Record<string, HealthStatus> = {};

    try {
      await withTimeout(this.prisma.$queryRaw`SELECT 1`, CHECK_TIMEOUT_MS);
      checks.database = 'ok';
    } catch (error) {
      this.logger.error('Database readiness check failed', error);
      checks.database = 'error';
    }

    try {
      await withTimeout(
        (async () => {
          await this.cache.set('health-check', '1', 5000);
          const val = await this.cache.get('health-check');
          // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
          if (val !== '1') throw new Error(`Unexpected cache value: ${val}`);
        })(),
        CHECK_TIMEOUT_MS,
      );
      checks.redis = 'ok';
    } catch (error) {
      this.logger.error('Redis readiness check failed', error);
      checks.redis = 'error';
    }

    const status: HealthStatus = Object.values(checks).every((v) => v === 'ok')
      ? 'ok'
      : 'error';
    return { status, checks };
  }
}
