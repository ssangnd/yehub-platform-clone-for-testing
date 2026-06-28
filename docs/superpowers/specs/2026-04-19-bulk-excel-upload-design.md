# Bulk Upload Posts via Excel/CSV — Design

- **Ticket:** YEH-88
- **Date:** 2026-04-19
- **Status:** Draft

## 1. Overview

Extend the existing bulk-upload flow on a campaign so a user can import posts via **Excel (`.xlsx`)** in addition to CSV, with KPI targets set at import time.

The template has **5 columns**:

| Column      | Required | Maps to               |
|-------------|----------|-----------------------|
| URL         | Yes      | `Post.url`            |
| Engagement  | No       | `kpi_targets.engagement` |
| Buzz        | No       | `kpi_targets.buzz`    |
| Interaction | No       | `kpi_targets.interaction` |
| View        | No       | `kpi_targets.view`    |

Scope of changes:

1. Backend: same endpoint accepts both `.csv` and `.xlsx`; reads KPI columns into `kpi_targets`.
2. Frontend: rename `ImportCsvDialog` → `ImportPostsDialog`, add a **Download template** dropdown (CSV / Excel), add an upload **progress bar**, keep the existing per-row failure list.

## 2. Non-goals

- Server-side template endpoint — templates are generated entirely client-side.
- Server-side progress reporting / job queue — HTTP upload progress only.
- Per-row processing progress during the request.
- Updating existing posts through bulk upload (insert-only, matching today's behavior).
- Multi-sheet selection in Excel — always use the first sheet.

## 3. Backend changes (`yehub-be/`)

### 3.1 Endpoint

`POST /v1/campaigns/:campaignId/posts/bulk` — path unchanged. Now accepts both `.csv` and `.xlsx` (detected by extension and mimetype). File-size cap raised from **2 MB → 5 MB** to accommodate Excel overhead.

Rejection cases (existing + new):
- No file → `BadRequestException('File is required')`.
- Extension is neither `.csv` nor `.xlsx` (and mimetype isn't `text/csv` or `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`) → `BadRequestException('Only CSV and Excel files are allowed')`.
- Row count > **500** → `BadRequestException` (same as today).

### 3.2 Dependency

Add `exceljs` to `yehub-be` (`pnpm add exceljs`). `papaparse` stays for CSV.

### 3.3 Service refactor (`posts.service.ts`)

Introduce a format-agnostic row type and two parsers. The existing `bulkUpload` logic (dedup, campaign validation, createMany, failure list) remains unchanged — only the input parsing becomes pluggable.

```ts
type BulkRow = {
  url: string
  kpi_targets: KpiTargets | null
}

type KpiTargets = {
  engagement: number
  buzz: number
  interaction: number
  view: number
}
```

New private methods:

- `parseCsvRows(buffer): { rows: BulkRow[]; rowErrors: { url: string; reason: string }[] }`
- `parseXlsxRows(buffer): { rows: BulkRow[]; rowErrors: { url: string; reason: string }[] }`

`bulkUpload` dispatches to the right parser based on extension/mimetype, merges `rowErrors` (parse-time failures like invalid KPI values) into the final `failures[]` array, then runs the existing dedup/insert path.

### 3.4 Header matching

Case-insensitive and trimmed: `URL` == `url` == ` Url `. Expected headers: `url`, `engagement`, `buzz`, `interaction`, `view`. Unknown columns are ignored. Missing KPI columns (e.g. CSV with only `url`) → every row imports with `kpi_targets = null` — preserves backward compatibility with today's CSV.

### 3.5 Per-row validation

- Empty `url` cell → row fails: `"Empty URL"` (existing).
- URL doesn't match any known platform → `"Unrecognized URL format"` (existing).
- Duplicate URL within the file → `"Duplicate URL in CSV"` (existing message; consider updating to `"Duplicate URL in file"` during implementation — minor copy change).
- Duplicate of an existing campaign post → `"Post already exists in this campaign"` (existing).
- KPI cell present but not a non-negative integer → row fails with `"Invalid {column} value: {raw}"`.
- KPI cell empty/whitespace → treated as omitted.
- If **any** KPI cell is filled on a row, build a `kpi_targets` object for that row; blanks in other KPI fields default to `0`.
- If **all** KPI cells are blank (or absent), save `kpi_targets = null`.

### 3.6 Excel parsing specifics

- Read the **first worksheet** only — never error if extra sheets exist.
- Row 1 is the header row; data starts at row 2.
- Trim string cells; treat pure-whitespace as empty.
- Numeric cells and numeric strings both accepted for KPI columns (`1000` and `"1000"` both work).

### 3.7 Response shape

**Unchanged:**

```ts
{
  total: number
  success_count: number
  failed_count: number
  failures: { url: string; reason: string }[]
}
```

## 4. Frontend changes (`yehub-fe/`)

### 4.1 Renames

- `pages/campaigns/CampaignDetailPage/components/ImportCsvDialog.tsx` → `ImportPostsDialog.tsx`
- Import site in `CampaignPostsTab.tsx` updated.
- Trigger button label: **"Import posts"** (was "Import CSV"). Icon unchanged.

### 4.2 New file: template generators

`pages/campaigns/CampaignDetailPage/components/import-template.ts`

Pure module exporting:

- `downloadCsvTemplate()` — build CSV string + `Blob` → trigger download as `posts-template.csv`. No library needed.
- `downloadExcelTemplate()` — use `exceljs` to build a single-sheet workbook (sheet name: `Posts`) with the 5 headers + one example row, then download as `posts-template.xlsx`.

Both templates contain:

| URL | Engagement | Buzz | Interaction | View |
|-----|------------|------|-------------|------|
| https://www.instagram.com/p/ABC123/ | 1000 | 500 | 800 | 5000 |

Add `exceljs` to `yehub-fe` dependencies (`pnpm add exceljs`).

### 4.3 Dialog structure (`ImportPostsDialog.tsx`)

Top to bottom inside `DialogContent`:

1. `DialogHeader`
   - Title: **"Import posts"**
   - Description: **"Upload a CSV or Excel file with URLs and optional KPI targets. Max 500 rows."**
2. **Template dropdown**
   - Trigger: `Button variant="outline" size="sm"` labelled **"Download template"** with a chevron icon.
   - Items: **"Excel (.xlsx)"** → calls `downloadExcelTemplate()`, **"CSV (.csv)"** → calls `downloadCsvTemplate()`.
   - Built with `DropdownMenu` from `components/ui/dropdown-menu`.
3. File picker / selected-file row (existing), `accept=".csv,.xlsx"`.
4. **Progress section** (new, shown while `mutation.isPending`):
   - `<Progress value={uploadPct} />` (shadcn primitive; add via `pnpm dlx shadcn@latest add progress` if not already installed).
   - Label reads `Uploading… {uploadPct}%` while `uploadPct < 100`.
   - Label reads `Processing…` once upload reaches 100% but the response has not returned yet. Progress bar shown at 100% (indeterminate visual optional — steady at 100% is acceptable).
5. Upload button — disabled during `mutation.isPending`; drop the inline "Uploading…" text since the progress section now conveys state.
6. Results view (existing — unchanged 3-column total/success/failed grid + scrollable failures list).

### 4.4 State additions

```ts
const [uploadPct, setUploadPct] = useState(0)
```

Reset to `0`:
- When the dialog closes.
- When the file is cleared.
- At the start of each mutation.

### 4.5 API layer (`api/posts.ts`)

Extend `bulkUploadPosts` to accept an optional `onUploadProgress` callback:

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
}
```

The dialog's mutation passes `setUploadPct`. Transition is implicit: `uploadPct` hits 100 while the promise is still pending → UI swaps label from "Uploading…" to "Processing…".

## 5. Testing

### 5.1 Backend (Jest — extend `posts.service.spec.ts`)

- CSV with `url`-only column → posts created, `kpi_targets` null (regression).
- CSV with all 5 columns → posts created, `kpi_targets` populated.
- Excel with 5 columns → posts created, `kpi_targets` populated.
- Excel: first sheet used when multiple sheets present.
- Header match is case-insensitive and whitespace-tolerant.
- Non-numeric KPI cell → row fails with `"Invalid {column} value: {raw}"`.
- Blank KPI cells on an otherwise valid row → `kpi_targets = null`.
- Mixed row: some KPIs filled, others blank → `kpi_targets` saved with missing fields defaulted to `0`.
- Over 500 rows → `BadRequestException`.
- Unsupported file type (e.g. `.txt`) → `BadRequestException`.
- File larger than 5 MB → rejected by Multer (covered via integration, not unit).

### 5.2 Frontend

Manual verification via the Campaign Detail page → Import posts:
- Download both templates, open them, confirm headers and example row.
- Upload each template (Excel and CSV) → expect 1 successful post.
- Upload a file mixing valid and invalid rows → expect failures list with correct reasons.
- Confirm progress bar animates during upload and transitions to "Processing…" for the server round trip.
- Confirm dialog reset behavior when closed and reopened.

No new unit tests (matches existing frontend convention — no test suite for dialogs).

## 6. Files touched

### Backend
- `yehub-be/package.json` — add `exceljs`.
- `yehub-be/src/posts/posts.controller.ts` — accept `.xlsx` mimetype, raise size cap to 5 MB, update error messages.
- `yehub-be/src/posts/posts.service.ts` — introduce parser split (`parseCsvRows`, `parseXlsxRows`), shared `BulkRow` normalization, KPI validation, `kpi_targets` handling.
- `yehub-be/src/posts/posts.service.spec.ts` — new test cases from §5.1.

### Frontend
- `yehub-fe/package.json` — add `exceljs`.
- `yehub-fe/src/components/ui/progress.tsx` — add shadcn primitive if missing.
- `yehub-fe/src/components/ui/dropdown-menu.tsx` — add shadcn primitive if missing.
- `yehub-fe/src/api/posts.ts` — extend `bulkUploadPosts` with `onUploadProgress`.
- `yehub-fe/src/pages/campaigns/CampaignDetailPage/components/ImportCsvDialog.tsx` → rename to `ImportPostsDialog.tsx`; body rewrite per §4.3.
- `yehub-fe/src/pages/campaigns/CampaignDetailPage/components/import-template.ts` — new file (client-side template generators).
- `yehub-fe/src/pages/campaigns/CampaignDetailPage/components/CampaignPostsTab.tsx` — update import and button label.

## 7. Open questions / decisions locked during brainstorming

- **CSV + Excel support, single endpoint** — do not split into two endpoints.
- **KPI columns map to `kpi_targets`** (not `kpi_currents`).
- **Progress = upload-progress only** (Axios `onUploadProgress`), not row-level / job-queue.
- **Template download dropdown** offers both CSV and Excel.
- **Templates generated client-side**; no server endpoint.
- **KPI columns optional**; non-numeric values fail the row; partial fills default missing KPIs to `0`.
