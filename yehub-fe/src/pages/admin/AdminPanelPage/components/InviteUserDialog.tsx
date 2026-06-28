import { useQueryClient, useMutation } from '@tanstack/react-query'
import { queryKeys } from '@/lib/constants/query-keys'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { showApiError } from '@/lib/errors'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { adminApi } from '@/api/admin'
import type { GlobalRole } from '@/api/auth'
import { inviteUserSchema, type InviteUserFormValues } from '@/lib/schemas'
import { GLOBAL_ROLE_CONFIG } from '@/lib/constants/roles'

interface InviteUserDialogProps {
  open: boolean
  onOpenChange: (v: boolean) => void
}

export function InviteUserDialog({ open, onOpenChange }: InviteUserDialogProps) {
  const queryClient = useQueryClient()
  const form = useForm<InviteUserFormValues>({
    resolver: zodResolver(inviteUserSchema),
    defaultValues: { name: '', email: '', role: 'AUTHORIZED_USER' },
  })

  const inviteMutation = useMutation({
    mutationFn: (data: InviteUserFormValues) => adminApi.inviteUser(data),
    onSuccess: () => {
      toast.success('Invitation sent successfully')
      queryClient.invalidateQueries({ queryKey: queryKeys.adminUsers.all })
      handleOpenChange(false)
    },
    onError: (error) => showApiError(error, { fallback: 'Failed to send invitation' }),
  })

  const handleOpenChange = (value: boolean) => {
    if (!value) form.reset()
    onOpenChange(value)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange} disablePointerDismissal>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Invite User</DialogTitle>
          <DialogDescription>Send an invitation email to add a new team member.</DialogDescription>
        </DialogHeader>
        <Separator />
        <Form {...form}>
          <form onSubmit={form.handleSubmit((v) => inviteMutation.mutate(v))} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Full Name</FormLabel>
                  <FormControl>
                    <Input placeholder="John Doe" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email</FormLabel>
                  <FormControl>
                    <Input placeholder="user@company.com" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="role"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Role</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue>
                          {(value: string) => GLOBAL_ROLE_CONFIG[value as GlobalRole]?.label ?? value}
                        </SelectValue>
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {(Object.keys(GLOBAL_ROLE_CONFIG) as GlobalRole[]).map((role) => (
                        <SelectItem key={role} value={role}>
                          {GLOBAL_ROLE_CONFIG[role].label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Separator />
            <div className="flex justify-end gap-3">
              <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={inviteMutation.isPending}>
                {inviteMutation.isPending ? 'Sending…' : 'Send Invitation'}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
