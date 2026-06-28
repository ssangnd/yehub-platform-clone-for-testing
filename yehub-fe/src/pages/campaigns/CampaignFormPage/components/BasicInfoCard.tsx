import { useFormContext } from 'react-hook-form'
import { FIELD_LIMITS, type CampaignFormValues } from '@/lib/schemas'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { TextareaWithCounter } from '@/components/common/TextareaWithCounter'

export function BasicInfoCard() {
  const { control } = useFormContext<CampaignFormValues>()

  return (
    <Card className="lg:col-span-8">
      <CardHeader>
        <CardTitle className="text-base">Basic Information</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <FormField
          control={control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Campaign Name</FormLabel>
              <FormControl>
                <Input placeholder="e.g. Summer Sale 2026" maxLength={FIELD_LIMITS.campaign.name.max} {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Description</FormLabel>
              <FormControl>
                <TextareaWithCounter
                  placeholder="Campaign description..."
                  rows={3}
                  maxLength={FIELD_LIMITS.campaign.description.max}
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </CardContent>
    </Card>
  )
}
