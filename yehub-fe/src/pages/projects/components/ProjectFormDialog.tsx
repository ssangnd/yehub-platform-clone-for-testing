import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import axios from 'axios'
import { toast } from 'sonner'
import { queryKeys } from '@/lib/constants/query-keys'
import { showApiError } from '@/lib/errors'
import { projectsApi, type Project } from '@/api/projects'
import { FIELD_LIMITS, projectFormSchema, type ProjectFormValues } from '@/lib/schemas'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { TextareaWithCounter } from '@/components/common/TextareaWithCounter'
import { MediaPickerBox } from '@/components/common/MediaPickerBox'
import { ProjectCategoryPicker } from './ProjectCategoryPicker'

interface ProjectFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  project?: Project | null
}

const emptyValues: ProjectFormValues = {
  name: '',
  client_name: '',
  description: '',
  logo: '',
  categories: [],
}

const toFormValues = (project?: Project | null): ProjectFormValues =>
  project
    ? {
        name: project.name,
        client_name: project.client_name ?? '',
        description: project.description ?? '',
        logo: project.logo ?? '',
        categories: project.categories,
      }
    : emptyValues

export function ProjectFormDialog({ open, onOpenChange, project }: ProjectFormDialogProps) {
  const queryClient = useQueryClient()
  const isEdit = !!project

  const form = useForm<ProjectFormValues>({
    resolver: zodResolver(projectFormSchema),
    defaultValues: emptyValues,
  })

  useEffect(() => {
    if (open) form.reset(toFormValues(project))
  }, [open, project, form])

  const mutation = useMutation({
    mutationFn: (values: ProjectFormValues) => {
      const payload = {
        name: values.name.trim(),
        client_name: values.client_name?.trim() || null,
        description: values.description?.trim() || null,
        logo: values.logo || null,
        category_ids: values.categories.map((c) => c.id),
      }
      return project ? projectsApi.updateProject(project.id, payload) : projectsApi.createProject(payload)
    },
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.projects.all })
      queryClient.invalidateQueries({ queryKey: queryKeys.projects.stats })
      if (res?.data) queryClient.setQueryData(queryKeys.project(res.data.id), res.data)
      toast.success(isEdit ? 'Project updated' : 'Project created')
      onOpenChange(false)
    },
    onError: (err) => {
      if (axios.isAxiosError(err) && err.response?.status === 409) {
        const message =
          (err.response.data as { message?: string })?.message ?? 'A project with this name already exists'
        form.setError('name', { type: 'server', message })
        return
      }
      showApiError(err, { fallback: isEdit ? 'Failed to update project' : 'Failed to create project' })
    },
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange} disablePointerDismissal>
      <DialogContent className="flex max-h-[90vh] flex-col sm:max-w-lg p-0 space-y-0 gap-0">
        <DialogHeader className="p-4">
          <DialogTitle>{isEdit ? 'Edit Project' : 'Create New Project'}</DialogTitle>
          <DialogDescription>
            {isEdit ? 'Update the project details.' : 'Fill in the details to create a new project.'}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit((v) => mutation.mutate(v))} className="space-y-4 overflow-y-auto p-4 pt-0">
            <Separator />

            <FormField
              control={form.control}
              name="logo"
              render={({ field }) => (
                <MediaPickerBox
                  value={field.value ?? ''}
                  onChange={field.onChange}
                  shape="square"
                  label="Logo (optional)"
                />
              )}
            />

            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Project Name</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g. Vinamilk Q2 2026" maxLength={FIELD_LIMITS.project.name.max} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="client_name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Client Name</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g. Vinamilk" maxLength={FIELD_LIMITS.project.clientName.max} {...field} />
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
                    <TextareaWithCounter
                      placeholder="Project description…"
                      rows={3}
                      maxLength={FIELD_LIMITS.project.description.max}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="categories"
              render={({ field }) => <ProjectCategoryPicker selected={field.value} onChange={field.onChange} />}
            />

            <Separator />
            <div className="flex justify-end gap-3">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} className="cursor-pointer">
                Cancel
              </Button>
              <Button type="submit" className="cursor-pointer" disabled={mutation.isPending}>
                {mutation.isPending ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Project'}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
