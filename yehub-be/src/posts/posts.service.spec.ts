import ExcelJS from 'exceljs';
import { Test, TestingModule } from '@nestjs/testing';
import { PostsService } from './posts.service';
import { PrismaService } from '../prisma/prisma.service';
import { PollingSchedulerService } from '../polling/polling-scheduler.service';
import { CampaignStatus, Platform } from '../../generated/prisma/client';

const pollingSchedulerMock = {
  schedulePost: jest.fn(),
  removePost: jest.fn(),
  scheduleCampaign: jest.fn(),
  removeCampaign: jest.fn(),
  rescheduleCampaignInheritedPosts: jest.fn(),
  getNextSyncTimes: jest.fn(),
  triggerImmediate: jest.fn(),
};

const campaign = {
  id: 'camp-1',
  metric_polling_interval: 3600,
  comments_polling_interval: 21600,
  platforms: [
    Platform.FACEBOOK,
    Platform.INSTAGRAM,
    Platform.TIKTOK,
    Platform.YOUTUBE,
    Platform.THREADS,
  ],
  deleted_at: null,
  status: CampaignStatus.ACTIVE,
};

const mockPrisma = {
  campaign: { findUnique: jest.fn() },
  post: { findMany: jest.fn(), createMany: jest.fn(), update: jest.fn() },
  $transaction: jest.fn(),
};

