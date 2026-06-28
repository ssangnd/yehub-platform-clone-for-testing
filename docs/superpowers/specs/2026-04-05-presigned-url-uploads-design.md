# Presigned URL File Uploads Design

**Date:** 2026-04-05
**Status:** Approved
**Scope:** Replace backend-proxied file uploads with S3 presigned URLs for upload, download, and view

## Context

The current upload flow sends files through the backend (multer memory storage → S3 PutObjectCommand). The S3 bucket is public, so files are accessed directly by URL. This approach buffers files in server memory and offers no access control.

This design replaces that with presigned URLs: the frontend uploads directly to S3 via a presigned PUT URL and retrieves files via presigned GET URLs. The bucket becomes private.

## Constraints

- Images only (jpeg, png, gif, webp, bmp) — no change from current
- 5 MB max file size — enforced via presigned URL conditions
- No new database models — S3 keys stored in existing `avatar`/`logo` fields
- No download URL caching on the frontend

## API Endpoints

### POST /v1/uploads/presigned-url

Request a presigned upload URL. Protected by `JwtAuthGuard`.

**Request body:**
```json
{
  "contentType": "image/png",
  "fileName": "avatar.png"
}
```

**Validation:**
- `contentType` must be one of: `image/jpeg`, `image/png`, `image/gif`, `image/webp`, `image/bmp`
- `fileName` is required, non-empty string

**Behavior:**
1. Normalize filename: lowercase, strip special characters, replace spaces with hyphens
2. Generate S3 key: `uploads/images/{uuid}-{normalized_name}.{ext}`
3. Create presigned PUT URL via `getSignedUrl()` with `PutObjectCommand`
   - Expiry: 15 minutes
   - Content-Type condition set to the declared `contentType`
   - Content-Length limit: 5 MB
4. Return response

**Response:**
```json
{
  "uploadUrl": "https://s3.../uploads/images/abc-avatar.png?X-Amz-...",
  "key": "uploads/images/abc-avatar.png"
}
```

### GET /v1/uploads/presigned-url

Get a presigned download URL for viewing a file. Protected by `JwtAuthGuard`.

**Query params:**
- `key` (required) — the S3 object key

**Validation:**
- `key` must start with `uploads/` (prevents access to arbitrary S3 objects)
- Object must exist in S3 (verified via `HeadObjectCommand`)

**Behavior:**
1. Validate key prefix
2. Check object exists via `HeadObjectCommand` (404 if not found)
3. Create presigned GET URL via `getSignedUrl()` with `GetObjectCommand`
   - Expiry: 24 hours
4. Return response

**Response:**
```json
{
  "downloadUrl": "https://s3.../uploads/images/abc-avatar.png?X-Amz-..."
}
```

### POST /v1/uploads (removed)

The existing multipart upload endpoint is deleted. All related code is removed: `FileInterceptor`, multer configuration, magic byte validation.

## Backend Changes

### UploadsService

Replace existing upload logic with two methods:

**`generateUploadUrl(contentType: string, fileName: string)`**
- Validates content type against allowed list
- Normalizes filename
- Generates S3 key: `uploads/images/{uuid}-{normalized_name}.{ext}`
- Creates presigned PUT URL with `@aws-sdk/s3-request-presigner`
- Sets Content-Type condition and 5 MB Content-Length limit
- Returns `{ uploadUrl, key }`

**`generateDownloadUrl(key: string)`**
- Validates key starts with `uploads/`
- Verifies object exists via `HeadObjectCommand`
- Creates presigned GET URL with 24-hour expiry
- Returns `{ downloadUrl }`

### UploadsController

- `POST /v1/uploads/presigned-url` — DTO validated via class-validator, calls `generateUploadUrl`
- `GET /v1/uploads/presigned-url` — `key` query param, calls `generateDownloadUrl`
- Remove `POST /v1/uploads` endpoint and all multer-related code

### Dependencies

- Add: `@aws-sdk/s3-request-presigner`
- Remove: multer memory storage usage, `FileInterceptor`

## Frontend Changes

### API Layer — `src/api/uploads.ts`

Replace current `upload()` with three functions:

```typescript
requestUploadUrl(contentType: string, fileName: string): Promise<{ uploadUrl: string; key: string }>
uploadToS3(uploadUrl: string, file: File): Promise<void>
getDownloadUrl(key: string): Promise<{ downloadUrl: string }>
```

- `requestUploadUrl` calls backend `POST /v1/uploads/presigned-url` via `apiClient`
- `uploadToS3` uses native `fetch()` — PUT request to S3 with raw file body and Content-Type header. Does NOT use `apiClient` (different host, no JWT needed)
- `getDownloadUrl` calls backend `GET /v1/uploads/presigned-url?key=...` via `apiClient`

### Custom Hook — `src/hooks/use-presigned-url.ts`

```typescript
usePresignedUrl(key: string | null): { url: string | undefined; isLoading: boolean }
```

- Uses React Query to call `getDownloadUrl(key)`
- `staleTime: 0`, `gcTime: 0` — no caching, always fetch fresh URL
- Query disabled when `key` is `null`
- Returns the presigned download URL for use in `<img src>`

### Component Updates

**`ProfileCard.tsx`** (user avatar):
- Upload: replace `uploadsApi.upload(file)` with two-step flow (`requestUploadUrl` → `uploadToS3`)
- After upload, update profile with the S3 key (not URL)
- Display: use `usePresignedUrl(user.avatar)` instead of direct `<img src={avatar}>`

**`ProjectLogoPicker.tsx`** (project logo):
- Same pattern as ProfileCard
- Upload: two-step presigned flow
- Display: `usePresignedUrl(project.logo)`

## Infrastructure (Manual)

### S3 Bucket Policy
- Remove public access from the bucket
- Local dev: update docker-compose MinIO init command to remove `mc anonymous set public`
- Production: update bucket policy to deny public access

### Data Migration (Owner-handled)
- Existing `User.avatar` and `Project.logo` fields store full URLs (e.g., `http://localhost:9000/yehub/uploads/abc`)
- These need to be converted to S3 keys (e.g., `uploads/abc`)
- Old keys (`uploads/{uuid}`) remain valid — `generateDownloadUrl` accepts any key with the `uploads/` prefix

## Upload Sequence Diagram

```
Frontend                     Backend                        S3
   |                            |                            |
   |-- POST /presigned-url ---->|                            |
   |   {contentType, fileName}  |                            |
   |                            |-- getSignedUrl(PUT) ------>|
   |<-- {uploadUrl, key} -------|                            |
   |                            |                            |
   |-- PUT uploadUrl ---------------------------------------->|
   |   (raw file body)          |                            |
   |<-- 200 OK --------------------------------------------- |
   |                            |                            |
   |-- PATCH /auth/me -------->|                            |
   |   {avatar: key}           |-- UPDATE user.avatar ------>|
   |<-- updated user ----------|                            |
   |                            |                            |
   |-- GET /presigned-url ----->|                            |
   |   ?key=...                 |-- getSignedUrl(GET) ------>|
   |<-- {downloadUrl} ---------|                            |
   |                            |                            |
   |-- GET downloadUrl ---------------------------------------->|
   |<-- image bytes -------------------------------------------|
```

## Not in Scope

- File database model / metadata tracking
- File deletion endpoint
- Non-image file types
- Post-upload server-side content validation
- Download URL caching
