import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { CampaignsService } from './campaigns.service';
import { PrismaService } from '../prisma/prisma.service';
import { PollingSchedulerService } from '../polling/polling-scheduler.service';

const pollingSchedulerMock = {
  schedulePost: jest.fn(),
  removePost: jest.fn(),
  scheduleCampaign: jest.fn(),
  removeCampaign: jest.fn(),
  rescheduleCampaignInheritedPosts: jest.fn(),
  triggerImmediate: jest.fn(),
};

const mockPrisma = {
  project: { findUnique: jest.fn() },
  objective: { count: jest.fn() },
  campaign: {
    create: jest.fn(),
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
  },
};

describe('CampaignsService — objective_ids validation', () => {
  let service: CampaignsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CampaignsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: PollingSchedulerService, useValue: pollingSchedulerMock },
      ],
    }).compile();
    service = module.get<CampaignsService>(CampaignsService);
    jest.clearAllMocks();
  });

  it('throws BadRequestException when objective_ids contain an unknown id', async () => {
    mockPrisma.project.findUnique.mockResolvedValue({ id: 'p1', active: true });
    mockPrisma.objective.count.mockResolvedValue(1);

    await expect(
      service.create('p1', {
        name: 'Test',
        platforms: ['FACEBOOK'] as any,
        start_date: '2026-01-01',
        end_date: '2026-06-01',
        objective_ids: [
          '11111111-1111-1111-1111-111111111111',
          '22222222-2222-2222-2222-222222222222',
        ],
      }),
    ).rejects.toThrow(BadRequestException);

    expect(mockPrisma.objective.count).toHaveBeenCalledWith({
      where: {
        id: {
          in: [
            '11111111-1111-1111-1111-111111111111',
            '22222222-2222-2222-2222-222222222222',
          ],
        },
      },
    });
    expect(mockPrisma.campaign.create).not.toHaveBeenCalled();
  });

  it('treats duplicate objective_ids as a single id during validation', async () => {
    mockPrisma.project.findUnique.mockResolvedValue({ id: 'p1', active: true });
    mockPrisma.objective.count.mockResolvedValue(1);
    mockPrisma.campaign.create.mockResolvedValue({
      id: 'c1',
      project_id: 'p1',
      name: 'Test',
      description: null,
      status: 'DRAFT',
      platforms: [],
      start_date: null,
      end_date: null,
      metric_polling_interval: null,
      comments_polling_interval: null,
      display_metrics: [],

      created_at: new Date(),
      updated_at: new Date(),
      _count: { posts: 0 },
      project: { id: 'p1', name: 'Project' },
      posts: [],
      objectives: [],
    });

    const sameId = '11111111-1111-1111-1111-111111111111';
    await expect(
      service.create('p1', {
        name: 'Test',
        platforms: ['FACEBOOK'] as any,
        start_date: '2026-01-01',
        end_date: '2026-06-01',
        objective_ids: [sameId, sameId],
      }),
    ).resolves.toBeDefined();

    expect(mockPrisma.objective.count).toHaveBeenCalledWith({
      where: { id: { in: [sameId] } },
    });
  });

  it('skips validation when objective_ids is omitted', async () => {
    mockPrisma.project.findUnique.mockResolvedValue({ id: 'p1', active: true });
    mockPrisma.campaign.create.mockResolvedValue({
      id: 'c1',
      project_id: 'p1',
      name: 'Test',
      description: null,
      status: 'DRAFT',
      platforms: [],
      start_date: null,
      end_date: null,
      metric_polling_interval: null,
      comments_polling_interval: null,
      display_metrics: [],

      created_at: new Date(),
      updated_at: new Date(),
      _count: { posts: 0 },
      project: { id: 'p1', name: 'Project' },
      posts: [],
      objectives: [],
    });

    await expect(
      service.create('p1', {
        name: 'Test',
        platforms: ['FACEBOOK'] as any,
        start_date: '2026-01-01',
        end_date: '2026-06-01',
      }),
    ).resolves.toBeDefined();
    expect(mockPrisma.objective.count).not.toHaveBeenCalled();
  });
});

