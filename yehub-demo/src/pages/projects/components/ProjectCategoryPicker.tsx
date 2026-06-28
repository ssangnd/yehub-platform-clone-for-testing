import { useState } from 'react'
import { Plus } from 'lucide-react'
import { Checkbox } from '@/components/ui/checkbox'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { PROJECT_CATEGORIES } from '@/types/project'

interface ProjectCategoryPickerProps {
  selected: string[]
  onChange: (categories: string[]) => void
}

export function ProjectCategoryPicker({ selected, onChange }: ProjectCategoryPickerProps) {
  const [addDialogOpen, setAddDialogOpen] = useState(false)
  const [newCategory, setNewCategory] = useState('')
  const [customCategories, setCustomCategories] = useState<string[]>([])

  const allCategories = [...PROJECT_CATEGORIES, ...customCategories]

  const toggle = (cat: string) => {
    onChange(
      selected.includes(cat)
        ? selected.filter(c => c !== cat)
        : [...selected, cat]
    )
  }

  const handleAddCategory = (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = newCategory.trim()
    if (!trimmed) return
    if (allCategories.some(c => c.toLowerCase() === trimmed.toLowerCase())) {
      if (!selected.includes(trimmed)) {
        const existing = allCategories.find(c => c.toLowerCase() === trimmed.toLowerCase())!
        onChange([...selected, existing])
      }
    } else {
      setCustomCategories(prev => [...prev, trimmed])
      onChange([...selected, trimmed])
    }
    setNewCategory('')
    setAddDialogOpen(false)
  }

  return (
    <div className="space-y-2">
      <Label>Categories</Label>
      <div className="grid grid-cols-2 gap-2">
        {allCategories.map(cat => (
          <label key={cat} className="flex items-center gap-2 cursor-pointer">
            <Checkbox
              checked={selected.includes(cat)}
              onCheckedChange={() => toggle(cat)}
            />
            <span className="text-sm">{cat}</span>
          </label>
        ))}
      </div>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="cursor-pointer text-xs"
        onClick={() => setAddDialogOpen(true)}
      >
        <Plus className="mr-1 h-3 w-3" />
        Add New Category
      </Button>

      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent className="sm:max-w-sm" onClick={(e) => e.stopPropagation()}>
          <DialogHeader>
            <DialogTitle>Add New Category</DialogTitle>
            <DialogDescription>Enter a custom category name.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleAddCategory} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="new-category-name">Category Name</Label>
              <Input
                id="new-category-name"
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value)}
                placeholder="e.g. Real Estate"
                required
                autoFocus
              />
            </div>
            <div className="flex justify-end gap-3">
              <Button type="button" variant="outline" onClick={() => setAddDialogOpen(false)} className="cursor-pointer">
                Cancel
              </Button>
              <Button type="submit" className="cursor-pointer">Add</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
