# Profile Create/Edit Form Bug Fixes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix six discrete issues in the Profile create/edit/link/unlink/move flows: tier select shows UUID, missing required-field validation, missing avatar support, raw 500s on duplicate social accounts, ability to leave a profile with zero accounts, and unvalidated URL/username inputs.

**Architecture:**
- **Backend:** tighten DTOs, add per-platform username validator, pre-flight uniqueness checks, last-account guard. New `avatar` column on `Profile`.
- **Frontend:** controlled `<SelectValue>` labels, inline validation, shared `parseSocialInput()` util mirroring the BE regex, `ProfileAvatarPicker` cloning the existing `ProjectLogoPicker` pattern, `<PresignedAvatar>` for display. Surface BE errors via existing `showApiError()` helper.

**Tech Stack:** NestJS 11, Prisma 7, class-validator, Jest (BE); React 19, TanStack Query v5, shadcn/ui, sonner (FE).

---

## File Map

### Backend
- **Create:** `yehub-be/src/profiles/social-account.validator.ts` — per-platform username regex + `validateUsername()`
- **Create:** `yehub-be/src/profiles/social-account.validator.spec.ts`
- **Modify:** `yehub-be/prisma/schema.prisma` — add `avatar String?` to `Profile`
- **Create:** `yehub-be/prisma/migrations/<ts>_add_profile_avatar/migration.sql`
- **Modify:** `yehub-be/src/profiles/dto/create-profile.dto.ts` — required gender/categories/socialAccounts; add avatar
- **Modify:** `yehub-be/src/profiles/dto/update-profile.dto.ts` — add avatar; min size on categoryIds when present
- **Modify:** `yehub-be/src/profiles/profiles.service.ts` — pre-flight checks, last-account guard, validateUsername calls, avatar pass-through
- **Modify:** `yehub-be/src/profiles/profiles.service.spec.ts` (create if missing) — coverage for new behavior

### Frontend
- **Create:** `yehub-fe/src/lib/social-accounts.ts` — `parseSocialInput()` util
- **Create:** `yehub-fe/src/pages/profiles/components/ProfileAvatarPicker.tsx`
- **Modify:** `yehub-fe/src/api/profiles.ts` — add `avatar` to types
- **Modify:** `yehub-fe/src/pages/profiles/AddProfilePage.tsx` — controlled SelectValue, validation, avatar, error toast, social input validation
- **Modify:** `yehub-fe/src/pages/profiles/components/EditProfileDialog.tsx` — controlled SelectValue, validation, avatar
- **Modify:** `yehub-fe/src/pages/profiles/components/LinkAccountDialog.tsx` — single URL/username input with validation, close on success only
- **Modify:** `yehub-fe/src/pages/profiles/components/MoveAccountDialog.tsx` — close on success only
- **Modify:** `yehub-fe/src/pages/profiles/components/SocialAccountRow.tsx` — `isLastAccount` prop
- **Modify:** `yehub-fe/src/pages/profiles/ProfileDetailPage/index.tsx` — pass `isLastAccount`, `<PresignedAvatar>`
- **Modify:** `yehub-fe/src/pages/profiles/ProfileDetailPage/use-profile-detail.ts` — `onError` toasts on link/unlink/move
- **Modify:** `yehub-fe/src/pages/profiles/ProfilesListPage/index.tsx` — `<PresignedAvatar>` in name column

---

## Task 1: Backend — Social account username validator

**Files:**
- Create: `yehub-be/src/profiles/social-account.validator.ts`
- Test: `yehub-be/src/profiles/social-account.validator.spec.ts`

- [ ] **Step 1: Write failing tests**

Create `yehub-be/src/profiles/social-account.validator.spec.ts`:

```ts
import { BadRequestException } from '@nestjs/common';
import { Platform } from '../../generated/prisma/client';
import { validateUsername, USERNAME_PATTERNS } from './social-account.validator';

describe('validateUsername', () => {
  it('accepts a valid Facebook username', () => {
    expect(() => validateUsername(Platform.FACEBOOK, 'john.doe')).not.toThrow();
  });

  it('accepts a valid Instagram username', () => {
    expect(() => validateUsername(Platform.INSTAGRAM, 'john_doe.99')).not.toThrow();
  });

  it('accepts a valid TikTok username', () => {
    expect(() => validateUsername(Platform.TIKTOK, 'john.doe')).not.toThrow();
  });

  it('accepts a valid YouTube handle', () => {
    expect(() => validateUsername(Platform.YOUTUBE, 'JohnDoe-Channel_99')).not.toThrow();
  });

  it('accepts a valid Threads username', () => {
    expect(() => validateUsername(Platform.THREADS, 'john.doe_99')).not.toThrow();
  });

  it('throws BadRequestException for empty username', () => {
    expect(() => validateUsername(Platform.INSTAGRAM, '')).toThrow(BadRequestException);
  });

  it('throws BadRequestException for username with spaces', () => {
    expect(() => validateUsername(Platform.INSTAGRAM, 'john doe')).toThrow(BadRequestException);
  });

  it('throws BadRequestException for username with invalid chars', () => {
    expect(() => validateUsername(Platform.INSTAGRAM, 'john@doe!')).toThrow(BadRequestException);
  });

  it('throws BadRequestException for Facebook username shorter than 3 chars', () => {
    expect(() => validateUsername(Platform.FACEBOOK, 'jo')).toThrow(BadRequestException);
  });

  it('error message includes platform and username', () => {
    expect(() => validateUsername(Platform.INSTAGRAM, 'bad name')).toThrow(
      'Invalid INSTAGRAM username: bad name',
    );
  });

  it('exports a USERNAME_PATTERNS map keyed by Platform', () => {
    expect(USERNAME_PATTERNS[Platform.FACEBOOK]).toBeInstanceOf(RegExp);
    expect(USERNAME_PATTERNS[Platform.INSTAGRAM]).toBeInstanceOf(RegExp);
    expect(USERNAME_PATTERNS[Platform.TIKTOK]).toBeInstanceOf(RegExp);
    expect(USERNAME_PATTERNS[Platform.YOUTUBE]).toBeInstanceOf(RegExp);
    expect(USERNAME_PATTERNS[Platform.THREADS]).toBeInstanceOf(RegExp);
  });
});
```

- [ ] **Step 2: Run tests to confirm failure**

Run: `cd yehub-be && pnpm test -- social-account.validator.spec`
Expected: FAIL with module not found.

- [ ] **Step 3: Implement validator**

Create `yehub-be/src/profiles/social-account.validator.ts`:

```ts
import { BadRequestException } from '@nestjs/common';
import { Platform } from '../../generated/prisma/client';

export const USERNAME_PATTERNS: Record<Platform, RegExp> = {
  [Platform.FACEBOOK]: /^[A-Za-z0-9.]{3,}$/,
  [Platform.INSTAGRAM]: /^[A-Za-z0-9._]{1,30}$/,
  [Platform.TIKTOK]: /^[A-Za-z0-9._]{2,24}$/,
  [Platform.YOUTUBE]: /^[A-Za-z0-9._-]{1,}$/,
  [Platform.THREADS]: /^[A-Za-z0-9._]{1,30}$/,
};

export function validateUsername(platform: Platform, username: string): void {
  const pattern = USERNAME_PATTERNS[platform];
  if (!username || !pattern.test(username)) {
    throw new BadRequestException(`Invalid ${platform} username: ${username}`);
  }
}
```

- [ ] **Step 4: Run tests to confirm pass**

Run: `cd yehub-be && pnpm test -- social-account.validator.spec`
Expected: PASS, all 11 tests green.

- [ ] **Step 5: Commit**

```bash
git add yehub-be/src/profiles/social-account.validator.ts yehub-be/src/profiles/social-account.validator.spec.ts
git commit -m "feat(be): add per-platform social account username validator"
```

---

## Task 2: Backend — Add `avatar` column to Profile model

**Files:**
- Modify: `yehub-be/prisma/schema.prisma`
- Generated: `yehub-be/prisma/migrations/<ts>_add_profile_avatar/migration.sql`

- [ ] **Step 1: Edit `prisma/schema.prisma`**

In the `Profile` model (around line 339), add `avatar` field below `phone`:

```prisma
model Profile {
  id          String   @id @default(uuid()) @db.Uuid
  name        String
  description String?
  tags        String[]
  gender      Gender?
  email       String?
  phone       String?
  avatar      String?
  tier_id     String?  @db.Uuid
  ...
}
```

- [ ] **Step 2: Create migration**

Run: `cd yehub-be && pnpm prisma:migrate --name add_profile_avatar`
Expected: a new migration directory under `prisma/migrations/`. The generated SQL should be approximately:

```sql
ALTER TABLE "profiles" ADD COLUMN "avatar" TEXT;
```

- [ ] **Step 3: Regenerate Prisma client**

Run: `cd yehub-be && pnpm prisma:generate`
Expected: `Generated Prisma Client` success message.

- [ ] **Step 4: Verify TypeScript compiles**

Run: `cd yehub-be && pnpm build`
Expected: build succeeds (avatar is optional so no breakage).

- [ ] **Step 5: Commit**

```bash
git add yehub-be/prisma/schema.prisma yehub-be/prisma/migrations/
git commit -m "feat(be): add avatar column to profiles table"
```

---

## Task 3: Backend — Update Create/Update DTOs

