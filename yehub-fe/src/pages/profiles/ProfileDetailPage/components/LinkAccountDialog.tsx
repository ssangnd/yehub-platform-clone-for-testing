import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'
import { parseSocialInput } from '@/lib/social-accounts'
import type { PlatformType, LinkAccountPayload } from '@/api/profiles'

const PLATFORMS: { value: PlatformType; label: string }[] = [
  { value: 'FACEBOOK', label: 'Facebook' },
  { value: 'INSTAGRAM', label: 'Instagram' },
  { value: 'THREADS', label: 'Threads' },
  { value: 'TIKTOK', label: 'TikTok' },
  { value: 'YOUTUBE', label: 'YouTube' },
]

const PLATFORM_VALUES = PLATFORMS.map((p) => p.value) as PlatformType[]

const linkAccountFormSchema = z
  .object({
    platform: z.string().min(1, 'Platform is required'),
    input: z.string().trim().min(1, 'URL or username is required'),
  })
  .superRefine((data, ctx) => {
    if (!PLATFORM_VALUES.includes(data.platform as PlatformType)) return
    const parsed = parseSocialInput(data.platform as PlatformType, data.input)
    if (!parsed.ok) {
      ctx.addIssue({ code: 'custom', path: ['input'], message: parsed.error ?? 'Invalid' })
    }
  })

type LinkAccountFormValues = z.infer<typeof linkAccountFormSchema>

const emptyForm: LinkAccountFormValues = {
  platform: '',
  input: '',
}

interface LinkAccountDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  existingPlatforms: PlatformType[]
  onLink: (data: LinkAccountPayload) => void
  isSaving: boolean
}

export function LinkAccountDialog({ open, onOpenChange, existingPlatforms, onLink, isSaving }: LinkAccountDialogProps) {
  const form = useForm<LinkAccountFormValues>({
    resolver: zodResolver(linkAccountFormSchema),
    defaultValues: emptyForm,
  })

  useEffect(() => {
    if (open) form.reset(emptyForm)
  }, [open, form])

  const handleSubmit = (values: LinkAccountFormValues) => {
    const platform = values.platform as PlatformType
    const parsed = parseSocialInput(platform, values.input)
    if (!parsed.ok || !parsed.username) {
      form.setError('input', { message: parsed.error ?? 'Invalid' })
      return
    }
    onLink({ platform, username: parsed.username })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange} disablePointerDismissal>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Link Social Account</DialogTitle>
          <DialogDescription>Connect a social media account to this profile.</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            <Separator />
            <FormField
              control={form.control}
              name="platform"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Platform *</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select platform" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {PLATFORMS.map((p) => (
                        <SelectItem key={p.value} value={p.value} disabled={existingPlatforms.includes(p.value)}>
                          {p.label}
                          {existingPlatforms.includes(p.value) ? ' (already linked)' : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="input"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>URL or username *</FormLabel>
                  <FormControl>
                    <Input placeholder="https://instagram.com/username or username" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Separator />
            <div className="flex justify-end gap-3">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} className="cursor-pointer">
                Cancel
              </Button>
              <Button type="submit" className="cursor-pointer" disabled={isSaving}>
                {isSaving ? 'Linking...' : 'Link Account'}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
