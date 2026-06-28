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
  onConfirm: (result: ImageCropResult) => Promise<void> | void
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
      await onConfirm({ blob, filename, contentType: outputMime })
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
            onValueChange={(v) => setZoom(Array.isArray(v) ? (v[0] ?? 1) : v)}
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
