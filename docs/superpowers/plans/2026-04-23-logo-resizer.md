# Logo / Avatar Crop & Resize Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a crop-and-resize dialog for every logo/avatar upload (4 surfaces) in `yehub-fe`, built on one reusable hook + dialog.

**Architecture:** `ImageCropDialog` (pure UI, cropper + controls + canvas export) + `useImageCropUpload` (orchestration — file pick, validation, S3 upload) + `MediaPickerBox` (dashed-box shell replacing two near-duplicate picker components). Four call sites migrate; two legacy picker files are deleted.

**Tech Stack:** React 19, TypeScript, Vite, Tailwind v4, shadcn/ui (dialog, slider, button), `react-easy-crop` (new dep), TanStack Query v5 (existing), Zod + RHF (existing).

**Testing note:** `yehub-fe` has no test runner (CI runs `lint` + `build` only; no `vitest`/`jest` in this package). Every task ends with `pnpm lint` + `pnpm build` gates and, for call-site migrations, an explicit manual smoke test in `pnpm dev`. TDD steps are omitted intentionally — adding a test runner is out of scope per the spec.

**Spec:** `docs/superpowers/specs/2026-04-23-logo-resizer-design.md`

---

## Task 1: Add `react-easy-crop` and `shadcn` slider

**Files:**
- Modify: `yehub-fe/package.json` (via pnpm)
- Create: `yehub-fe/src/components/ui/slider.tsx` (via shadcn CLI — do not hand-author)

- [ ] **Step 1: Install `react-easy-crop` in `yehub-fe`**

Run:
```bash
cd yehub-fe && pnpm add react-easy-crop
```

Expected: `package.json` gains `"react-easy-crop": "^x.y.z"` under `dependencies`. `pnpm-lock.yaml` updates.

- [ ] **Step 2: Add the shadcn `slider` component**

Run:
```bash
cd yehub-fe && pnpm dlx shadcn@latest add slider
```

Expected: Creates `yehub-fe/src/components/ui/slider.tsx`. It may also add `@radix-ui/react-slider` (or the `@base-ui/react` equivalent already used by this repo) to `package.json`. Accept whatever the CLI adds — it's the supported path per `yehub-fe/CLAUDE.md` ("Add new shadcn components via CLI: `pnpm dlx shadcn@latest add <component>` — do not copy files manually").

- [ ] **Step 3: Lint + build**

Run:
```bash
cd yehub-fe && pnpm lint && pnpm build
```

Expected: both pass.

- [ ] **Step 4: Commit**

```bash
git add yehub-fe/package.json yehub-fe/pnpm-lock.yaml yehub-fe/src/components/ui/slider.tsx
git commit -m "feat(fe): add react-easy-crop dep and shadcn slider"
```

---

## Task 2: Extract upload constants to `src/lib/constants/uploads.ts`

Currently `ALLOWED_IMAGE_TYPES` and `MAX_LOGO_BYTES` live only in `src/pages/admin/SettingsPage/use-appearance-tab.ts`. Move them to a cross-feature constants module so the new hook can import them too.

**Files:**
- Create: `yehub-fe/src/lib/constants/uploads.ts`
- Modify: `yehub-fe/src/pages/admin/SettingsPage/use-appearance-tab.ts`

- [ ] **Step 1: Create `uploads.ts` with the two shared constants**

Create `yehub-fe/src/lib/constants/uploads.ts`:

```ts
export const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/bmp'] as const

export const ALLOWED_IMAGE_ACCEPT_ATTR = '.jpg,.jpeg,.png,.gif,.webp,.bmp'

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024
```

- [ ] **Step 2: Update `use-appearance-tab.ts` to import from the new module**

In `yehub-fe/src/pages/admin/SettingsPage/use-appearance-tab.ts`:

- Remove the two local `const` declarations (`MAX_LOGO_BYTES`, `ALLOWED_IMAGE_TYPES`) at the top.
- Remove the `export { MAX_LOGO_BYTES, ALLOWED_IMAGE_TYPES }` at the bottom.
- Add import: `import { ALLOWED_IMAGE_TYPES, MAX_IMAGE_BYTES } from '@/lib/constants/uploads'`
- Replace the `MAX_LOGO_BYTES` reference inside the `uploadLogoMutation` validation with `MAX_IMAGE_BYTES`.
- Update the returned object: change `maxBytes: MAX_LOGO_BYTES` to `maxBytes: MAX_IMAGE_BYTES`.

Full replaced file contents:

```ts
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { systemSettingsApi } from '@/api/system-settings'
import { uploadsApi } from '@/api/uploads'
import { queryKeys } from '@/lib/constants/query-keys'
import { ALLOWED_IMAGE_TYPES, MAX_IMAGE_BYTES } from '@/lib/constants/uploads'
import { showApiError } from '@/lib/errors'
import { useSystemLogo } from '@/hooks/use-system-logo'

export function useAppearanceTab() {
  const queryClient = useQueryClient()
  const { url, isCustom, isLoading } = useSystemLogo()

  const uploadLogoMutation = useMutation({
    mutationFn: async (file: File) => {
      if (!ALLOWED_IMAGE_TYPES.includes(file.type as (typeof ALLOWED_IMAGE_TYPES)[number])) {
        throw new Error('Unsupported image type. Use JPEG, PNG, GIF, WebP, or BMP.')
      }
      if (file.size > MAX_IMAGE_BYTES) {
        throw new Error('Logo must be 5 MB or smaller.')
      }
      const { uploadUrl, key } = await uploadsApi.requestUploadUrl(file.type, file.name)
      await uploadsApi.uploadToS3(uploadUrl, file)
      return systemSettingsApi.upsert('logo', { type: 'TEXT', value_text: key })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.systemSettings.public })
      toast.success('Logo updated')
    },
    onError: (error) => {
      if (error instanceof Error && !('response' in error)) {
        toast.error(error.message)
        return
      }
      showApiError(error, { fallback: 'Failed to upload logo' })
    },
  })

  const resetLogoMutation = useMutation({
    mutationFn: () => systemSettingsApi.upsert('logo', { type: 'TEXT', value_text: null }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.systemSettings.public })
      toast.success('Logo reset to default')
    },
    onError: (error) => showApiError(error, { fallback: 'Failed to reset logo' }),
  })

  return {
    logoUrl: url,
    hasCustomLogo: isCustom,
    isLoading,
    maxBytes: MAX_IMAGE_BYTES,
    uploadLogo: (file: File) => uploadLogoMutation.mutate(file),
    resetLogo: () => resetLogoMutation.mutate(),
    isUploading: uploadLogoMutation.isPending,
    isResetting: resetLogoMutation.isPending,
  }
}
```