describe('PostsService.bulkUpload', () => {
  let service: PostsService;
  const originalFetch = global.fetch;
  const fetchMock = jest.fn();

  beforeAll(() => {
    global.fetch = fetchMock;
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    // Default: no redirect (no Location header) so URLs resolve to themselves.
    fetchMock.mockResolvedValue({ headers: new Headers() });
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PostsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: PollingSchedulerService, useValue: pollingSchedulerMock },
      ],
    }).compile();
    service = module.get(PostsService);

    mockPrisma.campaign.findUnique.mockResolvedValue(campaign);
    mockPrisma.post.findMany.mockResolvedValue([]);
    mockPrisma.post.createMany.mockResolvedValue({ count: 0 });
    mockPrisma.post.update.mockResolvedValue({});
    mockPrisma.$transaction.mockImplementation((ops) => Promise.all(ops));
  });

  const csvFile = (content: string) => ({
    originalname: 'posts.csv',
    mimetype: 'text/csv',
    buffer: Buffer.from(content, 'utf-8'),
  });

  async function buildXlsx(rows: (string | number)[][]): Promise<Buffer> {
    const wb = new ExcelJS.Workbook();
    const sheet = wb.addWorksheet('Posts');
    for (const row of rows) sheet.addRow(row);
    const arrayBuffer = await wb.xlsx.writeBuffer();
    return Buffer.from(arrayBuffer);
  }

  it('rejects CSV missing required columns with template guidance', async () => {
    const csv = 'url\nhttps://www.instagram.com/p/ABC123/\n';
    await expect(service.bulkUpload('camp-1', csvFile(csv))).rejects.toThrow(
      'Invalid file structure. Please use the provided template.',
    );
    expect(mockPrisma.post.createMany).not.toHaveBeenCalled();
  });

  it('rejects legacy bare KPI headers (engagement/buzz/interaction/view)', async () => {
    const csv =
      'url,engagement,buzz,interaction,view\n' +
      'https://www.instagram.com/p/ABC123/,1,2,3,4\n';
    await expect(service.bulkUpload('camp-1', csvFile(csv))).rejects.toThrow(
      'Invalid file structure. Please use the provided template.',
    );
    expect(mockPrisma.post.createMany).not.toHaveBeenCalled();
  });

  it('rejects rows with unrecognized URL format', async () => {
    const csv =
      'url,engagement kpi,buzz kpi,interaction kpi,view kpi\n' +
      'https://example.com/not-a-social-post,,,,\n';
    const result = await service.bulkUpload('camp-1', csvFile(csv));

    expect(result.failed_count).toBe(1);
    expect(result.failures[0].url).toBe(
      'https://example.com/not-a-social-post',
    );
    expect(result.failures[0].reason).toMatch(/Unrecognized URL format/);
  });

  it('rejects rows whose platform is not enabled for the campaign', async () => {
    mockPrisma.campaign.findUnique.mockResolvedValueOnce({
      ...campaign,
      platforms: [Platform.FACEBOOK, Platform.YOUTUBE],
    });
    const csv =
      'url,engagement kpi,buzz kpi,interaction kpi,view kpi\n' +
      'https://www.instagram.com/p/ABC123/,,,,\n';
    const result = await service.bulkUpload('camp-1', csvFile(csv));

    expect(result.failed_count).toBe(1);
    expect(result.failures[0].url).toBe('https://www.instagram.com/p/ABC123/');
    expect(result.failures[0].reason).toMatch(
      /Instagram is not enabled for this campaign/,
    );
    expect(result.failures[0].reason).toMatch(/Facebook/);
    expect(result.failures[0].reason).toMatch(/YouTube/);
    expect(mockPrisma.post.createMany).not.toHaveBeenCalled();
  });

  it('resolves Facebook share redirects so the canonical post id is stored (matches addPost)', async () => {
    // /share/p/<token> resolves to /reel/<numericId>. Without resolution the
    // share token would be stored as platform_post_id, causing duplicates
    // against posts added via the UI which store the canonical id.
    fetchMock
      .mockResolvedValueOnce({
        headers: new Headers({
          location: 'https://www.facebook.com/reel/9876543210',
        }),
      })
      .mockResolvedValueOnce({ headers: new Headers() });

    const csv =
      'url,engagement kpi,buzz kpi,interaction kpi,view kpi\n' +
      'https://www.facebook.com/share/p/1ERmfKW38S/,,,,\n';
    const result = await service.bulkUpload('camp-1', csvFile(csv));

    expect(result.success_count).toBe(1);
    expect(mockPrisma.post.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          url: 'https://www.facebook.com/reel/9876543210',
          platform: Platform.FACEBOOK,
          platform_post_id: '9876543210',
        }),
      ],
      skipDuplicates: true,
    });
  });

  it('saves kpi_targets when CSV provides all 4 KPI columns', async () => {
    const csv =
      'url,engagement kpi,buzz kpi,interaction kpi,view kpi\n' +
      'https://www.instagram.com/p/ABC123/,1000,500,800,5000\n';
    await service.bulkUpload('camp-1', {
      originalname: 'posts.csv',
      mimetype: 'text/csv',
      buffer: Buffer.from(csv, 'utf-8'),
    });

    expect(mockPrisma.post.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          kpi_targets: {
            engagement: 1000,
            buzz: 500,
            interaction: 800,
            view: 5000,
          },
        }),
      ],
      skipDuplicates: true,
    });
  });

  it('creates uploaded posts with null polling overrides so they inherit campaign intervals', async () => {
    const csv =
      'url,engagement kpi,buzz kpi,interaction kpi,view kpi\n' +
      'https://www.instagram.com/p/ABC123/,,,,\n';

    await service.bulkUpload('camp-1', csvFile(csv));

    expect(mockPrisma.post.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          polling_metric_override: null,
          polling_comment_override: null,
        }),
      ],
      skipDuplicates: true,
    });
  });

  it('defaults missing KPI fields to 0 when the row is partially filled', async () => {
    const csv =
      'url,engagement kpi,buzz kpi,interaction kpi,view kpi\n' +
      'https://www.instagram.com/p/ABC123/,1000,,,\n';
    await service.bulkUpload('camp-1', {
      originalname: 'posts.csv',
      mimetype: 'text/csv',
      buffer: Buffer.from(csv, 'utf-8'),
    });

    expect(mockPrisma.post.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          kpi_targets: { engagement: 1000, buzz: 0, interaction: 0, view: 0 },
        }),
      ],
      skipDuplicates: true,
    });
  });

  it('omits kpi_targets so SQL NULL is used when all KPI cells are blank', async () => {
    const csv =
      'url,engagement kpi,buzz kpi,interaction kpi,view kpi\n' +
      'https://www.instagram.com/p/ABC123/,,,,\n';
    await service.bulkUpload('camp-1', {
      originalname: 'posts.csv',
      mimetype: 'text/csv',
      buffer: Buffer.from(csv, 'utf-8'),
    });

    const createPayload = mockPrisma.post.createMany.mock.calls[0][0] as {
      data: Record<string, unknown>[];
    };
    expect(createPayload.data[0]).not.toHaveProperty('kpi_targets');
  });

  it('fails the row when a KPI cell is non-numeric', async () => {
    const csv =
      'url,engagement kpi,buzz kpi,interaction kpi,view kpi\n' +
      'https://www.instagram.com/p/ABC123/,abc,500,800,5000\n';
    const result = await service.bulkUpload('camp-1', {
      originalname: 'posts.csv',
      mimetype: 'text/csv',
      buffer: Buffer.from(csv, 'utf-8'),
    });

    expect(result.failed_count).toBe(1);
    expect(result.failures[0]).toEqual({
      url: 'https://www.instagram.com/p/ABC123/',
      reason: 'Invalid engagement value: abc',
    });
    expect(mockPrisma.post.createMany).not.toHaveBeenCalled();
  });

  it('matches KPI headers case-insensitively and trims whitespace', async () => {
    const csv =
      ' URL , Engagement KPI , BUZZ KPI , Interaction KPI , view kpi \n' +
      'https://www.instagram.com/p/ABC123/,1,2,3,4\n';
    await service.bulkUpload('camp-1', {
      originalname: 'posts.csv',
      mimetype: 'text/csv',
      buffer: Buffer.from(csv, 'utf-8'),
    });

    expect(mockPrisma.post.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          kpi_targets: { engagement: 1, buzz: 2, interaction: 3, view: 4 },
        }),
      ],
      skipDuplicates: true,
    });
  });

  it('imports XLSX with 5 columns and saves kpi_targets', async () => {
    const buffer = await buildXlsx([
      ['URL', 'Engagement KPI', 'Buzz KPI', 'Interaction KPI', 'View KPI'],
      ['https://www.instagram.com/p/ABC123/', 1000, 500, 800, 5000],
    ]);

    const result = await service.bulkUpload('camp-1', {
      originalname: 'posts.xlsx',
      mimetype:
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      buffer,
    });

    expect(result.success_count).toBe(1);
    expect(mockPrisma.post.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          kpi_targets: {
            engagement: 1000,
            buzz: 500,
            interaction: 800,
            view: 5000,
          },
        }),
      ],
      skipDuplicates: true,
    });
  });

  it('uses the first worksheet when XLSX has multiple sheets', async () => {
    const wb = new ExcelJS.Workbook();
    const first = wb.addWorksheet('Posts');
    first.addRow([
      'URL',
      'Engagement KPI',
      'Buzz KPI',
      'Interaction KPI',
      'View KPI',
    ]);
    first.addRow(['https://www.instagram.com/p/ABC123/', '', '', '', '']);
    const second = wb.addWorksheet('Other');
    second.addRow(['ignored']);
    second.addRow(['https://example.com/nope']);
    const buffer = Buffer.from(await wb.xlsx.writeBuffer());

    const result = await service.bulkUpload('camp-1', {
      originalname: 'posts.xlsx',
      mimetype:
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      buffer,
    });

    expect(result.total).toBe(1);
    expect(result.success_count).toBe(1);
  });

  it('fails row when XLSX KPI cell is non-numeric', async () => {
    const buffer = await buildXlsx([
      ['URL', 'Engagement KPI', 'Buzz KPI', 'Interaction KPI', 'View KPI'],
      ['https://www.instagram.com/p/ABC123/', 'abc', 500, 800, 5000],
    ]);

    const result = await service.bulkUpload('camp-1', {
      originalname: 'posts.xlsx',
      mimetype:
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      buffer,
    });

    expect(result.failed_count).toBe(1);
    expect(result.failures[0]).toEqual({
      url: 'https://www.instagram.com/p/ABC123/',
      reason: 'Invalid engagement value: abc',
    });
  });

  it('updates kpi_targets of an existing post instead of failing it', async () => {
    mockPrisma.post.findMany.mockResolvedValueOnce([
      {
        id: 'post-1',
        platform: Platform.INSTAGRAM,
        platform_post_id: 'ABC123',
      },
    ]);
    const csv =
      'url,engagement kpi,buzz kpi,interaction kpi,view kpi\n' +
      'https://www.instagram.com/p/ABC123/,1000,500,800,5000\n';

    const result = await service.bulkUpload('camp-1', csvFile(csv));

    expect(mockPrisma.post.update).toHaveBeenCalledWith({
      where: { id: 'post-1' },
      data: {
        kpi_targets: {
          engagement: 1000,
          buzz: 500,
          interaction: 800,
          view: 5000,
        },
      },
    });
    expect(mockPrisma.post.createMany).not.toHaveBeenCalled();
    expect(result.success_count).toBe(1);
    expect(result.failed_count).toBe(0);
    expect(result.failures).toEqual([]);
  });

  it('leaves an existing post untouched (no update) when the row has no KPI, still counting it as success', async () => {
    mockPrisma.post.findMany.mockResolvedValueOnce([
      {
        id: 'post-1',
        platform: Platform.INSTAGRAM,
        platform_post_id: 'ABC123',
      },
    ]);
    const csv =
      'url,engagement kpi,buzz kpi,interaction kpi,view kpi\n' +
      'https://www.instagram.com/p/ABC123/,,,,\n';

    const result = await service.bulkUpload('camp-1', csvFile(csv));

    expect(mockPrisma.post.update).not.toHaveBeenCalled();
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    expect(result.success_count).toBe(1);
    expect(result.failed_count).toBe(0);
    expect(result.failures).toEqual([]);
  });

  it('writes blanks as 0 when updating an existing post from a partially-filled row', async () => {
    // Relies on the parser normalizing a partially-filled row: a present-but-partial
    // KPI row yields a defined kpi_targets with blank dimensions set to 0.
    mockPrisma.post.findMany.mockResolvedValueOnce([
      {
        id: 'post-1',
        platform: Platform.INSTAGRAM,
        platform_post_id: 'ABC123',
      },
    ]);
    const csv =
      'url,engagement kpi,buzz kpi,interaction kpi,view kpi\n' +
      'https://www.instagram.com/p/ABC123/,1000,,,\n';

    await service.bulkUpload('camp-1', csvFile(csv));

    expect(mockPrisma.post.update).toHaveBeenCalledWith({
      where: { id: 'post-1' },
      data: {
        kpi_targets: { engagement: 1000, buzz: 0, interaction: 0, view: 0 },
      },
    });
  });

  it('creates new posts and updates existing ones in the same file', async () => {
    // existing matches the instagram URL; the tiktok URL is new
    mockPrisma.post.findMany.mockResolvedValueOnce([
      {
        id: 'post-1',
        platform: Platform.INSTAGRAM,
        platform_post_id: 'ABC123',
      },
    ]);
    const csv =
      'url,engagement kpi,buzz kpi,interaction kpi,view kpi\n' +
      'https://www.instagram.com/p/ABC123/,10,20,30,40\n' +
      'https://www.tiktok.com/@u/video/123,,,,\n';

    const result = await service.bulkUpload('camp-1', csvFile(csv));

    expect(mockPrisma.post.update).toHaveBeenCalledTimes(1);
    expect(mockPrisma.post.update).toHaveBeenCalledWith({
      where: { id: 'post-1' },
      data: {
        kpi_targets: { engagement: 10, buzz: 20, interaction: 30, view: 40 },
      },
    });
    expect(mockPrisma.post.createMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({ platform: Platform.TIKTOK })],
      skipDuplicates: true,
    });
    expect(result.success_count).toBe(2);
    expect(result.failed_count).toBe(0);
  });

  it('does not report an existing post as a failure', async () => {
    mockPrisma.post.findMany.mockResolvedValueOnce([
      {
        id: 'post-1',
        platform: Platform.INSTAGRAM,
        platform_post_id: 'ABC123',
      },
    ]);
    const csv =
      'url,engagement kpi,buzz kpi,interaction kpi,view kpi\n' +
      'https://www.instagram.com/p/ABC123/,1,2,3,4\n';

    const result = await service.bulkUpload('camp-1', csvFile(csv));

    expect(
      result.failures.some((f) => /already in the campaign/.test(f.reason)),
    ).toBe(false);
  });

  describe('file validation', () => {
    it('rejects a corrupted XLSX file', async () => {
      const buffer = Buffer.from('this is not a valid xlsx', 'utf-8');
      await expect(
        service.bulkUpload('camp-1', {
          originalname: 'posts.xlsx',
          mimetype:
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          buffer,
        }),
      ).rejects.toThrow('File is corrupted or cannot be read.');
      expect(mockPrisma.post.createMany).not.toHaveBeenCalled();
    });

    it('rejects an empty CSV file', async () => {
      await expect(service.bulkUpload('camp-1', csvFile(''))).rejects.toThrow(
        'The uploaded file contains no data.',
      );
      expect(mockPrisma.post.createMany).not.toHaveBeenCalled();
    });

    it('rejects a CSV with headers but no data rows', async () => {
      const csv = 'url,engagement kpi,buzz kpi,interaction kpi,view kpi\n';
      await expect(service.bulkUpload('camp-1', csvFile(csv))).rejects.toThrow(
        'The uploaded file contains no data.',
      );
      expect(mockPrisma.post.createMany).not.toHaveBeenCalled();
    });

    it('rejects an XLSX with headers but no data rows', async () => {
      const buffer = await buildXlsx([
        ['URL', 'Engagement KPI', 'Buzz KPI', 'Interaction KPI', 'View KPI'],
      ]);
      await expect(
        service.bulkUpload('camp-1', {
          originalname: 'posts.xlsx',
          mimetype:
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          buffer,
        }),
      ).rejects.toThrow('The uploaded file contains no data.');
      expect(mockPrisma.post.createMany).not.toHaveBeenCalled();
    });

    it('rejects a CSV missing a required KPI column', async () => {
      const csv =
        'url,engagement kpi,buzz kpi,interaction kpi\n' +
        'https://www.instagram.com/p/ABC123/,1,2,3\n';
      await expect(service.bulkUpload('camp-1', csvFile(csv))).rejects.toThrow(
        'Invalid file structure. Please use the provided template.',
      );
      expect(mockPrisma.post.createMany).not.toHaveBeenCalled();
    });

    it('rejects an XLSX missing a required KPI column', async () => {
      const buffer = await buildXlsx([
        ['URL', 'Engagement KPI', 'Buzz KPI', 'View KPI'],
        ['https://www.instagram.com/p/ABC123/', 1, 2, 3],
      ]);
      await expect(
        service.bulkUpload('camp-1', {
          originalname: 'posts.xlsx',
          mimetype:
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          buffer,
        }),
      ).rejects.toThrow(
        'Invalid file structure. Please use the provided template.',
      );
      expect(mockPrisma.post.createMany).not.toHaveBeenCalled();
    });
  });
});