**Files:**
- Modify: `yehub-be/src/profiles/dto/create-profile.dto.ts`
- Modify: `yehub-be/src/profiles/dto/update-profile.dto.ts`

- [ ] **Step 1: Update `create-profile.dto.ts`**

Replace the file content:

```ts
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsNotEmpty,
  MaxLength,
  IsEmail,
  IsEnum,
  IsArray,
  IsUUID,
  ValidateNested,
  ArrayMinSize,
} from 'class-validator';
import { Type } from 'class-transformer';
import { Gender, Platform } from '../../../generated/prisma/client';

export class SocialAccountInput {
  @ApiProperty({ enum: Platform })
  @IsEnum(Platform)
  platform: Platform;

  @ApiProperty({ example: 'https://facebook.com/johndoe' })
  @IsString()
  @IsNotEmpty()
  url: string;
}

export class CreateProfileDto {
  @ApiProperty({ example: 'John Doe' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ enum: Gender })
  @IsEnum(Gender)
  gender: Gender;

  @ApiPropertyOptional({ example: 'john@example.com' })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({ example: '+84123456789' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional({ description: 'S3 key for the avatar image' })
  @IsOptional()
  @IsString()
  avatar?: string;

  @ApiPropertyOptional({ example: ['fashion', 'beauty'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('4')
  tierId?: string;

  @ApiProperty({ type: [String], format: 'uuid' })
  @IsArray()
  @ArrayMinSize(1, { message: 'At least one category is required' })
  @IsUUID('4', { each: true })
  categoryIds: string[];

  @ApiProperty({ type: [SocialAccountInput] })
  @IsArray()
  @ArrayMinSize(1, { message: 'At least one social account is required' })
  @ValidateNested({ each: true })
  @Type(() => SocialAccountInput)
  socialAccounts: SocialAccountInput[];
}
```

- [ ] **Step 2: Update `update-profile.dto.ts`**

Replace the file content:

```ts
import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsNotEmpty,
  MaxLength,
  IsEmail,
  IsEnum,
  IsArray,
  IsUUID,
  ArrayMinSize,
} from 'class-validator';
import { Gender } from '../../../generated/prisma/client';

export class UpdateProfileDto {
  @ApiPropertyOptional({ example: 'John Doe' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ enum: Gender, nullable: true })
  @IsOptional()
  @IsEnum(Gender)
  gender?: Gender | null;

  @ApiPropertyOptional({ example: 'john@example.com', nullable: true })
  @IsOptional()
  @IsEmail()
  email?: string | null;

  @ApiPropertyOptional({ example: '+84123456789', nullable: true })
  @IsOptional()
  @IsString()
  phone?: string | null;

  @ApiPropertyOptional({
    description: 'S3 key for the avatar image; pass null to clear',
    nullable: true,
  })
  @IsOptional()
  @IsString()
  avatar?: string | null;

  @ApiPropertyOptional({ example: ['fashion', 'beauty'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @IsOptional()
  @IsUUID('4')
  tierId?: string | null;

  @ApiPropertyOptional({ type: [String], format: 'uuid' })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1, { message: 'At least one category is required' })
  @IsUUID('4', { each: true })
  categoryIds?: string[];
}
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `cd yehub-be && pnpm build`
Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
git add yehub-be/src/profiles/dto/create-profile.dto.ts yehub-be/src/profiles/dto/update-profile.dto.ts
git commit -m "feat(be): require gender/categories/socialAccounts on profile create; add avatar field"
```

---

## Task 4: Backend — Update ProfilesService (avatar, validation, duplicate checks, last-account guard)

**Files:**
- Modify: `yehub-be/src/profiles/profiles.service.ts`
- Create: `yehub-be/src/profiles/profiles.service.spec.ts`

- [ ] **Step 1: Write failing tests**

Create `yehub-be/src/profiles/profiles.service.spec.ts`:

```ts
import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { ProfilesService } from './profiles.service';
import { PrismaService } from '../prisma/prisma.service';
import { Platform, Gender } from '../../generated/prisma/client';

const mockPrisma = {
  profile: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    count: jest.fn(),
  },
  socialAccount: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    count: jest.fn(),
  },
  profilePost: {
    create: jest.fn(),
    delete: jest.fn(),
  },
  $transaction: jest.fn(),
};

const baseProfileResponse = {
  id: 'profile-1',
  name: 'John',
  description: null,
  gender: Gender.MALE,
  email: null,
  phone: null,
  avatar: null,
  tags: [],
  tier: null,
  categories: [],
  socialAccounts: [],
  _count: { profilePosts: 0 },
  created_at: new Date(),
  updated_at: new Date(),
};

describe('ProfilesService', () => {
  let service: ProfilesService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProfilesService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();
    service = module.get<ProfilesService>(ProfilesService);
    jest.clearAllMocks();
  });

  describe('create', () => {
    const dto = {
      name: 'John',
      gender: Gender.MALE,
      categoryIds: ['cat-1'],
      socialAccounts: [
        { platform: Platform.INSTAGRAM, url: 'https://instagram.com/johndoe' },
      ],
    };

    it('throws ConflictException when a social account is already linked', async () => {
      mockPrisma.socialAccount.findMany.mockResolvedValue([
        {
          platform: Platform.INSTAGRAM,
          platform_user_id: 'instagram_johndoe',
          username: 'johndoe',
          profile: { name: 'Jane' },
        },
      ]);

      await expect(service.create(dto)).rejects.toThrow(ConflictException);
      await expect(service.create(dto)).rejects.toThrow(
        /Already linked: INSTAGRAM @johndoe \(linked to "Jane"\)/,
      );
    });

    it('throws BadRequestException for invalid extracted username', async () => {
      mockPrisma.socialAccount.findMany.mockResolvedValue([]);
      const badDto = {
        ...dto,
        socialAccounts: [
          { platform: Platform.INSTAGRAM, url: 'https://instagram.com/john doe' },
        ],
      };
      await expect(service.create(badDto)).rejects.toThrow(BadRequestException);
    });

    it('creates a profile when there are no conflicts', async () => {
      mockPrisma.socialAccount.findMany.mockResolvedValue([]);
      mockPrisma.profile.create.mockResolvedValue(baseProfileResponse);

      const result = await service.create(dto);

      expect(mockPrisma.profile.create).toHaveBeenCalled();
      expect(result.id).toBe('profile-1');
      expect(result).toHaveProperty('avatar', null);
    });

    it('passes avatar through to profile.create', async () => {
      mockPrisma.socialAccount.findMany.mockResolvedValue([]);
      mockPrisma.profile.create.mockResolvedValue({
        ...baseProfileResponse,
        avatar: 'uploads/avatar.jpg',
      });

      const result = await service.create({ ...dto, avatar: 'uploads/avatar.jpg' });

      expect(mockPrisma.profile.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ avatar: 'uploads/avatar.jpg' }),
        }),
      );
      expect(result.avatar).toBe('uploads/avatar.jpg');
    });
  });

  describe('update', () => {
    it('passes avatar through to profile.update', async () => {
      mockPrisma.profile.findUnique.mockResolvedValue({ id: 'profile-1' });
      mockPrisma.profile.update.mockResolvedValue({
        ...baseProfileResponse,
        avatar: 'uploads/new.jpg',
      });

      await service.update('profile-1', { avatar: 'uploads/new.jpg' });

      expect(mockPrisma.profile.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'profile-1' },
          data: expect.objectContaining({ avatar: 'uploads/new.jpg' }),
        }),
      );
    });

    it('clears avatar when null is passed', async () => {
      mockPrisma.profile.findUnique.mockResolvedValue({ id: 'profile-1' });
      mockPrisma.profile.update.mockResolvedValue(baseProfileResponse);

      await service.update('profile-1', { avatar: null });

      expect(mockPrisma.profile.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ avatar: null }),
        }),
      );
    });
  });

  describe('linkAccount', () => {
    it('throws ConflictException when account already exists on another profile', async () => {
      mockPrisma.profile.findUnique.mockResolvedValue({ id: 'profile-1' });
      mockPrisma.socialAccount.findFirst.mockResolvedValue({
        profile: { name: 'Jane' },
      });

      await expect(
        service.linkAccount('profile-1', {
          platform: Platform.INSTAGRAM,
          username: 'johndoe',
        }),
      ).rejects.toThrow(
        /INSTAGRAM @johndoe is already linked to profile "Jane"/,
      );
    });

    it('throws BadRequestException for invalid username', async () => {
      mockPrisma.profile.findUnique.mockResolvedValue({ id: 'profile-1' });
      mockPrisma.socialAccount.findFirst.mockResolvedValue(null);

      await expect(
        service.linkAccount('profile-1', {
          platform: Platform.INSTAGRAM,
          username: 'bad name!',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('creates account when no conflict', async () => {
      mockPrisma.profile.findUnique.mockResolvedValue({ id: 'profile-1' });
      mockPrisma.socialAccount.findFirst.mockResolvedValue(null);
      mockPrisma.socialAccount.create.mockResolvedValue({
        id: 'acc-1',
        platform: Platform.INSTAGRAM,
        platform_user_id: 'instagram_johndoe',
        username: 'johndoe',
        display_name: null,
        follower_count: 0,
        is_verified: false,
        avatar_url: null,
        created_at: new Date(),
      });

      const result = await service.linkAccount('profile-1', {
        platform: Platform.INSTAGRAM,
        username: 'johndoe',
      });

      expect(result.id).toBe('acc-1');
    });
  });

  describe('unlinkAccount', () => {
    it('throws BadRequestException when removing the last account', async () => {
      mockPrisma.socialAccount.findFirst.mockResolvedValue({
        id: 'acc-1',
        profile_id: 'profile-1',
      });
      mockPrisma.socialAccount.count.mockResolvedValue(1);

      await expect(
        service.unlinkAccount('profile-1', 'acc-1'),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.unlinkAccount('profile-1', 'acc-1'),
      ).rejects.toThrow(/at least one social account/);
    });

    it('unlinks the account when more than one remains', async () => {
      mockPrisma.socialAccount.findFirst.mockResolvedValue({
        id: 'acc-1',
        profile_id: 'profile-1',
      });
      mockPrisma.socialAccount.count.mockResolvedValue(2);
      mockPrisma.socialAccount.delete.mockResolvedValue({});

      await service.unlinkAccount('profile-1', 'acc-1');

      expect(mockPrisma.socialAccount.delete).toHaveBeenCalledWith({
        where: { id: 'acc-1' },
      });
    });
  });

  describe('moveAccount', () => {
    it('throws BadRequestException when moving the last account', async () => {
      mockPrisma.socialAccount.findFirst.mockResolvedValue({
        id: 'acc-1',
        profile_id: 'profile-1',
      });
      mockPrisma.profile.findUnique.mockResolvedValue({ id: 'profile-2' });
      mockPrisma.socialAccount.count.mockResolvedValue(1);

      await expect(
        service.moveAccount('profile-1', 'acc-1', { targetProfileId: 'profile-2' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('moves the account when more than one remains', async () => {
      mockPrisma.socialAccount.findFirst.mockResolvedValue({
        id: 'acc-1',
        profile_id: 'profile-1',
      });
      mockPrisma.profile.findUnique.mockResolvedValue({ id: 'profile-2' });
      mockPrisma.socialAccount.count.mockResolvedValue(3);
      mockPrisma.socialAccount.update.mockResolvedValue({
        id: 'acc-1',
        platform: Platform.INSTAGRAM,
        platform_user_id: 'instagram_johndoe',
        username: 'johndoe',
        display_name: null,
        follower_count: 0,
        is_verified: false,
        avatar_url: null,
        created_at: new Date(),
      });

      const result = await service.moveAccount('profile-1', 'acc-1', {
        targetProfileId: 'profile-2',
      });

      expect(result.id).toBe('acc-1');
    });
  });
});
```