Note: Task 10 replaces this hook's body entirely (to use `useImageCropUpload`). This intermediate state just extracts constants and must still compile.

- [ ] **Step 3: Verify `AppearanceTab.tsx` still imports cleanly**

`AppearanceTab.tsx` currently does `import { useAppearanceTab, ALLOWED_IMAGE_TYPES } from '../use-appearance-tab'`. That named export no longer exists. Update its import:

```ts
import { useAppearanceTab } from '../use-appearance-tab'
import { ALLOWED_IMAGE_ACCEPT_ATTR } from '@/lib/constants/uploads'
```

Then change the `ACCEPT_ATTRIBUTE` line from:
```ts
const ACCEPT_ATTRIBUTE = ALLOWED_IMAGE_TYPES.join(',')
```
to:
```ts
const ACCEPT_ATTRIBUTE = ALLOWED_IMAGE_ACCEPT_ATTR
```

- [ ] **Step 4: Lint + build**

Run:
```bash
cd yehub-fe && pnpm lint && pnpm build
```

Expected: both pass. If `ALLOWED_IMAGE_TYPES.includes(file.type as …)` lint-complains about the `as` cast, use `(ALLOWED_IMAGE_TYPES as readonly string[]).includes(file.type)` instead — the runtime semantics are identical.

- [ ] **Step 5: Commit**

```bash
git add yehub-fe/src/lib/constants/uploads.ts \
        yehub-fe/src/pages/admin/SettingsPage/use-appearance-tab.ts \
        yehub-fe/src/pages/admin/SettingsPage/components/AppearanceTab.tsx
git commit -m "refactor(fe): extract upload constants to lib/constants/uploads"
```

---

## Task 3: Add the canvas crop utility

Pure function that takes a source `File`, the `croppedAreaPixels` from `react-easy-crop`, a rotation (multiple of 90°), a max output size, an output MIME, and a quality — returns a `Blob` or throws.

**Files:**
- Create: `yehub-fe/src/lib/image-crop.ts`

- [ ] **Step 1: Create `image-crop.ts`**

```ts
export type PixelCrop = { x: number; y: number; width: number; height: number }

export type CropImageOptions = {
  file: File
  pixelCrop: PixelCrop
  rotation: number // degrees, multiple of 90
  maxSize: number // longest side of output, in px
  outputMime: 'image/png' | 'image/jpeg'
  quality: number // 0..1, ignored for PNG
}

export async function cropImageToBlob({
  file,
  pixelCrop,
  rotation,
  maxSize,
  outputMime,
  quality,
}: CropImageOptions): Promise<Blob> {
  const objectUrl = URL.createObjectURL(file)
  try {
    const image = await loadImage(objectUrl)
    const rotated = drawRotated(image, rotation)
    const cropped = extractCrop(rotated, pixelCrop, maxSize)
    return await canvasToBlob(cropped, outputMime, quality)
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}

export function pickOutputMime(inputType: string): 'image/png' | 'image/jpeg' {
  return inputType === 'image/png' ? 'image/png' : 'image/jpeg'
}

export function swapExtension(filename: string, mime: 'image/png' | 'image/jpeg'): string {
  const ext = mime === 'image/png' ? 'png' : 'jpg'
  const dot = filename.lastIndexOf('.')
  const base = dot > 0 ? filename.slice(0, dot) : filename
  return `${base}.${ext}`
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Failed to load image'))
    img.src = src
  })
}

function drawRotated(image: HTMLImageElement, rotation: number): HTMLCanvasElement {
  const rotRad = (rotation * Math.PI) / 180
  const { width: boxW, height: boxH } = rotatedBox(image.width, image.height, rotation)
  const canvas = document.createElement('canvas')
  canvas.width = boxW
  canvas.height = boxH
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas 2D context unavailable')
  ctx.translate(boxW / 2, boxH / 2)
  ctx.rotate(rotRad)
  ctx.drawImage(image, -image.width / 2, -image.height / 2)
  return canvas
}

function rotatedBox(width: number, height: number, rotation: number): { width: number; height: number } {
  const rotRad = (rotation * Math.PI) / 180
  return {
    width: Math.abs(Math.cos(rotRad) * width) + Math.abs(Math.sin(rotRad) * height),
    height: Math.abs(Math.sin(rotRad) * width) + Math.abs(Math.cos(rotRad) * height),
  }
}

function extractCrop(source: HTMLCanvasElement, pixelCrop: PixelCrop, maxSize: number): HTMLCanvasElement {
  const longSide = Math.max(pixelCrop.width, pixelCrop.height)
  const scale = longSide > maxSize ? maxSize / longSide : 1
  const outW = Math.round(pixelCrop.width * scale)
  const outH = Math.round(pixelCrop.height * scale)
  const canvas = document.createElement('canvas')
  canvas.width = outW
  canvas.height = outH
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas 2D context unavailable')
  ctx.drawImage(source, pixelCrop.x, pixelCrop.y, pixelCrop.width, pixelCrop.height, 0, 0, outW, outH)
  return canvas
}

function canvasToBlob(canvas: HTMLCanvasElement, mime: string, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Failed to encode image'))),
      mime,
      quality,
    )
  })
}
```