describe('CampaignsService — completed campaign immutability', () => {
  let service: CampaignsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CampaignsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: PollingSchedulerService, useValue: pollingSchedulerMock },
      ],
    }).compile();
    service = module.get<CampaignsService>(CampaignsService);
    jest.clearAllMocks();
  });

  it('throws BadRequestException when updating a completed campaign', async () => {
    mockPrisma.campaign.findUnique.mockResolvedValue({
      id: 'c1',
      project_id: 'p1',
      name: 'Done Campaign',
      description: null,
      status: 'COMPLETED',
      platforms: ['FACEBOOK'],
      start_date: new Date('2026-01-01'),
      end_date: new Date('2026-03-01'),
      metric_polling_interval: null,
      comments_polling_interval: null,
      display_metrics: [],
      deleted_at: null,
      created_at: new Date(),
      updated_at: new Date(),
      _count: { posts: 0 },
      project: { id: 'p1', name: 'Project' },
      posts: [],
      objectives: [],
    });

    await expect(service.update('c1', { name: 'New Name' })).rejects.toThrow(
      BadRequestException,
    );

    expect(mockPrisma.campaign.update).not.toHaveBeenCalled();
  });
});

describe('CampaignsService — duplicate campaign name', () => {
  let service: CampaignsService;

  const localMockPrisma = {
    project: { findUnique: jest.fn() },
    objective: { count: jest.fn() },
    campaign: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
    },
  };

  const makeFullCampaign = (overrides: Record<string, unknown> = {}) => ({
    id: 'c1',
    project_id: 'p1',
    name: 'Summer 2026',
    description: null,
    status: 'DRAFT',
    platforms: [],
    start_date: new Date('2026-01-01'),
    end_date: new Date('2026-06-01'),
    metric_polling_interval: null,
    comments_polling_interval: null,
    display_metrics: [],
    deleted_at: null,
    created_at: new Date(),
    updated_at: new Date(),
    _count: { posts: 0 },
    project: { id: 'p1', name: 'Project' },
    posts: [],
    objectives: [],
    ...overrides,
  });

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CampaignsService,
        { provide: PrismaService, useValue: localMockPrisma },
        { provide: PollingSchedulerService, useValue: pollingSchedulerMock },
      ],
    }).compile();
    service = module.get<CampaignsService>(CampaignsService);
    jest.clearAllMocks();
  });

  it('create — throws ConflictException when an active campaign with the same name exists in the project', async () => {
    localMockPrisma.project.findUnique.mockResolvedValue({
      id: 'p1',
      active: true,
    });
    localMockPrisma.campaign.findFirst.mockResolvedValue({
      id: 'existing',
      name: 'Summer 2026',
    });

    await expect(
      service.create('p1', {
        name: 'Summer 2026',
        platforms: ['FACEBOOK'] as any,
        start_date: '2026-01-01',
        end_date: '2026-06-01',
      }),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(localMockPrisma.campaign.findFirst).toHaveBeenCalledWith({
      where: { project_id: 'p1', name: 'Summer 2026', deleted_at: null },
    });
    expect(localMockPrisma.campaign.create).not.toHaveBeenCalled();
  });

  it('create — ConflictException message mentions the project scope', async () => {
    localMockPrisma.project.findUnique.mockResolvedValue({
      id: 'p1',
      active: true,
    });
    localMockPrisma.campaign.findFirst.mockResolvedValue({
      id: 'existing',
      name: 'Summer 2026',
    });

    await expect(
      service.create('p1', {
        name: 'Summer 2026',
        platforms: ['FACEBOOK'] as any,
        start_date: '2026-01-01',
        end_date: '2026-06-01',
      }),
    ).rejects.toThrow(
      'A campaign with this name already exists in this project',
    );
  });

  it('create — allows reuse of a soft-deleted campaign name', async () => {
    localMockPrisma.project.findUnique.mockResolvedValue({
      id: 'p1',
      active: true,
    });
    // findFirst filters by deleted_at: null so a soft-deleted row returns null
    localMockPrisma.campaign.findFirst.mockResolvedValue(null);
    localMockPrisma.campaign.create.mockResolvedValue(makeFullCampaign());

    await expect(
      service.create('p1', {
        name: 'Summer 2026',
        platforms: ['FACEBOOK'] as any,
        start_date: '2026-01-01',
        end_date: '2026-06-01',
      }),
    ).resolves.toBeDefined();
  });

  it('create — throws ConflictException when prisma.create rejects with P2002 (race fallback)', async () => {
    localMockPrisma.project.findUnique.mockResolvedValue({
      id: 'p1',
      active: true,
    });
    localMockPrisma.campaign.findFirst.mockResolvedValue(null);
    localMockPrisma.campaign.create.mockRejectedValue({ code: 'P2002' });

    await expect(
      service.create('p1', {
        name: 'Racey',
        platforms: ['FACEBOOK'] as any,
        start_date: '2026-01-01',
        end_date: '2026-06-01',
      }),
    ).rejects.toBeInstanceOf(ConflictException);

    localMockPrisma.project.findUnique.mockResolvedValue({
      id: 'p1',
      active: true,
    });
    localMockPrisma.campaign.findFirst.mockResolvedValue(null);
    localMockPrisma.campaign.create.mockRejectedValue({ code: 'P2002' });
    await expect(
      service.create('p1', {
        name: 'Racey',
        platforms: ['FACEBOOK'] as any,
        start_date: '2026-01-01',
        end_date: '2026-06-01',
      }),
    ).rejects.toThrow(
      'A campaign with this name already exists in this project',
    );
  });

  it('create — rethrows non-Prisma errors from create unchanged', async () => {
    localMockPrisma.project.findUnique.mockResolvedValue({
      id: 'p1',
      active: true,
    });
    localMockPrisma.campaign.findFirst.mockResolvedValue(null);
    localMockPrisma.campaign.create.mockRejectedValue(new Error('boom'));

    await expect(
      service.create('p1', {
        name: 'Kaboomy',
        platforms: ['FACEBOOK'] as any,
        start_date: '2026-01-01',
        end_date: '2026-06-01',
      }),
    ).rejects.toThrow('boom');

    localMockPrisma.project.findUnique.mockResolvedValue({
      id: 'p1',
      active: true,
    });
    localMockPrisma.campaign.findFirst.mockResolvedValue(null);
    localMockPrisma.campaign.create.mockRejectedValue(new Error('boom'));
    await expect(
      service.create('p1', {
        name: 'Kaboomy',
        platforms: ['FACEBOOK'] as any,
        start_date: '2026-01-01',
        end_date: '2026-06-01',
      }),
    ).rejects.not.toBeInstanceOf(ConflictException);
  });

  it('update — throws ConflictException when renaming to an existing active campaign name', async () => {
    localMockPrisma.campaign.findUnique.mockResolvedValue(
      makeFullCampaign({ id: 'c1', name: 'Old' }),
    );
    localMockPrisma.campaign.findFirst.mockResolvedValue({
      id: 'other',
      name: 'New',
    });

    await expect(
      service.update('c1', { name: 'New' } as any),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(localMockPrisma.campaign.findFirst).toHaveBeenCalledWith({
      where: {
        project_id: 'p1',
        name: 'New',
        deleted_at: null,
        NOT: { id: 'c1' },
      },
    });
    expect(localMockPrisma.campaign.update).not.toHaveBeenCalled();
  });

  it('update — ConflictException message mentions the project scope', async () => {
    localMockPrisma.campaign.findUnique.mockResolvedValue(
      makeFullCampaign({ id: 'c1', name: 'Old' }),
    );
    localMockPrisma.campaign.findFirst.mockResolvedValue({
      id: 'other',
      name: 'New',
    });

    await expect(service.update('c1', { name: 'New' } as any)).rejects.toThrow(
      'A campaign with this name already exists in this project',
    );
  });

  it('update — skips duplicate probe when name is unchanged', async () => {
    localMockPrisma.campaign.findUnique.mockResolvedValue(
      makeFullCampaign({ id: 'c1', name: 'Same' }),
    );
    localMockPrisma.campaign.update.mockResolvedValue(
      makeFullCampaign({ id: 'c1', name: 'Same' }),
    );

    await service.update('c1', { name: 'Same' } as any);

    expect(localMockPrisma.campaign.findFirst).not.toHaveBeenCalled();
    expect(localMockPrisma.campaign.update).toHaveBeenCalled();
  });

  it('update — allows renaming when the new name is unique', async () => {
    localMockPrisma.campaign.findUnique.mockResolvedValue(
      makeFullCampaign({ id: 'c1', name: 'Old' }),
    );
    localMockPrisma.campaign.findFirst.mockResolvedValue(null);
    localMockPrisma.campaign.update.mockResolvedValue(
      makeFullCampaign({ id: 'c1', name: 'Fresh' }),
    );

    await service.update('c1', { name: 'Fresh' } as any);

    expect(localMockPrisma.campaign.update).toHaveBeenCalled();
  });

  it('update — throws ConflictException when prisma.update rejects with P2002 (race fallback)', async () => {
    localMockPrisma.campaign.findUnique.mockResolvedValue(
      makeFullCampaign({ id: 'c1', name: 'Old' }),
    );
    localMockPrisma.campaign.findFirst.mockResolvedValue(null);
    localMockPrisma.campaign.update.mockRejectedValue({ code: 'P2002' });

    await expect(
      service.update('c1', { name: 'Racey' } as any),
    ).rejects.toBeInstanceOf(ConflictException);

    localMockPrisma.campaign.findUnique.mockResolvedValue(
      makeFullCampaign({ id: 'c1', name: 'Old' }),
    );
    localMockPrisma.campaign.findFirst.mockResolvedValue(null);
    localMockPrisma.campaign.update.mockRejectedValue({ code: 'P2002' });
    await expect(
      service.update('c1', { name: 'Racey' } as any),
    ).rejects.toThrow(
      'A campaign with this name already exists in this project',
    );
  });

  it('update — rethrows non-Prisma errors from update unchanged', async () => {
    localMockPrisma.campaign.findUnique.mockResolvedValue(
      makeFullCampaign({ id: 'c1', name: 'Old' }),
    );
    localMockPrisma.campaign.findFirst.mockResolvedValue(null);
    localMockPrisma.campaign.update.mockRejectedValue(new Error('kaboom'));

    await expect(
      service.update('c1', { name: 'Fresh' } as any),
    ).rejects.toThrow('kaboom');

    localMockPrisma.campaign.findUnique.mockResolvedValue(
      makeFullCampaign({ id: 'c1', name: 'Old' }),
    );
    localMockPrisma.campaign.findFirst.mockResolvedValue(null);
    localMockPrisma.campaign.update.mockRejectedValue(new Error('kaboom'));
    await expect(
      service.update('c1', { name: 'Fresh' } as any),
    ).rejects.not.toBeInstanceOf(ConflictException);
  });
});