- [ ] **Step 2: Run tests to confirm failure**

Run: `cd yehub-be && pnpm test -- profiles.service.spec`
Expected: FAIL — most tests fail because behavior isn't implemented yet.

- [ ] **Step 3: Update `profiles.service.ts`**

Apply the following edits to `yehub-be/src/profiles/profiles.service.ts`:

**A. Add imports** at the top of the file:

```ts
import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
```

Add the validator import after the existing imports:

```ts
import { validateUsername } from './social-account.validator';
```

**B. Replace the `create()` method** (currently lines 35-72):

```ts
  async create(dto: CreateProfileDto) {
    const socialAccountsData = (dto.socialAccounts ?? []).map((sa) => {
      const username = this.extractUsernameFromUrl(sa.url);
      validateUsername(sa.platform, username);
      return {
        platform: sa.platform,
        username,
        platform_user_id: `${sa.platform.toLowerCase()}_${username}`,
      };
    });

    if (socialAccountsData.length > 0) {
      const existing = await this.prisma.socialAccount.findMany({
        where: {
          OR: socialAccountsData.map((sa) => ({
            platform: sa.platform,
            platform_user_id: sa.platform_user_id,
          })),
        },
        select: {
          platform: true,
          platform_user_id: true,
          username: true,
          profile: { select: { name: true } },
        },
      });

      if (existing.length > 0) {
        const detail = existing
          .map(
            (e) =>
              `${e.platform} @${e.username ?? e.platform_user_id} (linked to "${e.profile.name}")`,
          )
          .join('; ');
        throw new ConflictException(`Already linked: ${detail}`);
      }
    }

    try {
      const profile = await this.prisma.profile.create({
        data: {
          name: dto.name,
          description: dto.description,
          gender: dto.gender,
          email: dto.email,
          phone: dto.phone,
          avatar: dto.avatar,
          tags: dto.tags ?? [],
          ...(dto.tierId && { tier: { connect: { id: dto.tierId } } }),
          ...(dto.categoryIds &&
            dto.categoryIds.length > 0 && {
              categories: {
                create: dto.categoryIds.map((id) => ({
                  kol_category_id: id,
                })),
              },
            }),
          ...(socialAccountsData.length > 0 && {
            socialAccounts: {
              create: socialAccountsData,
            },
          }),
        },
        include: this.profileInclude,
      });

      return this.formatProfile(profile);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          'A social account is already linked to another profile',
        );
      }
      throw error;
    }
  }
```

**C. Update `update()` to handle `avatar`** — within the existing block of `if (dto.X !== undefined) data.X = dto.X;` (around line 238-243), add:

```ts
    if (dto.avatar !== undefined) data.avatar = dto.avatar;
```

(Place between `phone` and `tags`.)

**D. Replace `linkAccount()`** (currently lines 285-329):

```ts
  async linkAccount(profileId: string, dto: LinkAccountDto) {
    const profile = await this.prisma.profile.findUnique({
      where: { id: profileId },
    });
    if (!profile) {
      throw new NotFoundException('Profile not found');
    }

    validateUsername(dto.platform, dto.username);

    const platform_user_id =
      dto.platformUserId ?? `${dto.platform.toLowerCase()}_${dto.username}`;

    const existing = await this.prisma.socialAccount.findFirst({
      where: { platform: dto.platform, platform_user_id },
      select: { profile: { select: { name: true } } },
    });

    if (existing) {
      throw new ConflictException(
        `${dto.platform} @${dto.username} is already linked to profile "${existing.profile.name}"`,
      );
    }

    try {
      const account = await this.prisma.socialAccount.create({
        data: {
          profile_id: profileId,
          platform: dto.platform,
          username: dto.username,
          display_name: dto.displayName,
          platform_user_id,
          avatar_url: dto.avatarUrl,
        },
      });

      return {
        id: account.id,
        platform: account.platform,
        platformUserId: account.platform_user_id,
        username: account.username,
        displayName: account.display_name,
        followerCount: account.follower_count,
        isVerified: account.is_verified,
        avatarUrl: account.avatar_url,
        createdAt: account.created_at,
      };
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          `${dto.platform} @${dto.username} is already linked to another profile`,
        );
      }
      throw error;
    }
  }
```

**E. Update `unlinkAccount()`** (currently lines 331-340) — add the count check after the `findFirst`:

```ts
  async unlinkAccount(profileId: string, accountId: string) {
    const account = await this.prisma.socialAccount.findFirst({
      where: { id: accountId, profile_id: profileId },
    });
    if (!account) {
      throw new NotFoundException('Social account not found on this profile');
    }

    const count = await this.prisma.socialAccount.count({
      where: { profile_id: profileId },
    });
    if (count <= 1) {
      throw new BadRequestException(
        'A profile must have at least one social account. Link another account before unlinking this one.',
      );
    }

    await this.prisma.socialAccount.delete({ where: { id: accountId } });
  }
```

**F. Update `moveAccount()`** (currently lines 342-373) — add the count check after the target profile lookup:

```ts
  async moveAccount(profileId: string, accountId: string, dto: MoveAccountDto) {
    const account = await this.prisma.socialAccount.findFirst({
      where: { id: accountId, profile_id: profileId },
    });
    if (!account) {
      throw new NotFoundException('Social account not found on this profile');
    }

    const targetProfile = await this.prisma.profile.findUnique({
      where: { id: dto.targetProfileId },
    });
    if (!targetProfile) {
      throw new NotFoundException('Target profile not found');
    }

    const count = await this.prisma.socialAccount.count({
      where: { profile_id: profileId },
    });
    if (count <= 1) {
      throw new BadRequestException(
        'A profile must have at least one social account. Link another account on this profile before moving the last one.',
      );
    }

    const updated = await this.prisma.socialAccount.update({
      where: { id: accountId },
      data: { profile_id: dto.targetProfileId },
    });

    return {
      id: updated.id,
      platform: updated.platform,
      platformUserId: updated.platform_user_id,
      username: updated.username,
      displayName: updated.display_name,
      followerCount: updated.follower_count,
      isVerified: updated.is_verified,
      avatarUrl: updated.avatar_url,
      createdAt: updated.created_at,
    };
  }
```

**G. Update `formatProfile()` parameter type and return value** — in the type declaration around line 462, add `avatar: string | null;`:

```ts
  private formatProfile(p: {
    id: string;
    name: string;
    description: string | null;
    gender: Gender | null;
    email: string | null;
    phone: string | null;
    avatar: string | null;
    tags: string[];
    ...
```

In the return object around line 506, add `avatar: p.avatar,`:

```ts
    return {
      id: p.id,
      name: p.name,
      description: p.description,
      gender: p.gender,
      email: p.email,
      phone: p.phone,
      avatar: p.avatar,
      tags: p.tags,
      ...
```

