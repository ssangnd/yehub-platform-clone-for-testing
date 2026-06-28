import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import type { KolCategory } from '@/api/kol-categories'

interface DeleteCategoryDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  category: KolCategory
  onConfirm: () => void
  isPending: boolean
}

export function DeleteCategoryDialog({
  open,
  onOpenChange,
  category,
  onConfirm,
  isPending,
}: DeleteCategoryDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete category &quot;{category.name}&quot;?</AlertDialogTitle>
          <AlertDialogDescription>
            This will remove the category. Profiles linked to this category will be unlinked but not deleted.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel className="cursor-pointer" disabled={isPending}>
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            className="cursor-pointer bg-destructive text-destructive-foreground hover:bg-destructive/90"
            disabled={isPending}
            onClick={(e) => {
              e.preventDefault()
              onConfirm()
            }}
          >
            {isPending ? 'Deleting...' : 'Delete'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
