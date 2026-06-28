import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation } from '@tanstack/react-query'
import { toast } from 'sonner'
import { authApi } from '@/api/auth'
import { getApiErrorMessage } from '@/lib/errors'
import { changePasswordSchema, type ChangePasswordFormValues } from '@/lib/schemas'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export function ChangePasswordCard() {
  const passwordForm = useForm<ChangePasswordFormValues>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: { current_password: '', new_password: '', confirm_password: '' },
  })

  const changePasswordMutation = useMutation({
    mutationFn: (data: ChangePasswordFormValues) => authApi.changePassword(data.current_password, data.new_password),
    onSuccess: () => toast.success('Password changed'),
  })

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Change password</CardTitle>
        <CardDescription>Use a strong password of at least 8 characters</CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...passwordForm}>
          <form
            onSubmit={passwordForm.handleSubmit((values) =>
              changePasswordMutation.mutate(values, {
                onSuccess: () => passwordForm.reset(),
                onError: (error) => {
                  passwordForm.setError('root', {
                    message: getApiErrorMessage(error, { fallback: 'Failed to change password' }),
                  })
                },
              }),
            )}
            className="space-y-4"
          >
            {passwordForm.formState.errors.root && (
              <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {passwordForm.formState.errors.root.message}
              </p>
            )}
            <FormField
              control={passwordForm.control}
              name="current_password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Current password</FormLabel>
                  <FormControl>
                    <Input type="password" autoComplete="current-password" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={passwordForm.control}
              name="new_password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>New password</FormLabel>
                  <FormControl>
                    <Input type="password" autoComplete="new-password" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={passwordForm.control}
              name="confirm_password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Confirm new password</FormLabel>
                  <FormControl>
                    <Input type="password" autoComplete="new-password" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button type="submit" disabled={changePasswordMutation.isPending}>
              {changePasswordMutation.isPending ? 'Updating…' : 'Update password'}
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  )
}
