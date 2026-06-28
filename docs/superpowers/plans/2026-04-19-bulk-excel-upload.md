# Bulk Upload Posts via Excel/CSV — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow users to bulk-upload posts to a campaign from a CSV **or** Excel (`.xlsx`) file containing `URL` plus 4 optional KPI target columns (Engagement, Buzz, Interaction, View), with a template download dropdown and an upload progress bar.

**Architecture:** Single endpoint (`POST /v1/campaigns/:campaignId/posts/bulk`) accepts both formats — dispatched to `parseCsvRows` or `parseXlsxRows`, both returning a normalized `BulkRow[]` that feeds the existing dedup/insert path. Frontend generates templates client-side (CSV: inline `Blob`, Excel: `exceljs`), surfaces upload-progress via Axios `onUploadProgress`, and renders the existing failure list.

**Tech Stack:** NestJS 11 + Prisma + papaparse + **exceljs** (new, backend); React 19 + Axios + TanStack Query + shadcn/ui (Progress, DropdownMenu) + **exceljs** (new, frontend).

**Design doc:** `docs/superpowers/specs/2026-04-19-bulk-excel-upload-design.md`.

---

## File structure

### Backend (`yehub-be/`)
- **Modify:** `src/posts/posts.controller.ts` — accept `.xlsx` extension + mimetype, raise size cap to 5 MB, update error messages.
- **Modify:** `src/posts/posts.service.ts` — introduce `BulkRow` type, split parsing into `parseCsvRows` / `parseXlsxRows`, add KPI validation.
- **Create:** `src/posts/posts.service.spec.ts` — unit tests for `bulkUpload` across both formats.
- **Modify:** `package.json` — add `exceljs`.

### Frontend (`yehub-fe/`)
- **Rename + rewrite:** `src/pages/campaigns/CampaignDetailPage/components/ImportCsvDialog.tsx` → `ImportPostsDialog.tsx`.
- **Create:** `src/pages/campaigns/CampaignDetailPage/components/import-template.ts` — client-side CSV + Excel template generators.
- **Modify:** `src/pages/campaigns/CampaignDetailPage/components/CampaignPostsTab.tsx` — update import and button label.
- **Modify:** `src/api/posts.ts` — extend `bulkUploadPosts` with `onUploadProgress` callback.
- **Modify:** `package.json` — add `exceljs`.

---

## Task 1: Backend — add `exceljs` dependency

**Files:**
- Modify: `yehub-be/package.json`

- [ ] **Step 1: Install exceljs**

Run from `yehub-be/`:

```bash
pnpm add exceljs
```

Expected: dependency added to `package.json` under `dependencies`, lockfile updated.

- [ ] **Step 2: Commit**

```bash
git add yehub-be/package.json yehub-be/pnpm-lock.yaml
git commit -m "chore(be): add exceljs for xlsx bulk upload parsing"
```

---

## Task 2: Backend — scaffold `posts.service.spec.ts` with CSV regression tests

No spec file currently exists for `PostsService`. Create it and cover the **existing** CSV-only path first. These tests must pass against the *current* implementation — they are the safety net before refactoring.

**Files:**
- Create: `yehub-be/src/posts/posts.service.spec.ts`

- [ ] **Step 1: Write the initial test file**

