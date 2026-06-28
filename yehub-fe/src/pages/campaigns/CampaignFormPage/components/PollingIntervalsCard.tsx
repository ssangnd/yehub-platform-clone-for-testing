import { useFormContext } from 'react-hook-form'
import { PollingIntervalField } from '@/components/common/PollingIntervalField'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { CampaignFormValues } from '@/lib/schemas'

export function PollingIntervalsCard() {
  const { control } = useFormContext<CampaignFormValues>()

  return (
    <Card className="lg:col-span-6">
      <CardHeader>
        <CardTitle className="text-base">Polling Intervals</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 items-start gap-4">
          <PollingIntervalField control={control} name="metric_polling_interval" label="Metric Polling Interval" />
          <PollingIntervalField control={control} name="comments_polling_interval" label="Comments Polling Interval" />
        </div>
      </CardContent>
    </Card>
  )
}
