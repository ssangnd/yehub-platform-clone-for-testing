import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { Separator } from '@/components/ui/separator'
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'
import { MediaPickerBox } from '@/components/common/MediaPickerBox'
import { FIELD_LIMITS, profileEditFormSchema, type ProfileEditFormValues } from '@/lib/schemas'
import type { ProfileDetail, UpdateProfilePayload } from '@/api/profiles'
import type { KolCategory } from '@/api/kol-categories'
import type { KolTier } from '@/api/kol-tiers'

function profileToForm(profile: ProfileDetail): ProfileEditFormValues {
  return {
    name: profile.name,
    gender: profile.gender ?? 'OTHER',
    categoryIds: profile.categories.map((c) => c.id),
    tierId: profile.tier?.id ?? '',
    email: profile.email ?? '',
    phone: profile.phone ?? '',
    avatar: profile.avatar ?? '',
    tagsInput: profile.tags.join(', '),
  }
}

function toPayload(values: ProfileEditFormValues): UpdateProfilePayload {
  return {
    name: values.name,
    gender: values.gender,
    avatar: values.avatar || null,
    categoryIds: values.categoryIds,
    tierId: values.tierId,
    email: values.email || null,
    phone: values.phone || null,
    tags: values.tagsInput
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean),
  }
}

interface EditProfileDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  profile: ProfileDetail
  categories: KolCategory[]
  tiers: KolTier[]
  onSave: (data: UpdateProfilePayload) => void
  isSaving: boolean
}

export function EditProfileDialog({
  open,
  onOpenChange,
  profile,
  categories,
  tiers,
  onSave,
  isSaving,
}: EditProfileDialogProps) {
  const form = useForm<ProfileEditFormValues>({
    resolver: zodResolver(profileEditFormSchema),
    defaultValues: profileToForm(profile),
  })

  useEffect(() => {
    if (open) form.reset(profileToForm(profile))
  }, [open, profile, form])

  return (
    <Dialog open={open} onOpenChange={onOpenChange} disablePointerDismissal>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit Profile</DialogTitle>
          <DialogDescription>Update the profile details below.</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit((values) => onSave(toPayload(values)))} className="space-y-4">
            <Separator />
            <FormField
              control={form.control}
              name="avatar"
              render={({ field }) => (
                <FormItem className="flex justify-center">
                  <FormControl>
                    <MediaPickerBox
                      value={field.value}
                      onChange={field.onChange}
                      shape="circle"
                      label="Avatar (optional)"
                    />
                  </FormControl>
                </FormItem>
              )}
            />
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
                  <FormItem className="flex-1 min-w-0 h-fit">
                    <FormLabel>Tier *</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Select tier">
                            {tiers.find((t) => t.id === field.value)?.name}
                          </SelectValue>
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {tiers.map((t) => (
                          <SelectItem key={t.id} value={t.id}>
                            {t.name}
                          </SelectItem>
                        ))}
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
            </div>
            <FormField
              control={form.control}
              name="tagsInput"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Tags (comma separated)</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g. KOL, beauty, lifestyle" {...field} />
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
                {isSaving ? 'Saving...' : 'Save'}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
