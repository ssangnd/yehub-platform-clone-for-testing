# Settings Page — Project Categories & Campaign Objectives

**Date:** 2026-04-09
**Status:** Design approved, pending implementation
**Scope:** Single PR. Backend (NestJS + Prisma) and frontend (React + Vite).

## 1. Summary

Replace the placeholder `/settings` page with a tabbed admin-only Settings page that manages two pieces of shared configuration:

1. **Project Category** — already exists as the `Category` model, currently created/deleted from inside the Project form. Move that management out of the Project form and into Settings.
2. **Category Objective** — brand new. A separate entity that can be assigned (multi-select) to a Campaign.

The two tabs are symmetric in shape: list, add, delete with usage-aware confirm. The page is gated by the existing `<AdminRoute>` guard. Non-admin users continue to see and use the pickers in Project and Campaign forms but cannot create or delete entries.

## 2. Goals

- Admin-only Settings page with the same layout/margins as `/users` and `/projects` (currently it has neither — uses no `PageWrapper`).
- Tabbed UI driven by `?tab=` URL query so the choice survives refresh and is shareable.
- Two tabs in phase 1: **Project Category** and **Category Objective**. Architecture must accommodate more tabs without restructuring.
- Each tab supports list / add / delete. Delete confirms with a usage count and cascades the m2m disconnect.
- `ProjectCategoryPicker` becomes a pure picker — its inline "Add New Category" admin dialog is removed entirely.
- New `CampaignObjectivePicker` integrates into the Campaign form, optional, multi-select.
- Migration is purely additive; no risk to existing data.

## 3. Non-goals

Explicitly out of scope for this PR:

- Refactoring `CAMPAIGN_INCLUDE` over-fetch (B4 from the prior code review) — its own PR.
- Additional Settings tabs beyond the two specified — no scaffolding for hypothetical future tabs.
- Renaming, merging, or bulk import of categories/objectives.
- Reordering / manual sort fields. Both lists are alphabetical by `name`.
- "Quick add from picker" UX — the user explicitly asked for create/delete to live only in Settings.
- New e2e or frontend unit tests — backend unit tests only.

## 4. Architecture overview

Four small units of work, all in one PR:

1. **Backend `objectives` module** — new, mirrors `categories/`. Owns CRUD; admin-gated writes; m2m to `Campaign`.
2. **Backend glue** — `categories.service.findAll` adds `project_count`; `objectives.service.findAll` adds `campaign_count`; `campaigns.service` reads/writes `objective_ids`.
3. **Frontend Settings page** — wraps `PageWrapper`/`PageHeader`, uses shadcn `Tabs` driven by `?tab=` query param, two tab panels share a presentational `<TagListPanel>`.
4. **Frontend pickers & form integration** — `ProjectCategoryPicker` simplified, new `CampaignObjectivePicker` added, Campaign form gets an `ObjectivesCard`.

Two new shared frontend primitives (`<MultiSelectChecklist>` and `<TagListPanel>`) are extracted because they have exactly two callers each. Not speculative.

## 5. Backend changes

### 5.1 Schema (`yehub-be/prisma/schema.prisma`)

Add `Objective` model and m2m relation to `Campaign`:

```prisma
model Objective {
  id         String   @id @default(uuid()) @db.Uuid
  name       String   @unique @db.VarChar(100)
  created_at DateTime @default(now())

  campaigns Campaign[]

  @@map("objectives")
}

model Campaign {
  // ...existing fields unchanged...
  objectives Objective[]
}
```

Implicit m2m → Prisma generates the join table `_CampaignToObjective`, matching the `Category`/`Project` idiom already in use.

### 5.2 Migration

A single new migration directory `prisma/migrations/<timestamp>_add_objectives/`. The generated SQL must contain only `CREATE TABLE`, `CREATE INDEX`, and `CREATE UNIQUE INDEX` statements — **no `ALTER TABLE`, no enum changes, no drops**. Hand-review the file before commit. Safe for any environment regardless of data volume.

### 5.3 `src/objectives/` module

New directory mirroring `src/categories/`:

```
src/objectives/
├── objectives.module.ts
├── objectives.controller.ts
├── objectives.service.ts
├── objectives.service.spec.ts
└── dto/create-objective.dto.ts
```

**`objectives.controller.ts`** — controller pattern matches `categories.controller.ts` exactly:

