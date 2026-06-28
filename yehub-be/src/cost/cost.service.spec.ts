import { Test } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CostService } from './cost.service';
import type { CostQueryDto } from './dto/cost-query.dto';

const mockPrisma = {
  $queryRaw: jest.fn(),
  project: { findMany: jest.fn() },
  campaign: { findMany: jest.fn() },
};

describe('CostService', () => {
  let service: CostService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        CostService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();
    service = moduleRef.get(CostService);
  });

  const baseQuery: CostQueryDto = {
    from: '2026-05-01',
    to: '2026-05-31',
  };

  it('rejects an inverted date range', async () => {
    await expect(
      service.getOverview({
        from: '2026-05-31',
        to: '2026-05-01',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('aggregates all sections from the raw query results', async () => {
    mockPrisma.$queryRaw
      // 1. summary (run_count 4: 2 succeeded, 1 failed, 1 still in-progress)
      .mockResolvedValueOnce([
        {
          total_usd: 12.5,
          run_count: 4n,
          success_count: 2n,
          failure_count: 1n,
        },
      ])
      // 2. series
      .mockResolvedValueOnce([
        { bucket: new Date('2026-05-02T00:00:00Z'), usd: 12.5 },
      ])
      // 3. by_platform
      .mockResolvedValueOnce([
        { platform: 'FACEBOOK', run_count: 3n, total_usd: 10 },
        { platform: null, run_count: 1n, total_usd: 2.5 },
      ])
      // 4. by_project
      .mockResolvedValueOnce([
        {
          project_id: 'p1',
          project_name: 'Alpha',
          run_count: 3n,
          total_usd: 10,
        },
        { project_id: null, project_name: null, run_count: 1n, total_usd: 2.5 },
      ])
      // 5. by_campaign
      .mockResolvedValueOnce([
        {
          campaign_id: 'c1',
          campaign_name: 'Launch',
          project_name: 'Alpha',
          run_count: 3n,
          total_usd: 10,
        },
      ])
      // 6. by_job_type
      .mockResolvedValueOnce([
        { job_type: 'poll-post-metrics', run_count: 4n, total_usd: 12.5 },
      ])
      // 7. recent_runs
      .mockResolvedValueOnce([
        {
          id: 'r1',
          job_type: 'poll-post-metrics',
          status: 'SUCCEEDED',
          started_at: new Date('2026-05-02T00:00:00Z'),
          usage_total_usd: 12.5,
          usage_finalized: true,
          platform: 'FACEBOOK',
          project_name: 'Alpha',
          label: '@brand',
        },
      ]);

    const result = await service.getOverview(baseQuery);

    expect(result.currency).toBe('USD');
    expect(result.summary).toEqual({
      total_usd: 12.5,
      run_count: 4,
      success_count: 2,
      failure_count: 1,
    });
    expect(result.series.points.length).toBeGreaterThan(0);
    expect(result.by_platform).toContainEqual({
      platform: 'UNATTRIBUTED',
      run_count: 1,
      total_usd: 2.5,
    });
    expect(result.by_project).toContainEqual({
      project_id: null,
      project_name: 'UNATTRIBUTED',
      run_count: 1,
      total_usd: 2.5,
    });
    expect(result.by_campaign[0].campaign_name).toBe('Launch');
    expect(result.by_job_type[0].job_type).toBe('poll-post-metrics');
    expect(result.recent_runs[0].id).toBe('r1');
  });

  it('returns filter options', async () => {
    mockPrisma.project.findMany.mockResolvedValue([
      { id: 'p1', name: 'Alpha' },
    ]);
    mockPrisma.campaign.findMany.mockResolvedValue([
      { id: 'c1', name: 'Launch', project_id: 'p1' },
    ]);

    const result = await service.getFilterOptions();

    expect(result.projects).toEqual([{ id: 'p1', name: 'Alpha' }]);
    expect(result.campaigns).toEqual([
      { id: 'c1', name: 'Launch', project_id: 'p1' },
    ]);
  });
});
