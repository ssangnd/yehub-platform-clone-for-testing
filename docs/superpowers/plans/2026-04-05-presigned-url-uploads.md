# Presigned URL File Uploads Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace backend-proxied file uploads with S3 presigned URLs so files upload/download directly to/from S3, with a private bucket.

**Architecture:** Backend generates presigned PUT URLs for uploads and presigned GET URLs for downloads. Frontend uploads directly to S3 via `fetch()`, stores S3 keys in existing `avatar`/`logo` fields. No new database models.

**Tech Stack:** NestJS 11, AWS SDK v3 (`@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner`), React 19, TanStack Query v5

**Spec:** `docs/superpowers/specs/2026-04-05-presigned-url-uploads-design.md`

---

## File Structure

### Backend (yehub-be)

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `src/uploads/dto/presigned-upload.dto.ts` | DTO + validation for upload URL request |
| Rewrite | `src/uploads/uploads.service.ts` | Generate presigned PUT and GET URLs |
| Rewrite | `src/uploads/uploads.controller.ts` | Two new endpoints, remove old upload |
| Rewrite | `src/uploads/uploads.service.spec.ts` | Tests for new service methods |
| Modify | `docker-compose.yml:58-63` | Remove public bucket policy from MinIO init |
| Modify | `src/config/env.validation.ts:23` | Remove `S3_PUBLIC_URL` (no longer needed) |

### Frontend (yehub-fe)

| Action | File | Responsibility |
|--------|------|----------------|
| Rewrite | `src/api/uploads.ts` | Three API functions: requestUploadUrl, uploadToS3, getDownloadUrl |
| Create | `src/hooks/use-presigned-url.ts` | Hook to fetch presigned download URL for image display |
| Modify | `src/pages/MyAccountPage/components/ProfileCard.tsx:47-57,74` | Two-step upload + presigned display |
| Modify | `src/pages/projects/components/ProjectLogoPicker.tsx:15-27,38` | Two-step upload + presigned display |

---

## Task 1: Add `@aws-sdk/s3-request-presigner` dependency

**Files:**
- Modify: `yehub-be/package.json`

- [ ] **Step 1: Install the presigner package**

```bash
cd yehub-be && pnpm add @aws-sdk/s3-request-presigner
```

- [ ] **Step 2: Verify installation**

```bash
cd yehub-be && node -e "require('@aws-sdk/s3-request-presigner')" && echo 'OK'
```

Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add yehub-be/package.json yehub-be/pnpm-lock.yaml
git commit -m "chore(be): add @aws-sdk/s3-request-presigner dependency"
```

---

## Task 2: Create presigned upload DTO

**Files:**
- Create: `yehub-be/src/uploads/dto/presigned-upload.dto.ts`

- [ ] **Step 1: Create the DTO file**

```typescript
// yehub-be/src/uploads/dto/presigned-upload.dto.ts
import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsString, MinLength } from 'class-validator';

const ALLOWED_IMAGE_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/bmp',
] as const;

export type AllowedImageType = (typeof ALLOWED_IMAGE_TYPES)[number];

export class PresignedUploadDto {
  @ApiProperty({
    example: 'image/png',
    enum: ALLOWED_IMAGE_TYPES,
    description: 'MIME type of the image to upload',
  })
  @IsIn(ALLOWED_IMAGE_TYPES, {
    message: `contentType must be one of: ${ALLOWED_IMAGE_TYPES.join(', ')}`,
  })
  contentType: AllowedImageType;

