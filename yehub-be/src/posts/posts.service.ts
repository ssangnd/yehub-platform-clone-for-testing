import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PollingSchedulerService } from '../polling/polling-scheduler.service';
import { detectPlatform } from './platform-detect.utils';
import { cleanPostUrl } from './url-clean.utils';
import { AddPostDto } from './dto/add-post.dto';
import { UpdatePostSettingsDto } from './dto/update-post.dto';
import { ListPostsQueryDto } from './dto/list-posts-query.dto';
import { SyncPostDto } from './dto/sync-post.dto';
import {
  CampaignStatus,
  Platform,
  Prisma,
} from '../../generated/prisma/client';
import * as Papa from 'papaparse';
import ExcelJS from 'exceljs';
import { buildExportRow, buildExportWorkbook } from './posts-export';

const MAX_BULK_URLS = 500;
const REDIRECT_LOOKUP_TIMEOUT_MS = 10_000;
const MAX_REDIRECT_HOPS = 5;
// Bound concurrent redirect lookups during bulk import so a large file does not
// open hundreds of sockets at once.
const BULK_RESOLVE_CONCURRENCY = 8;

const PLATFORM_LABELS: Record<Platform, string> = {
  FACEBOOK: 'Facebook',
  INSTAGRAM: 'Instagram',
  TIKTOK: 'TikTok',
  YOUTUBE: 'YouTube',
  THREADS: 'Threads',
};

function platformNotAllowedMessage(
  detected: Platform,
  allowed: Platform[],
): string {
  const detectedLabel = PLATFORM_LABELS[detected];
  if (allowed.length === 0) {
    return `This campaign has no platforms configured. Update the campaign before adding ${detectedLabel} posts.`;
  }
  const allowedLabels = allowed.map((p) => PLATFORM_LABELS[p]).join(', ');
  return `${detectedLabel} is not enabled for this campaign. Allowed platforms: ${allowedLabels}.`;
}

const KPI_COLUMNS = ['engagement', 'buzz', 'interaction', 'view'] as const;
type KpiColumn = (typeof KPI_COLUMNS)[number];

const KPI_COLUMN_HEADERS: Record<KpiColumn, string> = {
  engagement: 'engagement kpi',
  buzz: 'buzz kpi',
  interaction: 'interaction kpi',
  view: 'view kpi',
};

const REQUIRED_COLUMNS = [
  'url',
  ...KPI_COLUMNS.map((c) => KPI_COLUMN_HEADERS[c]),
];

const ERROR_FILE_CORRUPTED = 'File is corrupted or cannot be read.';
const ERROR_FILE_EMPTY = 'The uploaded file contains no data.';
const ERROR_INVALID_STRUCTURE =
  'Invalid file structure. Please use the provided template.';

type BulkRow = {
  url: string;
  kpi_targets: Prisma.JsonObject | null;
};

type BulkFile = {
  originalname: string;
  mimetype: string;
  buffer: Buffer;
};

