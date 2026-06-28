import { useState } from 'react'
import { Pencil, Trash2 } from 'lucide-react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { showApiError } from '@/lib/errors'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { TableCell, TableRow } from '@/components/ui/table'
import { COLOR_PRESETS, type ColorKey } from '@/lib/constants/colors'
import { queryKeys } from '@/lib/constants/query-keys'
import { kolCategoriesApi, type KolCategory } from '@/api/kol-categories'
import { type CategoryFormValues } from '@/lib/schemas'
import { CategoryFormDialog } from './CategoryFormDialog'
import { DeleteCategoryDialog } from './DeleteCategoryDialog'

function toPayload(values: CategoryFormValues) {
  return {
    name: values.name,
    description: values.description?.trim() || null,
    color: values.color,
  }
}

interface CategoryRowProps {
  category: KolCategory
}

export function CategoryRow({ category }: CategoryRowProps) {
  const queryClient = useQueryClient()
  const [editOpen, setEditOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)

  const updateMutation = useMutation({
    mutationFn: (values: CategoryFormValues) => kolCategoriesApi.update(category.id, toPayload(values)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.kolCategories })
      setEditOpen(false)
      toast.success('Category updated')
    },
    onError: (error) => showApiError(error, { fallback: 'Failed to update category' }),
  })

  const deleteMutation = useMutation({
    mutationFn: () => kolCategoriesApi.delete(category.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.kolCategories })
      setDeleteOpen(false)
      toast.success('Category deleted')
    },
    onError: (error) => showApiError(error, { fallback: 'Failed to delete category' }),
  })

  const badgeClass = COLOR_PRESETS[category.color as ColorKey]?.badge ?? ''

  return (
    <>
      <TableRow>
        <TableCell>
          <Badge variant="outline" className={`${badgeClass} border-0`}>
            {category.name}
          </Badge>
        </TableCell>
        <TableCell className="text-sm text-muted-foreground">{category.description}</TableCell>
        <TableCell className="text-center font-mono font-medium">{category.profileCount}</TableCell>
        <TableCell>
          <div className="flex justify-end gap-1">
            <Button variant="ghost" size="icon" className="h-7 w-7 cursor-pointer" onClick={() => setEditOpen(true)}>
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 cursor-pointer text-destructive hover:text-destructive"
              onClick={() => setDeleteOpen(true)}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </TableCell>
      </TableRow>

      <CategoryFormDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        category={category}
        onSubmit={(values) => updateMutation.mutate(values)}
        isPending={updateMutation.isPending}
      />

      <DeleteCategoryDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        category={category}
        onConfirm={() => deleteMutation.mutate()}
        isPending={deleteMutation.isPending}
      />
    </>
  )
}
