# Export Posts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a campaign member download an Excel (`.xlsx`) export of the campaign's posts (honoring the active search + platform filter), with KPI/target + URL headers that match the import format so the file can be re-imported.

**Architecture:** A new backend endpoint `GET /campaigns/:campaignId/posts/export` queries the matching posts (same `where` as `findAll`), maps each through a pure `posts-export.ts` module (formulas mirror `campaign-metrics.ts`), and returns an ExcelJS-generated buffer. The import parser + template files are updated so KPI headers become `Engagement KPI / Buzz KPI / Interaction KPI / View KPI` on both sides. The frontend adds an Export button that downloads the blob.

**Tech Stack:** NestJS 11, Prisma 7, ExcelJS (already a backend dep), React 19 + TanStack Query v5, Axios.

**Spec:** `docs/superpowers/specs/2026-06-23-export-posts-design.md`

## Global Constraints

- Package manager is **pnpm** only (never npm/yarn).
- This machine: prepend `/c/Tools/nvm/v24.15.0` to PATH before `pnpm`/`node` (Bash), or run via PowerShell.
- Backend style: single quotes, trailing commas, strict TS. Run `cd yehub-be && pnpm lint` before each backend commit.
- Frontend style: **no semicolons**, single quotes, trailing commas, 120 char width. `yehub-fe` has **no unit-test runner** — verify FE tasks with `cd yehub-fe && pnpm lint && pnpm build` (+ manual check). Run `pnpm format` if a format-check failure appears.
- The `kpi_targets` **JSON keys stay** `engagement/buzz/interaction/view` — only the file *header labels* change. Do not rename the JSON keys.
- Per repo CLAUDE.md (GitNexus): run `gitnexus_impact({target, direction:'upstream'})` before editing any existing symbol (`parseCsvRows`, `parseXlsxRows`, `findAll`, `bulkUpload`, `PostsController`), report blast radius, and run `gitnexus_detect_changes()` before each commit.
- After any Prisma include change, no schema migration is needed (read-only includes only).

---

### Task 1: Update import contract to `… KPI` headers (backend parser + tests)

Decouple the file header labels from the `kpi_targets` JSON keys, switching required headers to `engagement kpi / buzz kpi / interaction kpi / view kpi` (lowercased form, since headers are lowercased before matching).

**Files:**
- Modify: `yehub-be/src/posts/posts.service.ts` (around lines 46-54, 442-447, 505-515)
- Test: `yehub-be/src/posts/posts.service.spec.ts`

**Interfaces:**
- Produces: `KPI_COLUMN_HEADERS: Record<KpiColumn, string>` mapping each kpi key to its lowercased file header. `REQUIRED_COLUMNS` now `['url', 'engagement kpi', 'buzz kpi', 'interaction kpi', 'view kpi']`.
- Consumes: existing `KPI_COLUMNS`, `KpiColumn`, `normalizeRows`.

- [ ] **Step 1: Update existing import test fixtures to the new headers**

In `posts.service.spec.ts`, replace every CSV header line `url,engagement,buzz,interaction,view` with `url,engagement kpi,buzz kpi,interaction kpi,view kpi` (lines ~82, 99, 115, 140, 158, 178, 194). Replace the case-insensitive test header (line ~212) ` URL , Engagement , BUZZ , Interaction , view ` with ` URL , Engagement KPI , BUZZ KPI , Interaction KPI , view kpi `. Replace every XLSX header array `['URL', 'Engagement', 'Buzz', 'Interaction', 'View']` with `['URL', 'Engagement KPI', 'Buzz KPI', 'Interaction KPI', 'View KPI']` (lines ~232, 262, 282). The expected `kpi_targets` objects stay keyed `engagement/buzz/interaction/view` — do not change those.

- [ ] **Step 2: Add a test that legacy bare headers are rejected**

```ts
it('rejects legacy bare KPI headers (engagement/buzz/interaction/view)', async () => {
  const csv =
    'url,engagement,buzz,interaction,view\n' +
    'https://www.instagram.com/p/ABC123/,1,2,3,4\n';
  await expect(service.bulkUpload('camp-1', csvFile(csv))).rejects.toThrow(
    'Invalid file structure. Please use the provided template.',
  );
  expect(mockPrisma.post.createMany).not.toHaveBeenCalled();
});
```

