import { Platform } from '../../generated/prisma/client';
import type { CostQueryDto } from './dto/cost-query.dto';
import { buildCostJoins, buildCostWhere } from './cost-query.builder';

describe('cost-query.builder', () => {
  const from = new Date('2026-05-01T00:00:00.000Z');
  const to = new Date('2026-05-31T23:59:59.999Z');

  it('builds a JOIN fragment referencing posts, social_accounts, campaigns', () => {
    const sql = buildCostJoins().sql;
    expect(sql).toContain('posts');
    expect(sql).toContain('social_accounts');
    expect(sql).toContain('campaigns');
  });

  it('builds a WHERE fragment with only the date range when no filters', () => {
    const where = buildCostWhere({} as Partial<CostQueryDto> as never, from, to);
    expect(where.sql).toContain('BETWEEN');
    expect(where.sql).not.toContain('IN (');
  });

  it('adds a platform filter when platforms are provided', () => {
    const where = buildCostWhere(
      { platforms: [Platform.FACEBOOK, Platform.TIKTOK] } as Partial<CostQueryDto> as never,
      from,
      to,
    );
    expect(where.sql).toContain('COALESCE(p.platform, sa.platform)');
    expect(where.values).toEqual(
      expect.arrayContaining([Platform.FACEBOOK, Platform.TIKTOK]),
    );
  });

  it('adds project and campaign filters when provided', () => {
    const where = buildCostWhere(
      { project_ids: ['11111111-1111-1111-1111-111111111111'], campaign_ids: ['22222222-2222-2222-2222-222222222222'] } as Partial<CostQueryDto> as never,
      from,
      to,
    );
    expect(where.sql).toContain('c.project_id');
    expect(where.sql).toContain('r.campaign_id');
    expect(where.values).toEqual(
      expect.arrayContaining([
        '11111111-1111-1111-1111-111111111111',
        '22222222-2222-2222-2222-222222222222',
      ]),
    );
  });

  it('treats empty filter arrays as no filter', () => {
    const where = buildCostWhere(
      { platforms: [], project_ids: [], campaign_ids: [] } as Partial<CostQueryDto> as never,
      from,
      to,
    );
    expect(where.sql).not.toContain('IN (');
  });
});