- [ ] **Step 4: Run tests to confirm pass**

Run: `cd yehub-be && pnpm test -- profiles.service.spec`
Expected: PASS, all tests green.

- [ ] **Step 5: Run full backend build + lint**

Run: `cd yehub-be && pnpm build && pnpm lint`
Expected: both succeed.

- [ ] **Step 6: Commit**

```bash
git add yehub-be/src/profiles/profiles.service.ts yehub-be/src/profiles/profiles.service.spec.ts
git commit -m "feat(be): pre-flight duplicate checks, last-account guard, username validation, avatar pass-through"
```

---

## Task 5: Frontend — Add `avatar` to profile API types

**Files:**
- Modify: `yehub-fe/src/api/profiles.ts`

- [ ] **Step 1: Edit `yehub-fe/src/api/profiles.ts`**

In the `Profile` interface (line 47), add `avatar` field:

```ts
export interface Profile {
  id: string
  name: string
  description: string | null
  gender: Gender | null
  email: string | null
  phone: string | null
  avatar: string | null
  tags: string[]
  tier: ProfileTier | null
  categories: ProfileCategory[]
  totalFollowers: number
  accounts: ProfileAccount[]
  linkedPostCount: number
  createdAt: string
  updatedAt: string
}
```

In the `CreateProfilePayload` interface (line 90), add `avatar?: string`:

```ts
export interface CreateProfilePayload {
  name: string
  description?: string
  gender?: Gender
  email?: string
  phone?: string
  avatar?: string
  tags?: string[]
  tierId?: string
  categoryIds?: string[]
  socialAccounts?: { platform: PlatformType; url: string }[]
}
```

In the `UpdateProfilePayload` interface (line 102), add `avatar?: string | null`:

```ts
export interface UpdateProfilePayload {
  name?: string
  description?: string
  gender?: Gender | null
  email?: string | null
  phone?: string | null
  avatar?: string | null
  tags?: string[]
  tierId?: string | null
  categoryIds?: string[]
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd yehub-fe && pnpm build`
Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
git add yehub-fe/src/api/profiles.ts
git commit -m "feat(fe): add avatar field to profile API types"
```

---

## Task 6: Frontend — Shared social-account input parser

**Files:**
- Create: `yehub-fe/src/lib/social-accounts.ts`

- [ ] **Step 1: Create `yehub-fe/src/lib/social-accounts.ts`**

```ts
import type { PlatformType } from '@/api/profiles'

export interface ParseResult {
  ok: boolean
  username?: string
  error?: string
}

interface PlatformConfig {
  url: RegExp
  username: RegExp
  label: string
}

const PATTERNS: Record<PlatformType, PlatformConfig> = {
  FACEBOOK: {
    url: /^https?:\/\/(?:www\.)?(?:facebook|fb)\.com\/([A-Za-z0-9.]{3,})\/?$/i,
    username: /^[A-Za-z0-9.]{3,}$/,
    label: 'Facebook',
  },
  INSTAGRAM: {
    url: /^https?:\/\/(?:www\.)?instagram\.com\/@?([A-Za-z0-9._]{1,30})\/?$/i,
    username: /^[A-Za-z0-9._]{1,30}$/,
    label: 'Instagram',
  },
  TIKTOK: {
    url: /^https?:\/\/(?:www\.)?tiktok\.com\/@([A-Za-z0-9._]{2,24})\/?$/i,
    username: /^[A-Za-z0-9._]{2,24}$/,
    label: 'TikTok',
  },
  YOUTUBE: {
    url: /^https?:\/\/(?:www\.)?youtube\.com\/(?:@|channel\/|c\/|user\/)?([A-Za-z0-9._-]{1,})\/?$/i,
    username: /^[A-Za-z0-9._-]{1,}$/,
    label: 'YouTube',
  },
  THREADS: {
    url: /^https?:\/\/(?:www\.)?threads\.(?:net|com)\/@?([A-Za-z0-9._]{1,30})\/?$/i,
    username: /^[A-Za-z0-9._]{1,30}$/,
    label: 'Threads',
  },
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

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd yehub-fe && pnpm build`
Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
git add yehub-fe/src/lib/social-accounts.ts
git commit -m "feat(fe): add parseSocialInput util for URL/username validation"
```

---

## Task 7: Frontend — `ProfileAvatarPicker` component

**Files:**
- Create: `yehub-fe/src/pages/profiles/components/ProfileAvatarPicker.tsx`

- [ ] **Step 1: Create `ProfileAvatarPicker.tsx`**

```tsx
import { useRef, useState } from 'react'
import { Upload } from 'lucide-react'
import { toast } from 'sonner'
import { uploadsApi } from '@/api/uploads'
import { showApiError } from '@/lib/errors'
import { usePresignedUrl } from '@/hooks/use-presigned-url'

interface ProfileAvatarPickerProps {
  value: string
  onChange: (url: string) => void
}

export function ProfileAvatarPicker({ value, onChange }: ProfileAvatarPickerProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const { url: avatarUrl } = usePresignedUrl(value || null)

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 5 * 1024 * 1024) {
      toast.error('File size must be under 5 MB')
      return
    }
    setUploading(true)
    try {
      const { uploadUrl, key } = await uploadsApi.requestUploadUrl(file.type, file.name)
      await uploadsApi.uploadToS3(uploadUrl, file)
      onChange(key)
    } catch (error) {
      showApiError(error, { fallback: 'Failed to upload avatar' })
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="space-y-2">
      <span className="text-sm font-medium">Avatar (optional)</span>
      <div
        className="group/avatar relative size-24 rounded-full border-2 border-dashed bg-muted overflow-hidden flex items-center justify-center cursor-pointer hover:border-primary/50 transition-colors"
        onClick={() => !value && inputRef.current?.click()}
      >
        {value ? (
          <>
            <img src={avatarUrl} alt="Avatar" className="size-full object-cover" />
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-black/60 opacity-0 group-hover/avatar:opacity-100 transition-opacity">
              <button
                type="button"
                className="text-xs font-medium text-white hover:underline cursor-pointer"
                onClick={(e) => {
                  e.stopPropagation()
                  inputRef.current?.click()
                }}
              >
                Change
              </button>
              <button
                type="button"
                className="text-xs font-medium text-white/80 hover:text-white hover:underline cursor-pointer"
                onClick={(e) => {
                  e.stopPropagation()
                  onChange('')
                  if (inputRef.current) inputRef.current.value = ''
                }}
              >
                Remove
              </button>
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center gap-1">
            {uploading ? (
              <span className="text-xs text-muted-foreground">Uploading…</span>
            ) : (
              <>
                <Upload className="h-5 w-5 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">Upload</span>
              </>
            )}
          </div>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept=".jpg,.jpeg,.png,.gif,.webp,.bmp"
        className="hidden"
        onChange={handleFileChange}
      />
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd yehub-fe && pnpm build`
Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
git add yehub-fe/src/pages/profiles/components/ProfileAvatarPicker.tsx
git commit -m "feat(fe): add ProfileAvatarPicker component"
```

---

## Task 8: Frontend — `AddProfilePage` (full rewrite)

**Files:**
- Modify: `yehub-fe/src/pages/profiles/AddProfilePage.tsx`

- [ ] **Step 1: Replace the file content**

```tsx
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation } from '@tanstack/react-query'
import { ArrowLeft } from 'lucide-react'
import { toast } from 'sonner'

import { PageWrapper } from '@/components/common/PageWrapper'
import { ROUTES } from '@/lib/constants/routes'
import { queryKeys } from '@/lib/constants/query-keys'
import { kolCategoriesApi } from '@/api/kol-categories'
import { kolTiersApi } from '@/api/kol-tiers'
import { profilesApi, type PlatformType } from '@/api/profiles'
import { showApiError } from '@/lib/errors'
import { parseSocialInput } from '@/lib/social-accounts'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { Separator } from '@/components/ui/separator'
import { ProfileAvatarPicker } from './components/ProfileAvatarPicker'

const SOCIAL_PLATFORMS: { key: PlatformType; label: string; placeholder: string }[] = [
  { key: 'FACEBOOK', label: 'Facebook URL or username', placeholder: 'https://facebook.com/username' },
  { key: 'INSTAGRAM', label: 'Instagram URL or username', placeholder: 'https://instagram.com/username' },
  { key: 'TIKTOK', label: 'TikTok URL or username', placeholder: 'https://tiktok.com/@username' },
  { key: 'YOUTUBE', label: 'YouTube URL or handle', placeholder: 'https://youtube.com/@channel' },
  { key: 'THREADS', label: 'Threads URL or username', placeholder: 'https://threads.net/@username' },
]

interface FormErrors {
  gender?: string
  categories?: string
  socialAccounts?: string
  social?: Partial<Record<PlatformType, string>>
}