- [ ] **Step 3: Run the import tests to verify they now fail**

Run: `cd yehub-be && pnpm test -- posts.service.spec`
Expected: FAIL — fixtures with `… kpi` headers are rejected as invalid structure (parser still wants bare headers), and the new legacy-rejection test fails because bare headers are still accepted.

- [ ] **Step 4: Implement the header decoupling in `posts.service.ts`**

Replace the `REQUIRED_COLUMNS` block (currently line ~49) with the header map + required columns:

```ts
const KPI_COLUMN_HEADERS: Record<KpiColumn, string> = {
  engagement: 'engagement kpi',
  buzz: 'buzz kpi',
  interaction: 'interaction kpi',
  view: 'view kpi',
};

const REQUIRED_COLUMNS = ['url', ...KPI_COLUMNS.map((c) => KPI_COLUMN_HEADERS[c])];
```

In `parseCsvRows`, change the kpi cell read (currently `(raw[col] ?? '').trim()`) to use the header map:

```ts
kpiCells: KPI_COLUMNS.reduce<Record<KpiColumn, string>>(
  (acc, col) => ({ ...acc, [col]: (raw[KPI_COLUMN_HEADERS[col]] ?? '').trim() }),
  { engagement: '', buzz: '', interaction: '', view: '' },
),
```

In `parseXlsxRows`, change the header lookup (currently `headerIndex.get(col)`) to `headerIndex.get(KPI_COLUMN_HEADERS[col])`:

```ts
const kpiCells = KPI_COLUMNS.reduce<Record<KpiColumn, string>>(
  (acc, col) => {
    const c = headerIndex.get(KPI_COLUMN_HEADERS[col]);
    if (!c) return { ...acc, [col]: '' };
    return { ...acc, [col]: this.cellToString(row.getCell(c).value).trim() };
  },
  { engagement: '', buzz: '', interaction: '', view: '' },
);
```

(`REQUIRED_COLUMNS` is already checked against the lowercased header set in both parsers, so no change is needed there beyond the new constant.)

- [ ] **Step 5: Run the import tests to verify they pass**

Run: `cd yehub-be && pnpm test -- posts.service.spec`
Expected: PASS (all import tests + the new legacy-rejection test).

- [ ] **Step 6: Lint and commit**

```bash
cd yehub-be && pnpm lint
git add yehub-be/src/posts/posts.service.ts yehub-be/src/posts/posts.service.spec.ts
git commit -m "feat(be): switch import KPI headers to '… KPI' labels"
```

---

### Task 2: Regenerate import template files with new headers

**Files:**
- Modify: `yehub-fe/public/templates/posts-template.csv`
- Modify (binary, regenerate): `yehub-fe/public/templates/posts-template.xlsx`
- Create (throwaway script, deleted at end of task): `yehub-be/scripts/gen-posts-template.mjs`

- [ ] **Step 1: Update the CSV template**

Overwrite `yehub-fe/public/templates/posts-template.csv` with:

```csv
URL,Engagement KPI,Buzz KPI,Interaction KPI,View KPI
https://www.instagram.com/p/ABC123/,1000,500,800,5000
```

- [ ] **Step 2: Write a one-off generator for the XLSX template**

Create `yehub-be/scripts/gen-posts-template.mjs`:

```js
import ExcelJS from 'exceljs'

const wb = new ExcelJS.Workbook()
const sheet = wb.addWorksheet('Posts')
sheet.addRow(['URL', 'Engagement KPI', 'Buzz KPI', 'Interaction KPI', 'View KPI'])
sheet.addRow(['https://www.instagram.com/p/ABC123/', 1000, 500, 800, 5000])
await wb.xlsx.writeFile('../yehub-fe/public/templates/posts-template.xlsx')
console.log('wrote posts-template.xlsx')
```

- [ ] **Step 3: Run the generator**