```ts
import { Test, TestingModule } from '@nestjs/testing';
import { PostsService } from './posts.service';
import { PrismaService } from '../prisma/prisma.service';
import { CampaignStatus, Platform } from '../../generated/prisma/client';

const campaign = {
  id: 'camp-1',
  metric_polling_interval: 3600,
  comments_polling_interval: 21600,
  deleted_at: null,
  status: CampaignStatus.ACTIVE,
};

const mockPrisma = {
  campaign: { findUnique: jest.fn() },
  post: { findMany: jest.fn(), createMany: jest.fn() },
  $transaction: jest.fn(),
};

describe('PostsService.bulkUpload', () => {
  let service: PostsService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PostsService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();
    service = module.get(PostsService);

    mockPrisma.campaign.findUnique.mockResolvedValue(campaign);
    mockPrisma.post.findMany.mockResolvedValue([]);
    mockPrisma.post.createMany.mockResolvedValue({ count: 0 });
  });

  const csvFile = (content: string) => ({
    originalname: 'posts.csv',
    mimetype: 'text/csv',
    buffer: Buffer.from(content, 'utf-8'),
  });

  it('imports CSV with only a url column (legacy behavior)', async () => {
    const csv = 'url\nhttps://www.instagram.com/p/ABC123/\n';
    const result = await service.bulkUpload('camp-1', csvFile(csv));

    expect(result.total).toBe(1);
    expect(result.success_count).toBe(1);
    expect(result.failed_count).toBe(0);
    expect(mockPrisma.post.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          campaign_id: 'camp-1',
          url: 'https://www.instagram.com/p/ABC123/',
          platform: Platform.INSTAGRAM,
          kpi_targets: null,
        }),
      ],
      skipDuplicates: true,
    });
  });

  it('rejects rows with unrecognized URL format', async () => {
    const csv = 'url\nhttps://example.com/not-a-social-post\n';
    const result = await service.bulkUpload('camp-1', csvFile(csv));

    expect(result.failed_count).toBe(1);
    expect(result.failures[0]).toEqual({
      url: 'https://example.com/not-a-social-post',
      reason: 'Unrecognized URL format',
    });
  });
});
```

> **Note:** This file expects `service.bulkUpload` to accept a file-like object `{ originalname, mimetype, buffer }` instead of the current `(campaignId, csvContent: string)` signature, **and** expects `createMany` to be called with a `kpi_targets: null` field. Both are intentional — subsequent tasks will introduce those changes. This test file is therefore expected to **fail** against the current implementation; Task 3 brings it green.

- [ ] **Step 2: Run the tests — expect failure**

Run from `yehub-be/`:

```bash
pnpm test posts.service
```

Expected: both tests fail. The first fails on the signature change (or on the `kpi_targets` assertion once signature is adjusted), the second fails similarly. Either way, we have a red baseline.

- [ ] **Step 3: Commit**

```bash
git add yehub-be/src/posts/posts.service.spec.ts
git commit -m "test(be): add posts.service.bulkUpload unit tests (failing)"
```

---

## Task 3: Backend — refactor `bulkUpload` to accept a file object and normalize rows via `BulkRow`

Change the `bulkUpload` signature from `(campaignId, csvContent: string)` to `(campaignId, file: { originalname; mimetype; buffer })`. Extract row parsing into a private `parseCsvRows(buffer)` that returns `BulkRow[]`. Add a `kpi_targets: null` stub on each created post (actual parsing comes in Task 5). This turns Task 2's tests green.

**Files:**
- Modify: `yehub-be/src/posts/posts.service.ts`
- Modify: `yehub-be/src/posts/posts.controller.ts`

- [ ] **Step 1: Refactor `posts.service.ts`**

Replace the existing `bulkUpload` block (the whole method) in `yehub-be/src/posts/posts.service.ts` with:

