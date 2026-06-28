import { useFormContext } from 'react-hook-form'
import type { CampaignFormValues } from '@/lib/schemas'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { FormField, FormItem, FormMessage } from '@/components/ui/form'
import { Checkbox } from '@/components/ui/checkbox'

const PLATFORMS = [
  { value: 'FACEBOOK', label: 'Facebook' },
  { value: 'INSTAGRAM', label: 'Instagram' },
  { value: 'TIKTOK', label: 'TikTok' },
  { value: 'YOUTUBE', label: 'YouTube' },
  { value: 'THREADS', label: 'Threads' },
]

export function PlatformsCard() {
  const { control } = useFormContext<CampaignFormValues>()

  return (
    <Card className="lg:col-span-4">
      <CardHeader>
        <CardTitle className="text-base">Platforms</CardTitle>
      </CardHeader>
      <CardContent>
        <FormField
          control={control}
          name="platforms"
          render={({ field }) => (
            <FormItem>
              <div className="grid grid-cols-1 gap-3">
                {PLATFORMS.map((p) => (
                  <label key={p.value} className="flex items-center gap-2 cursor-pointer">
                    <Checkbox
                      checked={field.value?.includes(p.value)}
                      onCheckedChange={(checked) => {
                        const current = field.value ?? []
                        field.onChange(checked ? [...current, p.value] : current.filter((v) => v !== p.value))
                      }}
                    />
                    <span className="text-sm">{p.label}</span>
                  </label>
                ))}
              </div>
              <FormMessage />
            </FormItem>
          )}
        />
      </CardContent>
    </Card>
  )
}