describe('PostsService.remove', () => {
  let service: PostsService;

  const removePrisma = {
    post: {
      findUnique: jest.fn(),
      delete: jest.fn(),
      update: jest.fn(),
    },
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PostsService,
        { provide: PrismaService, useValue: removePrisma },
        { provide: PollingSchedulerService, useValue: pollingSchedulerMock },
      ],
    }).compile();
    service = module.get(PostsService);
  });

  it('hard-deletes the post and lets cascade FKs remove comments + profile links', async () => {
    removePrisma.post.findUnique.mockResolvedValue({
      id: 'post-1',
      deleted_at: null,
      campaign: { status: CampaignStatus.ACTIVE },
    });
    removePrisma.post.delete.mockResolvedValue({ id: 'post-1' });

    await service.remove('post-1');

    expect(removePrisma.post.delete).toHaveBeenCalledWith({
      where: { id: 'post-1' },
    });
    expect(removePrisma.post.update).not.toHaveBeenCalled();
  });

  it('throws NotFoundException when the post does not exist', async () => {
    removePrisma.post.findUnique.mockResolvedValue(null);

    await expect(service.remove('missing')).rejects.toThrow('Post not found');
    expect(removePrisma.post.delete).not.toHaveBeenCalled();
  });

  it('throws NotFoundException when the post is already soft-deleted (legacy)', async () => {
    removePrisma.post.findUnique.mockResolvedValue({
      id: 'post-1',
      deleted_at: new Date(),
      campaign: { status: CampaignStatus.ACTIVE },
    });

    await expect(service.remove('post-1')).rejects.toThrow('Post not found');
    expect(removePrisma.post.delete).not.toHaveBeenCalled();
  });

  it('rejects with BadRequestException when the campaign is COMPLETED', async () => {
    removePrisma.post.findUnique.mockResolvedValue({
      id: 'post-1',
      deleted_at: null,
      campaign: { status: CampaignStatus.COMPLETED },
    });

    await expect(service.remove('post-1')).rejects.toThrow(
      'Cannot remove posts from a completed campaign',
    );
    expect(removePrisma.post.delete).not.toHaveBeenCalled();
  });
});

