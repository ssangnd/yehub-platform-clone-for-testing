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
import { FIELD_LIMITS, categoryFormSchema, type CategoryFormValues } from '@/lib/schemas'
import type { KolCategory } from '@/api/kol-categories'

const emptyCategoryForm: CategoryFormValues = {
  name: '',
  description: '',
  color: 'blue',
}

function categoryToForm(category: KolCategory): CategoryFormValues {
  return {
    name: category.name,
    description: category.description ?? '',
    color: (category.color as ColorKey) || 'blue',
  }
}

interface CategoryFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  category?: KolCategory | null
  onSubmit: (values: CategoryFormValues) => void
  isPending: boolean
}

export function CategoryFormDialog({ open, onOpenChange, category, onSubmit, isPending }: CategoryFormDialogProps) {
  const isEdit = !!category

  const form = useForm<CategoryFormValues>({
    resolver: zodResolver(categoryFormSchema),
    defaultValues: emptyCategoryForm,
  })

  useEffect(() => {
    if (open) form.reset(category ? categoryToForm(category) : emptyCategoryForm)
  }, [open, category, form])

  return (
    <Dialog open={open} onOpenChange={onOpenChange} disablePointerDismissal>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit Category' : 'Create Category'}</DialogTitle>
          <DialogDescription>
            {isEdit ? 'Update category details.' : 'Define a new category to organize profiles.'}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Category Name</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="e.g. KOL, Brand Ambassador"
                      maxLength={FIELD_LIMITS.kolCategory.name.max}
                      {...field}
                    />
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
                    <Textarea placeholder="Describe this category..." rows={3} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
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
              {isPending ? (isEdit ? 'Saving...' : 'Creating...') : isEdit ? 'Save Changes' : 'Create Category'}
            </Button>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
