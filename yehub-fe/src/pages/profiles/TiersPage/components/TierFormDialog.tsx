import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { ColorSwatchPicker } from '../../components/ColorSwatchPicker'
import { type ColorKey } from '@/lib/constants/colors'
import { FIELD_LIMITS, tierFormSchema, type TierFormValues } from '@/lib/schemas'
import type { KolTier } from '@/api/kol-tiers'

const emptyTierForm: TierFormValues = {
  name: '',
  description: '',
  color: 'blue',
  minFollowers: '',
  maxFollowers: '',
}

function tierToForm(tier: KolTier): TierFormValues {
  return {
    name: tier.name,
    description: tier.description ?? '',
    color: (tier.color as ColorKey) || 'blue',
    minFollowers: String(tier.minFollowers),
    maxFollowers: tier.maxFollowers != null ? String(tier.maxFollowers) : '',
  }
}

interface TierFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  tier?: KolTier | null
  onSubmit: (values: TierFormValues) => void
  isPending: boolean
}

export function TierFormDialog({ open, onOpenChange, tier, onSubmit, isPending }: TierFormDialogProps) {
  const isEdit = !!tier

  const form = useForm<TierFormValues>({
    resolver: zodResolver(tierFormSchema),
    defaultValues: emptyTierForm,
  })

  useEffect(() => {
    if (open) form.reset(tier ? tierToForm(tier) : emptyTierForm)
  }, [open, tier, form])

  return (
    <Dialog open={open} onOpenChange={onOpenChange} disablePointerDismissal>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit Tier' : 'Create Tier'}</DialogTitle>
          <DialogDescription>
            {isEdit ? 'Update tier details.' : 'Define a new tier for profile classification.'}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Tier Name</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g. Mega, Macro, Micro" maxLength={FIELD_LIMITS.kolTier.name.max} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <Textarea placeholder="Describe this tier..." rows={3} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="minFollowers"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Min Followers</FormLabel>
                    <FormControl>
                      <Input type="number" placeholder="e.g. 10000" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="maxFollowers"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Max Followers</FormLabel>
                    <FormControl>
                      <Input type="number" placeholder="Leave empty for no limit" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={form.control}
              name="color"
              render={({ field }) => (
                <FormItem>
                  <FormControl>
                    <ColorSwatchPicker value={field.value as ColorKey} onChange={(v) => field.onChange(v)} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button type="submit" className="w-full cursor-pointer" disabled={isPending}>
              {isPending ? (isEdit ? 'Saving...' : 'Creating...') : isEdit ? 'Save Changes' : 'Create Tier'}
            </Button>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
