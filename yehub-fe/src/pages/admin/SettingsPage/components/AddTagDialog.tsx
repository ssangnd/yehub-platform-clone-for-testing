import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'

interface AddTagDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  entityLabel: string
  isCreating: boolean
  onCreate: (name: string) => void
}

export function AddTagDialog({ open, onOpenChange, entityLabel, isCreating, onCreate }: AddTagDialogProps) {
  const [name, setName] = useState('')

  const handleOpenChange = (next: boolean) => {
    if (!next) setName('')
    onOpenChange(next)
  }

  const trimmed = name.trim()
  const isValid = trimmed.length > 0 && trimmed.length <= 100

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!isValid || isCreating) return
    onCreate(trimmed)
    setName('')
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange} disablePointerDismissal>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Add {entityLabel}</DialogTitle>
          <DialogDescription>Enter a name. Names must be unique.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="tag-name">Name</Label>
            <Input
              id="tag-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={`e.g. ${entityLabel === 'Project Category' ? 'FMCG' : 'Brand Awareness'}`}
              maxLength={100}
              autoFocus
            />
          </div>
          <div className="flex justify-end gap-3">
            <Button type="button" variant="outline" className="cursor-pointer" onClick={() => handleOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" className="cursor-pointer" disabled={!isValid || isCreating}>
              {isCreating ? 'Adding…' : 'Add'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
