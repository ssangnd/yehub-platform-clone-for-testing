import { useState } from 'react'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { AddTagDialog } from './AddTagDialog'
import { DeleteTagDialog } from './DeleteTagDialog'
import { EditTagDialog } from './EditTagDialog'

export interface TagListItem {
  id: string
  name: string
  usage_count: number
}

interface TagListPanelProps {
  entityLabel: string
  entityLabelPlural: string
  usageNoun: string
  items: TagListItem[]
  isLoading: boolean
  isError: boolean
  onCreate: (name: string) => void
  onDelete: (id: string) => void
  isCreating: boolean
  isDeleting: boolean
  onEdit?: (id: string, name: string) => void
  isEditing?: boolean
}

export function TagListPanel({
  entityLabel,
  entityLabelPlural,
  usageNoun,
  items,
  isLoading,
  isError,
  onCreate,
  onDelete,
  isCreating,
  isDeleting,
  onEdit,
  isEditing = false,
}: TagListPanelProps) {
  const [addOpen, setAddOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<TagListItem | null>(null)
  const [editTarget, setEditTarget] = useState<TagListItem | null>(null)

  const handleCreate = (name: string) => {
    onCreate(name)
    setAddOpen(false)
  }

  const handleConfirmDelete = () => {
    if (!deleteTarget) return
    onDelete(deleteTarget.id)
    setDeleteTarget(null)
  }

  const handleConfirmEdit = (name: string) => {
    if (!editTarget || !onEdit) return
    onEdit(editTarget.id, name)
    setEditTarget(null)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">{entityLabelPlural}</h2>
          <p className="text-sm text-muted-foreground">{items.length} total</p>
        </div>
        <Button onClick={() => setAddOpen(true)} className="cursor-pointer">
          <Plus className="mr-2 h-4 w-4" />
          Add {entityLabel}
        </Button>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground py-8 text-center">Loading…</p>
      ) : isError ? (
        <p className="text-sm text-destructive py-8 text-center">Failed to load.</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-muted-foreground py-8 text-center">
          No {entityLabelPlural.toLowerCase()} yet. Add one to get started.
        </p>
      ) : (
        <ul className="divide-y rounded border">
          {items.map((item) => (
            <li key={item.id} className="flex items-center justify-between gap-3 p-3">
              <div className="flex items-center gap-3">
                <span className="font-medium">{item.name}</span>
                <Badge variant="secondary">
                  {item.usage_count} {item.usage_count === 1 ? usageNoun : `${usageNoun}s`}
                </Badge>
              </div>
              <div className="flex items-center gap-1">
                {onEdit && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="cursor-pointer"
                    onClick={() => setEditTarget(item)}
                    aria-label={`Edit ${item.name}`}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  className="cursor-pointer text-destructive hover:text-destructive"
                  onClick={() => setDeleteTarget(item)}
                  aria-label={`Delete ${item.name}`}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <AddTagDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        entityLabel={entityLabel}
        isCreating={isCreating}
        onCreate={handleCreate}
      />

      <DeleteTagDialog
        open={!!deleteTarget}
        onOpenChange={(v) => {
          if (!v) setDeleteTarget(null)
        }}
        entityLabel={entityLabel}
        usageNoun={usageNoun}
        name={deleteTarget?.name ?? ''}
        usageCount={deleteTarget?.usage_count ?? 0}
        isDeleting={isDeleting}
        onConfirm={handleConfirmDelete}
      />

      {onEdit && (
        <EditTagDialog
          key={editTarget?.id ?? 'none'}
          open={!!editTarget}
          onOpenChange={(v) => {
            if (!v) setEditTarget(null)
          }}
          entityLabel={entityLabel}
          currentName={editTarget?.name ?? ''}
          isSubmitting={isEditing}
          onSubmit={handleConfirmEdit}
        />
      )}
    </div>
  )
}
