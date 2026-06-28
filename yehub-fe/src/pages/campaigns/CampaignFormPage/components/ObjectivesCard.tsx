import { useFormContext } from 'react-hook-form'
import type { CampaignFormValues } from '@/lib/schemas'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { FormField, FormItem, FormMessage } from '@/components/ui/form'
import { CampaignObjectivePicker } from './CampaignObjectivePicker'

export function ObjectivesCard() {
  const { control } = useFormContext<CampaignFormValues>()

  return (
    <Card className="lg:col-span-12">
      <CardHeader>
        <CardTitle className="text-base">Objectives</CardTitle>
      </CardHeader>
      <CardContent>
        <FormField
          control={control}
          name="objectives"
          render={({ field }) => (
            <FormItem>
              <CampaignObjectivePicker selected={field.value ?? []} onChange={field.onChange} />
              <FormMessage />
            </FormItem>
          )}
        />
      </CardContent>
    </Card>
  )
}
