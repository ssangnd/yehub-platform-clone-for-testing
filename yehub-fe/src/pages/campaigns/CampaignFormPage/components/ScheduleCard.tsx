import { useFormContext } from 'react-hook-form'
import type { CampaignFormValues } from '@/lib/schemas'
import { DatePicker } from '@/components/common/DatePicker'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'

export function ScheduleCard() {
  const { control } = useFormContext<CampaignFormValues>()

  return (
    <Card className="lg:col-span-6">
      <CardHeader>
        <CardTitle className="text-base">Schedule</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={control}
            name="start_date"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Start Date</FormLabel>
                <DatePicker value={field.value} onChange={field.onChange} placeholder="Pick start date" />
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={control}
            name="end_date"
            render={({ field }) => (
              <FormItem>
                <FormLabel>End Date</FormLabel>
                <DatePicker value={field.value} onChange={field.onChange} placeholder="Pick end date" />
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
      </CardContent>
    </Card>
  )
}