```ts
type BulkRow = {
  url: string;
  kpi_targets: Prisma.JsonObject | null;
};

type BulkFile = {
  originalname: string;
  mimetype: string;
  buffer: Buffer;
};

// inside the PostsService class, replace the existing bulkUpload method:

async bulkUpload(campaignId: string, file: BulkFile) {
  const campaign = await this.prisma.campaign.findUnique({
    where: { id: campaignId },
    select: {
      id: true,
      metric_polling_interval: true,
      comments_polling_interval: true,
      deleted_at: true,
      status: true,
    },
  });
  if (!campaign || campaign.deleted_at)
    throw new NotFoundException('Campaign not found');

  if (campaign.status === CampaignStatus.COMPLETED) {
    throw new BadRequestException('Cannot add posts to a completed campaign');
  }

  const { rows, rowErrors } = this.parseCsvRows(file.buffer);

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

  const toCreate: Prisma.PostCreateManyInput[] = [];
  const seenKeys = new Set<string>();

  for (const row of rows) {
    const url = row.url.trim();
    const detection = detectPlatform(url);
    if (!detection) {
      results.failed_count++;
      results.failures.push({ url, reason: 'Unrecognized URL format' });
      continue;
    }

    const key = `${detection.platform}:${detection.platform_post_id}`;
    if (seenKeys.has(key)) {
      results.failed_count++;
      results.failures.push({ url, reason: 'Duplicate URL in file' });
      continue;
    }
    seenKeys.add(key);

    toCreate.push({
      campaign_id: campaignId,
      url,
      platform: detection.platform,
      platform_post_id: detection.platform_post_id,
      polling_metric_override: campaign.metric_polling_interval,
      polling_comment_override: campaign.comments_polling_interval,
      kpi_targets: row.kpi_targets ?? undefined,
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
      select: { platform: true, platform_post_id: true },
    });

    const existingKeys = new Set(
      existingPosts.map((p) => `${p.platform}:${p.platform_post_id}`),
    );

    const finalCreate: typeof toCreate = [];
    for (const item of toCreate) {
      const key = `${item.platform}:${item.platform_post_id}`;
      if (existingKeys.has(key)) {
        results.failed_count++;
        results.failures.push({
          url: item.url ?? '',
          reason: 'Post already exists in this campaign',
        });
      } else {
        finalCreate.push(item);
      }
    }

    if (finalCreate.length > 0) {
      await this.prisma.post.createMany({
        data: finalCreate,
        skipDuplicates: true,
      });
      results.success_count = finalCreate.length;
    }
  }

  return results;
}

private parseCsvRows(buffer: Buffer): {
  rows: BulkRow[];
  rowErrors: { url: string; reason: string }[];
} {
  const csvContent = buffer.toString('utf-8');
  const parsed = Papa.parse<Record<string, string>>(csvContent, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim().toLowerCase(),
  });

  const rows: BulkRow[] = [];
  const rowErrors: { url: string; reason: string }[] = [];

  for (const raw of parsed.data) {
    const url = (raw['url'] ?? '').trim();
    if (!url) {
      rowErrors.push({ url: '', reason: 'Empty URL' });
      continue;
    }
    rows.push({ url, kpi_targets: null });
  }

  return { rows, rowErrors };
}
```

> Keep existing imports (`Papa`, `Prisma`, etc.) at the top of the file — the `BulkRow` / `BulkFile` types go near the top of the file alongside the other type declarations. Keep `MAX_BULK_URLS = 500` as-is.

- [ ] **Step 2: Update controller to pass the file object through**

In `yehub-be/src/posts/posts.controller.ts`, replace the `bulkUpload` handler body (currently converts buffer to string) with:

```ts
@Post('campaigns/:campaignId/posts/bulk')
@UseGuards(CampaignRolesGuard)
@Roles(ProjectRole.MANAGER, ProjectRole.EXECUTIVE)
@UseInterceptors(
  FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024 } }),
)
@ApiConsumes('multipart/form-data')
@ApiOperation({ summary: 'Bulk upload posts via CSV or Excel' })
bulkUpload(
  @Param('campaignId', ParseUUIDPipe) campaignId: string,
  @UploadedFile() file: { mimetype: string; originalname: string; buffer: Buffer },
) {
  if (!file) {
    throw new BadRequestException('File is required');
  }
  const name = file.originalname.toLowerCase();
  const isCsv = name.endsWith('.csv') || file.mimetype === 'text/csv';
  const isXlsx =
    name.endsWith('.xlsx') ||
    file.mimetype ===
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  if (!isCsv && !isXlsx) {
    throw new BadRequestException('Only CSV and Excel files are allowed');
  }
  return this.postsService.bulkUpload(campaignId, file);
}
```

Remove the now-unused `CsvUpload` local type at the top of the controller.

- [ ] **Step 3: Run the tests — expect pass**

Run from `yehub-be/`:

```bash
pnpm test posts.service
```

Expected: both tests from Task 2 pass.

- [ ] **Step 4: Run lint**

```bash
pnpm lint
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add yehub-be/src/posts/posts.service.ts yehub-be/src/posts/posts.controller.ts
git commit -m "refactor(be): normalize bulkUpload around BulkRow + file object"
```

---

## Task 4: Backend — parse KPI columns from CSV into `kpi_targets`