Run: `cd yehub-be && node scripts/gen-posts-template.mjs`
Expected: prints `wrote posts-template.xlsx`.

- [ ] **Step 4: Verify the generated XLSX header row**

Run: `cd yehub-be && node -e "const E=require('exceljs');(async()=>{const wb=new E.Workbook();await wb.xlsx.readFile('../yehub-fe/public/templates/posts-template.xlsx');const r=wb.worksheets[0].getRow(1).values;console.log(JSON.stringify(r));})()"`
Expected: includes `"URL","Engagement KPI","Buzz KPI","Interaction KPI","View KPI"`.

- [ ] **Step 5: Delete the throwaway script and commit**

```bash
rm yehub-be/scripts/gen-posts-template.mjs
git add yehub-fe/public/templates/posts-template.csv yehub-fe/public/templates/posts-template.xlsx
git commit -m "chore(fe): regenerate import templates with '… KPI' headers"
```

---

### Task 3: Pure export module (`posts-export.ts`) + unit tests

Pure, Prisma-free logic for column definitions, the achieved-% helper, and row building (all "missing → empty" rules live here).

**Files:**
- Create: `yehub-be/src/posts/posts-export.ts`
- Test: `yehub-be/src/posts/posts-export.spec.ts`

**Interfaces:**
- Produces:
  - `ExportPostInput` — flat input shape (see Step 3).
  - `EXPORT_COLUMNS: ReadonlyArray<{ header: string; key: string }>` — 19 columns in order.
  - `computeAchieved(actual: number | null, kpi: number | null): string | null`.
  - `buildExportRow(post: ExportPostInput): Record<string, string | number | null>` keyed by the `key`s in `EXPORT_COLUMNS`.
- Consumes: `Platform` from `../../generated/prisma/client`.

- [ ] **Step 1: Write the failing tests**

Create `yehub-be/src/posts/posts-export.spec.ts`:

```ts
import { Platform } from '../../generated/prisma/client';
import {
  buildExportRow,
  computeAchieved,
  EXPORT_COLUMNS,
  type ExportPostInput,
} from './posts-export';

const base: ExportPostInput = {
  platform: Platform.INSTAGRAM,
  url: 'https://www.instagram.com/p/ABC123/',
  published_at: new Date('2026-06-20T14:30:00.000Z'),
  likes: 100,
  shares: 20,
  views: 5000,
  comment_count: 30,
  last_metric_polled_at: new Date('2026-06-22T00:00:00.000Z'),
  kpi_targets: { engagement: 10000, buzz: 60, interaction: 300, view: 8000 },
  linkedAccount: { username: 'kol_handle', display_name: 'KOL Name', tierName: 'S' },
};

describe('computeAchieved', () => {
  it('returns rounded percent with %', () => {
    expect(computeAchieved(150, 300)).toBe('50%');
    expect(computeAchieved(1, 3)).toBe('33%');
  });
  it('returns null when actual or kpi missing or kpi is 0', () => {
    expect(computeAchieved(null, 300)).toBeNull();
    expect(computeAchieved(150, null)).toBeNull();
    expect(computeAchieved(150, 0)).toBeNull();
  });
});

describe('EXPORT_COLUMNS', () => {
  it('lists the 19 headers in order', () => {
    expect(EXPORT_COLUMNS.map((c) => c.header)).toEqual([
      'Account', 'Tier', 'Platform', 'URL', 'Posted Date',
      'Achieved Engagement', 'Achieved Buzz', 'Achieved Interaction', 'Achieved View',
      'Engagement KPI', 'Buzz KPI', 'Interaction KPI', 'View KPI',
      'Actual Engagement', 'Actual Buzz', 'Actual Interaction', 'Actual View',
      'Actual Comment', 'Actual Share',
    ]);
  });
});

describe('buildExportRow', () => {
  it('maps a fully-populated post', () => {
    const r = buildExportRow(base);
    expect(r.account).toBe('KOL Name');
    expect(r.tier).toBe('S');
    expect(r.platform).toBe('INSTAGRAM');
    expect(r.url).toBe('https://www.instagram.com/p/ABC123/');
    expect(r.postedDate).toBe('2026-06-20 14:30');
    // actuals: engagement=likes+shares+comments+views, buzz=comments,
    // interaction=likes+shares+comments, view=views, comment=comments, share=shares
    expect(r.actualEngagement).toBe(5150);
    expect(r.actualBuzz).toBe(30);
    expect(r.actualInteraction).toBe(150);
    expect(r.actualView).toBe(5000);
    expect(r.actualComment).toBe(30);
    expect(r.actualShare).toBe(20);
    expect(r.engagementKpi).toBe(10000);
    expect(r.achievedEngagement).toBe('52%'); // round(5150/10000*100)
    expect(r.achievedView).toBe('63%'); // round(5000/8000*100)
  });

  it('falls back to username when display_name is empty', () => {
    const r = buildExportRow({ ...base, linkedAccount: { username: 'handle', display_name: null, tierName: null } });
    expect(r.account).toBe('handle');
    expect(r.tier).toBeNull();
  });

  it('empties account and tier when no linked account', () => {
    const r = buildExportRow({ ...base, linkedAccount: null });
    expect(r.account).toBeNull();
    expect(r.tier).toBeNull();
  });

  it('empties KPI and achieved columns when kpi_targets is null', () => {
    const r = buildExportRow({ ...base, kpi_targets: null });
    expect(r.engagementKpi).toBeNull();
    expect(r.buzzKpi).toBeNull();
    expect(r.achievedEngagement).toBeNull();
    expect(r.achievedView).toBeNull();
    expect(r.actualEngagement).toBe(5150); // actuals unaffected
  });

  it('empties actuals and achieved when never metric-polled', () => {
    const r = buildExportRow({ ...base, last_metric_polled_at: null });
    expect(r.actualEngagement).toBeNull();
    expect(r.actualShare).toBeNull();
    expect(r.achievedEngagement).toBeNull();
    expect(r.engagementKpi).toBe(10000); // KPI still shown
  });

  it('empties posted date and url when null', () => {
    const r = buildExportRow({ ...base, published_at: null, url: null });
    expect(r.postedDate).toBeNull();
    expect(r.url).toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd yehub-be && pnpm test -- posts-export.spec`
