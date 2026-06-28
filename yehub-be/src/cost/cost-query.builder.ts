import { Prisma } from '../../generated/prisma/client';
import type { CostQueryDto } from './dto/cost-query.dto';

// Shared LEFT JOINs that let every aggregation derive platform (from the post or
// social account) and project (from the campaign). Always join from alias `r`
// (apify_runs).
export function buildCostJoins(): Prisma.Sql {
  return Prisma.sql`
    LEFT JOIN "posts" p            ON p.id = r.post_id
    LEFT JOIN "social_accounts" sa ON sa.id = r.social_account_id
    LEFT JOIN "campaigns" c        ON c.id = r.campaign_id
  `;
}

/**
 * Builds the shared WHERE clause: always the date window, plus any active filters.
 *
 * Alias contract — like `buildCostJoins`, this function assumes the query uses
 * the following table aliases:
 *   - `r`  → apify_runs
 *   - `p`  → posts
 *   - `sa` → social_accounts
 *   - `c`  → campaigns
 *
 * The alias `r` is hardcoded and intentional; do NOT parameterize it.
 */
export function buildCostWhere(
  query: CostQueryDto,
  from: Date,
  to: Date,
): Prisma.Sql {
  const conditions: Prisma.Sql[] = [
    Prisma.sql`COALESCE(r.started_at, r.created_at) BETWEEN ${from} AND ${to}`,
  ];

  if (query.platforms?.length) {
    conditions.push(
      Prisma.sql`COALESCE(p.platform, sa.platform) IN (${Prisma.join(
        query.platforms.map((p) => Prisma.sql`${p}::"Platform"`),
      )})`,
    );
  }
  if (query.project_ids?.length) {
    conditions.push(
      Prisma.sql`c.project_id IN (${Prisma.join(
        query.project_ids.map((id) => Prisma.sql`${id}::uuid`),
      )})`,
    );
  }
  if (query.campaign_ids?.length) {
    conditions.push(
      Prisma.sql`r.campaign_id IN (${Prisma.join(
        query.campaign_ids.map((id) => Prisma.sql`${id}::uuid`),
      )})`,
    );
  }

  return Prisma.sql`WHERE ${Prisma.join(conditions, ' AND ')}`;
}
