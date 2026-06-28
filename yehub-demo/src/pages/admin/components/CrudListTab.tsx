import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Pencil, Trash2, Plus, Check, X } from 'lucide-react'
import { toast } from 'sonner'

interface CrudItem {
  id: string
  name: string
}

interface CrudListTabProps {
  title: string
  description: string
  initialItems: CrudItem[]
  addPlaceholder: string
  emptyMessage?: string
}

export function CrudListTab({ title, description, initialItems, addPlaceholder, emptyMessage }: CrudListTabProps) {
  const [items, setItems] = useState<CrudItem[]>(initialItems)
  const [newName, setNewName] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const handleAdd = () => {
    const name = newName.trim()
    if (!name) return
    setItems(prev => [...prev, { id: `item-${Date.now()}`, name }])
    setNewName('')
    toast.success(`${title.replace(/s$/, '')} added`)
  }

  const handleStartEdit = (item: CrudItem) => {
    setEditingId(item.id)
    setEditingName(item.name)
  }

  const handleSaveEdit = () => {
    const name = editingName.trim()
    if (!name) return
    setItems(prev => prev.map(i => i.id === editingId ? { ...i, name } : i))
    setEditingId(null)
    toast.success(`${title.replace(/s$/, '')} updated`)
  }

  const handleDelete = (id: string) => {
    setItems(prev => prev.filter(i => i.id !== id))
    setDeletingId(null)
    toast.success(`${title.replace(/s$/, '')} deleted`)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2">
          <Input
            placeholder={addPlaceholder}
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleAdd()}
          />
          <Button onClick={handleAdd} className="cursor-pointer shrink-0">
            <Plus className="h-4 w-4 mr-1" /> Add
          </Button>
        </div>
        <div className="space-y-2">
          {items.map(item => (
            <div key={item.id} className="flex items-center gap-2 rounded-lg border px-3 py-2">
              {editingId === item.id ? (
                <>
                  <Input
                    value={editingName}
                    onChange={e => setEditingName(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleSaveEdit()}
                    className="h-7 flex-1"
                    autoFocus
                  />
                  <Button size="icon" variant="ghost" onClick={handleSaveEdit} className="h-7 w-7 cursor-pointer">
                    <Check className="h-4 w-4" />
                  </Button>
                  <Button size="icon" variant="ghost" onClick={() => setEditingId(null)} className="h-7 w-7 cursor-pointer">
                    <X className="h-4 w-4" />
                  </Button>
                </>
              ) : deletingId === item.id ? (
                <>
                  <span className="flex-1 text-sm text-muted-foreground">Delete "{item.name}"?</span>
                  <Button size="sm" variant="destructive" onClick={() => handleDelete(item.id)} className="cursor-pointer h-7">
                    Delete
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setDeletingId(null)} className="cursor-pointer h-7">
                    Cancel
                  </Button>
                </>
              ) : (
                <>
                  <span className="flex-1 text-sm">{item.name}</span>
                  <Button size="icon" variant="ghost" onClick={() => handleStartEdit(item)} className="h-7 w-7 cursor-pointer">
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="icon" variant="ghost" onClick={() => setDeletingId(item.id)} className="h-7 w-7 cursor-pointer text-destructive hover:text-destructive">
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </>
              )}
            </div>
          ))}
          {items.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">
              {emptyMessage ?? 'No items yet. Add one above.'}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