export default function AddProfilePage() {
  const navigate = useNavigate()

  const [name, setName] = useState('')
  const [gender, setGender] = useState<string>('')
  const [selectedCategories, setSelectedCategories] = useState<string[]>([])
  const [tierId, setTierId] = useState<string>('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [avatar, setAvatar] = useState('')
  const [tagsInput, setTagsInput] = useState('')
  const [socialUrls, setSocialUrls] = useState<Record<string, string>>({})
  const [errors, setErrors] = useState<FormErrors>({})

  const { data: categories = [] } = useQuery({
    queryKey: queryKeys.kolCategories,
    queryFn: kolCategoriesApi.list,
  })

  const { data: tiers = [] } = useQuery({
    queryKey: queryKeys.kolTiers,
    queryFn: kolTiersApi.list,
  })

  const createMutation = useMutation({
    mutationFn: profilesApi.create,
    onSuccess: () => {
      toast.success('Profile created')
      navigate(ROUTES.PROFILES)
    },
    onError: (error) => showApiError(error, { fallback: 'Failed to create profile' }),
  })

  const handleCategoryToggle = (categoryId: string) => {
    setSelectedCategories((prev) =>
      prev.includes(categoryId) ? prev.filter((id) => id !== categoryId) : [...prev, categoryId],
    )
  }

  const handleSocialUrlChange = (platform: PlatformType, value: string) => {
    setSocialUrls((prev) => ({ ...prev, [platform]: value }))
    setErrors((prev) => ({
      ...prev,
      social: { ...(prev.social ?? {}), [platform]: undefined },
      socialAccounts: undefined,
    }))
  }

  const validate = (): { valid: boolean; nextErrors: FormErrors; validAccounts: { platform: PlatformType; url: string }[] } => {
    const nextErrors: FormErrors = { social: {} }

    if (!gender) nextErrors.gender = 'Gender is required'
    if (selectedCategories.length === 0) nextErrors.categories = 'Select at least one category'

    const validAccounts: { platform: PlatformType; url: string }[] = []
    for (const { key } of SOCIAL_PLATFORMS) {
      const raw = socialUrls[key]?.trim() ?? ''
      if (!raw) continue
      const parsed = parseSocialInput(key, raw)
      if (!parsed.ok) {
        nextErrors.social![key] = parsed.error
      } else {
        validAccounts.push({ platform: key, url: raw })
      }
    }

    if (validAccounts.length === 0 && Object.values(nextErrors.social ?? {}).every((e) => !e)) {
      nextErrors.socialAccounts = 'Add at least one social account'
    }

    const hasFieldErrors =
      !!nextErrors.gender ||
      !!nextErrors.categories ||
      !!nextErrors.socialAccounts ||
      Object.values(nextErrors.social ?? {}).some(Boolean)

    return { valid: !hasFieldErrors, nextErrors, validAccounts }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    const { valid, nextErrors, validAccounts } = validate()
    setErrors(nextErrors)
    if (!valid) return

    const tags = tagsInput
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean)

    createMutation.mutate({
      name,
      gender: gender as 'MALE' | 'FEMALE' | 'OTHER',
      email: email || undefined,
      phone: phone || undefined,
      avatar: avatar || undefined,
      tags: tags.length > 0 ? tags : undefined,
      tierId: tierId || undefined,
      categoryIds: selectedCategories,
      socialAccounts: validAccounts,
    })
  }

  return (
    <PageWrapper>
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate(-1)}
          className="cursor-pointer"
          aria-label="Back"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-2xl font-bold">Add Profile</h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Card 1 - Basic Information */}
        <Card>
          <CardContent className="p-6 space-y-4">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Basic Information</h3>
            <Separator />
            <div className="flex flex-col sm:flex-row gap-6">
              <ProfileAvatarPicker value={avatar} onChange={setAvatar} />
              <div className="flex-1 space-y-4">
                <div className="flex flex-col sm:flex-row gap-4">
                  <div className="flex-1 min-w-0 space-y-2">
                    <Label htmlFor="profile-name">Name *</Label>
                    <Input
                      id="profile-name"
                      placeholder="Profile name"
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                    />
                  </div>
                  <div className="w-32 space-y-2">
                    <Label>Gender *</Label>
                    <Select
                      value={gender}
                      onValueChange={(v) => {
                        setGender(v ?? '')
                        setErrors((prev) => ({ ...prev, gender: undefined }))
                      }}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="MALE">Male</SelectItem>
                        <SelectItem value="FEMALE">Female</SelectItem>
                        <SelectItem value="OTHER">Other</SelectItem>
                      </SelectContent>
                    </Select>
                    {errors.gender && <p className="text-xs text-destructive">{errors.gender}</p>}
                  </div>
                </div>
                <div className="flex flex-col sm:flex-row gap-4">
                  <div className="flex-1 min-w-0 space-y-2">
                    <Label>Categories *</Label>
                    <div className="grid grid-cols-2 gap-2">
                      {categories.map((cat) => (
                        <label key={cat.id} className="flex items-center gap-2 cursor-pointer">
                          <Checkbox
                            checked={selectedCategories.includes(cat.id)}
                            onCheckedChange={() => {
                              handleCategoryToggle(cat.id)
                              setErrors((prev) => ({ ...prev, categories: undefined }))
                            }}
                          />
                          <span className="text-sm">{cat.name}</span>
                        </label>
                      ))}
                    </div>
                    {errors.categories && <p className="text-xs text-destructive">{errors.categories}</p>}
                  </div>
                  <div className="flex-1 min-w-0 space-y-2">
                    <Label>Tier</Label>
                    <Select value={tierId} onValueChange={(v) => setTierId(v ?? '')}>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select tier">
                          {tiers.find((t) => t.id === tierId)?.name}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {tiers.map((tier) => (
                          <SelectItem key={tier.id} value={tier.id}>
                            {tier.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Card 2 - Contact Information */}
        <Card>
          <CardContent className="p-6 space-y-4">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Contact Information
            </h3>
            <Separator />
            <div className="flex flex-col sm:flex-row flex-wrap gap-4">
              <div className="flex-1 min-w-0 space-y-2">
                <Label htmlFor="profile-email">Email</Label>
                <Input
                  id="profile-email"
                  type="email"
                  placeholder="email@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <div className="flex-1 min-w-0 space-y-2">
                <Label htmlFor="profile-phone">Phone</Label>
                <Input
                  id="profile-phone"
                  type="tel"
                  placeholder="+84 xxx xxx xxx"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
              </div>
              <div className="w-full space-y-2">
                <Label htmlFor="profile-tags">Tags (comma separated)</Label>
                <Input
                  id="profile-tags"
                  placeholder="e.g. KOL, beauty, lifestyle"
                  value={tagsInput}
                  onChange={(e) => setTagsInput(e.target.value)}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Card 3 - Social Accounts */}
        <Card>
          <CardContent className="p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                Social Accounts *
              </h3>
              {errors.socialAccounts && (
                <p className="text-xs text-destructive">{errors.socialAccounts}</p>
              )}
            </div>
            <Separator />
            <div className="flex flex-col sm:flex-row flex-wrap gap-4">
              {SOCIAL_PLATFORMS.map((platform) => (
                <div
                  key={platform.key}
                  className="flex-1 min-w-0 sm:basis-[calc(50%-0.5rem)] space-y-2"
                >
                  <Label htmlFor={`profile-${platform.key.toLowerCase()}`}>{platform.label}</Label>
                  <Input
                    id={`profile-${platform.key.toLowerCase()}`}
                    placeholder={platform.placeholder}
                    value={socialUrls[platform.key] || ''}
                    onChange={(e) => handleSocialUrlChange(platform.key, e.target.value)}
                  />
                  {errors.social?.[platform.key] && (
                    <p className="text-xs text-destructive">{errors.social[platform.key]}</p>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Footer */}
        <div className="flex justify-end gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={() => navigate(-1)}
            className="cursor-pointer"
          >
            Cancel
          </Button>
          <Button type="submit" className="cursor-pointer" disabled={createMutation.isPending}>
            Create Profile
          </Button>
        </div>
      </form>
    </PageWrapper>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd yehub-fe && pnpm build`
Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
git add yehub-fe/src/pages/profiles/AddProfilePage.tsx
git commit -m "feat(fe): validation, avatar, controlled tier label, error toast on add profile"
```

---

## Task 9: Frontend — `EditProfileDialog` (avatar, gender required, controlled tier label)

**Files:**
- Modify: `yehub-fe/src/pages/profiles/components/EditProfileDialog.tsx`

- [ ] **Step 1: Replace the file content**

```tsx
import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { Separator } from '@/components/ui/separator'
import { ProfileAvatarPicker } from './ProfileAvatarPicker'
import type { ProfileDetail, UpdateProfilePayload } from '@/api/profiles'
import type { KolCategory } from '@/api/kol-categories'
import type { KolTier } from '@/api/kol-tiers'

interface EditProfileDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  profile: ProfileDetail
  categories: KolCategory[]
  tiers: KolTier[]
  onSave: (data: UpdateProfilePayload) => void
}

interface FormErrors {
  gender?: string
  categories?: string
}

export function EditProfileDialog({
  open,
  onOpenChange,
  profile,
  categories,
  tiers,
  onSave,
}: EditProfileDialogProps) {
  const [name, setName] = useState(profile.name)
  const [gender, setGender] = useState(profile.gender ?? '')
  const [avatar, setAvatar] = useState(profile.avatar ?? '')
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<string[]>(
    profile.categories.map((c) => c.id),
  )
  const [tierId, setTierId] = useState(profile.tier?.id ?? '')
  const [email, setEmail] = useState(profile.email ?? '')
  const [phone, setPhone] = useState(profile.phone ?? '')
  const [tags, setTags] = useState(profile.tags.join(', '))
  const [errors, setErrors] = useState<FormErrors>({})

  useEffect(() => {
    if (open) {
      setName(profile.name)
      setGender(profile.gender ?? '')
      setAvatar(profile.avatar ?? '')
      setSelectedCategoryIds(profile.categories.map((c) => c.id))
      setTierId(profile.tier?.id ?? '')
      setEmail(profile.email ?? '')
      setPhone(profile.phone ?? '')
      setTags(profile.tags.join(', '))
      setErrors({})
    }
  }, [open, profile])

  const toggleCategory = (categoryId: string) => {
    setSelectedCategoryIds((prev) =>
      prev.includes(categoryId) ? prev.filter((id) => id !== categoryId) : [...prev, categoryId],
    )
    setErrors((prev) => ({ ...prev, categories: undefined }))
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    const nextErrors: FormErrors = {}
    if (!gender) nextErrors.gender = 'Gender is required'
    if (selectedCategoryIds.length === 0) nextErrors.categories = 'Select at least one category'
    setErrors(nextErrors)
    if (Object.values(nextErrors).some(Boolean)) return

    onSave({
      name,
      gender: gender as 'MALE' | 'FEMALE' | 'OTHER',
      avatar: avatar || null,
      categoryIds: selectedCategoryIds,
      tierId: tierId || null,
      email: email || null,
      phone: phone || null,
      tags: tags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
    })
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit Profile</DialogTitle>
          <DialogDescription>Update the profile details below.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <Separator />
          <div className="flex justify-center">
            <ProfileAvatarPicker value={avatar} onChange={setAvatar} />
          </div>
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1 min-w-0 space-y-2">
              <Label htmlFor="edit-name">Name *</Label>
              <Input id="edit-name" value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
            <div className="w-32 space-y-2">
              <Label>Gender *</Label>
              <Select
                value={gender}
                onValueChange={(v) => {
                  setGender(v ?? '')
                  setErrors((prev) => ({ ...prev, gender: undefined }))
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="MALE">Male</SelectItem>
                  <SelectItem value="FEMALE">Female</SelectItem>
                  <SelectItem value="OTHER">Other</SelectItem>
                </SelectContent>
              </Select>
              {errors.gender && <p className="text-xs text-destructive">{errors.gender}</p>}
            </div>
          </div>
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1 min-w-0 space-y-2">
              <Label>Categories *</Label>
              <div className="grid grid-cols-2 gap-2">
                {categories.map((cat) => (
                  <label key={cat.id} className="flex items-center gap-2 cursor-pointer">
                    <Checkbox
                      checked={selectedCategoryIds.includes(cat.id)}
                      onCheckedChange={() => toggleCategory(cat.id)}
                    />
                    <span className="text-sm">{cat.name}</span>
                  </label>
                ))}
              </div>
              {errors.categories && <p className="text-xs text-destructive">{errors.categories}</p>}
            </div>
            <div className="flex-1 min-w-0 space-y-2">
              <Label>Tier</Label>
              <div>
                <Select value={tierId} onValueChange={(v) => setTierId(v ?? '')}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select tier">
                      {tiers.find((t) => t.id === tierId)?.name}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {tiers.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1 min-w-0 space-y-2">
              <Label htmlFor="edit-email">Email</Label>
              <Input
                id="edit-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="email@example.com"
              />
            </div>
            <div className="flex-1 min-w-0 space-y-2">
              <Label htmlFor="edit-phone">Phone</Label>
              <Input
                id="edit-phone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+84 xxx xxx xxx"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-tags">Tags (comma separated)</Label>
            <Input
              id="edit-tags"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="e.g. KOL, beauty, lifestyle"
            />
          </div>
          <Separator />
          <div className="flex justify-end gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="cursor-pointer"
            >
              Cancel
            </Button>
            <Button type="submit" className="cursor-pointer">
              Save
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd yehub-fe && pnpm build`
Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
git add yehub-fe/src/pages/profiles/components/EditProfileDialog.tsx
git commit -m "feat(fe): avatar picker, gender required, controlled tier label in edit profile dialog"
```

---

## Task 10: Frontend — `LinkAccountDialog` (single URL/username input)

**Files:**
- Modify: `yehub-fe/src/pages/profiles/components/LinkAccountDialog.tsx`

- [ ] **Step 1: Replace the file content**

```tsx
import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { parseSocialInput } from '@/lib/social-accounts'
import type { PlatformType, LinkAccountPayload } from '@/api/profiles'

interface LinkAccountDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  existingPlatforms: PlatformType[]
  onLink: (data: LinkAccountPayload, opts: { onSuccess: () => void }) => void
}

const PLATFORMS: { value: PlatformType; label: string }[] = [
  { value: 'FACEBOOK', label: 'Facebook' },
  { value: 'INSTAGRAM', label: 'Instagram' },
  { value: 'THREADS', label: 'Threads' },
  { value: 'TIKTOK', label: 'TikTok' },
  { value: 'YOUTUBE', label: 'YouTube' },
]

export function LinkAccountDialog({ open, onOpenChange, existingPlatforms, onLink }: LinkAccountDialogProps) {
  const [platform, setPlatform] = useState<PlatformType | ''>('')
  const [input, setInput] = useState('')
  const [inputError, setInputError] = useState<string | undefined>()

  useEffect(() => {
    if (open) {
      setPlatform('')
      setInput('')
      setInputError(undefined)
    }
  }, [open])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!platform || !input.trim()) return

    const parsed = parseSocialInput(platform, input)
    if (!parsed.ok) {
      setInputError(parsed.error)
      return
    }
    setInputError(undefined)

    onLink(
      { platform, username: parsed.username! },
      { onSuccess: () => onOpenChange(false) },
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Link Social Account</DialogTitle>
          <DialogDescription>Connect a social media account to this profile.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <Separator />
          <div className="space-y-2">
            <Label>Platform *</Label>
            <div>
              <Select value={platform} onValueChange={(val) => setPlatform(val as PlatformType)}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select platform" />
                </SelectTrigger>
                <SelectContent>
                  {PLATFORMS.map((p) => (
                    <SelectItem
                      key={p.value}
                      value={p.value}
                      disabled={existingPlatforms.includes(p.value)}
                    >
                      {p.label}
                      {existingPlatforms.includes(p.value) ? ' (already linked)' : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="link-input">URL or username *</Label>
            <Input
              id="link-input"
              value={input}
              onChange={(e) => {
                setInput(e.target.value)
                setInputError(undefined)
              }}
              placeholder="https://instagram.com/username or username"
              required
            />
            {inputError && <p className="text-xs text-destructive">{inputError}</p>}
          </div>
          <Separator />
          <div className="flex justify-end gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="cursor-pointer"
            >
              Cancel
            </Button>
            <Button type="submit" disabled={!platform || !input.trim()} className="cursor-pointer">
              Link Account
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd yehub-fe && pnpm build`
Expected: build fails — `onLink` signature changed and the parent (`ProfileDetailPage`) hasn't been updated yet. That will be fixed in Task 13.

(If you're executing tasks strictly sequentially with build-after-each, you may temporarily get a TypeScript error here that resolves after Task 13. Acceptable: defer the build verification until Task 13.)

- [ ] **Step 3: Commit**

```bash
git add yehub-fe/src/pages/profiles/components/LinkAccountDialog.tsx
git commit -m "feat(fe): single URL/username input with validation in LinkAccountDialog"
```

---

## Task 11: Frontend — `MoveAccountDialog` (close on success only)

**Files:**
- Modify: `yehub-fe/src/pages/profiles/components/MoveAccountDialog.tsx`

- [ ] **Step 1: Update the file**

Change the `onMove` prop signature and the `handleSelect` function. Replace the existing prop type and `handleSelect`:

```tsx
interface MoveAccountDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  currentProfileId: string
  accountId: string
  onMove: (
    data: { accountId: string; targetProfileId: string },
    opts: { onSuccess: () => void },
  ) => void
}
```

Replace `handleSelect`:

```tsx
  const handleSelect = (targetProfileId: string) => {
    onMove(
      { accountId, targetProfileId },
      { onSuccess: () => onOpenChange(false) },
    )
  }
```

Also: replace the `Avatar` block in the profile picker rows to use `<PresignedAvatar>` once that wire-in happens — but for now keep `Avatar`/`AvatarFallback` (the avatar key isn't surfaced from `Profile` until after Task 5 anyway, and the visual update to `MoveAccountDialog` is purely cosmetic). To keep this task tight, leave the existing Avatar code in place; visual upgrade in Task 14.

- [ ] **Step 2: Verify**

Run: `cd yehub-fe && pnpm build`
Expected: still failing (parent hasn't been updated). Continue.

- [ ] **Step 3: Commit**

```bash
git add yehub-fe/src/pages/profiles/components/MoveAccountDialog.tsx
git commit -m "feat(fe): MoveAccountDialog only closes on successful mutation"
```

---

## Task 12: Frontend — `SocialAccountRow` (`isLastAccount` prop)

**Files:**
- Modify: `yehub-fe/src/pages/profiles/components/SocialAccountRow.tsx`

- [ ] **Step 1: Replace the file content**

```tsx
import { MoreHorizontal, ArrowRightLeft, Unlink2, CheckCircle } from 'lucide-react'
import { PlatformBadge } from '@/components/common/PlatformBadge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { formatNumber } from '@/lib/format'
import type { ProfileAccount } from '@/api/profiles'

interface SocialAccountRowProps {
  account: ProfileAccount
  isLastAccount: boolean
  onMove: () => void
  onUnlink: () => void
}

export function SocialAccountRow({ account, isLastAccount, onMove, onUnlink }: SocialAccountRowProps) {
  return (
    <div className="flex items-center justify-between rounded-lg border p-3">
      <div className="flex items-center gap-3 min-w-0">
        <PlatformBadge platform={account.platform} size="md" />
        <div className="min-w-0">
          <div className="flex items-center gap-1">
            <span className="font-medium text-sm truncate">
              @{account.username ?? account.displayName ?? account.platformUserId}
            </span>
            {account.isVerified && <CheckCircle className="h-4 w-4 shrink-0 text-blue-500" />}
          </div>
          <p className="text-xs text-muted-foreground">{formatNumber(account.followerCount)} followers</p>
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0 cursor-pointer"
                aria-label="Account actions"
              />
            }
          >
            <MoreHorizontal className="h-4 w-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              onClick={onMove}
              disabled={isLastAccount}
              className="cursor-pointer"
            >
              <ArrowRightLeft className="h-4 w-4" />
              Move to profile
              {isLastAccount && (
                <span className="ml-auto text-xs text-muted-foreground">last account</span>
              )}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              onClick={onUnlink}
              disabled={isLastAccount}
              className="cursor-pointer"
            >
              <Unlink2 className="h-4 w-4" />
              Unlink from profile
              {isLastAccount && (
                <span className="ml-auto text-xs text-muted-foreground">last account</span>
              )}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add yehub-fe/src/pages/profiles/components/SocialAccountRow.tsx
git commit -m "feat(fe): disable Move/Unlink actions when account is the last on profile"
```

---

## Task 13: Frontend — `use-profile-detail.ts` (error toasts + onSuccess callback support)

**Files:**
- Modify: `yehub-fe/src/pages/profiles/ProfileDetailPage/use-profile-detail.ts`

- [ ] **Step 1: Replace the file content**

```ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { queryKeys } from '@/lib/constants/query-keys'
import { profilesApi, type UpdateProfilePayload, type LinkAccountPayload } from '@/api/profiles'
import { kolCategoriesApi } from '@/api/kol-categories'
import { kolTiersApi } from '@/api/kol-tiers'
import { showApiError } from '@/lib/errors'

export function useProfileDetail() {
  const { id } = useParams<{ id: string }>()
  const queryClient = useQueryClient()

  const profileQuery = useQuery({
    queryKey: queryKeys.profile(id!),
    queryFn: () => profilesApi.get(id!),
    enabled: !!id,
  })

  const categoriesQuery = useQuery({
    queryKey: queryKeys.kolCategories,
    queryFn: kolCategoriesApi.list,
  })

  const tiersQuery = useQuery({
    queryKey: queryKeys.kolTiers,
    queryFn: kolTiersApi.list,
  })

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.profile(id!) })
    queryClient.invalidateQueries({ queryKey: queryKeys.profiles.all })
  }

  const updateMutation = useMutation({
    mutationFn: (data: UpdateProfilePayload) => profilesApi.update(id!, data),
    onSuccess: () => {
      invalidate()
      toast.success('Profile updated')
    },
    onError: (error) => showApiError(error, { fallback: 'Failed to update profile' }),
  })

  const linkAccountMutation = useMutation({
    mutationFn: (data: LinkAccountPayload) => profilesApi.linkAccount(id!, data),
    onSuccess: () => {
      invalidate()
      toast.success('Account linked')
    },
    onError: (error) => showApiError(error, { fallback: 'Failed to link account' }),
  })

  const unlinkAccountMutation = useMutation({
    mutationFn: (accountId: string) => profilesApi.unlinkAccount(id!, accountId),
    onSuccess: () => {
      invalidate()
      toast.success('Account unlinked')
    },
    onError: (error) => showApiError(error, { fallback: 'Failed to unlink account' }),
  })

  const moveAccountMutation = useMutation({
    mutationFn: ({ accountId, targetProfileId }: { accountId: string; targetProfileId: string }) =>
      profilesApi.moveAccount(id!, accountId, targetProfileId),
    onSuccess: () => {
      invalidate()
      toast.success('Account moved')
    },
    onError: (error) => showApiError(error, { fallback: 'Failed to move account' }),
  })

  const linkPostMutation = useMutation({
    mutationFn: (postId: string) => profilesApi.linkPost(id!, postId),
    onSuccess: () => {
      invalidate()
      toast.success('Post linked')
    },
    onError: (error) => showApiError(error, { fallback: 'Failed to link post' }),
  })

  const unlinkPostMutation = useMutation({
    mutationFn: (postId: string) => profilesApi.unlinkPost(id!, postId),
    onSuccess: () => {
      invalidate()
      toast.success('Post unlinked')
    },
    onError: (error) => showApiError(error, { fallback: 'Failed to unlink post' }),
  })

  return {
    profile: profileQuery.data,
    isLoading: profileQuery.isLoading,
    categories: categoriesQuery.data ?? [],
    tiers: tiersQuery.data ?? [],
    updateProfile: updateMutation.mutate,
    linkAccount: linkAccountMutation.mutate,
    unlinkAccount: unlinkAccountMutation.mutate,
    moveAccount: moveAccountMutation.mutate,
    linkPost: linkPostMutation.mutate,
    unlinkPost: unlinkPostMutation.mutate,
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add yehub-fe/src/pages/profiles/ProfileDetailPage/use-profile-detail.ts
git commit -m "feat(fe): show backend error toasts on profile mutations"
```

---

## Task 14: Frontend — `ProfileDetailPage` (`isLastAccount`, `<PresignedAvatar>`, dialog wire-up)

**Files:**
- Modify: `yehub-fe/src/pages/profiles/ProfileDetailPage/index.tsx`

- [ ] **Step 1: Replace the file content**

```tsx
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Plus, Pencil, Mail, Phone, Unlink2 } from 'lucide-react'
import { PageWrapper } from '@/components/common/PageWrapper'
import { MetricCard } from '@/components/common/MetricCard'
import { PostsTable } from '@/components/common/PostsTable'
import { PresignedAvatar } from '@/components/common/PresignedAvatar'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { COLOR_PRESETS, type ColorKey } from '@/lib/constants/colors'
import { formatNumber, formatDate } from '@/lib/format'
import { useProfileDetail } from './use-profile-detail'
import { SocialAccountRow } from '../components/SocialAccountRow'
import { EditProfileDialog } from '../components/EditProfileDialog'
import { LinkAccountDialog } from '../components/LinkAccountDialog'
import { LinkPostDialog } from '../components/LinkPostDialog'
import { MoveAccountDialog } from '../components/MoveAccountDialog'
import type { ProfileAccount } from '@/api/profiles'

export default function ProfileDetailPage() {
  const navigate = useNavigate()
  const {
    profile,
    isLoading,
    categories,
    tiers,
    updateProfile,
    linkAccount,
    unlinkAccount,
    moveAccount,
    linkPost,
    unlinkPost,
  } = useProfileDetail()

  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [linkDialogOpen, setLinkDialogOpen] = useState(false)
  const [linkPostDialogOpen, setLinkPostDialogOpen] = useState(false)
  const [moveDialogOpen, setMoveDialogOpen] = useState(false)
  const [selectedAccount, setSelectedAccount] = useState<ProfileAccount | null>(null)
  const [unlinkPostId, setUnlinkPostId] = useState<string | null>(null)

  if (isLoading) {
    return (
      <PageWrapper>
        <div className="flex items-center justify-center py-12">
          <p className="text-muted-foreground">Loading profile...</p>
        </div>
      </PageWrapper>
    )
  }

  if (!profile) {
    return (
      <PageWrapper>
        <div className="flex flex-col items-center justify-center py-12 gap-4">
          <p className="text-muted-foreground">Profile not found</p>
          <Button onClick={() => navigate('/profiles')} className="cursor-pointer">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Button>
        </div>
      </PageWrapper>
    )
  }

  const getCategoryBadgeClass = (color: string): string => {
    const preset = COLOR_PRESETS[color as ColorKey]
    return preset ? `${preset.badge} border-0` : ''
  }

  const getTierBadgeClass = (color: string): string => {
    const preset = COLOR_PRESETS[color as ColorKey]
    return preset ? `${preset.badge} border-0` : ''
  }

  const isLastAccount = profile.accounts.length === 1

  return (
    <PageWrapper>
      {/* Back button + breadcrumb */}
      <div className="flex items-center gap-2 mb-2">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate('/profiles')}
          className="cursor-pointer"
          aria-label="Back"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <span className="text-sm text-muted-foreground">Profiles</span>
      </div>

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-4 min-w-0">
          <PresignedAvatar
            imageKey={profile.avatar}
            alt={profile.name}
            fallback={profile.name[0]?.toUpperCase() ?? '?'}
            className="size-16 text-xl"
          />
          <div className="space-y-1.5 min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold truncate">{profile.name}</h1>
              {profile.tier && (
                <Badge variant="outline" className={`shrink-0 ${getTierBadgeClass(profile.tier.color)}`}>
                  {profile.tier.name}
                </Badge>
              )}
            </div>
            {profile.categories.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5">
                {profile.categories.map((cat) => (
                  <Badge key={cat.id} variant="outline" className={getCategoryBadgeClass(cat.color)}>
                    {cat.name}
                  </Badge>
                ))}
              </div>
            )}
            {profile.tags.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5">
                {profile.tags.map((tag) => (
                  <Badge key={tag} variant="secondary" className="text-xs">
                    {tag}
                  </Badge>
                ))}
              </div>
            )}
            <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
              {profile.gender && <span className="capitalize">{profile.gender.toLowerCase()}</span>}
              {profile.email && (
                <span className="flex items-center gap-1">
                  <Mail className="h-3.5 w-3.5" />
                  {profile.email}
                </span>
              )}
              {profile.phone && (
                <span className="flex items-center gap-1">
                  <Phone className="h-3.5 w-3.5" />
                  {profile.phone}
                </span>
              )}
            </div>
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              <span>Created {formatDate(profile.createdAt)}</span>
              <span>Updated {formatDate(profile.updatedAt)}</span>
            </div>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setEditDialogOpen(true)}
          className="shrink-0 cursor-pointer"
        >
          <Pencil className="mr-1 h-3 w-3" />
          Edit
        </Button>
      </div>

      {/* Metrics */}
      <div className="grid gap-4 md:grid-cols-3">
        <MetricCard label="Total Followers" value={formatNumber(profile.totalFollowers)} />
        <MetricCard label="Social Accounts" value={profile.accounts.length} />
        <MetricCard label="Linked Posts" value={profile.linkedPostCount} />
      </div>

      {/* Social Accounts */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Social Accounts</CardTitle>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setLinkDialogOpen(true)}
              className="cursor-pointer"
            >
              <Plus className="mr-1 h-3 w-3" />
              Link Account
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {profile.accounts.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              No social accounts linked yet.
            </p>
          ) : (
            <div className="space-y-3">
              {profile.accounts.map((account) => (
                <SocialAccountRow
                  key={account.id}
                  account={account}
                  isLastAccount={isLastAccount}
                  onMove={() => {
                    setSelectedAccount(account)
                    setMoveDialogOpen(true)
                  }}
                  onUnlink={() => unlinkAccount(account.id)}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Linked Posts */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Linked Posts</CardTitle>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setLinkPostDialogOpen(true)}
              className="cursor-pointer"
            >
              <Plus className="mr-1 h-3 w-3" />
              Link Post
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {profile.linkedPosts.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">No linked posts yet.</p>
          ) : (
            <PostsTable
              posts={profile.linkedPosts}
              onRowClick={(post) =>
                navigate(`/projects/${post.project_id}/campaigns/${post.campaign_id}/posts/${post.id}`)
              }
              renderCampaign={(post) => <span className="text-sm">{post.campaignName}</span>}
              renderKpi={(post) => (
                <div className="flex items-center gap-2">
                  {post.linkedBy ? (
                    <Badge variant={post.linkedBy === 'AUTO' ? 'secondary' : 'outline'} className="text-xs">
                      {post.linkedBy}
                    </Badge>
                  ) : (
                    <span className="text-sm text-muted-foreground">-</span>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 cursor-pointer text-destructive hover:text-destructive"
                    onClick={(e) => {
                      e.stopPropagation()
                      setUnlinkPostId(post.id)
                    }}
                    aria-label="Unlink post"
                  >
                    <Unlink2 className="h-4 w-4" />
                  </Button>
                </div>
              )}
            />
          )}
        </CardContent>
      </Card>

      {/* Dialogs */}
      <EditProfileDialog
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        profile={profile}
        categories={categories}
        tiers={tiers}
        onSave={updateProfile}
      />
      <LinkAccountDialog
        open={linkDialogOpen}
        onOpenChange={setLinkDialogOpen}
        existingPlatforms={profile.accounts.map((a) => a.platform)}
        onLink={(data, opts) => linkAccount(data, opts)}
      />
      <LinkPostDialog
        open={linkPostDialogOpen}
        onOpenChange={setLinkPostDialogOpen}
        linkedPostIds={profile.linkedPosts.map((p) => p.id)}
        onLink={linkPost}
      />
      {selectedAccount && (
        <MoveAccountDialog
          open={moveDialogOpen}
          onOpenChange={setMoveDialogOpen}
          currentProfileId={profile.id}
          accountId={selectedAccount.id}
          onMove={(data, opts) => moveAccount(data, opts)}
        />
      )}
      <AlertDialog open={!!unlinkPostId} onOpenChange={(open) => !open && setUnlinkPostId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Unlink post</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to unlink this post from the profile? This action can be undone by linking the post again.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="cursor-pointer">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="cursor-pointer bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (unlinkPostId) unlinkPost(unlinkPostId)
                setUnlinkPostId(null)
              }}
            >
              Unlink
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageWrapper>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd yehub-fe && pnpm build`
Expected: build succeeds (now that all consumers are aligned with the new `onLink`/`onMove` signatures).

- [ ] **Step 3: Commit**

```bash
git add yehub-fe/src/pages/profiles/ProfileDetailPage/index.tsx
git commit -m "feat(fe): use PresignedAvatar, pass isLastAccount, wire dialog onSuccess callbacks"
```

---

## Task 15: Frontend — `ProfilesListPage` (use `<PresignedAvatar>`)

**Files:**
- Modify: `yehub-fe/src/pages/profiles/ProfilesListPage/index.tsx`

- [ ] **Step 1: Edit the imports**

Replace the line:

```tsx
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
```

with:

```tsx
import { PresignedAvatar } from '@/components/common/PresignedAvatar'
```

- [ ] **Step 2: Replace the avatar block in the `name` column render**

Find (around line 119):

```tsx
        <div className="flex items-center gap-3">
          <Avatar className="h-8 w-8">
            <AvatarFallback>{p.name[0]?.toUpperCase()}</AvatarFallback>
          </Avatar>
          <span className="font-medium">{p.name}</span>
        </div>
```

Replace with:

```tsx
        <div className="flex items-center gap-3">
          <PresignedAvatar
            imageKey={p.avatar}
            alt={p.name}
            fallback={p.name[0]?.toUpperCase() ?? '?'}
            className="size-8"
          />
          <span className="font-medium">{p.name}</span>
        </div>
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `cd yehub-fe && pnpm build`
Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
git add yehub-fe/src/pages/profiles/ProfilesListPage/index.tsx
git commit -m "feat(fe): show profile avatar in profiles list table"
```

---

## Task 16: Verification — full test + build sweep

- [ ] **Step 1: Run backend tests**

Run: `cd yehub-be && pnpm test`
Expected: all tests pass, including new `social-account.validator.spec.ts` and `profiles.service.spec.ts`.

- [ ] **Step 2: Run backend lint**

Run: `cd yehub-be && pnpm lint`
Expected: no errors.

- [ ] **Step 3: Run backend build**

Run: `cd yehub-be && pnpm build`
Expected: build succeeds.

- [ ] **Step 4: Run frontend lint + build**

Run: `cd yehub-fe && pnpm lint && pnpm build`
Expected: both succeed.

- [ ] **Step 5: Manual smoke test (record observations in commit message)**

Start backend (`cd yehub-be && pnpm start:dev`) and frontend (`cd yehub-fe && pnpm dev`). Walk through these flows:

1. **Add Profile happy path**: name + gender + ≥1 category + valid social URL + avatar upload → profile created, redirected to list, new row shows avatar.
2. **Add Profile validation**: submit empty → see "Gender is required", "Select at least one category", "Add at least one social account".
3. **Add Profile invalid URL**: enter `https://instagram.com/has spaces` → inline "Invalid Instagram URL" appears, submit blocked.
4. **Add Profile duplicate account**: try to create with a social URL already linked to another profile → toast: `Already linked: INSTAGRAM @<user> (linked to "<name>")`.
5. **Tier select**: open Add Profile, select a tier — name shows immediately on the trigger (no UUID flash).
6. **Edit Profile dialog**: open from detail page, change avatar, change gender to empty → see required error; clear all categories → see required error.
7. **Link Account dialog**: try linking a duplicate → toast shows owning profile name; dialog stays open.
8. **Link Account validation**: enter invalid username → inline error appears, dialog stays open.
9. **Unlink last account**: profile with single account → Unlink button shows "last account", clicking does nothing. Profile with multiple accounts → unlink works, leaves at least one.
10. **Move last account**: same behavior as Unlink for the Move action.

- [ ] **Step 6: Final commit (if any cleanup needed) and push**

```bash
# If any changes during smoke testing:
git add -A
git commit -m "fix(profiles): smoke test cleanup"

# Otherwise just confirm clean state:
git status
```

---

## Notes for the executing agent

- Tasks 10 and 11 intentionally leave the FE in a temporarily-broken-build state because they change a prop signature consumed by Task 14. If you're using subagent-driven execution and the post-task review fails the build, that's expected — proceed to Task 12, 13, 14 to restore.
- All BE tests use Jest with full mocks (`jest-mock-extended` is **not** used in this codebase — see `projects.service.spec.ts` for reference patterns). Don't add new test framework dependencies.
- Keep commit messages on the existing pattern (`feat(be):`, `feat(fe):`, `fix:`). No `Co-Authored-By` lines (per user preference).
- Don't use `npm`/`yarn` — only `pnpm`.
