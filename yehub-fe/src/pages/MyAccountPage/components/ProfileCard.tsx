import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation } from '@tanstack/react-query'
import { toast } from 'sonner'
import { authApi } from '@/api/auth'
import { usePresignedUrl } from '@/hooks/use-presigned-url'
import { useImageCropUpload } from '@/hooks/use-image-crop-upload'
import { useAuthStore } from '@/store/auth.store'
import { getApiErrorMessage, showApiError } from '@/lib/errors'
import { updateProfileSchema, type UpdateProfileFormValues } from '@/lib/schemas'
import type { AuthUser } from '@/store/auth.store'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'

interface ProfileCardProps {
  profile: AuthUser | undefined
  user: AuthUser | null | undefined
  initials: string
}

export function ProfileCard({ profile, user, initials }: ProfileCardProps) {
  const { setUser } = useAuthStore()
  const { url: avatarUrl } = usePresignedUrl(user?.avatar)

  const profileForm = useForm<UpdateProfileFormValues>({
    resolver: zodResolver(updateProfileSchema),
    defaultValues: { name: '', email: '' },
  })

  useEffect(() => {
    if (profile) {
      profileForm.reset({ name: profile.name, email: profile.email })
    }
  }, [profile, profileForm])

  const updateProfileMutation = useMutation({
    mutationFn: (data: UpdateProfileFormValues) => authApi.updateProfile(data),
    onSuccess: (data) => {
      setUser(data)
      toast.success('Profile updated')
    },
  })

  const saveAvatarMutation = useMutation({
    mutationFn: (avatar: string) => authApi.updateAvatar(avatar),
    onSuccess: (data) => {
      setUser(data)
      toast.success('Avatar updated')
    },
    onError: (err) => showApiError(err, { fallback: 'Failed to update avatar' }),
  })

  const { openPicker, hiddenInput, dialog, isUploading } = useImageCropUpload({
    aspect: 1,
    title: 'Crop avatar',
    onUploaded: (key) => saveAvatarMutation.mutate(key),
  })

  const busy = isUploading || saveAvatarMutation.isPending

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Profile</CardTitle>
        <CardDescription>Your personal information</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-4">
          <Avatar className="size-16">
            <AvatarImage src={avatarUrl} alt={user?.name} />
            <AvatarFallback className="text-xl">{initials}</AvatarFallback>
          </Avatar>
          <Button variant="outline" size="sm" disabled={busy} onClick={openPicker}>
            {busy ? 'Uploading…' : 'Change avatar'}
          </Button>
          {hiddenInput}
          {dialog}
        </div>

        <Form {...profileForm}>
          <form
            onSubmit={profileForm.handleSubmit((values) =>
              updateProfileMutation.mutate(values, {
                onError: (error) => {
                  profileForm.setError('root', {
                    message: getApiErrorMessage(error, { fallback: 'Failed to update profile' }),
                  })
                },
              }),
            )}
            className="space-y-4"
          >
            {profileForm.formState.errors.root && (
              <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {profileForm.formState.errors.root.message}
              </p>
            )}

            <div className="grid gap-4 md:grid-cols-2">
              <FormField
                control={profileForm.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Name</FormLabel>
                    <FormControl>
                      <Input placeholder="Your name" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={profileForm.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input disabled {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <Button type="submit" disabled={updateProfileMutation.isPending || !profileForm.formState.isDirty}>
              {updateProfileMutation.isPending ? 'Saving…' : 'Save changes'}
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  )
}
