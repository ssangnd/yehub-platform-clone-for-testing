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
    mountedRef.current = true
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