describe('PostsService.syncNow', () => {
  let service: PostsService;

  const syncPrisma = {
    post: { findUnique: jest.fn() },
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PostsService,
        { provide: PrismaService, useValue: syncPrisma },
        { provide: PollingSchedulerService, useValue: pollingSchedulerMock },
      ],
    }).compile();
    service = module.get(PostsService);

    syncPrisma.post.findUnique.mockResolvedValue({
      id: 'post-1',
      url: 'https://example.com/post',
      deleted_at: null,
    });
    pollingSchedulerMock.triggerImmediate.mockResolvedValue({
      metrics: true,
      comments: true,
    });
  });

  it('triggers both dimensions when no body is provided (legacy clients)', async () => {
    await service.syncNow('post-1');

    expect(pollingSchedulerMock.triggerImmediate).toHaveBeenCalledWith('post-1', {
      metrics: true,
      comments: true,
    });
  });

  it('triggers only metrics when only metrics is requested', async () => {
    pollingSchedulerMock.triggerImmediate.mockResolvedValue({
      metrics: true,
      comments: false,
    });

    await service.syncNow('post-1', { metrics: true });

    expect(pollingSchedulerMock.triggerImmediate).toHaveBeenCalledWith('post-1', {
      metrics: true,
      comments: false,
    });
  });

  it('triggers only comments when only comments is requested', async () => {
    pollingSchedulerMock.triggerImmediate.mockResolvedValue({
      metrics: false,
      comments: true,
    });

    await service.syncNow('post-1', { comments: true });

    expect(pollingSchedulerMock.triggerImmediate).toHaveBeenCalledWith('post-1', {
      metrics: false,
      comments: true,
    });
  });

  it('throws NotFoundException when the post does not exist', async () => {
    syncPrisma.post.findUnique.mockResolvedValue(null);

    await expect(service.syncNow('missing', { metrics: true })).rejects.toThrow(
      'Post not found',
    );
    expect(pollingSchedulerMock.triggerImmediate).not.toHaveBeenCalled();
  });

  it('throws BadRequestException when the post has no URL', async () => {
    syncPrisma.post.findUnique.mockResolvedValue({
      id: 'post-1',
      url: null,
      deleted_at: null,
    });

    await expect(service.syncNow('post-1', { metrics: true })).rejects.toThrow(
      'Post has no URL to sync',
    );
    expect(pollingSchedulerMock.triggerImmediate).not.toHaveBeenCalled();
  });

  it('throws ConflictException when the requested dimension is already queued', async () => {
    pollingSchedulerMock.triggerImmediate.mockResolvedValue({
      metrics: false,
      comments: false,
    });

    await expect(service.syncNow('post-1', { metrics: true })).rejects.toThrow(
      'A sync is already in progress for this post',
    );
  });
});