Expected: FAIL with "Cannot find module './posts-export'".

- [ ] **Step 3: Implement `posts-export.ts`**

Create `yehub-be/src/posts/posts-export.ts`:

```ts
import { Platform } from '../../generated/prisma/client';

export interface ExportPostInput {
  platform: Platform;
  url: string | null;
  published_at: Date | null;
  likes: number;
  shares: number;
  views: number;
  comment_count: number;
  last_metric_polled_at: Date | null;
  kpi_targets: unknown;
  linkedAccount: {
    username: string | null;
    display_name: string | null;
    tierName: string | null;
  } | null;
}

export const EXPORT_COLUMNS = [
  { header: 'Account', key: 'account' },
  { header: 'Tier', key: 'tier' },
  { header: 'Platform', key: 'platform' },
  { header: 'URL', key: 'url' },
  { header: 'Posted Date', key: 'postedDate' },
  { header: 'Achieved Engagement', key: 'achievedEngagement' },
  { header: 'Achieved Buzz', key: 'achievedBuzz' },
  { header: 'Achieved Interaction', key: 'achievedInteraction' },
  { header: 'Achieved View', key: 'achievedView' },
  { header: 'Engagement KPI', key: 'engagementKpi' },
  { header: 'Buzz KPI', key: 'buzzKpi' },
  { header: 'Interaction KPI', key: 'interactionKpi' },
  { header: 'View KPI', key: 'viewKpi' },
  { header: 'Actual Engagement', key: 'actualEngagement' },
  { header: 'Actual Buzz', key: 'actualBuzz' },
  { header: 'Actual Interaction', key: 'actualInteraction' },
  { header: 'Actual View', key: 'actualView' },
  { header: 'Actual Comment', key: 'actualComment' },
  { header: 'Actual Share', key: 'actualShare' },
] as const;

export function computeAchieved(
  actual: number | null,
  kpi: number | null,
): string | null {
  if (actual == null || kpi == null || kpi === 0) return null;
  return `${Math.round((actual / kpi) * 100)}%`;
}

// UTC, 'yyyy-MM-dd HH:mm'
function formatPostedDate(date: Date | null): string | null {
  if (!date) return null;
  return date.toISOString().slice(0, 16).replace('T', ' ');
}

function readKpi(
  kpiTargets: unknown,
  key: 'engagement' | 'buzz' | 'interaction' | 'view',
): number | null {
  if (!kpiTargets || typeof kpiTargets !== 'object') return null;
  const value = (kpiTargets as Record<string, unknown>)[key];
  return typeof value === 'number' ? value : null;
}

export function buildExportRow(
  post: ExportPostInput,
): Record<string, string | number | null> {
  const polled = post.last_metric_polled_at != null;

  const actualEngagement = polled
    ? post.likes + post.shares + post.comment_count + post.views
    : null;
  const actualBuzz = polled ? post.comment_count : null;
  const actualInteraction = polled
    ? post.likes + post.shares + post.comment_count
    : null;
  const actualView = polled ? post.views : null;
  const actualComment = polled ? post.comment_count : null;
  const actualShare = polled ? post.shares : null;

  const engagementKpi = readKpi(post.kpi_targets, 'engagement');
  const buzzKpi = readKpi(post.kpi_targets, 'buzz');
  const interactionKpi = readKpi(post.kpi_targets, 'interaction');
  const viewKpi = readKpi(post.kpi_targets, 'view');

  const account =
    post.linkedAccount?.display_name || post.linkedAccount?.username || null;
  const tier = post.linkedAccount?.tierName ?? null;

  return {
    account,
    tier,
    platform: post.platform,
    url: post.url,
    postedDate: formatPostedDate(post.published_at),
    achievedEngagement: computeAchieved(actualEngagement, engagementKpi),
    achievedBuzz: computeAchieved(actualBuzz, buzzKpi),
    achievedInteraction: computeAchieved(actualInteraction, interactionKpi),
    achievedView: computeAchieved(actualView, viewKpi),
    engagementKpi,
    buzzKpi,
    interactionKpi,
    viewKpi,
    actualEngagement,
    actualBuzz,
    actualInteraction,
    actualView,
    actualComment,
    actualShare,
  };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd yehub-be && pnpm test -- posts-export.spec`