describe('CampaignsService.changeStatus — activation triggers immediate polling', () => {
  let service: CampaignsService;

  const localMockPrisma = {
    project: { findUnique: jest.fn() },
    objective: { count: jest.fn() },
    campaign: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CampaignsService,
        { provide: PrismaService, useValue: localMockPrisma },
        { provide: PollingSchedulerService, useValue: pollingSchedulerMock },
      ],
    }).compile();
    service = module.get<CampaignsService>(CampaignsService);
    jest.clearAllMocks();
  });

  it('requests an immediate poll when a campaign becomes ACTIVE', async () => {
    localMockPrisma.campaign.findUnique.mockResolvedValue({
      status: 'DRAFT',
      deleted_at: null,
    });
    localMockPrisma.campaign.update.mockResolvedValue({
      id: 'c1',
      project_id: 'p1',
      name: 'Summer 2026',
      description: null,
      status: 'ACTIVE',
      platforms: [],
      start_date: new Date('2026-01-01'),
      end_date: new Date('2026-06-01'),
      metric_polling_interval: null,
      comments_polling_interval: null,
      display_metrics: [],
      deleted_at: null,
      created_at: new Date(),
      updated_at: new Date(),
      _count: { posts: 0 },
      project: { id: 'p1', name: 'Project' },
      posts: [],
      objectives: [],
    });

    await service.changeStatus('c1', 'ACTIVE' as any);

    expect(pollingSchedulerMock.scheduleCampaign).toHaveBeenCalledWith('c1');
  });
});

