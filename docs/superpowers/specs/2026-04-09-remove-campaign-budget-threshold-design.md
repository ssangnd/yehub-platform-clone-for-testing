# Remove `budget_threshold` from Campaign — Design

**Date:** 2026-04-09
**Branch:** `fix/remove-stopped-campaign-status` (bundled with the STOPPED-status cleanup)
**Scope:** `yehub-be/`, `yehub-fe/`

## 1. Goal

Remove the `budget_threshold` field from the Campaign model end-to-end: form field, Zod schema, frontend API type, backend DTO, service write/read paths, seed value, and the database column itself.

## 2. Motivation

Grep across `yehub-be/src` and `yehub-fe/src` shows that `budget_threshold` is write-only from the user's perspective: the Campaign form collects it, the backend persists it, the frontend fetches it back through the API type — but nothing in the UI ever displays it. No list column, no detail page, no overview tab, no analytics view. It's dead weight that confuses users ("where does this value end up?") and carries maintenance cost.

Given no read path exists, deleting the column is strictly better than hiding the form field while leaving an orphaned column behind.

## 3. Non-goals

- Introducing a budget-tracking feature later. That's a separate project with its own design.
- Editing historical docs under `docs/superpowers/` that reference `budget_threshold`. Those are point-in-time records of prior planning work.
- Touching `yehub-demo/` or `yehub-e2e/`.
- Any of the unrelated review findings in `review_campaign.md`.

## 4. Backend changes (`yehub-be/`)

### 4.1 Schema

`prisma/schema.prisma` — remove the `budget_threshold Decimal? @db.Decimal(12, 2)` line from the `Campaign` model.

### 4.2 Migration

New migration `<timestamp>_remove_campaign_budget_threshold/migration.sql`:

```sql
ALTER TABLE "campaigns" DROP COLUMN "budget_threshold";
```

Unconditional drop. The user confirmed no production environments hold campaign data for this branch, so there is no data loss concern.

### 4.3 DTO

`src/campaigns/dto/create-campaign.dto.ts` — remove the `budget_threshold?: number` field and its validator decorators.

### 4.4 Service

`src/campaigns/campaigns.service.ts` — remove `budget_threshold` from:

- `create()` — the `data` object passed to `prisma.campaign.create`.
- `update()` — the DTO destructure, the conditional write block, and any ordering around it.
- `formatCampaign()` — the typed-parameter shape and the returned object.

### 4.5 Seed

`prisma/seed.ts` — remove the single `budget_threshold: 5000.0,` line.

### 4.6 Regeneration

Run `pnpm prisma:generate` after the schema change. TypeScript will fail compilation at any missed reference, which is the completeness check.

## 5. Frontend changes (`yehub-fe/`)

### 5.1 API types

`src/api/campaigns.ts`:

- Remove `budget_threshold: number | null` from the `Campaign` interface.
- Remove `budget_threshold?: number` from the `CreateCampaignPayload` interface.

### 5.2 Zod schema

`src/lib/schemas.ts` — remove `budget_threshold: z.number().min(0).optional()` from `campaignFormSchema`.

### 5.3 Form

`src/pages/campaigns/CampaignFormPage/components/BasicInfoCard.tsx` — remove the entire `<FormField name="budget_threshold">` block and its `Budget Threshold` label.

`src/pages/campaigns/CampaignFormPage/index.tsx` — remove `budget_threshold` from:

- `defaultValues` initializer
- the edit-mode `reset()` payload (the `existingCampaign.budget_threshold != null ? Number(...) : undefined` coercion)
- the create/update mutation payload builder

## 6. Testing

- Backend Jest suite (90 tests) must remain green.
- `pnpm lint` and `pnpm build` in both packages must pass (modulo the pre-existing `react-social-media-embed` failure in `yehub-fe` which is unrelated to this branch).
- No new unit tests proposed — there is no new logic, only removal. Existing tests do not reference `budget_threshold` (verified by grep).

## 7. Rollout

Bundled into the existing `fix/remove-stopped-campaign-status` branch as a second commit. The PR into `feat/campaigns-posts` will describe both changes. Branch name is slightly misleading for the combined scope, but keeping a single PR avoids fragmentation of two small related campaign-form cleanups.

## 8. Risks

| Risk | Mitigation |
|---|---|
| Existing rows have `budget_threshold` data | `DROP COLUMN` is unconditional; stakeholder confirmed no production data on this branch. |
| Missed stale reference | Regenerated Prisma client + TypeScript strict mode will surface any missed reference at compile time. |
| Downstream analytics relying on the column | None found. Grep confirms no usage outside the direct write/read chain being removed. |
| Users expect "budget threshold" in the form | The field was never surfaced anywhere, so removing it is strictly a cleanup — no feature loss. If budget tracking is needed later, that's a green-field feature. |
