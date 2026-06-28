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
import type { KolTier } from '@/api/kol-tiers'

interface DeleteTierDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  tier: KolTier
  onConfirm: () => void
  isPending: boolean
}

export function DeleteTierDialog({ open, onOpenChange, tier, onConfirm, isPending }: DeleteTierDialogProps) {
  const count = tier.profileCount
  const plural = count === 1 ? '' : 's'
  const description =
    count > 0
      ? `This tier is currently used by ${count} profile${plural}. Deleting will remove it from ${count === 1 ? 'that' : 'those'} profile${plural}.`
      : 'This action cannot be undone.'

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete tier &quot;{tier.name}&quot;?</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
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