```ts
@ApiTags('Objectives')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('objectives')
export class ObjectivesController {
  constructor(private readonly service: ObjectivesService) {}

  @Get() findAll() { return this.service.findAll(); }                            // any auth user

  @Post()
  @UseGuards(GlobalRolesGuard) @GlobalRoles(GlobalRole.ADMIN)
  create(@Body() dto: CreateObjectiveDto) { return this.service.create(dto.name); }

  @Delete(':id')
  @UseGuards(GlobalRolesGuard) @GlobalRoles(GlobalRole.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', ParseUUIDPipe) id: string) { return this.service.remove(id); }
}
```

**`objectives.service.ts`**:

- `findAll()` → returns `Array<{ id: string; name: string; campaign_count: number }>`, ordered by `name asc`. Uses `_count: { select: { campaigns: true } }` then maps the raw result so the response field is `campaign_count` (not Prisma's nested `_count.campaigns`).
- `create(name: string)` → wraps `prisma.objective.create({ data: { name } })`. Catches `Prisma.PrismaClientKnownRequestError` with code `P2002` and rethrows as `ConflictException('An objective with that name already exists')`.
- `remove(id: string)` → hard delete via `prisma.objective.delete({ where: { id } })`. Prisma's m2m auto-disconnects join rows. Catches `P2025` and rethrows as `NotFoundException('Objective not found')`.

**`dto/create-objective.dto.ts`** — copy of `create-category.dto.ts`, only the class name changes:

```ts
export class CreateObjectiveDto {
  @ApiProperty({ minLength: 1, maxLength: 100 })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name: string;
}
```

**`objectives.module.ts`** — imports `AuthModule`, declares controller and service.

**`app.module.ts`** — register `ObjectivesModule` in the imports list alongside `CategoriesModule`.

### 5.4 `src/categories/categories.service.ts` — `findAll` shape change

Add `_count: { select: { projects: true } }` to the existing `findMany`. Map results so the response field is `project_count`. Return type becomes `Array<{ id: string; name: string; project_count: number }>`.

Also add the same `P2002` → `ConflictException` to `create()` (currently surfaces as a generic 500 — small targeted fix, in scope because the inline-Add removal would otherwise leave the error worse than before).

### 5.5 `src/campaigns/campaigns.service.ts` — accept objectives

- `create()` and `update()` accept `objective_ids?: string[]` from their respective DTOs. When the field is provided, translate to `objectives: { set: ids.map((id) => ({ id })) }` inside the Prisma call. When `undefined`, leave untouched (PATCH semantics — same idiom the service uses for other optional fields).
- `CAMPAIGN_INCLUDE` (and the project-scoped variant) gain `objectives: { select: { id: true, name: true } }`.
- `formatCampaign` returns `objectives: campaign.objectives` on the response payload.
- Validate `objective_ids` *before* the Prisma call by counting the matching rows: `prisma.objective.count({ where: { id: { in: objective_ids } } })`. If the count does not equal `objective_ids.length`, throw `BadRequestException('One or more objective IDs are invalid')`. Skipping this check would surface the error as either a silent miss or an unclear Prisma error depending on whether `set` is used with non-existent IDs.

This is ~15 lines of additions to the existing service. **No unrelated refactor of the over-fetch issue (B4 from the prior review) — out of scope.**

### 5.6 DTO additions

`yehub-be/src/campaigns/dto/create-campaign.dto.ts` and `update-campaign.dto.ts` both add:

```ts
@ApiPropertyOptional({ type: [String], format: 'uuid' })
@IsOptional()
@IsArray()
@IsUUID('4', { each: true })
objective_ids?: string[];
```

### 5.7 Backend test plan

- **`objectives.service.spec.ts`** (new) — covers create, findAll (with `_count` shape), remove, unique-name conflict (`P2002` → 409), not-found on remove (`P2025` → 404). Mirrors the existing `categories.service.spec.ts` structure.
- **`campaigns.service` tests** (extend existing if convenient, otherwise add a new `objective_ids` test) — verify `objective_ids` round-trips through create/update; verify an unknown UUID surfaces as `BadRequestException`.
- No new guard tests needed; admin guard coverage is inherited from existing `categories` tests.

## 6. Frontend changes

### 6.1 `SettingsPage/index.tsx` — full rewrite

```tsx
export function SettingsPage() {
  useSetPageTitle('Settings')
  const [params, setParams] = useSearchParams()
  const tab = params.get('tab') === 'objectives' ? 'objectives' : 'categories'

  const setTab = (value: string) => {
    const next = new URLSearchParams(params)
    next.set('tab', value)
    setParams(next, { replace: true })
  }

  return (
    <PageWrapper>
      <PageHeader title="Settings" description="Manage shared settings used across projects and campaigns." />
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="categories">Project Category</TabsTrigger>
          <TabsTrigger value="objectives">Category Objective</TabsTrigger>
        </TabsList>
        <TabsContent value="categories"><ProjectCategoriesTab /></TabsContent>
        <TabsContent value="objectives"><CampaignObjectivesTab /></TabsContent>
      </Tabs>
    </PageWrapper>
  )
}
```

Default tab is `categories`. Unknown `?tab=` values fall back to `categories`. The rewrite fixes the missing-margins bug (now uses `PageWrapper`) and adds the page title (now uses `useSetPageTitle`).

### 6.2 Tab components

**`ProjectCategoriesTab.tsx`** and **`CampaignObjectivesTab.tsx`** — each ~10 lines, lives in `SettingsPage/components/`. Wraps its own data hook and renders `<TagListPanel>`:

```tsx
export function ProjectCategoriesTab() {
  const { items, isLoading, isError, createMutation, deleteMutation } = useCategoriesTab()
  return (
    <TagListPanel
      entityLabel="Project Category"
      entityLabelPlural="Project Categories"
      usageNoun="project"
      items={items}
      isLoading={isLoading}
      isError={isError}
      onCreate={createMutation.mutate}
      onDelete={deleteMutation.mutate}
      isCreating={createMutation.isPending}
      isDeleting={deleteMutation.isPending}
    />
  )
}
```

Splitting the two tabs into separate components keeps each tab's data fetching, mutations, and cache invalidation isolated — no risk of cross-contamination of query keys.

### 6.3 Tab data hooks

**`use-categories-tab.ts`** and **`use-objectives-tab.ts`** — co-located in `SettingsPage/`. Each owns:

- `useQuery` against its own `queryKeys.categories` / `queryKeys.objectives`.
- `useMutation` for create — invalidates own key on success, shows `toast.error` on failure.
- `useMutation` for delete — same.

### 6.4 `TagListPanel.tsx` (new shared component, in `SettingsPage/components/`)

Pure presentational. Knows nothing about HTTP. Props:

```ts
interface TagListPanelProps {
  entityLabel: string         // "Project Category"
  entityLabelPlural: string   // "Project Categories"
  usageNoun: string           // "project" → "Used by 3 projects"
  items: Array<{ id: string; name: string; usage_count: number }>
  isLoading: boolean
  isError: boolean
  onCreate: (name: string) => void
  onDelete: (id: string) => void
  isCreating: boolean
  isDeleting: boolean
}
```

Layout:
- Header row: `entityLabelPlural` heading + total count + "Add" button.
- Body: simple table or vertical list of `name + usage badge + trash button` per row.
- Empty state: inline "No project categories yet — add one to get started." (substituted by `entityLabelPlural.toLowerCase()`).
- Loading state: small skeleton or muted "Loading…" line.
- Error state: muted destructive line "Failed to load."

Owns the local state for "which delete dialog is open" and "is add dialog open." Does **not** own the data.

The `items` prop accepts a flat shape with `usage_count`; the tab components map their domain object (`{ id, name, project_count }` or `{ id, name, campaign_count }`) into this shape before passing it down. Keeps the panel domain-agnostic.

### 6.5 `AddTagDialog.tsx` and `DeleteTagDialog.tsx` (new, in `SettingsPage/components/`)

**`AddTagDialog`** — single text input, validates non-empty + ≤100 chars (mirrors backend DTO). Submits via `onCreate(name)`. Closes on success. Shows server-side conflict error inline if the create mutation fails (the `useCategoriesTab` hook also fires a `toast.error`).

**`DeleteTagDialog`** — shadcn `AlertDialog`. Message dynamically uses `usageNoun` and `usage_count`:

| `usage_count` | Message |
|---|---|
| 0 | "Delete *{name}*?" |
| 1 | "*{name}* is used by 1 {usageNoun}. Deleting will remove it from that {usageNoun}. Continue?" |
| n | "*{name}* is used by {n} {usageNoun}s. Deleting will remove it from those {usageNoun}s. Continue?" |

Confirms with a destructive variant button. Calls `onDelete(id)` and closes when confirmed.

Both dialogs live in `SettingsPage/components/` (not `components/common/`) because they're only used here. Move them later if a second consumer appears.

### 6.6 `MultiSelectChecklist.tsx` (new, in `components/common/`)

A pure presentational multi-select checklist used by both pickers. Props:

```ts
interface MultiSelectChecklistProps {
  label: string
  items: Array<{ id: string; name: string }>
  selectedIds: string[]
  onChange: (ids: string[]) => void
  emptyMessage?: string
  disabled?: boolean
}
```

Internals: a labeled section with a 2-column grid of checkboxes (matches the existing `ProjectCategoryPicker` visual style). When `items.length === 0`, shows `emptyMessage` in muted text instead of an empty grid. Does not fetch data, does not own selection state, does not know what an Objective or Category is.

### 6.7 `ProjectCategoryPicker.tsx` — simplification

Reduces from ~115 lines to ~25:

```tsx
export function ProjectCategoryPicker({ selected, onChange }: {
  selected: Category[]
  onChange: (cats: Category[]) => void
}) {
  const { data: items = [] } = useQuery({
    queryKey: queryKeys.categories,
    queryFn: categoriesApi.list,
  })

  const selectedIds = selected.map((s) => s.id)
  const handleChange = (ids: string[]) => {
    onChange(items.filter((c) => ids.includes(c.id)))
  }

  return (
    <MultiSelectChecklist
      label="Categories"
      items={items}
      selectedIds={selectedIds}
      onChange={handleChange}
      emptyMessage="No project categories defined. Ask an admin to create one in Settings."
    />
  )
}
```

**Deleted, not commented out:** `useMutation`, `useState`, `Dialog`, `Input`, `Label`, `Plus` icon, the "Add New Category" button, the `useAuthStore` admin check, and the entire dialog JSX block.

The `Category` type still has `project_count` after section 5.4's change, but the picker doesn't read it; passing `items` straight through is fine because `MultiSelectChecklist` only reads `id` and `name`.

### 6.8 `CampaignObjectivePicker.tsx` (new, in `pages/campaigns/CampaignFormPage/components/`)

Mirror of the simplified `ProjectCategoryPicker`. Identical wrapping logic; only differences:

- Queries `queryKeys.objectives` via `objectivesApi.list`.
- `label="Objectives"`.
- `emptyMessage="No objectives defined. Ask an admin to create one in Settings."`.

### 6.9 `ObjectivesCard.tsx` (new) and `CampaignFormPage` integration

**`ObjectivesCard.tsx`** — a thin shadcn `<Card>` matching the visual style of `PlatformsCard`, `DisplayMetricsCard`, etc. Uses `useFormContext()` to render `<CampaignObjectivePicker>` against the form's `objectives` field. Same idiom as the other cards.

**`CampaignFormPage/index.tsx`** — three additions:

1. `defaultValues` gains `objectives: []`.
2. The `values` block (used in edit mode) gains `objectives: existingCampaign.objectives ?? []`.
3. The mutation payload gains `objective_ids: values.objectives.map((o) => o.id)`.

Render `<ObjectivesCard />` inside the existing `<div className="grid gap-6 lg:grid-cols-12">` alongside the other cards.

### 6.10 `src/lib/schemas.ts` — `campaignFormSchema`

Add to the existing schema:

```ts
objectives: z.array(z.object({ id: z.string(), name: z.string() })).default([]),
```

Optional, defaults to empty array. Matches the "objectives are optional" decision.

### 6.11 API client and query keys

**`src/api/objectives.ts`** (new) — 15-line copy of `categories.ts`:

```ts
import { apiClient } from './client'

export interface Objective {
  id: string
  name: string
  campaign_count?: number
}

export const objectivesApi = {
  list: (): Promise<Objective[]> => apiClient.get<Objective[]>('/objectives').then((r) => r.data),
  create: (name: string): Promise<Objective> =>
    apiClient.post<Objective>('/objectives', { name }).then((r) => r.data),
  remove: (id: string) => apiClient.delete(`/objectives/${id}`),
}
```

**`src/api/categories.ts`** — `Category` interface gains optional `project_count?: number`. Function bodies unchanged.

**`src/api/campaigns.ts`** — the `Campaign` type gains `objectives: Array<{ id: string; name: string }>`. The create/update payload types gain `objective_ids?: string[]`.

**`src/lib/constants/query-keys.ts`** — add `objectives: ['objectives'] as const`.

## 7. Empty-state UX

Today, if an admin hasn't created any Project Categories yet, the picker is just blank space — users wonder what's wrong. The new `MultiSelectChecklist`'s `emptyMessage` directly tells them what to do. Same for objectives. Small but real UX win, free with one prop.

## 8. Migration safety and rollout

- **Schema change is purely additive**: one new table, one new join table. No `ALTER` on existing tables, no enum changes, no NOT NULL columns added to populated tables. Hand-review the generated migration SQL before commit to confirm only `CREATE TABLE` / `CREATE INDEX` statements appear.
- **Data backfill: none.** Existing campaigns get `objectives: []` implicitly (m2m absence default). Existing categories continue working unchanged; their list response gains a new `project_count` field that older clients would simply ignore — but BE and FE deploy together so this is moot.
- **Rollout order: BE migration → BE deploy → FE deploy**, all in one PR. There is no intermediate state where the FE breaks: even if the FE were deployed before the migration, the worst outcome is `/objectives` 404'ing, which surfaces as a clear empty state via the picker's `emptyMessage`.
- Directly addresses the migration-safety blockers (B1) flagged in the prior PR review by avoiding any destructive DDL.

## 9. Authorization

- `<AdminRoute>` already protects `/settings`. **No change needed.** Non-admins are redirected to `/projects` with a toast.
- Backend: `POST /objectives` and `DELETE /objectives/:id` are gated by `@UseGuards(GlobalRolesGuard) @GlobalRoles(GlobalRole.ADMIN)` — same pattern as categories.
- `GET /objectives` is open to any authenticated user (the picker needs it for non-admins editing campaigns).

## 10. File map

```
yehub-be/
├── prisma/schema.prisma                                            (modify)
├── prisma/migrations/<timestamp>_add_objectives/migration.sql      (new, hand-reviewed)
├── src/objectives/
│   ├── objectives.module.ts                                        (new)
│   ├── objectives.controller.ts                                    (new)
│   ├── objectives.service.ts                                       (new)
│   ├── objectives.service.spec.ts                                  (new)
│   └── dto/create-objective.dto.ts                                 (new)
├── src/categories/categories.service.ts                            (modify: + project_count, P2002 handler)
├── src/campaigns/campaigns.service.ts                              (modify: read/write objective_ids, include objectives)
├── src/campaigns/dto/create-campaign.dto.ts                        (modify: + objective_ids?)
├── src/campaigns/dto/update-campaign.dto.ts                        (modify: + objective_ids?)
└── src/app.module.ts                                               (modify: register ObjectivesModule)

yehub-fe/
├── src/api/objectives.ts                                                                (new)
├── src/api/categories.ts                                                                (modify)
├── src/api/campaigns.ts                                                                 (modify)
├── src/lib/schemas.ts                                                                   (modify)
├── src/lib/constants/query-keys.ts                                                      (modify)
├── src/components/common/MultiSelectChecklist.tsx                                       (new)
├── src/pages/admin/SettingsPage/
│   ├── index.tsx                                                                        (rewrite)
│   ├── use-categories-tab.ts                                                            (new)
│   ├── use-objectives-tab.ts                                                            (new)
│   └── components/
│       ├── ProjectCategoriesTab.tsx                                                     (new)
│       ├── CampaignObjectivesTab.tsx                                                    (new)
│       ├── TagListPanel.tsx                                                             (new)
│       ├── AddTagDialog.tsx                                                             (new)
│       └── DeleteTagDialog.tsx                                                          (new)
├── src/pages/projects/components/ProjectCategoryPicker.tsx                              (modify: simplify)
├── src/pages/campaigns/CampaignFormPage/components/CampaignObjectivePicker.tsx          (new)
├── src/pages/campaigns/CampaignFormPage/components/ObjectivesCard.tsx                   (new)
└── src/pages/campaigns/CampaignFormPage/index.tsx                                       (modify: render ObjectivesCard, wire objective_ids)
```

## 11. Definition of done

- Admin lands on `/settings` and sees a tabbed page with margins matching `/users` and `/projects`.
- Project Category tab lists all categories with usage counts; admin can add (validates uniqueness) and delete (confirm dialog shows usage count).
- Category Objective tab does the same for objectives.
- Tab choice survives URL share / refresh via `?tab=`.
- Add/Edit Project form's category picker works exactly as before *except* the inline "Add Category" button is gone.
- Add/Edit Campaign form has a new "Objectives" section, multi-select, optional, persists round-trip on create and edit.
- Non-admin hitting `/settings` is redirected to `/projects` (already enforced — no code change).
- Backend tests for the objectives module pass; existing backend tests still pass.
- `pnpm lint` clean on both packages.