describe('CampaignsService.getSpending', () => {
  let service: CampaignsService;

  const prisma = {
    campaign: { findUnique: jest.fn() },
    apifyRun: { groupBy: jest.fn(), count: jest.fn(), findMany: jest.fn() },
    post: { findMany: jest.fn() },
    socialAccount: { findMany: jest.fn() },
    $queryRaw: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CampaignsService,
        { provide: PrismaService, useValue: prisma },
        { provide: PollingSchedulerService, useValue: pollingSchedulerMock },
      ],
    }).compile();
    service = module.get(CampaignsService);

    prisma.campaign.findUnique.mockResolvedValue({
      id: 'c1',
      deleted_at: null,
      start_date: new Date('2026-06-01'),
      end_date: new Date('2026-06-10'),
    });
    prisma.$queryRaw.mockResolvedValue([]);
    prisma.post.findMany.mockResolvedValue([]);
    prisma.socialAccount.findMany.mockResolvedValue([]);
    prisma.apifyRun.findMany.mockResolvedValue([]);
  });

  it('throws NotFoundException when the campaign is missing', async () => {
    prisma.campaign.findUnique.mockResolvedValue(null);
    await expect(service.getSpending('missing')).rejects.toThrow(
      'Campaign not found',
    );
  });

  it('aggregates totals, by-type breakdown and pending count', async () => {
    prisma.apifyRun.groupBy
      // by job_type
      .mockResolvedValueOnce([
        {
          job_type: 'poll-post-metrics',
          _sum: { usage_total_usd: 0.04 },
          _count: { _all: 10 },
        },
        {
          job_type: 'poll-post-comments',
          _sum: { usage_total_usd: 0.08 },
          _count: { _all: 7 },
        },
      ])
      // top posts
      .mockResolvedValueOnce([])
      // top accounts
      .mockResolvedValueOnce([]);
    prisma.apifyRun.count
      .mockResolvedValueOnce(20) // total runs
      .mockResolvedValueOnce(17); // finalized

    const res = await service.getSpending('c1');

    expect(res.currency).toBe('USD');
    expect(res.total_usd).toBeCloseTo(0.12);
    expect(res.run_count).toBe(20);
    expect(res.finalized_count).toBe(17);
    expect(res.pending_count).toBe(3);
    // sorted by spend desc
    expect(res.by_job_type[0].job_type).toBe('poll-post-comments');
    expect(res.by_job_type[0].run_count).toBe(7);
  });

  it('labels top posts and accounts and resolves recent-run labels', async () => {
    prisma.apifyRun.groupBy
      .mockResolvedValueOnce([]) // by job_type
      .mockResolvedValueOnce([
        {
          post_id: 'post-1',
          _sum: { usage_total_usd: 0.05 },
          _count: { _all: 3 },
        },
      ])
      .mockResolvedValueOnce([
        {
          social_account_id: 'acc-1',
          _sum: { usage_total_usd: 0.07 },
          _count: { _all: 5 },
        },
      ]);
    prisma.apifyRun.count.mockResolvedValue(0);
    prisma.post.findMany.mockResolvedValue([
      {
        id: 'post-1',
        platform: 'FACEBOOK',
        platform_post_id: '123',
        author_name: 'KOL One',
      },
    ]);
    prisma.socialAccount.findMany.mockResolvedValue([
      { id: 'acc-1', platform: 'FACEBOOK', username: 'kol' },
    ]);
    prisma.apifyRun.findMany.mockResolvedValue([
      {
        id: 'run-1',
        job_type: 'poll-social-account',
        status: 'SUCCEEDED',
        started_at: new Date('2026-06-02'),
        usage_total_usd: 0.01,
        usage_finalized: true,
        post: null,
        socialAccount: { platform: 'FACEBOOK', username: 'kol' },
      },
    ]);

    const res = await service.getSpending('c1');

    expect(res.top_posts).toEqual([
      { post_id: 'post-1', label: 'KOL One', run_count: 3, total_usd: 0.05 },
    ]);
    expect(res.top_accounts).toEqual([
      {
        social_account_id: 'acc-1',
        label: '@kol',
        run_count: 5,
        total_usd: 0.07,
      },
    ]);
    expect(res.recent_runs[0].label).toBe('@kol');
  });
});
