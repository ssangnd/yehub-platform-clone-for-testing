# Logo / avatar crop & resize on upload

Date: 2026-04-23
Package: `yehub-fe`

## Problem

Four UI surfaces let users upload a logo or avatar into a fixed-shape preview
box: **Project logo**, **social-profile avatar**, **signed-in user avatar**
(My Account), and **admin system logo** (Appearance settings). All four ship
the raw file to S3. Display uses `object-cover` (avatars/project logo) or
`object-contain` (system logo), so:

- Wide photos get silently cropped at display time — users can't choose what
  gets cut.
- Full-resolution phone photos (10–20 MP) are stored unnecessarily.
- Non-square brand wordmarks letterbox awkwardly inside the square system-logo
  frame.

Users need to see exactly what will be stored and to control the crop.

## Goal

After the user picks a file, open a crop dialog with drag-to-reposition, zoom,
and 90° rotation. Resize the result before uploading. Apply this to all four
surfaces via one reusable crop primitive.

## Non-goals

- Drag-and-drop onto the picker. Native file picker only.
- Multi-file / bulk uploads.
- Free-form rotation slider or flip. 90° rotate buttons only.
- Persisting crop metadata (position/zoom) for later re-editing. The stored
  image is the final output; re-crop starts fresh.
- Backend changes. Presigned-URL flow already accepts any MIME.
- Adding a frontend test runner. No test infrastructure exists in `yehub-fe`
  and introducing one is out of scope.

## Dependency

Add `react-easy-crop` (~30 KB min+gz) via `pnpm add react-easy-crop` in
`yehub-fe/`.

## Architecture

Three new pieces, four rewired call sites, two deleted files:

```
src/components/common/
├── ImageCropDialog.tsx          [new]
└── MediaPickerBox.tsx           [new]
src/hooks/
└── use-image-crop-upload.ts     [new]
src/pages/
├── projects/components/ProjectLogoPicker.tsx        [deleted]
├── profiles/components/ProfileAvatarPicker.tsx      [deleted]
├── MyAccountPage/components/ProfileCard.tsx         [edited]
└── admin/SettingsPage/
    ├── use-appearance-tab.ts                        [edited]
    └── components/AppearanceTab.tsx                 [edited]
```

### Boundaries

- **`ImageCropDialog`** — pure UI. Receives a `File`, emits a cropped `Blob`.
  No knowledge of S3, uploads, or toasts.
- **`useImageCropUpload`** — orchestration. Owns the hidden `<input>`, the
  transient picked-file state, dialog open state, validation, S3 upload, and
  error toasts. Returns `{ openPicker, hiddenInput, dialog, isUploading }`
  elements for the consumer to render.
- **`MediaPickerBox`** — the dashed-box UI shell. Wraps the hook and replaces
  the two near-duplicate pickers (`ProjectLogoPicker`, `ProfileAvatarPicker`).
- **`ProfileCard` & `AppearanceTab`** — use the hook directly since they have
  their own button-style triggers.

## Component & hook APIs

### `ImageCropDialog`

```ts
type ImageCropResult = {
  blob: Blob
  filename: string
  contentType: string
}

type ImageCropDialogProps = {
  open: boolean
  file: File | null
  aspect: number | 'free'        // 1 for square; 'free' unlocks the crop rectangle
  maxSize: number                // longest output side, in px
  title?: string                 // default: 'Crop image'
  onCancel: () => void
  onConfirm: (result: ImageCropResult) => void
}
```

Internals:

- `<Cropper>` from `react-easy-crop` in a ~420×320 preview area.
- Zoom slider (range 1–4, step 0.01).
- Rotate-left / rotate-right buttons, 90° per click (state held as a multiple
  of 90).
- Footer: Cancel (secondary), Save (primary).
- On Save: render `croppedAreaPixels` × rotation into an offscreen canvas
  sized so the longest side equals `maxSize` (no upscaling beyond the
  source). Export with `canvas.toBlob(mimeOut, quality)`:
  - `image/png` in → `image/png` out (preserves transparency for wordmarks).
  - Everything else → `image/jpeg` at quality `0.9`.
