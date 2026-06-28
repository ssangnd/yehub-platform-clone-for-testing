import type { UseFormReturn } from 'react-hook-form'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { Separator } from '@/components/ui/separator'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'
import { MediaPickerBox } from '@/components/common/MediaPickerBox'
import type { KolCategory } from '@/api/kol-categories'
import type { KolTier } from '@/api/kol-tiers'
import { FIELD_LIMITS } from '@/lib/schemas'
import type { AddProfileFormValues } from '../schema'

interface BasicInfoCardProps {
  form: UseFormReturn<AddProfileFormValues>
  categories: KolCategory[]
  tiers: KolTier[]
}

export function BasicInfoCard({ form, categories, tiers }: BasicInfoCardProps) {
  return (
    <Card>
      <CardContent className="p-6 space-y-4">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Basic Information</h3>
        <Separator />
        <div className="flex flex-col sm:flex-row gap-6">
          <FormField
            control={form.control}
            name="avatar"
            render={({ field }) => (
              <FormItem>
                <FormControl>
                  <MediaPickerBox
                    value={field.value ?? ''}
                    onChange={field.onChange}
                    shape="circle"
                    label="Avatar (optional)"
                  />
                </FormControl>
              </FormItem>
            )}
          />
          <div className="flex-1 space-y-4">
            <div className="flex flex-col sm:flex-row gap-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem className="flex-1 min-w-0">
                    <FormLabel>Name *</FormLabel>
                    <FormControl>
                      <Input placeholder="Profile name" maxLength={FIELD_LIMITS.profile.name.max} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="gender"
                render={({ field }) => (
                  <FormItem className="w-32">
                    <FormLabel>Gender *</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Select" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="MALE">Male</SelectItem>
                        <SelectItem value="FEMALE">Female</SelectItem>
                        <SelectItem value="OTHER">Other</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <div className="flex flex-col sm:flex-row gap-4">
              <FormField
                control={form.control}
                name="categoryIds"
                render={({ field }) => (
                  <FormItem className="flex-1 min-w-0">
                    <FormLabel>Categories *</FormLabel>
                    <div className="grid grid-cols-2 gap-2">
                      {categories.map((cat) => (
                        <label key={cat.id} className="flex items-center gap-2 cursor-pointer">
                          <Checkbox
                            checked={field.value.includes(cat.id)}
                            onCheckedChange={(checked) => {
                              if (checked) field.onChange([...field.value, cat.id])
                              else field.onChange(field.value.filter((id) => id !== cat.id))
                            }}
                          />
                          <span className="text-sm">{cat.name}</span>
                        </label>
                      ))}
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="tierId"
                render={({ field }) => (
                  <FormItem className="flex-1 min-w-0">
                    <FormLabel>Tier *</FormLabel>
                    <Select value={field.value ?? ''} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Select tier">
                            {tiers.find((t) => t.id === field.value)?.name}
                          </SelectValue>
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {tiers.map((tier) => (
                          <SelectItem key={tier.id} value={tier.id}>
                            {tier.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