**Files:**
- Modify: `yehub-be/src/posts/posts.service.spec.ts`
- Modify: `yehub-be/src/posts/posts.service.ts`

- [ ] **Step 1: Add failing tests for KPI parsing**

Append to the `describe('PostsService.bulkUpload', …)` block in `posts.service.spec.ts`:

```ts
it('saves kpi_targets when CSV provides all 4 KPI columns', async () => {
  const csv =
    'url,engagement,buzz,interaction,view\n' +
    'https://www.instagram.com/p/ABC123/,1000,500,800,5000\n';
  await service.bulkUpload('camp-1', {
    originalname: 'posts.csv',
    mimetype: 'text/csv',
    buffer: Buffer.from(csv, 'utf-8'),
  });

  expect(mockPrisma.post.createMany).toHaveBeenCalledWith({
    data: [
      expect.objectContaining({
        kpi_targets: { engagement: 1000, buzz: 500, interaction: 800, view: 5000 },
      }),
    ],
    skipDuplicates: true,
  });
});

it('defaults missing KPI fields to 0 when the row is partially filled', async () => {
  const csv =
    'url,engagement,buzz,interaction,view\n' +
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

it('keeps kpi_targets null when all KPI cells are blank', async () => {
  const csv =
    'url,engagement,buzz,interaction,view\n' +
    'https://www.instagram.com/p/ABC123/,,,,\n';
  await service.bulkUpload('camp-1', {
    originalname: 'posts.csv',
    mimetype: 'text/csv',
    buffer: Buffer.from(csv, 'utf-8'),
  });

  expect(mockPrisma.post.createMany).toHaveBeenCalledWith({
    data: [expect.objectContaining({ kpi_targets: undefined })],
    skipDuplicates: true,
  });
});

it('fails the row when a KPI cell is non-numeric', async () => {
  const csv =
    'url,engagement,buzz,interaction,view\n' +
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
    ' URL , Engagement , BUZZ , Interaction , view \n' +
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
```

- [ ] **Step 2: Run tests — expect 5 new failures**

```bash
pnpm test posts.service
```

Expected: five new tests fail (KPI columns currently ignored — `kpi_targets` is always `null`).

- [ ] **Step 3: Extend `parseCsvRows` to read KPI columns**

Replace `parseCsvRows` in `posts.service.ts` with:

```ts
const KPI_COLUMNS = ['engagement', 'buzz', 'interaction', 'view'] as const;
type KpiColumn = (typeof KPI_COLUMNS)[number];

private parseCsvRows(buffer: Buffer): {
  rows: BulkRow[];
  rowErrors: { url: string; reason: string }[];
} {
  const csvContent = buffer.toString('utf-8');
  const parsed = Papa.parse<Record<string, string>>(csvContent, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim().toLowerCase(),
  });

  return this.normalizeRows(
    parsed.data.map((raw) => ({
      url: (raw['url'] ?? '').trim(),
      kpiCells: KPI_COLUMNS.reduce<Record<KpiColumn, string>>(
        (acc, col) => ({ ...acc, [col]: (raw[col] ?? '').trim() }),
        { engagement: '', buzz: '', interaction: '', view: '' },
      ),
    })),
  );
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

    rows.push({ url: raw.url, kpi_targets: kpi as Prisma.JsonObject });
  }

  return { rows, rowErrors };
}
```

- [ ] **Step 4: Run tests — expect all to pass**

```bash
pnpm test posts.service
```

Expected: all 7 tests pass.

- [ ] **Step 5: Commit**

```bash
git add yehub-be/src/posts/posts.service.ts yehub-be/src/posts/posts.service.spec.ts
git commit -m "feat(be): parse kpi_targets from CSV bulk upload"
```

---

## Task 5: Backend — add Excel (`.xlsx`) parsing

**Files:**
- Modify: `yehub-be/src/posts/posts.service.spec.ts`
- Modify: `yehub-be/src/posts/posts.service.ts`

- [ ] **Step 1: Add failing Excel tests**

Add to `posts.service.spec.ts`. Import `exceljs` at the top of the file:

```ts
import ExcelJS from 'exceljs';
```

Add these helper + tests inside the `describe`:

