import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '../../generated/prisma/client';
import {
  pickGranularity,
  zeroFillBuckets,
  type Granularity,
} from '../campaigns/campaign-analytics';
import { CostQueryDto } from './dto/cost-query.dto';
import { buildCostJoins, buildCostWhere } from './cost-query.builder';

const UNATTRIBUTED = 'UNATTRIBUTED';
const TOP_N = 10;
const RECENT_LIMIT = 20;

@Injectable()
export class CostService {
  constructor(private readonly prisma: PrismaService) {}

  // Projects + campaigns used to populate the cascading filter dropdowns.
  async getFilterOptions() {
    const [projects, campaigns] = await Promise.all([
      this.prisma.project.findMany({
        where: { active: true },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      }),
      this.prisma.campaign.findMany({
        where: { deleted_at: null },
        select: { id: true, name: true, project_id: true },
        orderBy: { name: 'asc' },
      }),
    ]);
    return { projects, campaigns };
  }

  async getOverview(query: CostQueryDto) {
    const from = new Date(query.from);
    const to = new Date(query.to);
    if (from > to) {
      throw new BadRequestException('`from` must be on or before `to`');
    }
    // Include the entire `to` day (the date-only string parses to 00:00 UTC).
    to.setUTCHours(23, 59, 59, 999);

    const joins = buildCostJoins();
    const where = buildCostWhere(query, from, to);
    const granularity: Granularity = pickGranularity(from, to);

    // NOTE: cost.service.spec.ts mocks $queryRaw in this exact call order — keep these 7 queries in sync with the spec.
    // 1. Summary
    const [summaryRow] = await this.prisma.$queryRaw<
      {
        total_usd: number;
        run_count: bigint;
        success_count: bigint;
        failure_count: bigint;
      }[]
    >(Prisma.sql`
      SELECT COALESCE(SUM(r.usage_total_usd), 0)::float8 AS total_usd,
             COUNT(*)::bigint AS run_count,
             COUNT(*) FILTER (WHERE r.status = 'SUCCEEDED')::bigint AS success_count,
             COUNT(*) FILTER (WHERE r.status IN ('FAILED', 'TIMED-OUT', 'ABORTED'))::bigint AS failure_count
      FROM "apify_runs" r
      ${joins}
      ${where}
    `);
    const runCount = Number(summaryRow?.run_count ?? 0);
    const successCount = Number(summaryRow?.success_count ?? 0);
    const failureCount = Number(summaryRow?.failure_count ?? 0);

    // 2. Spend over time
    const seriesRows = await this.prisma.$queryRaw<
      { bucket: Date; usd: number }[]
    >(Prisma.sql`
      SELECT date_trunc(${Prisma.raw(`'${granularity}'`)}, COALESCE(r.started_at, r.created_at)) AS bucket,
             COALESCE(SUM(r.usage_total_usd), 0)::float8 AS usd
      FROM "apify_runs" r
      ${joins}
      ${where}
      GROUP BY bucket
      ORDER BY bucket ASC
    `);
    const series = {
      granularity,
      points: zeroFillBuckets(
        seriesRows.map((row) => ({ date: row.bucket, count: row.usd })),
        from,
        to,
        granularity,
      ).map((p) => ({ date: p.date, usd: p.count })),
    };

    // 3. By platform
    const platformRows = await this.prisma.$queryRaw<
      { platform: string | null; run_count: bigint; total_usd: number }[]
    >(Prisma.sql`
      SELECT COALESCE(p.platform, sa.platform)::text AS platform,
             COUNT(*)::bigint AS run_count,
             COALESCE(SUM(r.usage_total_usd), 0)::float8 AS total_usd
      FROM "apify_runs" r
      ${joins}
      ${where}
      GROUP BY COALESCE(p.platform, sa.platform)
      ORDER BY total_usd DESC
    `);
    const by_platform = platformRows.map((row) => ({
      platform: row.platform ?? UNATTRIBUTED,
      run_count: Number(row.run_count),
      total_usd: row.total_usd,
    }));

    // 4. By project (top N; null project_id => UNATTRIBUTED)
    const projectRows = await this.prisma.$queryRaw<
      {
        project_id: string | null;
        project_name: string | null;
        run_count: bigint;
        total_usd: number;
      }[]
    >(Prisma.sql`
      SELECT c.project_id AS project_id,
             pr.name AS project_name,
             COUNT(*)::bigint AS run_count,
             COALESCE(SUM(r.usage_total_usd), 0)::float8 AS total_usd
      FROM "apify_runs" r
      ${joins}
      LEFT JOIN "projects" pr ON pr.id = c.project_id
      ${where}
      GROUP BY c.project_id, pr.name
      ORDER BY total_usd DESC
      LIMIT ${TOP_N}
    `);
    const by_project = projectRows.map((row) => ({
      project_id: row.project_id,
      project_name: row.project_name ?? UNATTRIBUTED,
      run_count: Number(row.run_count),
      total_usd: row.total_usd,
    }));

    // 5. By campaign (top N)
    const campaignRows = await this.prisma.$queryRaw<
      {
        campaign_id: string | null;
        campaign_name: string | null;
        project_name: string | null;
        run_count: bigint;
        total_usd: number;
      }[]
    >(Prisma.sql`
      SELECT r.campaign_id AS campaign_id,
             c.name AS campaign_name,
             pr.name AS project_name,
             COUNT(*)::bigint AS run_count,
             COALESCE(SUM(r.usage_total_usd), 0)::float8 AS total_usd
      FROM "apify_runs" r
      ${joins}
      LEFT JOIN "projects" pr ON pr.id = c.project_id
      ${where}
      GROUP BY r.campaign_id, c.name, pr.name
      ORDER BY total_usd DESC
      LIMIT ${TOP_N}
    `);
    const by_campaign = campaignRows.map((row) => ({
      campaign_id: row.campaign_id,
      campaign_name: row.campaign_name ?? UNATTRIBUTED,
      project_name: row.project_name ?? UNATTRIBUTED,
      run_count: Number(row.run_count),
      total_usd: row.total_usd,
    }));

    // 6. By job type
    const jobTypeRows = await this.prisma.$queryRaw<
      { job_type: string; run_count: bigint; total_usd: number }[]
    >(Prisma.sql`
      SELECT r.job_type AS job_type,
             COUNT(*)::bigint AS run_count,
             COALESCE(SUM(r.usage_total_usd), 0)::float8 AS total_usd
      FROM "apify_runs" r
      ${joins}
      ${where}
      GROUP BY r.job_type
      ORDER BY total_usd DESC
    `);
    const by_job_type = jobTypeRows.map((row) => ({
      job_type: row.job_type,
      run_count: Number(row.run_count),
      total_usd: row.total_usd,
    }));

    // 7. Recent runs (label/platform/project resolved in SQL)
    const recentRows = await this.prisma.$queryRaw<
      {
        id: string;
        job_type: string;
        status: string;
        started_at: Date | null;
        usage_total_usd: number | null;
        usage_finalized: boolean;
        platform: string | null;
        project_name: string | null;
        label: string | null;
      }[]
    >(Prisma.sql`
      SELECT r.id,
             r.job_type,
             r.status,
             r.started_at,
             r.usage_total_usd,
             r.usage_finalized,
             COALESCE(p.platform, sa.platform)::text AS platform,
             pr.name AS project_name,
             COALESCE(
               p.author_name,
               CASE WHEN p.id IS NOT NULL THEN p.platform::text || ' ' || p.platform_post_id END,
               CASE WHEN sa.username IS NOT NULL THEN '@' || sa.username END,
               sa.platform::text
             ) AS label
      FROM "apify_runs" r
      ${joins}
      LEFT JOIN "projects" pr ON pr.id = c.project_id
      ${where}
      ORDER BY r.created_at DESC
      LIMIT ${RECENT_LIMIT}
    `);
    const recent_runs = recentRows.map((row) => ({
      id: row.id,
      job_type: row.job_type,
      status: row.status,
      started_at: row.started_at,
      usage_total_usd: row.usage_total_usd,
      usage_finalized: row.usage_finalized,
      platform: row.platform ?? UNATTRIBUTED,
      project_name: row.project_name ?? UNATTRIBUTED,
      label: row.label,
    }));

    return {
      currency: 'USD' as const,
      summary: {
        total_usd: summaryRow?.total_usd ?? 0,
        run_count: runCount,
        success_count: successCount,
        failure_count: failureCount,
      },
      series,
      by_platform,
      by_project,
      by_campaign,
      by_job_type,
      recent_runs,
    };
  }
}