- Filename: `<originalBase>.<outputExt>`.
- Uses `URL.createObjectURL(file)` for the source; revoked on close/unmount.

### `useImageCropUpload`

```ts
type UseImageCropUploadOptions = {
  aspect: number | 'free'
  maxSize?: number                     // default: 512 if aspect === 1, else 1024
  accept?: string                      // default: '.jpg,.jpeg,.png,.gif,.webp,.bmp'
  maxBytes?: number                    // default: 5 * 1024 * 1024
  title?: string                       // passed through to ImageCropDialog
  onUploaded: (key: string) => void
}

type UseImageCropUploadReturn = {
  openPicker: () => void
  hiddenInput: ReactElement            // render once in the consumer tree
  dialog: ReactElement                 // render once in the consumer tree
  isUploading: boolean
}
```

Flow:

1. `openPicker()` clicks the hidden `<input type="file">`.
2. On input `change`, validate `file.size ≤ maxBytes` and
   `file.type ∈ ALLOWED_IMAGE_TYPES`. Fail → `toast.error(...)`, abort.
3. Set `pickedFile = file`, open the dialog.
4. On `ImageCropDialog.onConfirm`, set `isUploading = true`, call
   `uploadsApi.requestUploadUrl(contentType, filename)` then
   `uploadsApi.uploadToS3(uploadUrl, blob)`.
5. Success → `onUploaded(key)`; close dialog; clear picked file; reset input
   value so the same file can be picked again.
6. Failure → `showApiError(err, { fallback: 'Failed to upload image' })`;
   dialog stays open so the user can click Save again without re-cropping.
7. Unmount during upload → `onUploaded` is gated by a mount ref and becomes a
   no-op; in-flight request is not aborted.

Moves `ALLOWED_IMAGE_TYPES` and `MAX_LOGO_BYTES` (renamed `MAX_IMAGE_BYTES`) from
`src/pages/admin/SettingsPage/use-appearance-tab.ts` into a new
`src/lib/constants/uploads.ts` (the repo already uses `src/lib/constants/` for
cross-feature constants like `roles`, `routes`, `query-keys`). `use-appearance-tab.ts`
re-exports or updates its imports accordingly so existing consumers compile.

### `MediaPickerBox`

```ts
type MediaPickerBoxProps = {
  value: string                        // S3 key ('' when empty)
  onChange: (key: string) => void
  shape: 'square' | 'circle'
  label: string                        // e.g. 'Logo (optional)'
}
```

Internals:

- Same visual as today's `ProjectLogoPicker` / `ProfileAvatarPicker`:
  `size-24` dashed-border box, `bg-muted`, hover overlay with Change/Remove
  buttons over a dimmed version of the image.
- `shape` → `rounded-lg` (square) or `rounded-full` (circle).
- Uses `useImageCropUpload({ aspect: 1, onUploaded: onChange })`.
- Renders `hiddenInput` and `dialog` from the hook.
- Click-to-upload when empty; "Change" in overlay when filled.
- "Remove" sets `onChange('')` — same semantics as today.

## Call-site migrations

