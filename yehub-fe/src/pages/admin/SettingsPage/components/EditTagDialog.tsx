import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'

interface EditTagDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  entityLabel: string
  currentName: string
  isSubmitting: boolean
  onSubmit: (name: string) => void
}

export function EditTagDialog({
  open,
  onOpenChange,
  entityLabel,
  currentName,
  isSubmitting,
  onSubmit,
}: EditTagDialogProps) {
  const [name, setName] = useState(currentName)

  const trimmed = name.trim()
  const isValid = trimmed.length > 0 && trimmed.length <= 100
  const isUnchanged = trimmed === currentName.trim()
  const canSubmit = isValid && !isUnchanged && !isSubmitting

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!canSubmit) return
    onSubmit(trimmed)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange} disablePointerDismissal>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Edit {entityLabel}</DialogTitle>
          <DialogDescription>Rename this {entityLabel.toLowerCase()}. Names must be unique.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="edit-tag-name">Name</Label>
            <Input
              id="edit-tag-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={100}
              autoFocus
            />
          </div>
          <div className="flex justify-end gap-3">
            <Button type="button" variant="outline" className="cursor-pointer" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" className="cursor-pointer" disabled={!canSubmit}>
              {isSubmitting ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
