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

interface DeleteTagDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  entityLabel: string
  usageNoun: string
  name: string
  usageCount: number
  isDeleting: boolean
  onConfirm: () => void
}

function buildDescription(usageNoun: string, usageCount: number): string {
  if (usageCount === 0) return ''
  const noun = usageCount === 1 ? usageNoun : `${usageNoun}s`
  return `It is currently used by ${usageCount} ${noun}. Deleting will remove it from ${usageCount === 1 ? 'that' : 'those'} ${noun}.`
}

export function DeleteTagDialog({
  open,
  onOpenChange,
  entityLabel,
  usageNoun,
  name,
  usageCount,
  isDeleting,
  onConfirm,
}: DeleteTagDialogProps) {
  const description = buildDescription(usageNoun, usageCount)

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            Delete {entityLabel.toLowerCase()} &quot;{name}&quot;?
          </AlertDialogTitle>
          {description && <AlertDialogDescription>{description}</AlertDialogDescription>}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel className="cursor-pointer" disabled={isDeleting}>
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            className="cursor-pointer bg-destructive text-destructive-foreground hover:bg-destructive/90"
            disabled={isDeleting}
            onClick={(e) => {
              e.preventDefault()
              onConfirm()
            }}
          >
            {isDeleting ? 'Deleting…' : 'Delete'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
