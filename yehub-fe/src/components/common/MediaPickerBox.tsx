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