Expected: PASS.

- [ ] **Step 5: Lint and commit**

```bash
cd yehub-be && pnpm lint
git add yehub-be/src/posts/posts-export.ts yehub-be/src/posts/posts-export.spec.ts
git commit -m "feat(be): add pure posts-export row builder"
```

---

### Task 4: Service `exportPosts` + workbook builder

Add the workbook builder to `posts-export.ts` and the `exportPosts` service method. Extract a shared `where`-builder so `findAll` and `exportPosts` don't duplicate the filter.

**Files:**
- Modify: `yehub-be/src/posts/posts-export.ts` (add `buildExportWorkbook`)
- Modify: `yehub-be/src/posts/posts.service.ts` (add `exportPosts`, extract `campaignPostsWhere`)
- Test: `yehub-be/src/posts/posts.service.spec.ts` (new `describe('PostsService.exportPosts')`)

**Interfaces:**
- Produces:
  - `buildExportWorkbook(rows: Record<string, string | number | null>[]): Promise<Buffer>` (in `posts-export.ts`).
  - `PostsService.exportPosts(campaignId: string, query: ListPostsQueryDto): Promise<{ buffer: Buffer; filename: string }>`.
- Consumes: `buildExportRow`, `EXPORT_COLUMNS` (Task 3); `ListPostsQueryDto`.

- [ ] **Step 1: Run impact analysis on `findAll` before refactoring its `where`**

Run (via GitNexus MCP): `gitnexus_impact({ target: 'findAll', direction: 'upstream' })`. Report blast radius. Expected: callers are `PostsController.findAll` + tests; LOW/MEDIUM risk (extraction preserves behavior).

- [ ] **Step 2: Add `buildExportWorkbook` to `posts-export.ts`**

