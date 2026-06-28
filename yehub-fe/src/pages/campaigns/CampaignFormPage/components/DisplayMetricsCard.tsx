import { useFormContext } from 'react-hook-form'
import type { CampaignFormValues } from '@/lib/schemas'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { FormField, FormItem, FormMessage } from '@/components/ui/form'
import { MetricSelector } from './MetricSelector'

export function DisplayMetricsCard() {
  const { control } = useFormContext<CampaignFormValues>()

  return (
    <Card className="lg:col-span-12">
      <CardHeader>
        <CardTitle className="text-base">Display Metrics</CardTitle>
      </CardHeader>
      <CardContent>
        <FormField
          control={control}
          name="display_metrics"
          render={({ field }) => (
            <FormItem>
              <MetricSelector selected={field.value ?? []} onChange={field.onChange} />
              <FormMessage />
            </FormItem>
          )}
        />
      </CardContent>
    </Card>
  )
}