describe('PostsService.addPost', () => {
  let service: PostsService;
  const originalFetch = global.fetch;
  const fetchMock = jest.fn();

  const tx = {
    campaign: { findUnique: jest.fn() },
    post: { findFirst: jest.fn(), create: jest.fn() },
  };

  const addPrisma = {
    $transaction: jest.fn((cb: (t: typeof tx) => unknown) => cb(tx)),
  };

  const baseCampaign = {
    id: 'camp-1',
    metric_polling_interval: 3600,
    comments_polling_interval: 21600,
    platforms: [
      Platform.FACEBOOK,
      Platform.INSTAGRAM,
      Platform.TIKTOK,
      Platform.YOUTUBE,
      Platform.THREADS,
    ],
    deleted_at: null,
    status: CampaignStatus.ACTIVE,
  };

  beforeAll(() => {
    global.fetch = fetchMock;
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    fetchMock.mockRejectedValue(new Error('Network disabled in tests'));
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PostsService,
        { provide: PrismaService, useValue: addPrisma },
        { provide: PollingSchedulerService, useValue: pollingSchedulerMock },
      ],
    }).compile();
    service = module.get(PostsService);

    tx.campaign.findUnique.mockResolvedValue(baseCampaign);
    tx.post.findFirst.mockResolvedValue(null);
    tx.post.create.mockImplementation(
      ({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve({ id: 'post-1', ...data }),
    );
  });

  it('creates the post when the URL platform is allowed', async () => {
    const result = await service.addPost('camp-1', {
      url: 'https://www.instagram.com/p/ABC123/',
    });

    expect(tx.post.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        campaign_id: 'camp-1',
        url: 'https://www.instagram.com/p/ABC123/',
        platform: Platform.INSTAGRAM,
        platform_post_id: 'ABC123',
      }),
    });
    expect(result).toMatchObject({ platform: Platform.INSTAGRAM });
  });

  it('creates a post with null polling overrides so it inherits campaign intervals', async () => {
    await service.addPost('camp-1', {
      url: 'https://www.instagram.com/p/ABC123/',
    });

    expect(tx.post.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        polling_metric_override: null,
        polling_comment_override: null,
      }),
    });
  });

  it('uses the redirect location when the input URL returns a Location header', async () => {
    fetchMock.mockResolvedValueOnce({
      headers: new Headers({
        location: 'https://www.instagram.com/p/ABC123/',
      }),
    });

    await service.addPost('camp-1', {
      url: 'https://redirect.example/post',
    });

    expect(tx.post.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        url: 'https://www.instagram.com/p/ABC123/',
        platform: Platform.INSTAGRAM,
        platform_post_id: 'ABC123',
      }),
    });
  });

  it('normalizes Facebook reel share redirects to the clean reel URL', async () => {
    fetchMock
      .mockResolvedValueOnce({
        headers: new Headers({
          location:
            'https://www.facebook.com/reel/2210411646441107?rdid=UOSDf7cMJSD5v6ub&share_url=https%3A%2F%2Fwww.facebook.com%2Fshare%2Fr%2F1DNeQrFRY4%2F',
        }),
      })
      .mockResolvedValueOnce({
        headers: new Headers(),
      });

    await service.addPost('camp-1', {
      url: 'https://www.facebook.com/share/r/1DNeQrFRY4/',
    });

    expect(tx.post.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        url: 'https://www.facebook.com/reel/2210411646441107',
        platform: Platform.FACEBOOK,
        platform_post_id: '2210411646441107',
      }),
    });
  });

  it('normalizes Facebook video share redirects to the clean reel URL', async () => {
    fetchMock
      .mockResolvedValueOnce({
        headers: new Headers({
          location:
            'https://www.facebook.com/reel/1512188266932084/?rdid=DstozfZlMgjhhLKa&share_url=https%3A%2F%2Fwww.facebook.com%2Fshare%2Fv%2F1S3vC9KZ9q%2F',
        }),
      })
      .mockResolvedValueOnce({
        headers: new Headers(),
      });

    await service.addPost('camp-1', {
      url: 'https://www.facebook.com/share/v/1S3vC9KZ9q/',
    });

    expect(tx.post.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        url: 'https://www.facebook.com/reel/1512188266932084',
        platform: Platform.FACEBOOK,
        platform_post_id: '1512188266932084',
      }),
    });
  });

  it('normalizes Facebook share reel redirects that land on page videos to the clean video URL', async () => {
    fetchMock
      .mockResolvedValueOnce({
        headers: new Headers({
          location:
            'https://www.facebook.com/story.php?story_fbid=1410176874467548&id=100064257476549&mibextid=wwXIfr&rdid=O0mC0K3El210CUcV&share_url=https%3A%2F%2Fwww.facebook.com%2Fshare%2Fr%2F18wCAPndkY%2F%3Fmibextid%3DwwXIfr',
        }),
      })
      .mockResolvedValueOnce({
        headers: new Headers({
          location:
            'https://www.facebook.com/hhsb.vn/videos/t%C3%B3p-phai-t%C3%B3p-phai-nguy%E1%BB%85n-h%C6%B0%C6%A1ng-giang-ch%C3%ADnh-th%E1%BB%A9c-b%C6%B0%E1%BB%9Bc-v%C3%A0o-top-5-mgi-allstars/1477869813512523/?mibextid=wwXIfr&share_url=https%3A%2F%2Fwww.facebook.com%2Fshare%2Fr%2F18wCAPndkY%2F%3Fmibextid%3DwwXIfr&rdid=O0mC0K3El210CUcV',
        }),
      })
      .mockResolvedValueOnce({
        headers: new Headers(),
      });

    await service.addPost('camp-1', {
      url: 'https://www.facebook.com/share/r/18wCAPndkY/?mibextid=wwXIfr',
    });

    expect(tx.post.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        url: 'https://www.facebook.com/hhsb.vn/videos/1477869813512523',
        platform: Platform.FACEBOOK,
        platform_post_id: '1477869813512523',
      }),
    });
  });

  it('follows TikTok short URL redirects through the i18n intermediate URL', async () => {
    fetchMock
      .mockResolvedValueOnce({
        headers: new Headers({
          location:
            'https://t.tiktok.com/i18n/share/video/7643387604909477127/?_t=ZS-96mesSNTXCW',
        }),
      })
      .mockResolvedValueOnce({
        headers: new Headers({
          location:
            'https://www.tiktok.com/@/video/7643387604909477127/?_r=1&_t=ZS-96mesSNTXCW',
        }),
      })
      .mockResolvedValueOnce({
        headers: new Headers(),
      })
      .mockResolvedValueOnce({
        json: () =>
          Promise.resolve({
            html: '<blockquote class="tiktok-embed" cite="https://www.tiktok.com/@tomskincare/video/7643387604909477127"></blockquote>',
            author_name: 'tomskincare',
          }),
      });

    await service.addPost('camp-1', {
      url: 'https://vt.tiktok.com/ZSxGL3wpt/',
    });

    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(tx.post.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        url: 'https://www.tiktok.com/@tomskincare/video/7643387604909477127',
        platform: Platform.TIKTOK,
        platform_post_id: '7643387604909477127',
      }),
    });
  });

  it('rejects unrecognized URLs with a guidance message', async () => {
    await expect(
      service.addPost('camp-1', { url: 'https://example.com/not-a-post' }),
    ).rejects.toThrow(/Unrecognized URL format/);
    expect(tx.post.create).not.toHaveBeenCalled();
  });

  it('rejects URLs whose platform is not enabled for the campaign', async () => {
    tx.campaign.findUnique.mockResolvedValueOnce({
      ...baseCampaign,
      platforms: [Platform.FACEBOOK, Platform.YOUTUBE],
    });

    await expect(
      service.addPost('camp-1', {
        url: 'https://www.instagram.com/p/ABC123/',
      }),
    ).rejects.toThrow(/Instagram is not enabled for this campaign/);
    expect(tx.post.create).not.toHaveBeenCalled();
  });

  it('rejects duplicate posts with a clear message', async () => {
    tx.post.findFirst.mockResolvedValueOnce({ id: 'existing-1' });

    await expect(
      service.addPost('camp-1', {
        url: 'https://www.instagram.com/p/ABC123/',
      }),
    ).rejects.toThrow(/already in the campaign/);
    expect(tx.post.create).not.toHaveBeenCalled();
  });

  it('rejects when the campaign is COMPLETED', async () => {
    tx.campaign.findUnique.mockResolvedValueOnce({
      ...baseCampaign,
      status: CampaignStatus.COMPLETED,
    });

    await expect(
      service.addPost('camp-1', {
        url: 'https://www.instagram.com/p/ABC123/',
      }),
    ).rejects.toThrow('Cannot add posts to a completed campaign');
    expect(tx.post.create).not.toHaveBeenCalled();
  });

  it('throws NotFoundException when the campaign is missing', async () => {
    tx.campaign.findUnique.mockResolvedValueOnce(null);

    await expect(
      service.addPost('camp-1', {
        url: 'https://www.instagram.com/p/ABC123/',
      }),
    ).rejects.toThrow('Campaign not found');
  });
});

