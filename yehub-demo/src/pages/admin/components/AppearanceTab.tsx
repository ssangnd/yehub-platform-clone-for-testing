import { useRef, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Upload } from 'lucide-react'
import { useAppSettings } from '@/contexts/AppSettingsContext'
import { toast } from 'sonner'

export function AppearanceTab() {
  const { logoUrl, setLogoUrl, allProfileCategories, visibleProfileCategories, setVisibleProfileCategories } = useAppSettings()
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    return () => {
      if (logoUrl) URL.revokeObjectURL(logoUrl)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (logoUrl) URL.revokeObjectURL(logoUrl)
    const url = URL.createObjectURL(file)
    setLogoUrl(url)
    toast.success('Logo updated')
  }

  const toggleCategory = (cat: string) => {
    setVisibleProfileCategories(
      visibleProfileCategories.includes(cat)
        ? visibleProfileCategories.filter(c => c !== cat)
        : [...visibleProfileCategories, cat]
    )
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Logo & Branding</CardTitle>
          <CardDescription>Upload your organization's logo</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {logoUrl && (
            <img src={logoUrl} alt="Logo preview" className="h-16 w-auto object-contain rounded border p-2" />
          )}
          <div className="flex gap-2">
            <Button
              variant="outline"
              className="cursor-pointer"
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="h-4 w-4 mr-2" />
              {logoUrl ? 'Change Logo' : 'Upload Logo'}
            </Button>
            {logoUrl && (
              <Button variant="ghost" className="cursor-pointer text-destructive" onClick={() => { URL.revokeObjectURL(logoUrl!); setLogoUrl(null) }}>
                Remove
              </Button>
            )}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleLogoChange}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Profile Categories Display</CardTitle>
          <CardDescription>Choose which categories are visible in the Profiles page filter</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-3">
            {allProfileCategories.map(cat => (
              <label key={cat} className="flex items-center gap-2 cursor-pointer">
                <Checkbox
                  checked={visibleProfileCategories.includes(cat)}
                  onCheckedChange={() => toggleCategory(cat)}
                />
                <span className="text-sm">{cat}</span>
              </label>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