@Injectable()
export class PostsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pollingScheduler: PollingSchedulerService,
  ) {}

  async addPost(campaignId: string, dto: AddPostDto) {
    const resolvedUrl = await this.resolveRedirectUrl(dto.url);
    const detection = detectPlatform(resolvedUrl);
    if (!detection) {
      throw new BadRequestException(
        'Unrecognized URL format. Paste a public post link from Facebook, Instagram, TikTok, YouTube, or Threads.',
      );
    }
    // Strip tracking params after redirect resolution + detection (detection
    // regexes rely on params like story_fbid / fbid / v).
    const url = cleanPostUrl(resolvedUrl, detection.platform);

    const result = await this.prisma.$transaction(async (tx) => {
      const campaign = await tx.campaign.findUnique({
        where: { id: campaignId },
        select: {
          id: true,
          metric_polling_interval: true,
          comments_polling_interval: true,
          platforms: true,
          deleted_at: true,
          status: true,
        },
      });
      if (!campaign || campaign.deleted_at)
        throw new NotFoundException('Campaign not found');

      if (campaign.status === CampaignStatus.COMPLETED) {
        throw new BadRequestException(
          'Cannot add posts to a completed campaign',
        );
      }

      if (!campaign.platforms.includes(detection.platform)) {
        throw new BadRequestException(
          platformNotAllowedMessage(detection.platform, campaign.platforms),
        );
      }

      const existing = await tx.post.findFirst({
        where: {
          campaign_id: campaignId,
          platform: detection.platform,
          platform_post_id: detection.platform_post_id,
          deleted_at: null,
        },
      });
      if (existing) {
        throw new ConflictException(
          'This post URL is already in the campaign. Each post can only be added once.',
        );
      }

      const post = await tx.post.create({
        data: {
          campaign_id: campaignId,
          url,
          platform: detection.platform,
          platform_post_id: detection.platform_post_id,
          polling_metric_override: null,
          polling_comment_override: null,
        },
      });
      return { post, campaignStatus: campaign.status };
    });

    if (result.campaignStatus === CampaignStatus.ACTIVE) {
      await this.pollingScheduler.schedulePost(result.post.id);
    }
    return result.post;
  }

  // Resolve many URLs through resolveRedirectUrl with a bounded worker pool,
  // preserving input order in the returned array.
  private async resolveUrlsWithConcurrency(urls: string[]): Promise<string[]> {
    const resolved = new Array<string>(urls.length);
    let cursor = 0;
    const worker = async () => {
      while (cursor < urls.length) {
        const index = cursor++;
        resolved[index] = await this.resolveRedirectUrl(urls[index]);
      }
    };
    const workerCount = Math.min(BULK_RESOLVE_CONCURRENCY, urls.length);
    await Promise.all(Array.from({ length: workerCount }, () => worker()));
    return resolved;
  }

  private async resolveRedirectUrl(originalUrl: string): Promise<string> {
    let input: URL;
    try {
      input = new URL(originalUrl);
    } catch {
      return originalUrl;
    }

    if (input.protocol !== 'http:' && input.protocol !== 'https:') {
      return originalUrl;
    }

    let current = input;
    for (let i = 0; i < MAX_REDIRECT_HOPS; i++) {
      try {
        const response = await fetch(current, {
          method: 'GET',
          redirect: 'manual',
          signal: AbortSignal.timeout(REDIRECT_LOOKUP_TIMEOUT_MS),
        });
        const location = response.headers.get('location');
        if (!location) {
          return this.resolveCanonicalPostUrl(current.toString());
        }
        current = new URL(location, current);
      } catch {
        return current.toString();
      }
    }
    return this.resolveCanonicalPostUrl(current.toString());
  }

  private async resolveCanonicalPostUrl(url: string): Promise<string> {
    return this.resolveTikTokCanonicalUrl(
      this.resolveFacebookCanonicalUrl(url),
    );
  }

  private resolveFacebookCanonicalUrl(url: string): string {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return url;
    }

    if (!/(^|\.)facebook\.com$/i.test(parsed.hostname)) {
      return url;
    }

    const reelMatch = parsed.pathname.match(/^\/reel\/(\d+)\/?$/i);
    if (reelMatch) {
      return `https://www.facebook.com/reel/${reelMatch[1]}`;
    }

    const videoMatch = parsed.pathname.match(
      /^\/([^/]+)\/videos\/(?:[^/]+\/)?(\d+)\/?$/i,
    );
    const shareUrl = parsed.searchParams.get('share_url');
    if (!videoMatch || !shareUrl) {
      return url;
    }

    try {
      const parsedShareUrl = new URL(shareUrl);
      if (
        /(^|\.)facebook\.com$/i.test(parsedShareUrl.hostname) &&
        /^\/share\/[rv]\/[^/]+\/?$/i.test(parsedShareUrl.pathname)
      ) {
        return `https://www.facebook.com/${videoMatch[1]}/videos/${videoMatch[2]}`;
      }
    } catch {
      return url;
    }

    return url;
  }

  private async resolveTikTokCanonicalUrl(url: string): Promise<string> {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return url;
    }

    const match = parsed.pathname.match(/^\/@\/(video|photo)\/(\d+)/i);
    if (!/(^|\.)tiktok\.com$/i.test(parsed.hostname) || !match) {
      return url;
    }

    try {
      const oembedUrl = new URL('https://www.tiktok.com/oembed');
      oembedUrl.searchParams.set('url', url);
      const response = await fetch(oembedUrl, {
        method: 'GET',
        signal: AbortSignal.timeout(REDIRECT_LOOKUP_TIMEOUT_MS),
      });
      const data = (await response.json()) as {
        html?: unknown;
        author_name?: unknown;
      };

      if (typeof data.html === 'string') {
        const cite = data.html.match(/\bcite="([^"]+)"/i)?.[1];
        if (cite) return cite;
      }
      if (typeof data.author_name === 'string' && data.author_name.length > 0) {
        return `https://www.tiktok.com/@${data.author_name}/${match[1]}/${match[2]}`;
      }
    } catch {
      return url;
    }

    return url;
  }

  async bulkUpload(campaignId: string, file: BulkFile) {
    const campaign = await this.prisma.campaign.findUnique({
      where: { id: campaignId },
      select: {
        id: true,
        metric_polling_interval: true,
        comments_polling_interval: true,
        platforms: true,
        deleted_at: true,
        status: true,
      },
    });
    if (!campaign || campaign.deleted_at)
      throw new NotFoundException('Campaign not found');

    if (campaign.status === CampaignStatus.COMPLETED) {
      throw new BadRequestException('Cannot add posts to a completed campaign');
    }

    const allowedPlatforms = new Set(campaign.platforms);

    const name = file.originalname.toLowerCase();
    const isXlsx =
      name.endsWith('.xlsx') ||
      file.mimetype ===
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

    const { rows, rowErrors } = isXlsx
      ? await this.parseXlsxRows(file.buffer)
      : this.parseCsvRows(file.buffer);

    if (rows.length + rowErrors.length === 0) {
      throw new BadRequestException(ERROR_FILE_EMPTY);
    }

    if (rows.length + rowErrors.length > MAX_BULK_URLS) {
      throw new BadRequestException(
        `File contains ${rows.length + rowErrors.length} rows, maximum is ${MAX_BULK_URLS}`,
      );
    }

    const results = {
      total: rows.length + rowErrors.length,
      success_count: 0,
      failed_count: rowErrors.length,
      failures: [...rowErrors] as { url: string; reason: string }[],
    };

    // Resolve redirects/share links to canonical URLs (same as addPost) so the
    // detected platform_post_id matches posts added via the UI. Failures inside
    // resolveRedirectUrl fall back to the original URL, so this never throws.
    const resolvedUrls = await this.resolveUrlsWithConcurrency(
      rows.map((row) => row.url.trim()),
    );

    const toCreate: Prisma.PostCreateManyInput[] = [];
    const seenKeys = new Set<string>();

    for (const [index, row] of rows.entries()) {
      // Report the URL exactly as it appeared in the file so users can find it.
      const url = row.url.trim();
      const resolvedUrl = resolvedUrls[index];
      const detection = detectPlatform(resolvedUrl);
      if (!detection) {
        results.failed_count++;
        results.failures.push({
          url,
          reason:
            'Unrecognized URL format. Paste a public post link from Facebook, Instagram, TikTok, YouTube, or Threads.',
        });
        continue;
      }

      if (!allowedPlatforms.has(detection.platform)) {
        results.failed_count++;
        results.failures.push({
          url,
          reason: platformNotAllowedMessage(
            detection.platform,
            campaign.platforms,
          ),
        });
        continue;
      }

      const key = `${detection.platform}:${detection.platform_post_id}`;
      if (seenKeys.has(key)) {
        results.failed_count++;
        results.failures.push({
          url,
          reason: 'This URL appears more than once in the file.',
        });
        continue;
      }
      seenKeys.add(key);

      const cleanedUrl = cleanPostUrl(resolvedUrl, detection.platform);

      toCreate.push({
        campaign_id: campaignId,
        url: cleanedUrl,
        platform: detection.platform,
        platform_post_id: detection.platform_post_id,
        polling_metric_override: null,
        polling_comment_override: null,
        ...(row.kpi_targets !== null && { kpi_targets: row.kpi_targets }),
      });
    }

    if (toCreate.length > 0) {
      const existingPosts = await this.prisma.post.findMany({
        where: {
          campaign_id: campaignId,
          deleted_at: null,
          OR: toCreate.map((p) => ({
            platform: p.platform,
            platform_post_id: p.platform_post_id,
          })),
        },
        select: { id: true, platform: true, platform_post_id: true },
      });

      const existingIdByKey = new Map(
        existingPosts.map((p) => [`${p.platform}:${p.platform_post_id}`, p.id]),
      );

      const finalCreate: typeof toCreate = [];
      const ops: Prisma.PrismaPromise<unknown>[] = [];
      for (const item of toCreate) {
        const key = `${item.platform}:${item.platform_post_id}`;
        const existingId = existingIdByKey.get(key);
        if (existingId !== undefined) {
          // Existing post: refresh KPI targets when the row supplies them,
          // otherwise leave it untouched. Either way it counts as success.
          results.success_count++;
          if (item.kpi_targets !== undefined) {
            ops.push(
              this.prisma.post.update({
                where: { id: existingId },
                data: { kpi_targets: item.kpi_targets },
              }),
            );
          }
        } else {
          finalCreate.push(item);
        }
      }

      if (finalCreate.length > 0) {
        ops.push(
          this.prisma.post.createMany({
            data: finalCreate,
            skipDuplicates: true,
          }),
        );
      }
      if (ops.length > 0) {
        await this.prisma.$transaction(ops);
      }

      results.success_count += finalCreate.length;
      if (finalCreate.length > 0 && campaign.status === CampaignStatus.ACTIVE) {
        await this.pollingScheduler.scheduleCampaign(campaignId);
      }
    }

    return results;
  }

  private parseCsvRows(buffer: Buffer): {
    rows: BulkRow[];
    rowErrors: { url: string; reason: string }[];
  } {
    const csvContent = buffer.toString('utf-8').trim();
    if (!csvContent) {
      throw new BadRequestException(ERROR_FILE_EMPTY);
    }

    const parsed = Papa.parse<Record<string, string>>(csvContent, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h) => h.trim().toLowerCase(),
    });

    const headers = parsed.meta.fields ?? [];
    if (headers.length === 0) {
      throw new BadRequestException(ERROR_FILE_EMPTY);
    }

    const headerSet = new Set(headers);
    if (REQUIRED_COLUMNS.some((c) => !headerSet.has(c))) {
      throw new BadRequestException(ERROR_INVALID_STRUCTURE);
    }

    if (parsed.data.length === 0) {
      throw new BadRequestException(ERROR_FILE_EMPTY);
    }

    return this.normalizeRows(
      parsed.data.map((raw) => ({
        url: (raw['url'] ?? '').trim(),
        kpiCells: KPI_COLUMNS.reduce<Record<KpiColumn, string>>(
          (acc, col) => ({
            ...acc,
            [col]: (raw[KPI_COLUMN_HEADERS[col]] ?? '').trim(),
          }),
          { engagement: '', buzz: '', interaction: '', view: '' },
        ),
      })),
    );
  }

  private cellToString(value: ExcelJS.CellValue): string {
    if (value == null) return '';
    if (typeof value === 'string') return value;
    if (typeof value === 'number' || typeof value === 'boolean')
      return String(value);
    if (value instanceof Date) return value.toISOString();
    // Rich text, hyperlink, formula result, error — extract text safely
    if (typeof value === 'object') {
      if ('richText' in value)
        return value.richText.map((r) => r.text).join('');
      if ('text' in value) return String(value.text);
      if ('result' in value) return this.cellToString(value.result);
      if ('error' in value) return '';
    }
    return '';
  }

  private async parseXlsxRows(buffer: Buffer): Promise<{
    rows: BulkRow[];
    rowErrors: { url: string; reason: string }[];
  }> {
    const wb = new ExcelJS.Workbook();
    try {
      await wb.xlsx.load(buffer as unknown as ArrayBuffer);
    } catch {
      throw new BadRequestException(ERROR_FILE_CORRUPTED);
    }

    const sheet = wb.worksheets[0];
    if (!sheet) {
      throw new BadRequestException(ERROR_FILE_EMPTY);
    }

    const headerRow = sheet.getRow(1);
    const headerIndex = new Map<string, number>();
    headerRow.eachCell((cell, colNumber) => {
      const key = this.cellToString(cell.value).trim().toLowerCase();
      if (key) headerIndex.set(key, colNumber);
    });

    if (headerIndex.size === 0) {
      throw new BadRequestException(ERROR_FILE_EMPTY);
    }

    if (REQUIRED_COLUMNS.some((c) => !headerIndex.has(c))) {
      throw new BadRequestException(ERROR_INVALID_STRUCTURE);
    }

    const urlCol = headerIndex.get('url')!;

    const raws: { url: string; kpiCells: Record<KpiColumn, string> }[] = [];
    for (let r = 2; r <= sheet.rowCount; r++) {
      const row = sheet.getRow(r);
      const url = this.cellToString(row.getCell(urlCol).value).trim();

      const kpiCells = KPI_COLUMNS.reduce<Record<KpiColumn, string>>(
        (acc, col) => {
          const c = headerIndex.get(KPI_COLUMN_HEADERS[col]);
          if (!c) return { ...acc, [col]: '' };
          return {
            ...acc,
            [col]: this.cellToString(row.getCell(c).value).trim(),
          };
        },
        { engagement: '', buzz: '', interaction: '', view: '' },
      );

      // skip fully-empty rows (ExcelJS reports trailing blanks)
      if (!url && KPI_COLUMNS.every((c) => kpiCells[c] === '')) continue;

      raws.push({ url, kpiCells });
    }

    return this.normalizeRows(raws);
  }

  private normalizeRows(
    raws: { url: string; kpiCells: Record<KpiColumn, string> }[],
  ): { rows: BulkRow[]; rowErrors: { url: string; reason: string }[] } {
    const rows: BulkRow[] = [];
    const rowErrors: { url: string; reason: string }[] = [];

    for (const raw of raws) {
      if (!raw.url) {
        rowErrors.push({ url: '', reason: 'Empty URL' });
        continue;
      }

      const anyFilled = KPI_COLUMNS.some((c) => raw.kpiCells[c] !== '');
      if (!anyFilled) {
        rows.push({ url: raw.url, kpi_targets: null });
        continue;
      }

      const kpi: Record<string, number> = {};
      let invalid: { column: KpiColumn; raw: string } | null = null;

      for (const col of KPI_COLUMNS) {
        const cell = raw.kpiCells[col];
        if (cell === '') {
          kpi[col] = 0;
          continue;
        }
        const n = Number(cell);
        if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n)) {
          invalid = { column: col, raw: cell };
          break;
        }
        kpi[col] = n;
      }

      if (invalid) {
        rowErrors.push({
          url: raw.url,
          reason: `Invalid ${invalid.column} value: ${invalid.raw}`,
        });
        continue;
      }

      rows.push({ url: raw.url, kpi_targets: kpi });
    }

    return { rows, rowErrors };
  }

  private campaignPostsWhere(
    campaignId: string,
    query: ListPostsQueryDto,
  ): Prisma.PostWhereInput {
    return {
      campaign_id: campaignId,
      deleted_at: null,
      ...(query.platform && { platform: query.platform }),
      ...(query.q && {
        OR: [
          { url: { contains: query.q, mode: 'insensitive' as const } },
          { content: { contains: query.q, mode: 'insensitive' as const } },
          { author_name: { contains: query.q, mode: 'insensitive' as const } },
          {
            platform_post_id: {
              contains: query.q,
              mode: 'insensitive' as const,
            },
          },
        ],
      }),
    };
  }

  async findAll(campaignId: string, query: ListPostsQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where = this.campaignPostsWhere(campaignId, query);

    const postInclude = {
      socialAccountPosts: {
        include: {
          socialAccount: {
            select: {
              id: true,
              platform: true,
              username: true,
              display_name: true,
            },
          },
        },
      },
    } satisfies Prisma.PostInclude;

    const [posts, total] = await this.prisma.$transaction([
      this.prisma.post.findMany({
        where,
        include: postInclude,
        orderBy: { [query.sort_by ?? 'created_at']: query.order ?? 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.post.count({ where }),
    ]);

    return {
      data: posts.map(({ socialAccountPosts, ...p }) => {
        const linked = socialAccountPosts[0]?.socialAccount ?? null;
        return {
          ...p,
          linked_account: linked
            ? {
                id: linked.id,
                platform: linked.platform,
                username: linked.username,
                displayName: linked.display_name,
              }
            : null,
        };
      }),
      total,
      page,
      totalPages: Math.ceil(total / limit) || 1,
    };
  }

  async exportPosts(campaignId: string, query: ListPostsQueryDto) {
    const campaign = await this.prisma.campaign.findUnique({
      where: { id: campaignId },
      select: { id: true, name: true, deleted_at: true },
    });
    if (!campaign || campaign.deleted_at)
      throw new NotFoundException('Campaign not found');

    const posts = await this.prisma.post.findMany({
      where: this.campaignPostsWhere(campaignId, query),
      select: {
        platform: true,
        url: true,
        published_at: true,
        likes: true,
        shares: true,
        views: true,
        comment_count: true,
        last_metric_polled_at: true,
        kpi_targets: true,
        socialAccountPosts: {
          select: {
            socialAccount: {
              select: {
                username: true,
                display_name: true,
                profile: { select: { tier: { select: { name: true } } } },
              },
            },
          },
        },
      },
      orderBy: { created_at: 'desc' },
    });

    const rows = posts.map((p) => {
      const linked = p.socialAccountPosts[0]?.socialAccount ?? null;
      return buildExportRow({
        platform: p.platform,
        url: p.url,
        published_at: p.published_at,
        likes: p.likes,
        shares: p.shares,
        views: p.views,
        comment_count: p.comment_count,
        last_metric_polled_at: p.last_metric_polled_at,
        kpi_targets: p.kpi_targets,
        linkedAccount: linked
          ? {
              username: linked.username,
              display_name: linked.display_name,
              tierName: linked.profile?.tier?.name ?? null,
            }
          : null,
      });
    });

    const buffer = await buildExportWorkbook(rows);
    const slug =
      campaign.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '') || 'campaign';
    return { buffer, filename: `${slug}-posts.xlsx` };
  }

  async findAllPosts(
    userId: string,
    query: ListPostsQueryDto,
    isAdmin = false,
  ) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Prisma.PostWhereInput = {
      deleted_at: null,
      campaign: {
        deleted_at: null,
        ...(!isAdmin && {
          OR: [
            { project: { memberships: { some: { user_id: userId } } } },
            { campaignMemberships: { some: { user_id: userId } } },
          ],
        }),
      },
      ...(query.platform && { platform: query.platform }),
      ...(query.q && {
        OR: [
          { url: { contains: query.q, mode: 'insensitive' as const } },
          { content: { contains: query.q, mode: 'insensitive' as const } },
          { author_name: { contains: query.q, mode: 'insensitive' as const } },
          {
            platform_post_id: {
              contains: query.q,
              mode: 'insensitive' as const,
            },
          },
        ],
      }),
      ...(query.social_account_id?.length && {
        socialAccountPosts: {
          some: { social_account_id: { in: query.social_account_id } },
        },
      }),
    };

    const postInclude = {
      campaign: {
        select: {
          id: true,
          name: true,
          project: { select: { id: true, name: true } },
        },
      },
      socialAccountPosts: {
        include: {
          socialAccount: {
            select: {
              id: true,
              platform: true,
              username: true,
              display_name: true,
            },
          },
        },
      },
    } satisfies Prisma.PostInclude;

    const [posts, total] = await this.prisma.$transaction([
      this.prisma.post.findMany({
        where,
        include: postInclude,
        orderBy: { [query.sort_by ?? 'created_at']: query.order ?? 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.post.count({ where }),
    ]);

    return {
      data: posts.map((p) => {
        const linked = p.socialAccountPosts[0]?.socialAccount ?? null;
        return {
          id: p.id,
          campaign_id: p.campaign_id,
          campaign_name: p.campaign.name,
          project_id: p.campaign.project.id,
          project_name: p.campaign.project.name,
          url: p.url,
          platform: p.platform,
          platform_post_id: p.platform_post_id,
          content: p.content,
          author_name: p.author_name,
          author_avatar: p.author_avatar,
          media_type: p.media_type,
          published_at: p.published_at,
          likes: p.likes,
          shares: p.shares,
          views: p.views,
          comment_count: p.comment_count,
          engagement: p.engagement,
          metrics_snapshot: p.metrics_snapshot,
          kpi_targets: p.kpi_targets,
          polling_metric_override: p.polling_metric_override,
          polling_comment_override: p.polling_comment_override,
          last_polled_at: p.last_polled_at,
          last_poll_status: p.last_poll_status,
          created_at: p.created_at,
          updated_at: p.updated_at,
          linked_account: linked
            ? {
                id: linked.id,
                platform: linked.platform,
                username: linked.username,
                displayName: linked.display_name,
              }
            : null,
        };
      }),
      total,
      page,
      totalPages: Math.ceil(total / limit) || 1,
    };
  }

  async findOne(postId: string) {
    const post = await this.prisma.post.findUnique({
      where: { id: postId },
      include: {
        campaign: {
          select: {
            id: true,
            name: true,
            status: true,
            start_date: true,
            end_date: true,
            project: { select: { id: true, name: true } },
          },
        },
        socialAccountPosts: {
          include: {
            socialAccount: {
              include: {
                profile: {
                  include: {
                    tier: { select: { id: true, name: true, color: true } },
                    categories: {
                      include: {
                        kolCategory: {
                          select: { id: true, name: true, color: true },
                        },
                      },
                    },
                    socialAccounts: {
                      select: { follower_count: true },
                    },
                    _count: { select: { socialAccounts: true } },
                  },
                },
              },
            },
          },
        },
      },
    });
    if (!post || post.deleted_at) throw new NotFoundException('Post not found');

    const nextSyncTimes = await this.pollingScheduler.getNextSyncTimes(post.id);

    const socialAccountPost = post.socialAccountPosts[0] ?? null;
    const linkedAccount = socialAccountPost
      ? {
          id: socialAccountPost.socialAccount.id,
          platform: socialAccountPost.socialAccount.platform,
          username: socialAccountPost.socialAccount.username,
          displayName: socialAccountPost.socialAccount.display_name,
          followerCount: socialAccountPost.socialAccount.follower_count,
          isVerified: socialAccountPost.socialAccount.is_verified,
          linkedBy: socialAccountPost.linked_by,
          profile: {
            id: socialAccountPost.socialAccount.profile.id,
            name: socialAccountPost.socialAccount.profile.name,
            gender: socialAccountPost.socialAccount.profile.gender,
            tier: socialAccountPost.socialAccount.profile.tier ?? null,
            categories: socialAccountPost.socialAccount.profile.categories.map(
              (pc) => pc.kolCategory,
            ),
            totalFollowers:
              socialAccountPost.socialAccount.profile.socialAccounts.reduce(
                (sum, sa) => sum + sa.follower_count,
                0,
              ),
            accountCount:
              socialAccountPost.socialAccount.profile._count.socialAccounts,
          },
        }
      : null;

    return {
      id: post.id,
      campaign_id: post.campaign_id,
      campaign_name: post.campaign.name,
      campaign_status: post.campaign.status,
      campaign_start_date: post.campaign.start_date,
      campaign_end_date: post.campaign.end_date,
      project_id: post.campaign.project.id,
      project_name: post.campaign.project.name,
      url: post.url,
      platform: post.platform,
      platform_post_id: post.platform_post_id,
      content: post.content,
      author_name: post.author_name,
      author_avatar: post.author_avatar,
      media_type: post.media_type,
      published_at: post.published_at,
      likes: post.likes,
      shares: post.shares,
      views: post.views,
      comment_count: post.comment_count,
      metrics_snapshot: post.metrics_snapshot,
      kpi_targets: post.kpi_targets,
      polling_metric_override: post.polling_metric_override,
      polling_comment_override: post.polling_comment_override,
      last_polled_at: post.last_polled_at,
      last_metric_polled_at: post.last_metric_polled_at,
      last_comment_polled_at: post.last_comment_polled_at,
      last_poll_status: post.last_poll_status,
      next_metric_sync_at: nextSyncTimes.next_metric_sync_at,
      next_comment_sync_at: nextSyncTimes.next_comment_sync_at,
      created_at: post.created_at,
      updated_at: post.updated_at,
      linked_account: linkedAccount,
    };
  }

  async updateSettings(postId: string, dto: UpdatePostSettingsDto) {
    const post = await this.prisma.post.findUnique({
      where: { id: postId },
      select: {
        id: true,
        deleted_at: true,
        polling_metric_override: true,
        polling_comment_override: true,
        campaign: {
          select: {
            status: true,
          },
        },
      },
    });
    if (!post || post.deleted_at) throw new NotFoundException('Post not found');

    if (post.campaign?.status === CampaignStatus.COMPLETED) {
      throw new BadRequestException(
        'Cannot edit a post in a completed campaign',
      );
    }

    const updated = await this.prisma.post.update({
      where: { id: postId },
      data: {
        polling_metric_override: dto.polling_metric_override,
        polling_comment_override: dto.polling_comment_override,
        kpi_targets: dto.kpi_targets,
      },
    });

    const overridesChanged =
      post.polling_metric_override !== updated.polling_metric_override ||
      post.polling_comment_override !== updated.polling_comment_override;
    if (overridesChanged) {
      await this.pollingScheduler.schedulePost(postId);
    }

    return updated;
  }

  async syncNow(postId: string, dto: SyncPostDto = {}) {
    const post = await this.prisma.post.findUnique({
      where: { id: postId },
      select: { id: true, url: true, deleted_at: true },
    });
    if (!post || post.deleted_at) throw new NotFoundException('Post not found');
    if (!post.url) {
      throw new BadRequestException('Post has no URL to sync');
    }
    // Default to syncing both dimensions when the caller omits the body, so the
    // existing "sync everything" behaviour is preserved for older clients.
    const metrics = dto.metrics ?? dto.comments === undefined;
    const comments = dto.comments ?? dto.metrics === undefined;
    const result = await this.pollingScheduler.triggerImmediate(postId, {
      metrics,
      comments,
    });
    if (!result.metrics && !result.comments) {
      throw new ConflictException(
        'A sync is already in progress for this post',
      );
    }
  }

  async remove(postId: string) {
    const post = await this.prisma.post.findUnique({
      where: { id: postId },
      include: { campaign: { select: { status: true } } },
    });
    if (!post || post.deleted_at) throw new NotFoundException('Post not found');

    if (post.campaign.status === CampaignStatus.COMPLETED) {
      throw new BadRequestException(
        'Cannot remove posts from a completed campaign',
      );
    }

    await this.pollingScheduler.removePost(postId);
    await this.prisma.post.delete({
      where: { id: postId },
    });
  }
}