describe('PostsService.updateSettings', () => {
  let service: PostsService;

  const prisma = {
    post: { findUnique: jest.fn(), update: jest.fn() },
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PostsService,
        { provide: PrismaService, useValue: prisma },
        { provide: PollingSchedulerService, useValue: pollingSchedulerMock },
      ],
    }).compile();
    service = module.get(PostsService);

    prisma.post.findUnique.mockResolvedValue({
      id: 'post-1',
      campaign_id: 'camp-1',
      deleted_at: null,
      polling_metric_override: 3600,
      polling_comment_override: 21600,
      campaign: {
        status: CampaignStatus.ACTIVE,
        metric_polling_interval: 86400,
        comments_polling_interval: 86400,
      },
    });
  });

  it('clears overrides and reschedules when settings are saved as manual', async () => {
    prisma.post.update.mockResolvedValue({
      id: 'post-1',
      polling_metric_override: null,
      polling_comment_override: null,
    });

    await service.updateSettings('post-1', {
      polling_metric_override: null,
      polling_comment_override: null,
      kpi_targets: { engagement: 0, buzz: 0, interaction: 0, view: 0 },
    });

    expect(prisma.post.update).toHaveBeenCalledWith({
      where: { id: 'post-1' },
      data: {
        polling_metric_override: null,
        polling_comment_override: null,
        kpi_targets: { engagement: 0, buzz: 0, interaction: 0, view: 0 },
      },
    });
    expect(pollingSchedulerMock.schedulePost).toHaveBeenCalledWith('post-1');
  });

  it('reschedules when a metric override changes to manual-trigger (0)', async () => {
    prisma.post.update.mockResolvedValue({
      id: 'post-1',
      polling_metric_override: 0,
      polling_comment_override: 21600,
    });

    await service.updateSettings('post-1', {
      polling_metric_override: 0,
      polling_comment_override: 21600,
      kpi_targets: { engagement: 0, buzz: 0, interaction: 0, view: 0 },
    });

    expect(prisma.post.update).toHaveBeenCalledWith({
      where: { id: 'post-1' },
      data: {
        polling_metric_override: 0,
        polling_comment_override: 21600,
        kpi_targets: { engagement: 0, buzz: 0, interaction: 0, view: 0 },
      },
    });
    expect(pollingSchedulerMock.schedulePost).toHaveBeenCalledWith('post-1');
  });

  it('does not reschedule when overrides are unchanged', async () => {
    prisma.post.update.mockResolvedValue({
      id: 'post-1',
      polling_metric_override: 3600,
      polling_comment_override: 21600,
    });

    await service.updateSettings('post-1', {
      polling_metric_override: 3600,
      polling_comment_override: 21600,
      kpi_targets: { engagement: 0, buzz: 0, interaction: 0, view: 0 },
    });

    expect(pollingSchedulerMock.schedulePost).not.toHaveBeenCalled();
  });
});

