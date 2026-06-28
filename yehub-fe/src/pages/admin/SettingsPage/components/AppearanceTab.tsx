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