Append to `yehub-be/src/posts/posts-export.ts`:

```ts
import ExcelJS from 'exceljs';

export async function buildExportWorkbook(
  rows: Record<string, string | number | null>[],
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet('Posts');
  sheet.addRow(EXPORT_COLUMNS.map((c) => c.header));
  for (const row of rows) {
    sheet.addRow(EXPORT_COLUMNS.map((c) => row[c.key] ?? null));
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}
```

(Move the `import ExcelJS` to the top of the file with the other imports.)

- [ ] **Step 3: Write the failing service test**

Add to `posts.service.spec.ts` (after the `bulkUpload` describe block). It parses the generated buffer back with ExcelJS:

```ts
import {
  buildExportRow as _unusedGuard, // ensure module compiles; remove if lint complains
} from './posts-export';

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
        kpi_targets: { engagement: 10000, buzz: 60, interaction: 300, view: 8000 },
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
    const { buffer, filename } = await service.exportPosts('camp-1', {} as never);
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
    await expect(service.exportPosts('camp-x', {} as never)).rejects.toThrow(
      'Campaign not found',
    );
  });
});
```

(Remove the `_unusedGuard` import line if ESLint flags it — it is only there to anchor the module path; the real coverage of `posts-export` is in `posts-export.spec.ts`.)

- [ ] **Step 4: Run the test to verify it fails**

Run: `cd yehub-be && pnpm test -- posts.service.spec`
Expected: FAIL — `service.exportPosts is not a function`.

- [ ] **Step 5: Extract the shared `where` builder in `posts.service.ts`**

Add a private method and use it inside `findAll` (replace the inline `where` object construction at line ~580 with a call to it):

```ts
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
```

In `findAll`, set `const where = this.campaignPostsWhere(campaignId, query);` (delete the old inline literal).

- [ ] **Step 6: Implement `exportPosts` in `posts.service.ts`**

Add the import at the top: `import { buildExportRow, buildExportWorkbook } from './posts-export';`

Add the method (place it after `findAll`):

```ts
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
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `cd yehub-be && pnpm test -- posts.service.spec posts-export.spec`
Expected: PASS (export tests + unchanged import/findAll tests).

- [ ] **Step 8: Run change detection, lint, commit**

```bash
cd yehub-be && pnpm lint
```
Then run GitNexus `gitnexus_detect_changes()` and confirm only `findAll`, `exportPosts`, `campaignPostsWhere`, and `posts-export` symbols changed.

```bash
git add yehub-be/src/posts/posts-export.ts yehub-be/src/posts/posts.service.ts yehub-be/src/posts/posts.service.spec.ts
git commit -m "feat(be): add PostsService.exportPosts xlsx builder"
```

---

### Task 5: Controller endpoint `GET /campaigns/:campaignId/posts/export`

**Files:**
- Modify: `yehub-be/src/posts/posts.controller.ts`
- Test: `yehub-be/src/posts/posts.controller.spec.ts` (create if absent)

**Interfaces:**
- Consumes: `PostsService.exportPosts` (Task 4).
- Produces: HTTP route streaming the `.xlsx` with `Content-Type` + `Content-Disposition`.

- [ ] **Step 1: Run impact analysis on the controller**

Run: `gitnexus_impact({ target: 'PostsController', direction: 'upstream' })`. Expected: route additions only, LOW risk.

- [ ] **Step 2: Write the failing controller test**

Create/extend `yehub-be/src/posts/posts.controller.spec.ts`:

```ts
import { Test, TestingModule } from '@nestjs/testing';
import { StreamableFile } from '@nestjs/common';
import { PostsController } from './posts.controller';
import { PostsService } from './posts.service';