```ts
async function buildXlsx(rows: (string | number)[][]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet('Posts');
  for (const row of rows) sheet.addRow(row);
  const arrayBuffer = await wb.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer as ArrayBuffer);
}

it('imports XLSX with 5 columns and saves kpi_targets', async () => {
  const buffer = await buildXlsx([
    ['URL', 'Engagement', 'Buzz', 'Interaction', 'View'],
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
        kpi_targets: { engagement: 1000, buzz: 500, interaction: 800, view: 5000 },
      }),
    ],
    skipDuplicates: true,
  });
});

it('uses the first worksheet when XLSX has multiple sheets', async () => {
  const wb = new ExcelJS.Workbook();
  const first = wb.addWorksheet('Posts');
  first.addRow(['URL']);
  first.addRow(['https://www.instagram.com/p/ABC123/']);
  const second = wb.addWorksheet('Other');
  second.addRow(['ignored']);
  second.addRow(['https://example.com/nope']);
  const buffer = Buffer.from((await wb.xlsx.writeBuffer()) as ArrayBuffer);

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
    ['URL', 'Engagement', 'Buzz', 'Interaction', 'View'],
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
```

- [ ] **Step 2: Run tests — expect failures**

```bash
pnpm test posts.service
```

Expected: three new tests fail — service still runs CSV parser on XLSX bytes, which produces garbage.

- [ ] **Step 3: Add `parseXlsxRows` and dispatch based on file type**

In `posts.service.ts`, add the import at the top:

```ts
import ExcelJS from 'exceljs';
```

Extend the service with `parseXlsxRows`:

```ts
private async parseXlsxRows(buffer: Buffer): Promise<{
  rows: BulkRow[];
  rowErrors: { url: string; reason: string }[];
}> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as unknown as ArrayBuffer);
  const sheet = wb.worksheets[0];
  if (!sheet) return { rows: [], rowErrors: [] };

  const headerRow = sheet.getRow(1);
  const headerIndex = new Map<string, number>();
  headerRow.eachCell((cell, colNumber) => {
    const key = String(cell.value ?? '').trim().toLowerCase();
    if (key) headerIndex.set(key, colNumber);
  });

  const urlCol = headerIndex.get('url');
  if (!urlCol) return { rows: [], rowErrors: [] };

  const raws: { url: string; kpiCells: Record<KpiColumn, string> }[] = [];
  for (let r = 2; r <= sheet.rowCount; r++) {
    const row = sheet.getRow(r);
    const urlCell = row.getCell(urlCol).value;
    const url =
      urlCell == null ? '' : String(urlCell).trim();

    const kpiCells = KPI_COLUMNS.reduce<Record<KpiColumn, string>>(
      (acc, col) => {
        const c = headerIndex.get(col);
        if (!c) return { ...acc, [col]: '' };
        const v = row.getCell(c).value;
        return {
          ...acc,
          [col]: v == null ? '' : String(v).trim(),
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
```

Now update `bulkUpload` to dispatch on file type — replace the single line
`const { rows, rowErrors } = this.parseCsvRows(file.buffer);`
with:

```ts
const name = file.originalname.toLowerCase();
const isXlsx =
  name.endsWith('.xlsx') ||
  file.mimetype ===
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

const { rows, rowErrors } = isXlsx
  ? await this.parseXlsxRows(file.buffer)
  : this.parseCsvRows(file.buffer);
```

- [ ] **Step 4: Run tests — expect pass**

```bash
pnpm test posts.service
```

Expected: all 10 tests pass.

- [ ] **Step 5: Run lint**

```bash
pnpm lint
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add yehub-be/src/posts/posts.service.ts yehub-be/src/posts/posts.service.spec.ts
git commit -m "feat(be): support xlsx in campaign bulk-upload endpoint"
```

---

## Task 6: Frontend — add `exceljs` dependency

**Files:**
- Modify: `yehub-fe/package.json`

- [ ] **Step 1: Install exceljs**

Run from `yehub-fe/`:

```bash
pnpm add exceljs
```

Expected: added to `dependencies`.

- [ ] **Step 2: Commit**

