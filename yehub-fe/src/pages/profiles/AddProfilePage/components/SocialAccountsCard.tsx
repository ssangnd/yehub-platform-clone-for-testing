import type { UseFormReturn } from 'react-hook-form'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'
import { SOCIAL_PLATFORMS, type AddProfileFormValues } from '../schema'

interface SocialAccountsCardProps {
  form: UseFormReturn<AddProfileFormValues>
}

export function SocialAccountsCard({ form }: SocialAccountsCardProps) {
  return (
    <Card>
      <CardContent className="p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Social Accounts</h3>
        </div>
        <Separator />
        <div className="flex flex-col sm:flex-row flex-wrap gap-4">
          {SOCIAL_PLATFORMS.map((platform) => (
            <FormField
              key={platform.key}
              control={form.control}
              name={`socialUrls.${platform.key}`}
              render={({ field }) => (
                <FormItem className="flex-1 min-w-0 sm:basis-[calc(50%-0.5rem)]">
                  <FormLabel>{platform.label}</FormLabel>
                  <FormControl>
                    <Input placeholder={platform.placeholder} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