describe('PostsController.exportPosts', () => {
  let controller: PostsController;
  const serviceMock = {
    exportPosts: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PostsController],
      providers: [{ provide: PostsService, useValue: serviceMock }],
    })
      .overrideGuard(require('../auth/guards/jwt-auth.guard').JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(require('../auth/guards/campaign-roles.guard').CampaignRolesGuard)
      .useValue({ canActivate: () => true })
      .compile();
    controller = module.get(PostsController);
  });

  it('sets download headers and returns a StreamableFile', async () => {
    serviceMock.exportPosts.mockResolvedValue({
      buffer: Buffer.from('xlsx-bytes'),
      filename: 'summer-push-posts.xlsx',
    });
    const res = { set: jest.fn() } as never;

    const result = await controller.exportPosts('camp-1', {} as never, res);

    expect(serviceMock.exportPosts).toHaveBeenCalledWith('camp-1', {});
    expect((res as { set: jest.Mock }).set).toHaveBeenCalledWith(
      expect.objectContaining({
        'Content-Disposition': 'attachment; filename="summer-push-posts.xlsx"',
      }),
    );
    expect(result).toBeInstanceOf(StreamableFile);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `cd yehub-be && pnpm test -- posts.controller.spec`
Expected: FAIL — `controller.exportPosts is not a function`.

- [ ] **Step 4: Implement the endpoint**

In `posts.controller.ts`, add imports:

```ts
import { Res, StreamableFile } from '@nestjs/common';
import type { Response } from 'express';
```

Add the route (place it directly above the existing `@Get('campaigns/:campaignId/posts')` handler so the static `export` segment is registered first):

```ts
@Get('campaigns/:campaignId/posts/export')
@UseGuards(CampaignRolesGuard)
@ApiOperation({ summary: 'Export campaign posts as an Excel file' })
async exportPosts(
  @Param('campaignId', ParseUUIDPipe) campaignId: string,
  @Query() query: ListPostsQueryDto,
  @Res({ passthrough: true }) res: Response,
) {
  const { buffer, filename } = await this.postsService.exportPosts(
    campaignId,
    query,
  );
  res.set({
    'Content-Type':
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'Content-Disposition': `attachment; filename="${filename}"`,
  });
  return new StreamableFile(buffer);
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd yehub-be && pnpm test -- posts.controller.spec`
Expected: PASS.

- [ ] **Step 6: Build, lint, detect changes, commit**

```bash
cd yehub-be && pnpm lint && pnpm build
```
Run `gitnexus_detect_changes()` and confirm only `PostsController` changed.

```bash
git add yehub-be/src/posts/posts.controller.ts yehub-be/src/posts/posts.controller.spec.ts
git commit -m "feat(be): add posts export endpoint"
```

---

### Task 6: Frontend API function `postsApi.exportPosts`

**Files:**
- Modify: `yehub-fe/src/api/posts.ts`

**Interfaces:**
- Produces: `postsApi.exportPosts(campaignId: string, params?: { q?: string; platform?: Platform }): Promise<Blob>`.

- [ ] **Step 1: Add the API function**

In `yehub-fe/src/api/posts.ts`, inside the `postsApi` object (e.g. after `bulkUploadPosts`), add:

```ts
exportPosts: (campaignId: string, params?: { q?: string; platform?: Platform }) =>
  apiClient
    .get<Blob>(`/campaigns/${campaignId}/posts/export`, { params, responseType: 'blob' })
    .then((r) => r.data),
```

- [ ] **Step 2: Lint and build**

Run: `cd yehub-fe && pnpm lint && pnpm build`
Expected: PASS (no type/lint errors).

- [ ] **Step 3: Commit**

```bash
git add yehub-fe/src/api/posts.ts
git commit -m "feat(fe): add posts export API function"
```

---

### Task 7: Frontend Export button in `CampaignPostsTab`

**Files:**
- Modify: `yehub-fe/src/pages/campaigns/CampaignDetailPage/components/CampaignPostsTab.tsx`

**Interfaces:**
- Consumes: `postsApi.exportPosts` (Task 6); the `search` and `platformFilter` already returned by `useCampaignPosts`; the `campaign` prop (for the filename).

- [ ] **Step 1: Add imports**

At the top of `CampaignPostsTab.tsx`, add `Download` to the lucide import and add TanStack/toast imports:

```tsx
import { Plus, Upload, FileText, Download } from 'lucide-react'
import { useMutation } from '@tanstack/react-query'
import { toast } from 'sonner'
import { postsApi } from '@/api/posts'
```

- [ ] **Step 2: Add the export mutation inside the component**

After the `useCampaignPosts(...)` destructure (so `search` and `platformFilter` are in scope), add:

```tsx
const exportMutation = useMutation({
  mutationFn: () =>
    postsApi.exportPosts(campaignId, {
      q: search || undefined,
      platform: platformFilter || undefined,
    }),
  onSuccess: (blob) => {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${campaign.name}-posts.xlsx`
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  },
  onError: () => toast.error('Export failed'),
})
```

- [ ] **Step 3: Render the Export button (visible to all viewers)**

Replace the toolbar's right-hand group (currently the `{canManage && (<div className="ml-auto flex gap-2">…</div>)}` block) with a group that always renders Export and gates Import/Add behind `canManage`:

```tsx
<div className="ml-auto flex gap-2">
  <Button
    size="sm"
    variant="outline"
    className="cursor-pointer"
    onClick={() => exportMutation.mutate()}
    disabled={exportMutation.isPending}
  >
    <Download className="mr-1 h-3 w-3" /> {exportMutation.isPending ? 'Exporting…' : 'Export'}
  </Button>
  {canManage && (
    <>
      <Button size="sm" variant="outline" className="cursor-pointer" onClick={() => setImportOpen(true)}>
        <Upload className="mr-1 h-3 w-3" /> Import posts
      </Button>
      <Button size="sm" className="cursor-pointer" onClick={() => setAddOpen(true)}>
        <Plus className="mr-1 h-3 w-3" /> Add Post
      </Button>
    </>
  )}