```bash
git add yehub-fe/package.json yehub-fe/pnpm-lock.yaml
git commit -m "chore(fe): add exceljs for bulk-upload templates"
```

---

## Task 7: Frontend — create the template generator module

**Files:**
- Create: `yehub-fe/src/pages/campaigns/CampaignDetailPage/components/import-template.ts`

- [ ] **Step 1: Write the template module**

Create `yehub-fe/src/pages/campaigns/CampaignDetailPage/components/import-template.ts` with:

```ts
import ExcelJS from 'exceljs'

const HEADERS = ['URL', 'Engagement', 'Buzz', 'Interaction', 'View'] as const
const EXAMPLE_ROW = [
  'https://www.instagram.com/p/ABC123/',
  1000,
  500,
  800,
  5000,
] as const

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

export function downloadCsvTemplate() {
  const csv = `${HEADERS.join(',')}\n${EXAMPLE_ROW.join(',')}\n`
  triggerDownload(new Blob([csv], { type: 'text/csv;charset=utf-8' }), 'posts-template.csv')
}

export async function downloadExcelTemplate() {
  const wb = new ExcelJS.Workbook()
  const sheet = wb.addWorksheet('Posts')
  sheet.addRow([...HEADERS])
  sheet.addRow([...EXAMPLE_ROW])
  sheet.getRow(1).font = { bold: true }
  const buffer = await wb.xlsx.writeBuffer()
  triggerDownload(
    new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }),
    'posts-template.xlsx',
  )
}
```

- [ ] **Step 2: Type-check**

Run from `yehub-fe/`:

```bash
pnpm lint
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add yehub-fe/src/pages/campaigns/CampaignDetailPage/components/import-template.ts
git commit -m "feat(fe): add client-side CSV + Excel template generators"
```

---

## Task 8: Frontend — extend `bulkUploadPosts` with `onUploadProgress`

**Files:**
- Modify: `yehub-fe/src/api/posts.ts`

- [ ] **Step 1: Update the API function**

In `yehub-fe/src/api/posts.ts`, replace the existing `bulkUploadPosts` entry with:

```ts
bulkUploadPosts: (
  campaignId: string,
  file: File,
  onUploadProgress?: (pct: number) => void,
) => {
  const formData = new FormData()
  formData.append('file', file)
  return apiClient.post<BulkUploadResult>(`/campaigns/${campaignId}/posts/bulk`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    onUploadProgress: (e) => {
      if (onUploadProgress && e.total) {
        onUploadProgress(Math.round((e.loaded / e.total) * 100))
      }
    },
  })
},
```

- [ ] **Step 2: Type-check**

```bash
pnpm lint
```

Expected: no errors (existing call site in `ImportCsvDialog` still compiles because the new arg is optional — Task 9 uses it).

- [ ] **Step 3: Commit**

```bash
git add yehub-fe/src/api/posts.ts
git commit -m "feat(fe): expose upload progress callback on bulkUploadPosts"
```

---

## Task 9: Frontend — rename `ImportCsvDialog` to `ImportPostsDialog` and rewrite the body

**Files:**
- Create: `yehub-fe/src/pages/campaigns/CampaignDetailPage/components/ImportPostsDialog.tsx`
- Delete: `yehub-fe/src/pages/campaigns/CampaignDetailPage/components/ImportCsvDialog.tsx`
- Modify: `yehub-fe/src/pages/campaigns/CampaignDetailPage/components/CampaignPostsTab.tsx`

- [ ] **Step 1: Create `ImportPostsDialog.tsx`**

