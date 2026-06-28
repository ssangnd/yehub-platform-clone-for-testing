# Profile Create/Edit Form — Bug Fixes & Validation Hardening

**Date:** 2026-04-19
**Scope:** `yehub-be/src/profiles`, `yehub-fe/src/pages/profiles/**`, `yehub-fe/src/api/profiles.ts`, Prisma `Profile` model

## Goals

Fix six discrete issues with the Profile create/edit experience and harden social-account validation across both create and link/move flows.

1. Tier `<Select>` shows the raw UUID instead of the tier name when the underlying tier list hasn't loaded.
2. Required-field rules are too lax — gender, ≥1 category, and ≥1 social account must be enforced.
3. Profiles cannot have an avatar; need upload + display.
4. A duplicate `(platform, platform_user_id)` triggers a raw 500 with the Prisma stack trace instead of a clean 409.
5. Unlinking or moving the **last** social account on a profile is allowed today, leaving an "empty" profile.
6. URL/username inputs aren't validated client-side, leading to malformed `platform_user_id` rows.

## Non-Goals

- No changes to `MoveAccount` business logic. Duplicates are structurally impossible (we only change `profile_id`; `(platform, platform_user_id)` stays intact). FE error surfacing only.
- No new shared `ImagePicker` abstraction. Clone the `ProjectLogoPicker` pattern as `ProfileAvatarPicker`. Generalize later if a third use case appears.
- No changes to social-account fetching/auto-enrichment.

---

## 1. Tier select displays UUID

**Root cause.** Radix `<SelectValue>` falls back to displaying the raw `value` string when no matching `<SelectItem>` is currently mounted. On first paint of `AddProfilePage` and `EditProfileDialog`, the `tiers` query is still loading, so the `<SelectItem>` array is empty and the trigger renders `tierId` (a UUID).

**Fix.** Make the trigger label fully controlled. In both files, change:

```tsx
<SelectValue placeholder="Select tier" />
```

to:

```tsx
<SelectValue placeholder="Select tier">
  {tiers.find((t) => t.id === tierId)?.name}
</SelectValue>
```

Trigger now resolves the label from our own data and is immune to mount order. Apply the same change to any other `<Select>` in the profile pages that reads from an async-loaded list.

---

## 2. Required fields: gender, ≥1 category, ≥1 social account

### Backend — `CreateProfileDto`

```ts
@ApiProperty({ enum: Gender })
@IsEnum(Gender)
gender: Gender;                              // was @IsOptional + Gender?

@ApiProperty({ type: [String], format: 'uuid' })
@IsArray()
@ArrayMinSize(1, { message: 'At least one category is required' })
@IsUUID('4', { each: true })
categoryIds: string[];                        // was @IsOptional + string[]?

@ApiProperty({ type: [SocialAccountInput] })
@IsArray()
@ArrayMinSize(1, { message: 'At least one social account is required' })
@ValidateNested({ each: true })
@Type(() => SocialAccountInput)
socialAccounts: SocialAccountInput[];         // was @IsOptional + SocialAccountInput[]?
```

### Backend — `UpdateProfileDto`

For partial updates, keep all fields optional but enforce `@ArrayMinSize(1)` on `categoryIds` when present (cannot send `[]`). Gender stays nullable in update — user may want to clear it later if business rules change. *Note: We're enforcing required at create time only for gender; this matches the user's spec which says "Gender required" in the context of create.* If the user wants this on update too, we can tighten later.

### Backend — `ProfilesService`

`create()` already handles all three fields correctly when present; no service-layer changes needed beyond the DTO tightening.

### Frontend — `AddProfilePage`

Use simple state-driven validation (matches existing patterns; no new RHF migration):

- Add `errors` object: `{ name?, gender?, categories?, socialAccounts? }`
- Compute `isValid` derived from current state
- On submit: `if (!isValid) { setErrors(...); return }`
- Render `<p className="text-sm text-destructive">{errors.X}</p>` under each field
- Submit button stays enabled (so user can click and see all errors at once on first attempt) but bails early if invalid

Specific rules:

- **Name**: non-empty (already enforced via `required`).
- **Gender**: `gender !== ''` else `'Gender is required'`.
- **Categories**: `selectedCategories.length >= 1` else `'Select at least one category'`.
- **Social accounts**: count of non-empty + valid (per §6) URL inputs `>= 1` else `'Add at least one social account'`.

### Frontend — `EditProfileDialog`

Same validation for **gender** and **≥1 category** (no social-account field present, per Q1). `name` already required.

---

## 3. Avatar upload/update

### Backend

Schema change in `prisma/schema.prisma`:

```prisma
model Profile {
  ...
  avatar      String?   // S3 key, mirrors User.avatar field naming
  ...
}
```

Migration: `pnpm prisma:migrate --name add_profile_avatar`.

DTO updates:

- `CreateProfileDto`: optional `avatar?: string` (`@IsOptional() @IsString()`).
- `UpdateProfileDto`: nullable `avatar?: string | null` (allow clearing).

Service updates:

- `ProfilesService.create` / `update`: pass through `data.avatar = dto.avatar`.
- `formatProfile`: include `avatar: p.avatar`.
- Add `avatar: true` to default selects on the Profile queries (Prisma includes scalar fields by default unless `select:` narrows them — confirm `findMany`/`findUnique` default behavior; if a `select:` is in use elsewhere, add `avatar: true`).

### Frontend

**Display** — reuse existing `<PresignedAvatar>`:

- `ProfilesListPage` table row Avatar column → `<PresignedAvatar imageKey={p.avatar} fallback={p.name[0]?.toUpperCase()} className="size-8" />`
- `ProfileDetailPage` header Avatar → same with `className="size-16"`
- `MoveAccountDialog` profile picker rows → same with `className="size-6"`

**Picker** — new `yehub-fe/src/pages/profiles/components/ProfileAvatarPicker.tsx`:

Clone `ProjectLogoPicker` verbatim, change copy to "Avatar (optional)" and accepted file types unchanged. Same flow: pick file → `uploadsApi.requestUploadUrl` → `uploadsApi.uploadToS3` → `onChange(key)`.

**Wire-in**:

- `AddProfilePage`: place picker at the top of the Basic Information card, left of the name input. Local state `const [avatar, setAvatar] = useState('')`. Pass `avatar: avatar || undefined` to the create payload.
- `EditProfileDialog`: place picker above the name field. Initialize from `profile.avatar`. Pass `avatar: avatar || null` (null clears it server-side).

**API types** in `yehub-fe/src/api/profiles.ts`:

```ts
export interface Profile {
  ...
  avatar: string | null    // S3 key
  ...
}
export interface CreateProfilePayload { ...; avatar?: string }
export interface UpdateProfilePayload { ...; avatar?: string | null }
```

---

## 4. Surface duplicate social account error properly (Create + Link)

### Backend — `ProfilesService.create`

Add a pre-flight uniqueness check before the transaction:

```ts
const proposedKeys = socialAccountsData.map((sa) => ({
  platform: sa.platform,
  platform_user_id: sa.platform_user_id,
}));

const existing = await this.prisma.socialAccount.findMany({
  where: { OR: proposedKeys },
  select: {
    platform: true,
    platform_user_id: true,
    username: true,
    profile: { select: { name: true } },
  },
});

if (existing.length > 0) {
  const detail = existing
    .map((e) => `${e.platform} @${e.username ?? e.platform_user_id} (linked to "${e.profile.name}")`)
    .join('; ');
  throw new ConflictException(`Already linked: ${detail}`);
}
```

Wrap the actual `create` call in try/catch as a defense-in-depth fallback for the race condition where another request inserts between pre-flight and create:

```ts
try {
  const profile = await this.prisma.profile.create({...});
  return this.formatProfile(profile);
} catch (error) {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
    throw new ConflictException('A social account is already linked to another profile');
  }
  throw error;
}
```

### Backend — `ProfilesService.linkAccount`

Existing handler only catches P2002 with a generic message. Add a pre-flight that includes the owning-profile name in the response:

