# Remove STOPPED Campaign Status — Design

**Date:** 2026-04-09
**Branch:** `fix/remove-stopped-campaign-status` (off `feat/campaigns-posts`)
**Scope:** `yehub-be/`, `yehub-fe/`

## 1. Goal

Eliminate the `STOPPED` status from the `CampaignStatus` lifecycle. Authorized users (admin, or users holding an `edit_campaign`-capable role on the campaign) must be able to transition a campaign from `ACTIVE → COMPLETED` or `PAUSED → COMPLETED` from the Campaign Detail page, behind a confirmation dialog that states the action cannot be undone.

## 2. Motivation

`STOPPED` and `COMPLETED` are both terminal states in the campaign lifecycle. Having two terminal states with near-identical semantics is a source of UX ambiguity ("which one do I pick?") and product drift. Consolidating on `COMPLETED` — the more neutral, positive term — removes the duplicate concept without losing any capability.

Review item I8 in `review_campaign.md` also flagged that the current UI only offers a path into the `STOPPED` terminal state, not `COMPLETED`, despite `ACTIVE → COMPLETED` being a valid backend transition. This design fixes that gap at the same time as removing `STOPPED`.

## 3. Non-goals

- Fixing the other review findings in `review_campaign.md` (B1–B4, I1–I7, I9–I10). Out of scope.
- Touching `yehub-demo/` or `yehub-e2e/`. The demo is an independently-maintained mock and e2e additions are outside standing scope.
- Adding a data migration for existing `STOPPED` rows. Per stakeholder direction, no environments currently hold `STOPPED` campaigns; the Postgres enum cast will be the safety net if that assumption is wrong.

## 4. Lifecycle after the change

```
DRAFT     → ACTIVE
ACTIVE    → PAUSED | COMPLETED
PAUSED    → ACTIVE  | COMPLETED
COMPLETED → (terminal)
```

The `COMPLETED` state is terminal: no further transitions are allowed, and posts cannot be added to a completed campaign (existing behavior, preserved).

## 5. Backend changes (`yehub-be/`)

### 5.1 Schema

`prisma/schema.prisma` — drop `STOPPED` from the `CampaignStatus` enum:

```prisma
enum CampaignStatus {
  DRAFT
  ACTIVE
  PAUSED
  COMPLETED
}
```

### 5.2 Migration

New Prisma migration folder `<timestamp>_remove_stopped_campaign_status/migration.sql`:

```sql
CREATE TYPE "CampaignStatus_new" AS ENUM ('DRAFT', 'ACTIVE', 'PAUSED', 'COMPLETED');
ALTER TABLE "campaigns"
  ALTER COLUMN "status" TYPE "CampaignStatus_new"
  USING ("status"::text::"CampaignStatus_new");
DROP TYPE "CampaignStatus";
ALTER TYPE "CampaignStatus_new" RENAME TO "CampaignStatus";
```

This is Postgres's standard pattern for enum removal. The `USING` cast will error if any row holds `STOPPED`; that's the intended safety net.

### 5.3 Status transition map

`src/campaigns/campaign-status.utils.ts` — update `VALID_TRANSITIONS` to:

```ts
const VALID_TRANSITIONS: Record<CampaignStatus, CampaignStatus[]> = {
  [CampaignStatus.DRAFT]: [CampaignStatus.ACTIVE],
  [CampaignStatus.ACTIVE]: [CampaignStatus.PAUSED, CampaignStatus.COMPLETED],
  [CampaignStatus.PAUSED]: [CampaignStatus.ACTIVE, CampaignStatus.COMPLETED],
  [CampaignStatus.COMPLETED]: [],
};
```

### 5.4 Post creation guard

`src/posts/posts.service.ts` — in both `addPost` (~line 44) and `bulkUpload` (~line 96), remove the `CampaignStatus.STOPPED` arm of the terminal-state check and simplify the error message to "Cannot add posts to a completed campaign".

### 5.5 Stale references

`src/campaigns/campaigns.service.ts` — update the `// - ACTIVE -> STOPPED / COMPLETED: remove polling jobs` TODO comment (~line 193) to drop `STOPPED`.

### 5.6 Regeneration

Run `pnpm prisma:generate` so the generated client's `CampaignStatus` type drops `STOPPED`. This will cause TypeScript to fail compilation anywhere stale `STOPPED` references remain — which is the point.

## 6. Frontend changes (`yehub-fe/`)

### 6.1 Type union

`src/api/campaigns.ts:5` — drop `'STOPPED'` from the `CampaignStatus` union:

```ts
export type CampaignStatus = 'DRAFT' | 'ACTIVE' | 'PAUSED' | 'COMPLETED'
```

### 6.2 StatusBadge

`src/pages/campaigns/components/StatusBadge.tsx` — remove the `STOPPED` row from `STATUS_CONFIG`. The `Record<CampaignStatus, ...>` typing will ensure the map is exhaustive against the updated union.

### 6.3 List filter

`src/pages/campaigns/CampaignsListPage/index.tsx` — remove the `<SelectItem value="STOPPED">` filter option from the status dropdown.

### 6.4 Campaign detail page — Mark Complete button

`src/pages/campaigns/CampaignDetailPage/index.tsx`:

- Replace the existing **Stop** button (currently shown when `canEditCampaign && isRunning`) with a **Mark Complete** button. Same authorization and visibility conditions — meaning authorized users on both `ACTIVE` and `PAUSED` campaigns can mark them complete.
- Swap the `Square` icon import for `CheckCircle2` from `lucide-react`.
- Rename the state variable `stopConfirmOpen` → `completeConfirmOpen`.
- Repurpose the existing `AlertDialog` (no need for a second dialog):
  - Title: **"Mark this campaign as completed?"**
  - Description: **"This will permanently mark the campaign as completed. No further status changes are allowed and this action cannot be undone."**
  - Action button: label **"Mark Complete"**, kept as `variant="destructive"` to convey terminality (matches the current Stop button styling).
  - On confirm: call `changeStatus('COMPLETED')` instead of `'STOPPED'`.

Authorization is unchanged — it follows the existing `canEditCampaign = isAdmin || canEditByRole` gate, where `canEditByRole = useCan('edit_campaign', myRole)`.

## 7. Testing

- Baseline backend Jest suite (90 tests) must remain green after changes.
- `pnpm lint` and `pnpm build` in both `yehub-be/` and `yehub-fe/` must pass. The updated generated Prisma client will cause TypeScript to fail if any stale `STOPPED` reference is missed — we rely on that as the completeness check.
- No new unit tests proposed. `campaign-status.utils.ts` remains trivial and has no existing tests to update. The existing `posts.service.ts` terminal-state rejection path is still exercised through the `COMPLETED` branch; its Jest coverage (if any) does not reference `STOPPED` by name.

## 8. Rollout

Single commit (or small commit series) on `fix/remove-stopped-campaign-status`, PR into `feat/campaigns-posts`. Because the branch has not been merged to `main`, the migration is safe to ship as part of the feature branch's first rollout — there is no window during which production DBs hold `STOPPED` rows.

## 9. Risks

| Risk | Mitigation |
|---|---|
| Pre-existing `STOPPED` rows in a dev/staging DB | Migration's `USING` cast will fail loudly; operator can manually `UPDATE campaigns SET status = 'COMPLETED' WHERE status = 'STOPPED'` and retry. |
| Missed stale reference to `STOPPED` | TypeScript will fail to compile after `prisma:generate` + the FE type-union tightening. Both `pnpm build`s must pass. |
| Users accidentally complete a campaign | Confirmation dialog with explicit "cannot be undone" wording; `destructive` variant button. |