- [ ] **Step 2: Lint + build**

Run:
```bash
cd yehub-fe && pnpm lint && pnpm build
```

Expected: both pass.

- [ ] **Step 3: Commit**

```bash
git add yehub-fe/src/lib/image-crop.ts
git commit -m "feat(fe): add image crop/resize canvas utility"
```

---

## Task 4: Build `ImageCropDialog`

**Files:**
- Create: `yehub-fe/src/components/common/ImageCropDialog.tsx`

- [ ] **Step 1: Create the dialog**

```tsx
import { useEffect, useMemo, useState } from 'react'
import Cropper, { type Area } from 'react-easy-crop'
import { RotateCcwIcon, RotateCwIcon } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Slider } from '@/components/ui/slider'
import { cropImageToBlob, pickOutputMime, swapExtension } from '@/lib/image-crop'

export type ImageCropResult = {
  blob: Blob
  filename: string
  contentType: 'image/png' | 'image/jpeg'
}

type ImageCropDialogProps = {
  open: boolean
  file: File | null
  aspect: number | 'free'
  maxSize: number
  title?: string
  isUploading?: boolean
  onCancel: () => void
  onConfirm: (result: ImageCropResult) => void
}

export function ImageCropDialog({
  open,
  file,
  aspect,
  maxSize,
  title = 'Crop image',
  isUploading = false,
  onCancel,
  onConfirm,
}: ImageCropDialogProps) {
  const [crop, setCrop] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [rotation, setRotation] = useState(0)
  const [pixelCrop, setPixelCrop] = useState<Area | null>(null)
  const [processing, setProcessing] = useState(false)

  const imageSrc = useMemo(() => (file ? URL.createObjectURL(file) : null), [file])

  useEffect(() => {
    return () => {
      if (imageSrc) URL.revokeObjectURL(imageSrc)
    }
  }, [imageSrc])

  useEffect(() => {
    if (open && file) {
      setCrop({ x: 0, y: 0 })
      setZoom(1)
      setRotation(0)
      setPixelCrop(null)
    }
  }, [open, file])

  const handleSave = async () => {
    if (!file || !pixelCrop) return
    setProcessing(true)
    try {
      const outputMime = pickOutputMime(file.type)
      const blob = await cropImageToBlob({
        file,
        pixelCrop,
        rotation,
        maxSize,
        outputMime,
        quality: 0.9,
      })
      const filename = swapExtension(file.name, outputMime)
      onConfirm({ blob, filename, contentType: outputMime })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to process image')
    } finally {
      setProcessing(false)
    }
  }

  const cropperAspect = aspect === 'free' ? undefined : aspect
  const busy = processing || isUploading

  return (
    <Dialog open={open} onOpenChange={(next) => !next && !busy && onCancel()}>
      <DialogContent className="sm:max-w-xl p-0 gap-0">
        <DialogHeader className="p-4">
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        <div className="relative mx-4 h-80 overflow-hidden rounded-md bg-black/80">
          {imageSrc && (
            <Cropper
              image={imageSrc}
              crop={crop}
              zoom={zoom}
              rotation={rotation}
              aspect={cropperAspect}
              onCropChange={setCrop}
              onZoomChange={setZoom}
              onRotationChange={setRotation}
              onCropComplete={(_, areaPixels) => setPixelCrop(areaPixels)}
              restrictPosition={false}
            />
          )}
        </div>

        <div className="flex items-center gap-4 p-4">
          <span className="text-sm font-medium w-12">Zoom</span>
          <Slider
            value={[zoom]}
            min={1}
            max={4}
            step={0.01}
            onValueChange={(v) => setZoom(v[0] ?? 1)}
            className="flex-1"
          />
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={() => setRotation((r) => (r - 90 + 360) % 360)}
            aria-label="Rotate left"
            disabled={busy}
          >
            <RotateCcwIcon className="size-4" />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={() => setRotation((r) => (r + 90) % 360)}
            aria-label="Rotate right"
            disabled={busy}
          >
            <RotateCwIcon className="size-4" />
          </Button>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button type="button" onClick={handleSave} disabled={busy || !pixelCrop}>
            {busy ? 'Saving…' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
```

Notes for the implementer:
- `react-easy-crop`'s `Cropper` is positioned absolutely inside a relatively-positioned parent with a fixed height. The `h-80` parent is that parent.
- `aspect={undefined}` on `<Cropper>` means free-form crop rectangle.
- The dialog captures its own `processing` state separately from the consumer's `isUploading`, because canvas encoding is async.
- Closing via ESC / overlay click is blocked during `busy` to avoid orphaning the crop.

- [ ] **Step 2: Lint + build**

Run:
```bash
cd yehub-fe && pnpm lint && pnpm build
```

Expected: both pass. If the `Slider` import fails, re-check that Task 1 added the component and that the named export is `Slider` (open `yehub-fe/src/components/ui/slider.tsx` — shadcn generates `export { Slider }`).