```ts
const platform_user_id = dto.platformUserId ?? `${dto.platform.toLowerCase()}_${dto.username}`;

const existing = await this.prisma.socialAccount.findFirst({
  where: { platform: dto.platform, platform_user_id },
  select: { profile: { select: { name: true } } },
});

if (existing) {
  throw new ConflictException(
    `${dto.platform} @${dto.username} is already linked to profile "${existing.profile.name}"`
  );
}
```

Keep the existing `try/catch` on the `socialAccount.create` call as fallback for the race window between pre-flight and insert. Use the same message format: `${dto.platform} @${dto.username} is already linked to another profile` (we can't include the owning profile name in the fallback path because we don't know it without a second query).

### Frontend

- `AddProfilePage`: add `onError: (e) => showApiError(e, { fallback: 'Failed to create profile' })` to the create mutation.
- `use-profile-detail.ts`: add `onError: showApiError(...)` to `linkAccountMutation`, `unlinkAccountMutation`, `moveAccountMutation`. Move dialog stays open on error so user can retry.
- Both `LinkAccountDialog` and `MoveAccountDialog` already close on success in their parent component; for error, the parent's `onError` displays the toast and the dialog naturally remains open (since `onOpenChange(false)` is called from the dialog's submit handler before the mutation result — this needs adjustment: move `onOpenChange(false)` into the mutation's `onSuccess` so the dialog stays open on error).

---

## 5. Last-account guard on Unlink/Move

### Backend

`ProfilesService.unlinkAccount`:

```ts
const count = await this.prisma.socialAccount.count({ where: { profile_id: profileId } });
if (count <= 1) {
  throw new BadRequestException(
    'A profile must have at least one social account. Link another account before unlinking this one.',
  );
}
```

`ProfilesService.moveAccount` — same check on the **source** profile:

```ts
const count = await this.prisma.socialAccount.count({ where: { profile_id: profileId } });
if (count <= 1) {
  throw new BadRequestException(
    'A profile must have at least one social account. Link another account on this profile before moving the last one.',
  );
}
```

### Frontend — `SocialAccountRow`

- Add `isLastAccount: boolean` prop.
- When `true`, render Move and Unlink dropdown items with `disabled` and a hint:

```tsx
<DropdownMenuItem disabled={isLastAccount} onClick={onMove}>
  <ArrowRightLeft className="h-4 w-4" />
  Move to profile
  {isLastAccount && <span className="ml-auto text-xs text-muted-foreground">last account</span>}
</DropdownMenuItem>
```

### Frontend — `ProfileDetailPage`

Pass `isLastAccount={profile.accounts.length === 1}` to each `<SocialAccountRow>`. The BE check remains as the source of truth — the FE rule just prevents accidental clicks.

---

## 6. Shared URL/username validation (Create form + Link dialog)

### Frontend — new util `yehub-fe/src/lib/social-accounts.ts`

```ts
export interface ParseResult {
  ok: boolean
  username?: string         // normalized, no leading @, no slashes
  error?: string
}

const PATTERNS: Record<PlatformType, { url: RegExp; username: RegExp; label: string }> = {
  FACEBOOK:  { url: /^https?:\/\/(?:www\.)?(?:facebook|fb)\.com\/([A-Za-z0-9.]{3,})\/?$/i,
               username: /^[A-Za-z0-9.]{3,}$/,
               label: 'Facebook' },
  INSTAGRAM: { url: /^https?:\/\/(?:www\.)?instagram\.com\/@?([A-Za-z0-9._]{1,30})\/?$/i,
               username: /^[A-Za-z0-9._]{1,30}$/,
               label: 'Instagram' },
  TIKTOK:    { url: /^https?:\/\/(?:www\.)?tiktok\.com\/@([A-Za-z0-9._]{2,24})\/?$/i,
               username: /^[A-Za-z0-9._]{2,24}$/,
               label: 'TikTok' },
  YOUTUBE:   { url: /^https?:\/\/(?:www\.)?youtube\.com\/(?:@|channel\/|c\/|user\/)?([A-Za-z0-9._\-]{1,})\/?$/i,
               username: /^[A-Za-z0-9._\-]{1,}$/,
               label: 'YouTube' },
  THREADS:   { url: /^https?:\/\/(?:www\.)?threads\.(?:net|com)\/@?([A-Za-z0-9._]{1,30})\/?$/i,
               username: /^[A-Za-z0-9._]{1,30}$/,
               label: 'Threads' },
}

export function parseSocialInput(platform: PlatformType, raw: string): ParseResult {
  const trimmed = raw.trim().replace(/^@/, '')
  if (!trimmed) return { ok: false, error: 'Required' }

  const cfg = PATTERNS[platform]

  if (/^https?:\/\//i.test(trimmed)) {
    const m = trimmed.match(cfg.url)
    if (!m) return { ok: false, error: `Invalid ${cfg.label} URL` }
    return { ok: true, username: m[1] }
  }

  if (!cfg.username.test(trimmed)) {
    return { ok: false, error: `Invalid ${cfg.label} username` }
  }
  return { ok: true, username: trimmed }
}
```