```tsx
import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import axios from 'axios'
import { postsApi, type BulkUploadResult } from '@/api/posts'
import { queryKeys } from '@/lib/constants/query-keys'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Progress } from '@/components/ui/progress'
import { ChevronDown, Upload, X } from 'lucide-react'
import {
  downloadCsvTemplate,
  downloadExcelTemplate,
} from './import-template'

interface ImportPostsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  campaignId: string
}

export function ImportPostsDialog({ open, onOpenChange, campaignId }: ImportPostsDialogProps) {
  const queryClient = useQueryClient()
  const [file, setFile] = useState<File | null>(null)
  const [result, setResult] = useState<BulkUploadResult | null>(null)
  const [uploadPct, setUploadPct] = useState(0)

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      setFile(null)
      setResult(null)
      setUploadPct(0)
    }
    onOpenChange(next)
  }

  const mutation = useMutation({
    mutationFn: () => {
      setUploadPct(0)
      return postsApi.bulkUploadPosts(campaignId, file!, setUploadPct)
    },
    onSuccess: (response) => {
      const data = response.data
      setResult(data)
      queryClient.invalidateQueries({ queryKey: queryKeys.posts.byCampaign(campaignId) })
      queryClient.invalidateQueries({ queryKey: queryKeys.campaigns.all })
      toast.success(`Imported ${data.success_count} of ${data.total} posts`)
    },
    onError: (err) => {
      if (axios.isAxiosError(err)) {
        toast.error((err.response?.data as { message?: string })?.message ?? 'Upload failed')
      }
    },
  })

  const isUploading = mutation.isPending
  const uploadLabel = uploadPct < 100 ? `Uploading… ${uploadPct}%` : 'Processing…'

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Import posts</DialogTitle>
          <DialogDescription>
            Upload a CSV or Excel file with URLs and optional KPI targets. Max 500 rows.
          </DialogDescription>
        </DialogHeader>

        {!result ? (
          <div className="space-y-4">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="cursor-pointer">
                  Download template
                  <ChevronDown className="ml-1 h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuItem onClick={() => void downloadExcelTemplate()}>
                  Excel (.xlsx)
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => downloadCsvTemplate()}>
                  CSV (.csv)
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {!file ? (
              <label className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-6 cursor-pointer hover:bg-muted/50">
                <Upload className="h-8 w-8 text-muted-foreground mb-2" />
                <span className="text-sm text-muted-foreground">
                  Click to select a CSV or Excel file
                </span>
                <input
                  type="file"
                  accept=".csv,.xlsx"
                  className="hidden"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                />
              </label>
            ) : (
              <div className="flex items-center justify-between rounded-lg border p-3">
                <span className="text-sm truncate">{file.name}</span>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    setFile(null)
                    setUploadPct(0)
                  }}
                  disabled={isUploading}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            )}

            {isUploading && (
              <div className="space-y-1">
                <Progress value={uploadPct < 100 ? uploadPct : 100} />
                <div className="text-xs text-muted-foreground">{uploadLabel}</div>
              </div>
            )}

            <Button
              className="w-full cursor-pointer"
              disabled={!file || isUploading}
              onClick={() => mutation.mutate()}
            >
              Upload
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="rounded-lg border p-3">
                <div className="text-2xl font-bold">{result.total}</div>
                <div className="text-xs text-muted-foreground">Total</div>
              </div>
              <div className="rounded-lg border p-3">
                <div className="text-2xl font-bold text-green-600">{result.success_count}</div>
                <div className="text-xs text-muted-foreground">Success</div>
              </div>
              <div className="rounded-lg border p-3">
                <div className="text-2xl font-bold text-red-600">{result.failed_count}</div>
                <div className="text-xs text-muted-foreground">Failed</div>
              </div>
            </div>
            {result.failures.length > 0 && (
              <div className="max-h-40 overflow-y-auto rounded-lg border p-3 space-y-1">
                {result.failures.map((f, i) => (
                  <div key={i} className="text-xs">
                    <span className="font-mono truncate">{f.url}</span>
                    <span className="text-red-500 ml-2">— {f.reason}</span>
                  </div>
                ))}
              </div>
            )}
            <Button className="w-full cursor-pointer" onClick={() => handleOpenChange(false)}>
              Done
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 2: Delete the old file**

```bash
git rm yehub-fe/src/pages/campaigns/CampaignDetailPage/components/ImportCsvDialog.tsx
```

- [ ] **Step 3: Update `CampaignPostsTab.tsx`**

In `yehub-fe/src/pages/campaigns/CampaignDetailPage/components/CampaignPostsTab.tsx`:

1. Change the import line from `import { ImportCsvDialog } from './ImportCsvDialog'` to `import { ImportPostsDialog } from './ImportPostsDialog'`.
2. Update the button label from `Import CSV` to `Import posts`.
3. Update the empty-state description from `Add posts by URL or import from a CSV file.` to `Add posts by URL or import from a CSV / Excel file.`.
4. Replace the `<ImportCsvDialog …/>` render with `<ImportPostsDialog …/>`.

- [ ] **Step 4: Lint + build**

Run from `yehub-fe/`:

```bash
pnpm lint
pnpm build
```

Expected: both succeed.

- [ ] **Step 5: Commit**

```bash
git add yehub-fe/src/pages/campaigns/CampaignDetailPage/components/ImportPostsDialog.tsx \
        yehub-fe/src/pages/campaigns/CampaignDetailPage/components/CampaignPostsTab.tsx \
        yehub-fe/src/pages/campaigns/CampaignDetailPage/components/ImportCsvDialog.tsx