| Call site | Before | After |
|---|---|---|
| `pages/projects/ProjectsListPage/components/CreateProjectDialog.tsx` | `<ProjectLogoPicker />` | `<MediaPickerBox shape="square" label="Logo (optional)" ... />` |
| `pages/projects/components/EditProjectDialog.tsx` | `<ProjectLogoPicker />` | `<MediaPickerBox shape="square" label="Logo (optional)" ... />` |
| `pages/profiles/AddProfilePage/components/BasicInfoCard.tsx` | `<ProfileAvatarPicker />` | `<MediaPickerBox shape="circle" label="Avatar (optional)" ... />` |
| `pages/profiles/ProfileDetailPage/components/EditProfileDialog.tsx` | `<ProfileAvatarPicker />` | `<MediaPickerBox shape="circle" label="Avatar (optional)" ... />` |
| `pages/MyAccountPage/components/ProfileCard.tsx` | Own hidden input + `uploadAvatarMutation` | Hook with `aspect: 1`; "Change avatar" calls `openPicker()`; `onUploaded` calls `authApi.updateProfile({ avatar: key })` + `setUser(updated)`. Remove the current `uploadAvatarMutation` and hidden input. |
| `pages/admin/SettingsPage/components/AppearanceTab.tsx` + `use-appearance-tab.ts` | Own hidden input + `uploadLogoMutation(file)` | Hook with `aspect: 'free'`, `maxSize: 1024`; "Upload logo" / "Replace logo" calls `openPicker()`. The post-upload settings write stays as a `useMutation` in `use-appearance-tab.ts` (preserves `isPending`/success toast behavior); `onUploaded(key)` calls that mutation with `{ key }`. The mutation body is reduced to the `systemSettingsApi.upsert('logo', { type: 'TEXT', value_text: key })` call plus the existing query invalidation — no more file validation or S3 upload inside the mutation. |

After migration, `ProjectLogoPicker.tsx` and `ProfileAvatarPicker.tsx` are
deleted.

## Error handling

| Failure | UX |
|---|---|
| File > `maxBytes` | `toast.error('File size must be under 5 MB')`; dialog does NOT open. |
| Unsupported MIME | `toast.error('Unsupported image type. Use JPEG, PNG, GIF, WebP, or BMP.')`; dialog does NOT open. |
| `requestUploadUrl` fails | `showApiError(err, { fallback: 'Failed to upload image' })`; dialog stays open, user can retry Save. |
| `uploadToS3` non-2xx | Same as above. |
| `canvas.toBlob` returns `null` | `toast.error('Failed to process image')`; dialog stays open. |
| User closes dialog during upload | Ignored. `onUploaded` guarded by a mount ref; UI state is not touched. |
| Same file picked twice in a row | Input `value` is cleared after every dialog close so `change` re-fires. |

## Notes

- **EXIF orientation** — modern browsers auto-orient via the default
  `image-orientation: from-image` CSS rule (Chrome 81+, Firefox 77+,
  Safari 13.4+). `react-easy-crop` uses a standard `<img>` under the hood, so
  rotated phone photos show upright in the cropper without extra code.
- **Canvas taint** — the source `<img>` is loaded from `blob:` URLs created
  locally from the `File`, so it is same-origin and the canvas is never
  tainted. No CORS handling needed.
- **Bundle** — ~30 KB added once; reused across four surfaces.
- **Upload cost** — typical phone photo (12 MP, ~3 MB JPEG) cropped to 512 px
  square outputs ~50–80 KB.

## Verification

No automated tests (no frontend test runner in the repo). Gates:

1. `pnpm lint` passes.
2. `pnpm build` passes.
3. Manual walkthrough in `pnpm dev`:
   - **Project logo** (`MediaPickerBox shape="square"`) via Create Project
     dialog + Edit Project dialog — upload a 4000×3000 photo, crop square,
     confirm preview shows the chosen crop, confirm S3 receives ≤ 512 px JPEG.
   - **Profile avatar** (`MediaPickerBox shape="circle"`) via Add Profile +
     Edit Profile — same flow, round preview.
   - **My Account `ProfileCard`** — "Change avatar" → dialog → Save; sidebar
     avatar updates via `setUser`.
   - **Admin `AppearanceTab`** — "Upload logo" → dialog with no aspect lock;
     Save a transparent PNG wordmark; confirm output stays PNG and transparency
     is preserved at ≤ 1024 px.
4. Edge cases:
   - File > 5 MB → toast; dialog does not open.
   - Cancel in dialog → no network requests; picking the same file again
     reopens the dialog.
   - Offline-toggle during Save → error toast; dialog stays open; Save again
     after going online succeeds.
   - Phone photo with non-default EXIF orientation → appears upright in the
     cropper and in the stored output.