- [ ] **Step 3: Commit**

```bash
git add yehub-fe/src/components/common/ImageCropDialog.tsx
git commit -m "feat(fe): add ImageCropDialog with zoom and 90° rotation"
```

---

## Task 5: Build `useImageCropUpload` hook

**Files:**
- Create: `yehub-fe/src/hooks/use-image-crop-upload.ts`

- [ ] **Step 1: Create the hook**

```tsx
import { useCallback, useEffect, useRef, useState, type ReactElement } from 'react'
import { toast } from 'sonner'
import { uploadsApi } from '@/api/uploads'
import { showApiError } from '@/lib/errors'
import { ALLOWED_IMAGE_ACCEPT_ATTR, ALLOWED_IMAGE_TYPES, MAX_IMAGE_BYTES } from '@/lib/constants/uploads'
import { ImageCropDialog, type ImageCropResult } from '@/components/common/ImageCropDialog'

type UseImageCropUploadOptions = {
  aspect: number | 'free'
  maxSize?: number
  accept?: string
  maxBytes?: number
  title?: string
  onUploaded: (key: string) => void
}

type UseImageCropUploadReturn = {
  openPicker: () => void
  hiddenInput: ReactElement
  dialog: ReactElement
  isUploading: boolean
}

export function useImageCropUpload(options: UseImageCropUploadOptions): UseImageCropUploadReturn {
  const {
    aspect,
    maxSize = aspect === 1 ? 512 : 1024,
    accept = ALLOWED_IMAGE_ACCEPT_ATTR,
    maxBytes = MAX_IMAGE_BYTES,
    title,
    onUploaded,
  } = options

  const inputRef = useRef<HTMLInputElement>(null)
  const mountedRef = useRef(true)
  const [pickedFile, setPickedFile] = useState<File | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [isUploading, setIsUploading] = useState(false)

  useEffect(() => {
    return () => {
      mountedRef.current = false
    }
  }, [])

  const resetInput = () => {
    if (inputRef.current) inputRef.current.value = ''
  }

  const openPicker = useCallback(() => {
    inputRef.current?.click()
  }, [])

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!(ALLOWED_IMAGE_TYPES as readonly string[]).includes(file.type)) {
      toast.error('Unsupported image type. Use JPEG, PNG, GIF, WebP, or BMP.')
      resetInput()
      return
    }
    if (file.size > maxBytes) {
      toast.error('File size must be under 5 MB')
      resetInput()
      return
    }
    setPickedFile(file)
    setDialogOpen(true)
  }

  const handleCancel = () => {
    setDialogOpen(false)
    setPickedFile(null)
    resetInput()
  }

  const handleConfirm = async (result: ImageCropResult) => {
    setIsUploading(true)
    try {
      const { uploadUrl, key } = await uploadsApi.requestUploadUrl(result.contentType, result.filename)
      const res = await fetch(uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': result.contentType },
        body: result.blob,
      })
      if (!res.ok) throw new Error(`S3 upload failed: ${res.status}`)
      if (!mountedRef.current) return
      onUploaded(key)
      setDialogOpen(false)
      setPickedFile(null)
      resetInput()
    } catch (err) {
      if (!mountedRef.current) return
      showApiError(err, { fallback: 'Failed to upload image' })
    } finally {
      if (mountedRef.current) setIsUploading(false)
    }
  }

  const hiddenInput = (
    <input ref={inputRef} type="file" accept={accept} className="hidden" onChange={handleFileChange} />
  )

  const dialog = (
    <ImageCropDialog
      open={dialogOpen}
      file={pickedFile}
      aspect={aspect}
      maxSize={maxSize}
      title={title}
      isUploading={isUploading}
      onCancel={handleCancel}
      onConfirm={handleConfirm}
    />
  )

  return { openPicker, hiddenInput, dialog, isUploading }
}
```

