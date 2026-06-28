import type { UseFormReturn } from 'react-hook-form'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'
import type { AddProfileFormValues } from '../schema'

interface ContactInfoCardProps {
  form: UseFormReturn<AddProfileFormValues>
}

export function ContactInfoCard({ form }: ContactInfoCardProps) {
  return (
    <Card>
      <CardContent className="p-6 space-y-4">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Contact Information</h3>
        <Separator />
        <div className="flex flex-col sm:flex-row flex-wrap gap-4">
          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem className="flex-1 min-w-0">
                <FormLabel>Email</FormLabel>
                <FormControl>
                  <Input placeholder="email@example.com" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="phone"
            render={({ field }) => (
              <FormItem className="flex-1 min-w-0">
                <FormLabel>Phone</FormLabel>
                <FormControl>
                  <Input type="tel" placeholder="+84 xxx xxx xxx" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="tagsInput"
            render={({ field }) => (
              <FormItem className="w-full">
                <FormLabel>Tags (comma separated)</FormLabel>
                <FormControl>
                  <Input placeholder="e.g. KOL, beauty, lifestyle" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
      </CardContent>
    </Card>
  )
}