</div>
```

- [ ] **Step 4: Lint and build**

Run: `cd yehub-fe && pnpm lint && pnpm build`
Expected: PASS.

- [ ] **Step 5: Manual verification**

Start backend (`cd yehub-be && pnpm start:dev`) + frontend (`cd yehub-fe && pnpm dev`). Open a campaign's Posts tab. Click **Export** → an `.xlsx` downloads. Open it: header row matches the 19 columns; KPI columns are numeric; achieved columns show `NN%` or blank. Apply a platform filter, export again, confirm only matching rows are present. Re-import the exported file via **Import posts** → rows import (the `URL` + `… KPI` columns are read, others ignored).

- [ ] **Step 6: Commit**

```bash
git add yehub-fe/src/pages/campaigns/CampaignDetailPage/components/CampaignPostsTab.tsx
git commit -m "feat(fe): add export button to campaign posts tab"
```

---

## Self-Review

**Spec coverage:**
- Headers `URL/Engagement KPI/…` on both sides → Tasks 1, 2 (import) + 3, 4 (export). ✓
- 19 export columns in order → Task 3 (`EXPORT_COLUMNS` test). ✓
- Metric formulas → Task 3 `buildExportRow` tests. ✓
- Missing → empty rules (account/tier, kpi null, never-polled, kpi 0, null date/url) → Task 3 tests. ✓
- Achieved `"NN%"` text → Task 3 `computeAchieved`. ✓
- Honor filters → Task 4 (`campaignPostsWhere` reused) + Task 7 (FE passes `q`/`platform`). ✓
- xlsx only → Task 4 `buildExportWorkbook`. ✓
- Endpoint, read-only guard → Task 5. ✓
- Export visible to all viewers → Task 7. ✓
- Import-contract change + template regen + test updates → Tasks 1, 2. ✓

**Placeholder scan:** No TBD/TODO; every code step has complete code. ✓

**Type consistency:** `ExportPostInput`, `EXPORT_COLUMNS` keys, `buildExportRow`, `buildExportWorkbook`, `exportPosts({buffer,filename})`, `campaignPostsWhere` used consistently across Tasks 3-5. KPI JSON keys stay `engagement/buzz/interaction/view`; only headers change. ✓

**Deviation from spec:** Filename is built client-side from `campaign.name` (Task 7) rather than parsed from `Content-Disposition` — avoids a CORS expose-header dependency. Backend still sets the header. Functionally equivalent.
</content>