git commit -m "feat(fe): rename to ImportPostsDialog with xlsx + template dropdown + progress"
```

---

## Task 10: Manual QA — verify the full flow

- [ ] **Step 1: Start services**

From repo root:

```bash
docker compose up -d
```

From `yehub-be/`:

```bash
pnpm start:dev
```

From `yehub-fe/`:

```bash
pnpm dev
```

- [ ] **Step 2: Walk the flow**

1. Log in, open any campaign's detail page → **Posts** tab.
2. Click **Import posts**. Verify title, description, and the **Download template** dropdown are present.
3. Click **Download template → Excel (.xlsx)** → a `posts-template.xlsx` file downloads. Open it: headers are `URL, Engagement, Buzz, Interaction, View` (row 1 bold), one example row.
4. Click **Download template → CSV (.csv)** → same headers, same example row.
5. Upload the Excel template unmodified → 1 success. Verify the new post appears with `kpi_targets` = `{ engagement: 1000, buzz: 500, interaction: 800, view: 5000 }` (check via Prisma Studio or the post's dialog / detail page).
6. Upload a handcrafted Excel with 3 rows: one valid, one with `abc` in Engagement, one with a bogus URL. Verify `success_count = 1`, `failed_count = 2`, reasons match (`Invalid engagement value: abc`, `Unrecognized URL format`).
7. Upload a ≥ 3 MB Excel (pad rows) — confirm the 5 MB cap now works (was 2 MB before).
8. During upload of a larger file, confirm the `<Progress>` bar animates and the label transitions from `Uploading… NN%` to `Processing…`.
9. Upload the old CSV (url column only) → still works (regression).
10. Close and reopen the dialog → state resets (no stale file, progress, or results).

- [ ] **Step 3: If anything fails, file a bug against the plan and fix before merging.**

- [ ] **Step 4: Nothing to commit for manual QA.**

---

## Self-review summary

- **Spec coverage:**
  - §3.1 (endpoint accepts xlsx, 5 MB cap) → Task 3 Step 2.
  - §3.2 (exceljs dep) → Task 1.
  - §3.3 (BulkRow refactor) → Tasks 3 + 4.
  - §3.4 (header case/whitespace) → Task 4 (test) + Task 5 (XLSX side).
  - §3.5 (per-row validation rules) → Task 4 + Task 5.
  - §3.6 (first-sheet, header row, trimming) → Task 5.
  - §3.7 (response shape unchanged) → preserved in Task 3 refactor.
  - §4.1 rename → Task 9.
  - §4.2 template generators → Task 7.
  - §4.3 dialog layout → Task 9.
  - §4.4 state → Task 9.
  - §4.5 API extension → Task 8.
  - §5.1 backend tests → Tasks 2, 4, 5.
  - §5.2 manual frontend QA → Task 10.
- **Placeholder scan:** none — every step has exact code, paths, commands.
- **Type consistency:** `BulkRow`, `BulkFile`, `KPI_COLUMNS`, `KpiColumn`, `parseCsvRows`, `parseXlsxRows`, `normalizeRows` are referenced consistently across Tasks 3–5. Frontend `ImportPostsDialog`, `downloadCsvTemplate`, `downloadExcelTemplate`, `bulkUploadPosts(campaignId, file, onUploadProgress?)` line up across Tasks 7–9.
