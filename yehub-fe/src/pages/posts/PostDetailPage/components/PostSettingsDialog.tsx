import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { formatNumber } from '@/lib/format'
import { deriveRecordedKpiMetrics, type PostMetricCounts } from '@/lib/post-metrics'
import type { KpiTargets, PostDetail } from '@/api/posts'

const POST_POLLING_INTERVAL_SECONDS = [900, 3600, 21600, 43200, 86400, 0] as const
const kpiTargetSchema = z.number().int().min(0, 'Must be 0 or more')
const pollingOverrideSchema = z
  .number()
  .refine(
    (value) => POST_POLLING_INTERVAL_SECONDS.includes(value as (typeof POST_POLLING_INTERVAL_SECONDS)[number]),
    'Select a polling interval',
  )
  .nullable()

const formSchema = z.object({
  polling_metric_override: pollingOverrideSchema,
  polling_comment_override: pollingOverrideSchema,
  kpi_targets: z.object({
    engagement: kpiTargetSchema,
    buzz: kpiTargetSchema,
    interaction: kpiTargetSchema,
    view: kpiTargetSchema,
  }),
})

type FormValues = z.infer<typeof formSchema>
type PollingOverrideField = 'polling_metric_override' | 'polling_comment_override'

const KPI_TYPES = ['engagement', 'buzz', 'interaction', 'view'] as const
const KPI_LABELS: Record<(typeof KPI_TYPES)[number], string> = {
  engagement: 'Engagement',
  buzz: 'Buzz',
  interaction: 'Interaction',
  view: 'View',
}

interface PostSettingsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  post: PostDetail
  onSave: (data: {
    polling_metric_override: number | null
    polling_comment_override: number | null
    kpi_targets: KpiTargets
  }) => void
}

const INHERIT_VALUE = 'inherit'

const PRESET_OPTIONS = [
  { value: String(POST_POLLING_INTERVAL_SECONDS[0]), label: 'Every 15 minutes' },
  { value: String(POST_POLLING_INTERVAL_SECONDS[1]), label: 'Every hour' },
  { value: String(POST_POLLING_INTERVAL_SECONDS[2]), label: 'Every 6 hours' },
  { value: String(POST_POLLING_INTERVAL_SECONDS[3]), label: 'Every 12 hours' },
  { value: String(POST_POLLING_INTERVAL_SECONDS[4]), label: 'Every 24 hours' },
  { value: String(POST_POLLING_INTERVAL_SECONDS[5]), label: 'Manual trigger' },
]
const PRESET_VALUES = PRESET_OPTIONS.map((opt) => opt.value)

function normalizePollingOverride(value: number | null): number | null {
  if (value === null) return null
  return POST_POLLING_INTERVAL_SECONDS.includes(value as (typeof POST_POLLING_INTERVAL_SECONDS)[number]) ? value : null
}

function buildDefaults(post: PostDetail): FormValues {
  return {
    polling_metric_override: normalizePollingOverride(post.polling_metric_override),
    polling_comment_override: normalizePollingOverride(post.polling_comment_override),
    kpi_targets: post.kpi_targets ?? { engagement: 0, buzz: 0, interaction: 0, view: 0 },
  }
}

function PostPollingIntervalField({
  form,
  name,
  label,
}: {
  form: ReturnType<typeof useForm<FormValues>>
  name: PollingOverrideField
  label: string
}) {
  return (
    <FormField
      control={form.control}
      name={name}
      render={({ field }) => {
        const raw = field.value
        const hasNumber = typeof raw === 'number' && Number.isFinite(raw)
        const selectValue = hasNumber && PRESET_VALUES.includes(String(raw)) ? String(raw) : INHERIT_VALUE
        const selectLabel =
          selectValue === INHERIT_VALUE
            ? 'Inherit from campaign'
            : PRESET_OPTIONS.find((opt) => opt.value === selectValue)?.label

        return (
          <FormItem>
            <FormLabel>{label}</FormLabel>
            <Select
              value={selectValue}
              onValueChange={(value) => {
                if (value === INHERIT_VALUE) {
                  field.onChange(null)
                } else {
                  field.onChange(Number(value))
                }
              }}
            >
              <FormControl>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select interval">{selectLabel}</SelectValue>
                </SelectTrigger>
              </FormControl>
              <SelectContent>
                <SelectItem value={INHERIT_VALUE}>Inherit from campaign</SelectItem>
                {PRESET_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FormMessage />
          </FormItem>
        )
      }}
    />
  )
}

export function PostSettingsDialog({ open, onOpenChange, post, onSave }: PostSettingsDialogProps) {
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: buildDefaults(post),
    mode: 'onChange',
  })

  useEffect(() => {
    if (open) form.reset(buildDefaults(post))
  }, [open, post, form])

  const currentKpiMetrics = deriveRecordedKpiMetrics({
    likes: post.likes,
    shares: post.shares,
    comments: post.comment_count,
    views: post.views,
  } satisfies PostMetricCounts)

  const onSubmit = (values: FormValues) => {
    onSave({
      polling_metric_override: values.polling_metric_override,
      polling_comment_override: values.polling_comment_override,
      kpi_targets: values.kpi_targets,
    })
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange} disablePointerDismissal>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Post Settings</DialogTitle>
          <DialogDescription>
            Override campaign defaults for this post's polling intervals and KPI targets.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
            <Separator />

            <div className="space-y-4">
              <div className="grid grid-cols-2 items-start gap-4">
                <PostPollingIntervalField form={form} name="polling_metric_override" label="Metric Polling Interval" />
                <PostPollingIntervalField
                  form={form}
                  name="polling_comment_override"
                  label="Comment Polling Interval"
                />
              </div>
            </div>

            <Separator />

            {/* KPI Targets */}
            <div className="space-y-3">
              <Label className="text-sm font-medium">KPI Targets</Label>
              <div className="grid grid-cols-2 gap-3">
                {KPI_TYPES.map((type) => (
                  <FormField
                    key={type}
                    control={form.control}
                    name={`kpi_targets.${type}` as const}
                    render={({ field }) => (
                      <FormItem className="space-y-1">
                        <FormLabel className="text-xs">{KPI_LABELS[type]}</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            min={0}
                            value={field.value}
                            onChange={(e) => {
                              const v = e.target.value
                              field.onChange(v === '' ? 0 : Number(v))
                            }}
                          />
                        </FormControl>
                        <p className="text-xs text-muted-foreground">
                          {formatNumber(currentKpiMetrics[type])} / {formatNumber(field.value)}
                        </p>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                ))}
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} className="cursor-pointer">
                Cancel
              </Button>
              <Button type="submit" className="cursor-pointer" disabled={!form.formState.isValid}>
                Save
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