### Frontend — `AddProfilePage`

For each platform input, run `parseSocialInput(platform, value)` on change/blur. Show inline error if input is non-empty and invalid. On submit, only include valid + non-empty inputs in the `socialAccounts` payload, send `{ platform, url: trimmedRawInput }` (BE does its own extraction; we send the original input for traceability).

### Frontend — `LinkAccountDialog`

- Replace separate "Username *" input with a single "URL or username *" input.
- Run `parseSocialInput(platform, value)` on blur; show inline error.
- On submit, send `{ platform, username: parsed.username }` to `/profiles/:id/accounts`.

### Backend — defense in depth

Mirror the same per-platform regexes server-side. Create `yehub-be/src/profiles/social-account.validator.ts` exporting `validateUsername(platform: Platform, username: string): void` that throws `BadRequestException(\`Invalid ${platform} username: ${username}\`)` on mismatch. The regex map is duplicated from `yehub-fe/src/lib/social-accounts.ts` (acceptable duplication — this is the trust boundary). Use it in:

- `ProfilesService.create` — call `validateUsername(sa.platform, username)` for each social account inside the existing `socialAccountsData` `.map` after `extractUsernameFromUrl`.
- `ProfilesService.linkAccount` — call `validateUsername(dto.platform, dto.username)` at the top.

This guarantees malformed `platform_user_id` rows can't be created even if a client bypasses the FE.

---

## File-level change summary

### Backend
- `prisma/schema.prisma` — add `avatar String?` to Profile, run migration
- `src/profiles/dto/create-profile.dto.ts` — tighten gender/categories/socialAccounts; add `avatar`
- `src/profiles/dto/update-profile.dto.ts` — add `avatar`; tighten `categoryIds` min size when present
- `src/profiles/profiles.service.ts` — pre-flight duplicate check; last-account guard; pass through avatar; username validation against per-platform regex
- (No controller changes)

### Frontend
- `src/api/profiles.ts` — add `avatar` to types
- `src/lib/social-accounts.ts` — new validation util
- `src/pages/profiles/components/ProfileAvatarPicker.tsx` — new picker (clone of ProjectLogoPicker)
- `src/pages/profiles/AddProfilePage.tsx` — controlled SelectValue, validation, picker, error toast
- `src/pages/profiles/components/EditProfileDialog.tsx` — controlled SelectValue, validation, picker
- `src/pages/profiles/components/LinkAccountDialog.tsx` — single URL/username input with validation; close on success only
- `src/pages/profiles/components/MoveAccountDialog.tsx` — close on success only; error toast surfaced via parent
- `src/pages/profiles/components/SocialAccountRow.tsx` — `isLastAccount` prop, disabled state
- `src/pages/profiles/ProfileDetailPage/index.tsx` — pass `isLastAccount`; use `<PresignedAvatar>`
- `src/pages/profiles/ProfileDetailPage/use-profile-detail.ts` — `onError` toasts on link/unlink/move mutations
- `src/pages/profiles/ProfilesListPage/index.tsx` — use `<PresignedAvatar>` in name column

## Out of scope / follow-ups

- Migrating profile forms to React Hook Form + Zod (currently raw state). Not blocking these fixes.
- A generic `ImagePicker` abstraction unifying ProjectLogoPicker + ProfileAvatarPicker + ProfileCard avatar.
- Adding a duplicate-detection background job for already-existing duplicate accounts in the DB (out of scope for the form).