describe('PostsService.findOne', () => {
  let service: PostsService;

  const prisma = {
    post: { findUnique: jest.fn() },
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PostsService,
        { provide: PrismaService, useValue: prisma },
        { provide: PollingSchedulerService, useValue: pollingSchedulerMock },
      ],
    }).compile();
    service = module.get(PostsService);

    pollingSchedulerMock.getNextSyncTimes.mockResolvedValue({
      next_metric_sync_at: new Date('2026-06-07T10:00:00.000Z'),
      next_comment_sync_at: new Date('2026-06-07T12:00:00.000Z'),
    });
    prisma.post.findUnique.mockResolvedValue({
      id: 'post-1',
      campaign_id: 'camp-1',
      url: 'https://www.instagram.com/p/ABC123/',
      platform: Platform.INSTAGRAM,
      platform_post_id: 'ABC123',
      content: null,
      author_name: null,
      author_avatar: null,
      media_type: 'IMAGE',
      published_at: null,
      likes: 0,
      shares: 0,
      views: 0,
      comment_count: 0,
      metrics_snapshot: null,
      kpi_targets: null,
      polling_metric_override: null,
      polling_comment_override: null,
      last_polled_at: new Date('2026-06-07T09:00:00.000Z'),
      last_metric_polled_at: new Date('2026-06-07T09:00:00.000Z'),
      last_comment_polled_at: new Date('2026-06-07T08:30:00.000Z'),
      last_poll_status: 'success',
      created_at: new Date('2026-06-07T08:00:00.000Z'),
      updated_at: new Date('2026-06-07T09:00:00.000Z'),
      deleted_at: null,
      campaign: {
        id: 'camp-1',
        name: 'Campaign',
        status: CampaignStatus.ACTIVE,
        start_date: null,
        end_date: null,
        project: { id: 'proj-1', name: 'Project' },
      },
      socialAccountPosts: [],
    });
  });

  it('includes next metric and comment sync times in post details', async () => {
    await expect(service.findOne('post-1')).resolves.toEqual(
      expect.objectContaining({
        next_metric_sync_at: new Date('2026-06-07T10:00:00.000Z'),
        next_comment_sync_at: new Date('2026-06-07T12:00:00.000Z'),
      }),
    );
    expect(pollingSchedulerMock.getNextSyncTimes).toHaveBeenCalledWith(
      'post-1',
    );
  });

  it('includes split metric and comment last poll times in post details', async () => {
    await expect(service.findOne('post-1')).resolves.toEqual(
      expect.objectContaining({
        last_metric_polled_at: new Date('2026-06-07T09:00:00.000Z'),
        last_comment_polled_at: new Date('2026-06-07T08:30:00.000Z'),
      }),
    );
  });
});

describe('PostsService.findAll', () => {
  let service: PostsService;

  const prisma = {
    post: { findMany: jest.fn(), count: jest.fn() },
    $transaction: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PostsService,
        { provide: PrismaService, useValue: prisma },
        { provide: PollingSchedulerService, useValue: pollingSchedulerMock },
      ],
    }).compile();
    service = module.get(PostsService);
  });

  const dbPost = (over: Record<string, unknown>) => ({
    id: 'p1',
    campaign_id: 'c1',
    socialAccountPosts: [],
    url: null,
    platform: Platform.TIKTOK,
    platform_post_id: 'x',
    content: null,
    author_name: null,
    author_avatar: null,
    media_type: 'VIDEO',
    published_at: null,
    likes: 0,
    shares: 0,
    views: 0,
    comment_count: 0,
    engagement: 0,
    metrics_snapshot: null,
    kpi_targets: null,
    polling_metric_override: null,
    polling_comment_override: null,
    last_polled_at: null,
    last_poll_status: null,
    created_at: new Date('2026-01-01T00:00:00.000Z'),
    updated_at: new Date('2026-01-01T00:00:00.000Z'),
    ...over,
  });

  it('returns the engagement column maintained by the DB trigger', async () => {
    prisma.$transaction.mockResolvedValue([
      [dbPost({ likes: 30, shares: 5, comment_count: 20, engagement: 55 })],
      1,
    ]);

    const res = await service.findAll('c1', {});

    expect(res.data[0].engagement).toBe(55);
  });

  it('sorts by the engagement column when sort_by=engagement', async () => {
    prisma.$transaction.mockResolvedValue([[dbPost({ engagement: 180 })], 1]);

    await service.findAll('c1', { sort_by: 'engagement', order: 'desc' });

    expect(prisma.post.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { engagement: 'desc' } }),
    );
  });
});