Notes:
- `uploadsApi.uploadToS3` accepts a `File` parameter. We need to `PUT` a `Blob`, so the hook calls `fetch` directly with the `Blob` body rather than using `uploadToS3`. (Adding a `Blob` overload to `uploadsApi` is a reasonable alternative but expands the API's surface — leaving `uploadsApi.uploadToS3` untouched.)
- `mountedRef` prevents state updates after unmount.
- The hook intentionally does NOT memoize `hiddenInput`/`dialog` — they're cheap wrappers; re-rendering on every state change is correct.

- [ ] **Step 2: Lint + build**

Run:
```bash
cd yehub-fe && pnpm lint && pnpm build
```

Expected: both pass.

- [ ] **Step 3: Commit**

```bash
git add yehub-fe/src/hooks/use-image-crop-upload.ts
git commit -m "feat(fe): add useImageCropUpload orchestration hook"
```

---

## Task 6: Build `MediaPickerBox`

Consolidates `ProjectLogoPicker` and `ProfileAvatarPicker` into one component. Does not yet delete them — deletions happen when the last consumer migrates (Tasks 7–8).

**Files:**
- Create: `yehub-fe/src/components/common/MediaPickerBox.tsx`

- [ ] **Step 1: Create the component**

```tsx
import { Upload } from 'lucide-react'
import { usePresignedUrl } from '@/hooks/use-presigned-url'
import { useImageCropUpload } from '@/hooks/use-image-crop-upload'
import { cn } from '@/lib/utils'

type MediaPickerBoxProps = {
  value: string
  onChange: (key: string) => void
  shape: 'square' | 'circle'
  label: string
}

export function MediaPickerBox({ value, onChange, shape, label }: MediaPickerBoxProps) {
  const { url: previewUrl } = usePresignedUrl(value || null)
  const { openPicker, hiddenInput, dialog, isUploading } = useImageCropUpload({
    aspect: 1,
    onUploaded: onChange,
  })

  const roundedClass = shape === 'circle' ? 'rounded-full' : 'rounded-lg'

  return (
    <div className="space-y-2">
      <span className="text-sm font-medium">{label}</span>
      <div
        className={cn(
          'group/media relative size-24 border-2 border-dashed bg-muted overflow-hidden flex items-center justify-center cursor-pointer hover:border-primary/50 transition-colors',
          roundedClass,
        )}
        onClick={() => !value && openPicker()}
      >
        {value ? (
          <>
            <img src={previewUrl} alt={label} className="size-full object-cover" />
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-black/60 opacity-0 group-hover/media:opacity-100 transition-opacity">
              <button
                type="button"
                className="text-xs font-medium text-white hover:underline cursor-pointer"
                onClick={(e) => {
                  e.stopPropagation()
                  openPicker()
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
                }}
              >
                Remove
              </button>
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center gap-1">
            {isUploading ? (
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
      {hiddenInput}
      {dialog}
    </div>
  )
}
```

- [ ] **Step 2: Lint + build**

Run:
```bash
cd yehub-fe && pnpm lint && pnpm build
```

Expected: both pass.

- [ ] **Step 3: Commit**

```bash
git add yehub-fe/src/components/common/MediaPickerBox.tsx
git commit -m "feat(fe): add MediaPickerBox reusable crop+upload picker"
```

---

## Task 7: Migrate project-logo callers; delete `ProjectLogoPicker`

**Files:**
- Modify: `yehub-fe/src/pages/projects/ProjectsListPage/components/CreateProjectDialog.tsx`
- Modify: `yehub-fe/src/pages/projects/components/EditProjectDialog.tsx`
- Delete: `yehub-fe/src/pages/projects/components/ProjectLogoPicker.tsx`

- [ ] **Step 1: Swap `ProjectLogoPicker` → `MediaPickerBox` in `CreateProjectDialog.tsx`**

Change the import on line 16 from:
```ts
import { ProjectLogoPicker } from '../../components/ProjectLogoPicker'
```
to:
```ts
import { MediaPickerBox } from '@/components/common/MediaPickerBox'
```

Change the FormField render on line 78 from:
```tsx
render={({ field }) => <ProjectLogoPicker value={field.value ?? ''} onChange={field.onChange} />}
```
to:
```tsx
render={({ field }) => (
  <MediaPickerBox
    value={field.value ?? ''}
    onChange={field.onChange}
    shape="square"
    label="Logo (optional)"
  />
)}
```

- [ ] **Step 2: Swap `ProjectLogoPicker` → `MediaPickerBox` in `EditProjectDialog.tsx`**

Change the import on line 17 from:
```ts
import { ProjectLogoPicker } from './ProjectLogoPicker'
```
to:
```ts
import { MediaPickerBox } from '@/components/common/MediaPickerBox'
```

Change the FormField render on line 98 from:
```tsx
render={({ field }) => <ProjectLogoPicker value={field.value ?? ''} onChange={field.onChange} />}
```
to:
```tsx
render={({ field }) => (
  <MediaPickerBox
    value={field.value ?? ''}
    onChange={field.onChange}
    shape="square"
    label="Logo (optional)"
  />
)}
```

- [ ] **Step 3: Delete `ProjectLogoPicker.tsx`**

Run:
```bash
rm yehub-fe/src/pages/projects/components/ProjectLogoPicker.tsx
```

- [ ] **Step 4: Verify no lingering references**

Run:
```bash
grep -rn "ProjectLogoPicker" yehub-fe/src
```

Expected: no output. If any references remain, update them to `MediaPickerBox` with `shape="square"`.

- [ ] **Step 5: Lint + build**

Run:
```bash
cd yehub-fe && pnpm lint && pnpm build
```

Expected: both pass.

- [ ] **Step 6: Manual smoke test**

Start the dev server (`cd yehub-fe && pnpm dev`) and:

- Go to the Projects list → click "New project" → click the logo box → pick any image > 1 MP → crop dialog opens → move/zoom/rotate → Save.
- Confirm the preview inside the dashed box shows the chosen crop.
- Submit the form — confirm the project is created and its list-view logo matches the crop.
- Go to an existing project → "Edit" → click the existing logo's Change button → repeat.

If anything is visually off (dialog clipped, zoom slider misaligned), note it but don't block — adjust only if functionally broken.

- [ ] **Step 7: Commit**

```bash
git add yehub-fe/src/pages/projects/ProjectsListPage/components/CreateProjectDialog.tsx \
        yehub-fe/src/pages/projects/components/EditProjectDialog.tsx \
        yehub-fe/src/pages/projects/components/ProjectLogoPicker.tsx
git commit -m "feat(fe): migrate project logo upload to MediaPickerBox with cropper"
```

---

## Task 8: Migrate profile-avatar callers; delete `ProfileAvatarPicker`

**Files:**
- Modify: `yehub-fe/src/pages/profiles/AddProfilePage/components/BasicInfoCard.tsx`
- Modify: `yehub-fe/src/pages/profiles/ProfileDetailPage/components/EditProfileDialog.tsx`
- Delete: `yehub-fe/src/pages/profiles/components/ProfileAvatarPicker.tsx`

- [ ] **Step 1: Swap in `BasicInfoCard.tsx`**

Change the import on line 8 from:
```ts
import { ProfileAvatarPicker } from '../../components/ProfileAvatarPicker'
```
to:
```ts
import { MediaPickerBox } from '@/components/common/MediaPickerBox'
```

Change line 32 from:
```tsx
<ProfileAvatarPicker value={field.value ?? ''} onChange={field.onChange} />
```
to:
```tsx
<MediaPickerBox
  value={field.value ?? ''}
  onChange={field.onChange}
  shape="circle"
  label="Avatar (optional)"
/>
```

- [ ] **Step 2: Swap in `EditProfileDialog.tsx`**

Change the import on line 11 from:
```ts
import { ProfileAvatarPicker } from '../../components/ProfileAvatarPicker'
```
to:
```ts
import { MediaPickerBox } from '@/components/common/MediaPickerBox'
```

Change line 90 from:
```tsx
<ProfileAvatarPicker value={field.value} onChange={field.onChange} />
```
to:
```tsx
<MediaPickerBox
  value={field.value}
  onChange={field.onChange}
  shape="circle"
  label="Avatar (optional)"
/>
```

- [ ] **Step 3: Delete `ProfileAvatarPicker.tsx`**

Run:
```bash
rm yehub-fe/src/pages/profiles/components/ProfileAvatarPicker.tsx
```

- [ ] **Step 4: Verify no lingering references**

Run:
```bash
grep -rn "ProfileAvatarPicker" yehub-fe/src
```

Expected: no output.

- [ ] **Step 5: Lint + build**

Run:
```bash
cd yehub-fe && pnpm lint && pnpm build
```

Expected: both pass.

- [ ] **Step 6: Manual smoke test**

Dev server:

- Profiles → "Add profile" → click the avatar box → pick a phone photo → confirm cropper opens → save with a rotation → form submits → profile card shows the cropped avatar (round).
- Profiles → open an existing profile → "Edit" → change avatar → repeat.

- [ ] **Step 7: Commit**

```bash
git add yehub-fe/src/pages/profiles/AddProfilePage/components/BasicInfoCard.tsx \
        yehub-fe/src/pages/profiles/ProfileDetailPage/components/EditProfileDialog.tsx \
        yehub-fe/src/pages/profiles/components/ProfileAvatarPicker.tsx
git commit -m "feat(fe): migrate profile avatar upload to MediaPickerBox with cropper"
```

---

## Task 9: Migrate `ProfileCard` (My Account avatar)

`ProfileCard` uses its own hidden input + `uploadAvatarMutation` flow, not the picker-box pattern. Swap to the hook directly.

**Files:**
- Modify: `yehub-fe/src/pages/MyAccountPage/components/ProfileCard.tsx`

- [ ] **Step 1: Rewrite `ProfileCard.tsx` avatar section**

Replace the full contents with:

```tsx
import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation } from '@tanstack/react-query'
import { toast } from 'sonner'
import { authApi } from '@/api/auth'
import { usePresignedUrl } from '@/hooks/use-presigned-url'
import { useImageCropUpload } from '@/hooks/use-image-crop-upload'
import { useAuthStore } from '@/store/auth.store'
import { getApiErrorMessage, showApiError } from '@/lib/errors'
import { updateProfileSchema, type UpdateProfileFormValues } from '@/lib/schemas'
import type { AuthUser } from '@/store/auth.store'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'

interface ProfileCardProps {
  profile: AuthUser | undefined
  user: AuthUser | null | undefined
  initials: string
}

export function ProfileCard({ profile, user, initials }: ProfileCardProps) {
  const { setUser } = useAuthStore()
  const { url: avatarUrl } = usePresignedUrl(user?.avatar)

  const profileForm = useForm<UpdateProfileFormValues>({
    resolver: zodResolver(updateProfileSchema),
    defaultValues: { name: '', email: '' },
  })

  useEffect(() => {
    if (profile) {
      profileForm.reset({ name: profile.name, email: profile.email })
    }
  }, [profile, profileForm])

  const updateProfileMutation = useMutation({
    mutationFn: (data: UpdateProfileFormValues) => authApi.updateProfile(data),
    onSuccess: (data) => {
      setUser(data)
      toast.success('Profile updated')
    },
  })

  const saveAvatarMutation = useMutation({
    mutationFn: (avatar: string) => authApi.updateProfile({ avatar }),
    onSuccess: (data) => {
      setUser(data)
      toast.success('Avatar updated')
    },
    onError: (err) => showApiError(err, { fallback: 'Failed to update avatar' }),
  })

  const { openPicker, hiddenInput, dialog, isUploading } = useImageCropUpload({
    aspect: 1,
    title: 'Crop avatar',
    onUploaded: (key) => saveAvatarMutation.mutate(key),
  })

  const busy = isUploading || saveAvatarMutation.isPending

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Profile</CardTitle>
        <CardDescription>Your personal information</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-4">
          <Avatar className="size-16">
            <AvatarImage src={avatarUrl} alt={user?.name} />
            <AvatarFallback className="text-xl">{initials}</AvatarFallback>
          </Avatar>
          <Button variant="outline" size="sm" disabled={busy} onClick={openPicker}>
            {busy ? 'Uploading…' : 'Change avatar'}
          </Button>
          {hiddenInput}
          {dialog}
        </div>

        <Form {...profileForm}>
          <form
            onSubmit={profileForm.handleSubmit((values) =>
              updateProfileMutation.mutate(values, {
                onError: (error) => {
                  profileForm.setError('root', {
                    message: getApiErrorMessage(error, { fallback: 'Failed to update profile' }),
                  })
                },
              }),
            )}
            className="space-y-4"
          >
            {profileForm.formState.errors.root && (
              <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {profileForm.formState.errors.root.message}
              </p>
            )}

            <div className="grid gap-4 md:grid-cols-2">
              <FormField
                control={profileForm.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Name</FormLabel>
                    <FormControl>
                      <Input placeholder="Your name" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={profileForm.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input disabled {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <Button type="submit" disabled={updateProfileMutation.isPending || !profileForm.formState.isDirty}>
              {updateProfileMutation.isPending ? 'Saving…' : 'Save changes'}
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  )
}
```

Key changes from the previous version:

- Removed the hidden `<input type="file">`, `fileInputRef`, and `handleAvatarChange` — all handled by the hook.
- Replaced `uploadAvatarMutation` (file → upload + update profile) with `saveAvatarMutation` (key → update profile). The upload is done by the hook; the mutation only writes the key to the user's profile.
- `isUploading` (from hook) covers the S3 phase; `saveAvatarMutation.isPending` covers the profile-API phase. Either disables the button.
- Removed `ChangeEvent` import (no longer needed).

- [ ] **Step 2: Lint + build**

Run:
```bash
cd yehub-fe && pnpm lint && pnpm build
```

Expected: both pass.

- [ ] **Step 3: Manual smoke test**

Dev server:

- Go to My Account → click "Change avatar" → pick a phone photo (rotated if possible) → cropper opens → zoom in → save.
- Confirm the avatar in the page, the header/avatar menu, and sidebar all update within a second.

- [ ] **Step 4: Commit**

```bash
git add yehub-fe/src/pages/MyAccountPage/components/ProfileCard.tsx
git commit -m "feat(fe): crop/resize avatar on My Account page"
```

---

## Task 10: Migrate admin `AppearanceTab` system logo (free aspect)

The system logo is the only call site that uses `aspect: 'free'` and `maxSize: 1024`.

**Files:**
- Modify: `yehub-fe/src/pages/admin/SettingsPage/use-appearance-tab.ts`
- Modify: `yehub-fe/src/pages/admin/SettingsPage/components/AppearanceTab.tsx`

- [ ] **Step 1: Rewrite `use-appearance-tab.ts`**

Replace full contents with:

```ts
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { systemSettingsApi } from '@/api/system-settings'
import { queryKeys } from '@/lib/constants/query-keys'
import { MAX_IMAGE_BYTES } from '@/lib/constants/uploads'
import { showApiError } from '@/lib/errors'
import { useSystemLogo } from '@/hooks/use-system-logo'
import { useImageCropUpload } from '@/hooks/use-image-crop-upload'

export function useAppearanceTab() {
  const queryClient = useQueryClient()
  const { url, isCustom, isLoading } = useSystemLogo()

  const saveLogoMutation = useMutation({
    mutationFn: (key: string) => systemSettingsApi.upsert('logo', { type: 'TEXT', value_text: key }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.systemSettings.public })
      toast.success('Logo updated')
    },
    onError: (error) => showApiError(error, { fallback: 'Failed to save logo' }),
  })

  const resetLogoMutation = useMutation({
    mutationFn: () => systemSettingsApi.upsert('logo', { type: 'TEXT', value_text: null }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.systemSettings.public })
      toast.success('Logo reset to default')
    },
    onError: (error) => showApiError(error, { fallback: 'Failed to reset logo' }),
  })

  const { openPicker, hiddenInput, dialog, isUploading } = useImageCropUpload({
    aspect: 'free',
    maxSize: 1024,
    title: 'Crop logo',
    onUploaded: (key) => saveLogoMutation.mutate(key),
  })

  return {
    logoUrl: url,
    hasCustomLogo: isCustom,
    isLoading,
    maxBytes: MAX_IMAGE_BYTES,
    openLogoPicker: openPicker,
    pickerInput: hiddenInput,
    pickerDialog: dialog,
    resetLogo: () => resetLogoMutation.mutate(),
    isUploading: isUploading || saveLogoMutation.isPending,
    isResetting: resetLogoMutation.isPending,
  }
}
```

- [ ] **Step 2: Rewrite `AppearanceTab.tsx`**

Replace full contents with:

```tsx
import { UploadIcon, RotateCcwIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useAppearanceTab } from '../use-appearance-tab'

export function AppearanceTab() {
  const {
    logoUrl,
    hasCustomLogo,
    isLoading,
    openLogoPicker,
    pickerInput,
    pickerDialog,
    resetLogo,
    isUploading,
    isResetting,
  } = useAppearanceTab()

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>System logo</CardTitle>
          <CardDescription>
            Shown in the navigation and on public pages. PNG, JPEG, GIF, WebP, or BMP — up to 5 MB.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-6">
            <div className="flex size-32 shrink-0 items-center justify-center rounded-lg border bg-muted overflow-hidden">
              {isLoading ? (
                <Skeleton className="size-full" />
              ) : (
                <img src={logoUrl} alt="System logo" className="max-h-full max-w-full object-contain p-2" />
              )}
            </div>

            <div className="flex flex-col gap-2">
              <p className="text-sm text-muted-foreground">
                {hasCustomLogo ? 'Using your uploaded logo.' : 'Using the default YeHub logo.'}
              </p>
              <div className="flex flex-wrap gap-2">
                <Button type="button" onClick={openLogoPicker} disabled={isUploading || isResetting}>
                  <UploadIcon className="size-4" />
                  {isUploading ? 'Uploading…' : hasCustomLogo ? 'Replace logo' : 'Upload logo'}
                </Button>
                {hasCustomLogo && (
                  <Button type="button" variant="outline" onClick={resetLogo} disabled={isUploading || isResetting}>
                    <RotateCcwIcon className="size-4" />
                    {isResetting ? 'Resetting…' : 'Reset to default'}
                  </Button>
                )}
              </div>
            </div>
          </div>
          {pickerInput}
          {pickerDialog}
        </CardContent>
      </Card>
    </div>
  )
}
```

Key changes:
- No more local `inputRef`, `handleFile`, or `ACCEPT_ATTRIBUTE` — the hook owns the hidden input.
- "Upload logo" button calls `openLogoPicker()`.
- Renders `pickerInput` + `pickerDialog` inside the card.

- [ ] **Step 3: Lint + build**

Run:
```bash
cd yehub-fe && pnpm lint && pnpm build
```

Expected: both pass.

- [ ] **Step 4: Manual smoke test**

Log in as admin, go to Settings → Appearance:

- Upload a wide/landscape brand logo (PNG with transparency if possible) → cropper opens with NO aspect lock (you can resize the crop to any rectangle) → adjust to include only the wordmark → Save.
- Confirm "Using your uploaded logo." appears, the square preview shows the logo letterboxed via `object-contain` with transparency preserved.
- Check the sidebar/nav logo (via `useSystemLogo` → `queryKeys.systemSettings.public` invalidation) — it should update without a refresh.
- "Reset to default" still works.

- [ ] **Step 5: Commit**

```bash
git add yehub-fe/src/pages/admin/SettingsPage/use-appearance-tab.ts \
        yehub-fe/src/pages/admin/SettingsPage/components/AppearanceTab.tsx
git commit -m "feat(fe): crop+resize admin system logo with free aspect"
```

---

## Task 11: End-to-end verification

No file changes — just the verification matrix from the spec.

- [ ] **Step 1: Clean rebuild**

Run:
```bash
cd yehub-fe && pnpm lint && pnpm build
```

Expected: both pass with no warnings introduced by this feature branch.

- [ ] **Step 2: Walk the four surfaces in `pnpm dev`**

Tick each as done:

- **Project logo (Create)** — oversized photo → crop → save → lists show cropped square.
- **Project logo (Edit)** — existing logo → Change → new crop → save → list refreshes.
- **Profile avatar (Add)** — oversized photo → crop → save → avatar round.
- **Profile avatar (Edit)** — existing avatar → Change → crop → save.
- **My Account avatar** — Change avatar → crop → save → header/sidebar update.
- **Admin system logo** — wide PNG wordmark → free-aspect crop → save → nav logo updates; PNG transparency preserved.

- [ ] **Step 3: Edge cases**

- File > 5 MB → toast, dialog does NOT open.
- Unsupported type (try `.svg`) → native picker's `accept` blocks it; if forced via dragging through devtools file input, toast appears.
- Cancel → no network calls in DevTools Network tab; picking the same file again opens dialog fresh.
- Offline toggle during Save → error toast; dialog stays open; Save again after going online succeeds.
- Phone photo with non-default EXIF orientation → image appears upright in the cropper and in the final stored image.

- [ ] **Step 4: Confirm legacy files are gone**

Run:
```bash
test ! -f yehub-fe/src/pages/projects/components/ProjectLogoPicker.tsx && echo "ok: ProjectLogoPicker deleted"
test ! -f yehub-fe/src/pages/profiles/components/ProfileAvatarPicker.tsx && echo "ok: ProfileAvatarPicker deleted"
grep -rn "ProjectLogoPicker\|ProfileAvatarPicker" yehub-fe/src && echo "BAD: stale refs above" || echo "ok: no stale refs"
```

Expected:
```
ok: ProjectLogoPicker deleted
ok: ProfileAvatarPicker deleted
ok: no stale refs
```

- [ ] **Step 5: (Optional) If anything is broken, fix + amend the relevant task's commit, do NOT add a new catch-all commit**

Feature is done.

---

## Self-review checklist (written, then cross-referenced)

- ✅ Spec §Architecture → Tasks 4, 5, 6 create the three new modules; Tasks 7–10 rewire the four call sites; Tasks 7 & 8 delete the two legacy files.
- ✅ Spec §Dependency (`react-easy-crop`) → Task 1.
- ✅ Spec §Constants move (`ALLOWED_IMAGE_TYPES`, `MAX_IMAGE_BYTES` → `src/lib/constants/uploads.ts`) → Task 2.
- ✅ Spec §`ImageCropDialog` API → Task 4 matches the prop signature exactly (`open`, `file`, `aspect`, `maxSize`, `title`, `onCancel`, `onConfirm`); adds `isUploading?: boolean` pass-through for consumer-controlled busy state — compatible extension.
- ✅ Spec §`useImageCropUpload` API → Task 5 matches the return shape (`openPicker`, `hiddenInput`, `dialog`, `isUploading`) and options (`aspect`, `maxSize`, `accept`, `maxBytes`, `title`, `onUploaded`).
- ✅ Spec §`MediaPickerBox` API → Task 6 matches (`value`, `onChange`, `shape`, `label`).
- ✅ Spec §Call-site migrations table → each row has a dedicated task.
- ✅ Spec §Error handling → covered in hook (Task 5) and dialog (Task 4); verification in Task 11.
- ✅ Spec §EXIF orientation → relies on browser default; verified in Task 11 edge cases.
- ✅ Spec §Verification → Task 11 mirrors the spec's manual walkthrough and edge cases.
- ✅ Type consistency: `ImageCropResult` from Task 4 matches its consumption in Task 5; `cropImageToBlob` signature from Task 3 matches its call site in Task 4; `useImageCropUpload` return in Task 5 matches its consumption in Tasks 6, 9, 10.
- ✅ No placeholders, no "TODO", no "similar to Task N"; every code change has the code inline.