  @ApiProperty({ example: 'avatar.png' })
  @IsString()
  @MinLength(1)
  fileName: string;
}
```

- [ ] **Step 2: Verify the backend compiles**

```bash
cd yehub-be && pnpm build
```

Expected: Build succeeds with no errors.

- [ ] **Step 3: Commit**

```bash
git add yehub-be/src/uploads/dto/presigned-upload.dto.ts
git commit -m "feat(be): add PresignedUploadDto for upload URL requests"
```

---

## Task 3: Rewrite UploadsService with presigned URL methods

**Files:**
- Rewrite: `yehub-be/src/uploads/uploads.service.ts`
- Rewrite: `yehub-be/src/uploads/uploads.service.spec.ts`

- [ ] **Step 1: Write the failing tests**

Replace `yehub-be/src/uploads/uploads.service.spec.ts` entirely:

```typescript
// yehub-be/src/uploads/uploads.service.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { NotFoundException } from '@nestjs/common';
import { UploadsService } from './uploads.service';
import { S3Client, HeadObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

jest.mock('@aws-sdk/client-s3');
jest.mock('@aws-sdk/s3-request-presigner');

const mockSend = jest.fn();
(S3Client as jest.Mock).mockImplementation(() => ({ send: mockSend }));
(getSignedUrl as jest.Mock).mockResolvedValue(
  'https://s3.example.com/signed-url',
);

const mockConfig: Record<string, string> = {
  S3_ENDPOINT: 'http://localhost:9000',
  S3_REGION: 'us-east-1',
  S3_BUCKET: 'yehub',
  S3_ACCESS_KEY: 'minioadmin',
  S3_SECRET_KEY: 'minioadmin',
};

describe('UploadsService', () => {
  let service: UploadsService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UploadsService,
        {
          provide: ConfigService,
          useValue: { get: (key: string) => mockConfig[key] },
        },
      ],
    }).compile();
    service = module.get<UploadsService>(UploadsService);
  });

  describe('generateUploadUrl', () => {
    it('returns a presigned upload URL and S3 key', async () => {
      const result = await service.generateUploadUrl(
        'image/png',
        'My Avatar.PNG',
      );

      expect(result.uploadUrl).toBe('https://s3.example.com/signed-url');
      expect(result.key).toMatch(
        /^uploads\/images\/[0-9a-f-]{36}-my-avatar\.png$/,
      );
      expect(getSignedUrl).toHaveBeenCalledWith(
        expect.any(S3Client),
        expect.anything(),
        expect.objectContaining({ expiresIn: 900 }),
      );
    });

    it('normalizes filename with special characters', async () => {
      const result = await service.generateUploadUrl(
        'image/jpeg',
        'Photo (1) @home!.JPEG',
      );

      expect(result.key).toMatch(
        /^uploads\/images\/[0-9a-f-]{36}-photo-1-home\.jpeg$/,
      );
    });
  });

  describe('generateDownloadUrl', () => {
    it('returns a presigned download URL for an existing object', async () => {
      mockSend.mockResolvedValueOnce({}); // HeadObjectCommand succeeds

      const result = await service.generateDownloadUrl(
        'uploads/images/abc-avatar.png',
      );

      expect(result.downloadUrl).toBe('https://s3.example.com/signed-url');
      expect(mockSend).toHaveBeenCalledWith(expect.any(HeadObjectCommand));
      expect(getSignedUrl).toHaveBeenCalledWith(
        expect.any(S3Client),
        expect.anything(),
        expect.objectContaining({ expiresIn: 86400 }),
      );
    });

    it('throws NotFoundException when object does not exist', async () => {
      const notFound = new Error('Not Found');
      notFound.name = 'NotFound';
      mockSend.mockRejectedValueOnce(notFound);

      await expect(
        service.generateDownloadUrl('uploads/images/missing.png'),
      ).rejects.toThrow(NotFoundException);
    });

    it('rejects keys that do not start with uploads/', async () => {
      await expect(
        service.generateDownloadUrl('secrets/passwords.txt'),
      ).rejects.toThrow();
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd yehub-be && pnpm test -- uploads.service.spec
```

Expected: FAIL — `generateUploadUrl` and `generateDownloadUrl` are not defined.

- [ ] **Step 3: Rewrite the service implementation**

Replace `yehub-be/src/uploads/uploads.service.ts` entirely:

```typescript
// yehub-be/src/uploads/uploads.service.ts
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { extname } from 'path';
import { ConfigService } from '@nestjs/config';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const UPLOAD_EXPIRY = 900; // 15 minutes
const DOWNLOAD_EXPIRY = 86400; // 24 hours
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB

@Injectable()
export class UploadsService {
  private readonly s3: S3Client;
  private readonly bucket: string;

  constructor(private readonly config: ConfigService) {
    this.bucket = this.config.get<string>('S3_BUCKET')!;
    const endpoint = this.config.get<string>('S3_ENDPOINT');
    this.s3 = new S3Client({
      region: this.config.get<string>('S3_REGION') ?? 'us-east-1',
      credentials: {
        accessKeyId: this.config.get<string>('S3_ACCESS_KEY')!,
        secretAccessKey: this.config.get<string>('S3_SECRET_KEY')!,
      },
      ...(endpoint && { endpoint, forcePathStyle: true }),
    });
  }

  async generateUploadUrl(
    contentType: string,
    fileName: string,
  ): Promise<{ uploadUrl: string; key: string }> {
    const normalized = this.normalizeFileName(fileName);
    const ext = extname(normalized).slice(1) || 'bin';
    const baseName = normalized.replace(/\.[^.]+$/, '');
    const key = `uploads/images/${randomUUID()}-${baseName}.${ext}`;

    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ContentType: contentType,
      ContentLength: MAX_FILE_SIZE,
    });

    const uploadUrl = await getSignedUrl(this.s3, command, {
      expiresIn: UPLOAD_EXPIRY,
    });

    return { uploadUrl, key };
  }

  async generateDownloadUrl(
    key: string,
  ): Promise<{ downloadUrl: string }> {
    if (!key.startsWith('uploads/')) {
      throw new BadRequestException('Invalid file key');
    }

    try {
      await this.s3.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: key }),
      );
    } catch {
      throw new NotFoundException('File not found');
    }

    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });

    const downloadUrl = await getSignedUrl(this.s3, command, {
      expiresIn: DOWNLOAD_EXPIRY,
    });

    return { downloadUrl };
  }

  private normalizeFileName(fileName: string): string {
    return fileName
      .toLowerCase()
      .replace(/[^a-z0-9.\-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd yehub-be && pnpm test -- uploads.service.spec
```

Expected: All 5 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add yehub-be/src/uploads/uploads.service.ts yehub-be/src/uploads/uploads.service.spec.ts
git commit -m "feat(be): rewrite UploadsService with presigned URL generation"
```

---

## Task 4: Rewrite UploadsController with presigned endpoints

**Files:**
- Rewrite: `yehub-be/src/uploads/uploads.controller.ts`

- [ ] **Step 1: Rewrite the controller**

Replace `yehub-be/src/uploads/uploads.controller.ts` entirely:

```typescript
// yehub-be/src/uploads/uploads.controller.ts
import {
  Controller,
  Post,
  Get,
  Body,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UploadsService } from './uploads.service';
import { PresignedUploadDto } from './dto/presigned-upload.dto';

@ApiTags('Uploads')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('uploads')
export class UploadsController {
  constructor(private readonly uploadsService: UploadsService) {}

  @Post('presigned-url')
  @ApiOperation({ summary: 'Get a presigned URL to upload an image to S3' })
  async getUploadUrl(@Body() dto: PresignedUploadDto) {
    return this.uploadsService.generateUploadUrl(dto.contentType, dto.fileName);
  }

  @Get('presigned-url')
  @ApiOperation({ summary: 'Get a presigned URL to download/view an image from S3' })
  @ApiQuery({ name: 'key', required: true, description: 'S3 object key' })
  async getDownloadUrl(@Query('key') key: string) {
    return this.uploadsService.generateDownloadUrl(key);
  }
}
```

- [ ] **Step 2: Verify the backend compiles**

```bash
cd yehub-be && pnpm build
```

Expected: Build succeeds. No references to multer, FileInterceptor, or magic bytes remain.

- [ ] **Step 3: Run all tests**

```bash
cd yehub-be && pnpm test -- uploads
```

Expected: All tests PASS.

- [ ] **Step 4: Commit**

```bash
git add yehub-be/src/uploads/uploads.controller.ts
git commit -m "feat(be): rewrite UploadsController with presigned URL endpoints"
```

---

## Task 5: Remove `S3_PUBLIC_URL` from env validation

**Files:**
- Modify: `yehub-be/src/config/env.validation.ts:23`
- Modify: `yehub-be/.env`
- Modify: `yehub-be/.env.example` (if exists)

- [ ] **Step 1: Remove `S3_PUBLIC_URL` from the Joi validation schema**

In `yehub-be/src/config/env.validation.ts`, delete line 23:

```typescript
  S3_PUBLIC_URL: Joi.string().required(),
```

- [ ] **Step 2: Remove `S3_PUBLIC_URL` from `.env` and `.env.example`**

Remove the `S3_PUBLIC_URL=...` line from both files (if they exist).

- [ ] **Step 3: Remove `S3_PUBLIC_URL` from docker-compose.yml**

In `docker-compose.yml`, find the backend service environment and remove:

```yaml
      S3_PUBLIC_URL: "http://localhost:9000/yehub"
```

- [ ] **Step 4: Verify the backend still compiles and tests pass**

```bash
cd yehub-be && pnpm build && pnpm test -- uploads
```

Expected: Build succeeds, tests pass.

- [ ] **Step 5: Commit**

```bash
git add yehub-be/src/config/env.validation.ts yehub-be/.env docker-compose.yml
git commit -m "chore(be): remove S3_PUBLIC_URL env var (no longer needed)"
```

---

## Task 6: Make MinIO bucket private in docker-compose

**Files:**
- Modify: `docker-compose.yml:58-63`

- [ ] **Step 1: Update the MinIO init entrypoint**

In `docker-compose.yml`, change the `minio-init` entrypoint from:

```yaml
    # Dev only: bucket is set to public for easy local testing
    entrypoint: >
      /bin/sh -c "
        mc alias set local http://minio:9000 minioadmin minioadmin &&
        mc mb --ignore-existing local/yehub &&
        mc anonymous set public local/yehub
      "
```

To:

```yaml
    entrypoint: >
      /bin/sh -c "
        mc alias set local http://minio:9000 minioadmin minioadmin &&
        mc mb --ignore-existing local/yehub &&
        mc anonymous set none local/yehub
      "
```

This changes the bucket from public to private. The `mc anonymous set none` command removes any existing public policy.

- [ ] **Step 2: Recreate the MinIO init container to apply**

```bash
docker compose up -d minio-init
```

- [ ] **Step 3: Commit**

```bash
git add docker-compose.yml
git commit -m "chore: make MinIO bucket private for presigned URL access"
```

---

## Task 7: Rewrite frontend uploads API layer

**Files:**
- Rewrite: `yehub-fe/src/api/uploads.ts`

- [ ] **Step 1: Rewrite the uploads API file**

Replace `yehub-fe/src/api/uploads.ts` entirely:

```typescript
// yehub-fe/src/api/uploads.ts
import { apiClient } from './client'

interface PresignedUploadResponse {
  uploadUrl: string
  key: string
}

interface PresignedDownloadResponse {
  downloadUrl: string
}

export const uploadsApi = {
  requestUploadUrl: async (
    contentType: string,
    fileName: string,
  ): Promise<PresignedUploadResponse> => {
    const r = await apiClient.post<PresignedUploadResponse>('/uploads/presigned-url', {
      contentType,
      fileName,
    })
    return r.data
  },

  uploadToS3: async (uploadUrl: string, file: File): Promise<void> => {
    const res = await fetch(uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': file.type },
      body: file,
    })
    if (!res.ok) throw new Error(`S3 upload failed: ${res.status}`)
  },

  getDownloadUrl: async (key: string): Promise<string> => {
    const r = await apiClient.get<PresignedDownloadResponse>('/uploads/presigned-url', {
      params: { key },
    })
    return r.data.downloadUrl
  },
}
```

- [ ] **Step 2: Verify the frontend compiles**

```bash
cd yehub-fe && pnpm build
```

Expected: Build fails — `ProfileCard.tsx` and `ProjectLogoPicker.tsx` still reference the old `uploadsApi.upload()`. This is expected and will be fixed in Tasks 9 and 10.

- [ ] **Step 3: Commit**

```bash
git add yehub-fe/src/api/uploads.ts
git commit -m "feat(fe): rewrite uploads API with presigned URL functions"
```

---

## Task 8: Create `usePresignedUrl` hook

**Files:**
- Create: `yehub-fe/src/hooks/use-presigned-url.ts`

- [ ] **Step 1: Create the hook file**

```typescript
// yehub-fe/src/hooks/use-presigned-url.ts
import { useQuery } from '@tanstack/react-query'
import { uploadsApi } from '@/api/uploads'

export function usePresignedUrl(key: string | null | undefined) {
  const { data: url, isLoading } = useQuery({
    queryKey: ['presigned-url', key],
    queryFn: () => uploadsApi.getDownloadUrl(key!),
    enabled: !!key,
    staleTime: 0,
    gcTime: 0,
  })

  return { url, isLoading }
}
```

- [ ] **Step 2: Verify the frontend compiles (this file only)**

```bash
cd yehub-fe && npx tsc --noEmit src/hooks/use-presigned-url.ts 2>&1 || echo "Full build check deferred to Task 10"
```

- [ ] **Step 3: Commit**

```bash
git add yehub-fe/src/hooks/use-presigned-url.ts
git commit -m "feat(fe): add usePresignedUrl hook for image display"
```

---

## Task 9: Update ProfileCard to use presigned URLs

**Files:**
- Modify: `yehub-fe/src/pages/MyAccountPage/components/ProfileCard.tsx`

- [ ] **Step 1: Update imports**

In `ProfileCard.tsx`, replace line 8:

```typescript
import { uploadsApi } from '@/api/uploads'
```

With:

```typescript
import { uploadsApi } from '@/api/uploads'
import { usePresignedUrl } from '@/hooks/use-presigned-url'
```

- [ ] **Step 2: Add the presigned URL hook call**

After line 26 (`const fileInputRef = useRef<HTMLInputElement>(null)`), add:

```typescript
  const { url: avatarUrl } = usePresignedUrl(user?.avatar)
```

- [ ] **Step 3: Update the upload mutation**

Replace lines 47-57 (the `uploadAvatarMutation`):

```typescript
  const uploadAvatarMutation = useMutation({
    mutationFn: async (file: File) => {
      const url = await uploadsApi.upload(file)
      return authApi.updateProfile({ avatar: url })
    },
    onSuccess: (data) => {
      setUser(data)
      toast.success('Avatar updated')
    },
    onError: () => toast.error('Failed to upload avatar'),
  })
```

With:

```typescript
  const uploadAvatarMutation = useMutation({
    mutationFn: async (file: File) => {
      const { uploadUrl, key } = await uploadsApi.requestUploadUrl(file.type, file.name)
      await uploadsApi.uploadToS3(uploadUrl, file)
      return authApi.updateProfile({ avatar: key })
    },
    onSuccess: (data) => {
      setUser(data)
      toast.success('Avatar updated')
    },
    onError: () => toast.error('Failed to upload avatar'),
  })
```

- [ ] **Step 4: Update the AvatarImage src**

Replace line 74:

```tsx
            <AvatarImage src={user?.avatar} alt={user?.name} />
```

With:

```tsx
            <AvatarImage src={avatarUrl} alt={user?.name} />
```

- [ ] **Step 5: Remove unused `axios` import**

Delete line 6 (`import axios from 'axios'`) only if `axios` is no longer used elsewhere in the file. Check: it is still used on line 93 (`axios.isAxiosError`), so **keep it**.

- [ ] **Step 6: Commit**

```bash
git add yehub-fe/src/pages/MyAccountPage/components/ProfileCard.tsx
git commit -m "feat(fe): update ProfileCard to use presigned URLs"
```

---

## Task 10: Update ProjectLogoPicker to use presigned URLs

**Files:**
- Modify: `yehub-fe/src/pages/projects/components/ProjectLogoPicker.tsx`

- [ ] **Step 1: Update imports**

In `ProjectLogoPicker.tsx`, add after line 4:

```typescript
import { usePresignedUrl } from '@/hooks/use-presigned-url'
```

- [ ] **Step 2: Update the prop type and add hook**

The `value` prop currently holds a full URL. It will now hold an S3 key. The prop type (`string`) remains the same, but rename for clarity. Replace lines 6-9:

```typescript
interface ProjectLogoPickerProps {
  value: string
  onChange: (url: string) => void
}
```

With:

```typescript
interface ProjectLogoPickerProps {
  value: string
  onChange: (key: string) => void
}
```

Inside the component, after line 13 (`const [uploading, setUploading] = useState(false)`), add:

```typescript
  const { url: logoUrl } = usePresignedUrl(value || null)
```

- [ ] **Step 3: Update the upload handler**

Replace lines 15-27 (the `handleFileChange` function):

```typescript
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const url = await uploadsApi.upload(file)
      onChange(url)
    } catch {
      toast.error('Failed to upload logo')
    } finally {
      setUploading(false)
    }
  }
```

With:

```typescript
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const { uploadUrl, key } = await uploadsApi.requestUploadUrl(file.type, file.name)
      await uploadsApi.uploadToS3(uploadUrl, file)
      onChange(key)
    } catch {
      toast.error('Failed to upload logo')
    } finally {
      setUploading(false)
    }
  }
```

- [ ] **Step 4: Update the image src**

Replace line 38:

```tsx
            <img src={value} alt="Logo" className="size-full object-cover" />
```

With:

```tsx
            <img src={logoUrl} alt="Logo" className="size-full object-cover" />
```

- [ ] **Step 5: Verify the full frontend builds**

```bash
cd yehub-fe && pnpm build
```

Expected: Build succeeds with no errors.

- [ ] **Step 6: Run frontend lint**

```bash
cd yehub-fe && pnpm lint
```

Expected: No lint errors.

- [ ] **Step 7: Commit**

```bash
git add yehub-fe/src/pages/projects/components/ProjectLogoPicker.tsx
git commit -m "feat(fe): update ProjectLogoPicker to use presigned URLs"
```

---

## Task 11: Run full backend test suite and lint

**Files:** None (verification only)

- [ ] **Step 1: Run all backend tests**

```bash
cd yehub-be && pnpm test
```

Expected: All tests pass.

- [ ] **Step 2: Run backend lint**

```bash
cd yehub-be && pnpm lint
```

Expected: No lint errors.

- [ ] **Step 3: Fix any issues found, then commit if fixes were needed**

```bash
git add -A && git commit -m "fix: address lint/test issues from presigned URL migration"
```

Only commit if there were actual fixes. Skip if everything passed cleanly.