describe('PostsService.exportPosts', () => {
  let service: PostsService;

  const exportPrisma = {
    campaign: { findUnique: jest.fn() },
    post: { findMany: jest.fn() },
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PostsService,
        { provide: PrismaService, useValue: exportPrisma },
        { provide: PollingSchedulerService, useValue: pollingSchedulerMock },
      ],
    }).compile();
    service = module.get(PostsService);

    exportPrisma.campaign.findUnique.mockResolvedValue({
      id: 'camp-1',
      name: 'Summer Push',
      deleted_at: null,
    });
    exportPrisma.post.findMany.mockResolvedValue([
      {
        platform: Platform.INSTAGRAM,
        url: 'https://www.instagram.com/p/ABC123/',
        published_at: new Date('2026-06-20T14:30:00.000Z'),
        likes: 100,
        shares: 20,
        views: 5000,
        comment_count: 30,
        last_metric_polled_at: new Date('2026-06-22T00:00:00.000Z'),
        kpi_targets: {
          engagement: 10000,
          buzz: 60,
          interaction: 300,
          view: 8000,
        },
        socialAccountPosts: [
          {
            socialAccount: {
              username: 'kol_handle',
              display_name: 'KOL Name',
              profile: { tier: { name: 'S' } },
            },
          },
        ],
      },
    ]);
  });

  it('returns an xlsx buffer with the export header row and a data row', async () => {
    const { buffer, filename } = await service.exportPosts('camp-1', {});
    expect(filename).toBe('summer-push-posts.xlsx');

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as unknown as ArrayBuffer);
    const sheet = wb.worksheets[0];
    expect(sheet.getRow(1).getCell(1).value).toBe('Account');
    expect(sheet.getRow(1).getCell(10).value).toBe('Engagement KPI');
    expect(sheet.getRow(2).getCell(1).value).toBe('KOL Name');
    expect(sheet.getRow(2).getCell(2).value).toBe('S');
    expect(sheet.getRow(2).getCell(10).value).toBe(10000);
  });

  it('throws NotFound when the campaign is missing', async () => {
    exportPrisma.campaign.findUnique.mockResolvedValueOnce(null);
    await expect(service.exportPosts('camp-x', {})).rejects.toThrow(
      'Campaign not found',
    );
  });

  it('throws NotFound when the campaign is soft-deleted', async () => {
    exportPrisma.campaign.findUnique.mockResolvedValueOnce({
      id: 'camp-1',
      name: 'Summer Push',
      deleted_at: new Date(),
    });
    await expect(service.exportPosts('camp-1', {})).rejects.toThrow(
      'Campaign not found',
    );
  });
});

describe('PostsService.findAllPosts', () => {
  let service: PostsService;

  const prisma = {
    post: { findMany: jest.fn(), count: jest.fn() },
    $transaction: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PostsService,
        { provide: PrismaService, useValue: prisma },
        { provide: PollingSchedulerService, useValue: pollingSchedulerMock },
      ],
    }).compile();
    service = module.get(PostsService);
  });

  const dbPost = (over: Record<string, unknown>) => ({
    id: 'p1',
    campaign_id: 'c1',
    campaign: { id: 'c1', name: 'Camp', project: { id: 'pr1', name: 'Proj' } },
    socialAccountPosts: [],
    url: null,
    platform: Platform.TIKTOK,
    platform_post_id: 'x',
    content: null,
    author_name: null,
    author_avatar: null,
    media_type: 'VIDEO',
    published_at: null,
    likes: 0,
    shares: 0,
    views: 0,
    comment_count: 0,
    engagement: 0,
    metrics_snapshot: null,
    kpi_targets: null,
    polling_metric_override: null,
    polling_comment_override: null,
    last_polled_at: null,
    last_poll_status: null,
    created_at: new Date('2026-01-01T00:00:00.000Z'),
    updated_at: new Date('2026-01-01T00:00:00.000Z'),
    ...over,
  });

  it('returns the engagement column maintained by the DB trigger', async () => {
    prisma.$transaction.mockResolvedValue([
      [dbPost({ likes: 30, shares: 5, comment_count: 20, engagement: 55 })],
      1,
    ]);

    const res = await service.findAllPosts('u1', {});

    expect(res.data[0].engagement).toBe(55);
  });

  it('sorts by the engagement column when sort_by=engagement', async () => {
    prisma.$transaction.mockResolvedValue([[dbPost({ engagement: 180 })], 1]);

    await service.findAllPosts('u1', { sort_by: 'engagement', order: 'desc' });

    expect(prisma.post.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { engagement: 'desc' } }),
    );
  });

  it('filters by linked social account ids when provided', async () => {
    prisma.$transaction.mockResolvedValue([[dbPost({})], 1]);

    await service.findAllPosts('u1', { social_account_id: ['sa-1', 'sa-2'] });

    expect(prisma.post.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          socialAccountPosts: {
            some: { social_account_id: { in: ['sa-1', 'sa-2'] } },
          },
        }),
      }),
    );
  });

  it('does not add the social account filter when not provided', async () => {
    prisma.$transaction.mockResolvedValue([[dbPost({})], 1]);

    await service.findAllPosts('u1', {});

    const arg = prisma.post.findMany.mock.calls[0][0] as {
      where: Record<string, unknown>;
    };
    expect(arg.where.socialAccountPosts).toBeUndefined();
  });
});
