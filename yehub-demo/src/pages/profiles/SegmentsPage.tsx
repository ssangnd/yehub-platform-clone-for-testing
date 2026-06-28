import { useState } from 'react'
import { Plus, Tag, Pencil, Trash2 } from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { EmptyState } from '@/components/common/EmptyState'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { COLOR_PRESETS, type ColorKey } from '@/lib/constants/colors'
import { toast } from 'sonner'

interface Category {
  id: string
  name: string
  description: string
  profileCount: number
  color: ColorKey
}

export const mockCategories: Category[] = [
  { id: 'cat-1', name: 'Beauty', description: 'Skincare, makeup, and cosmetics content creators', profileCount: 18, color: 'pink' },
  { id: 'cat-2', name: 'Tech', description: 'Technology reviews, gadgets, and software', profileCount: 12, color: 'blue' },
  { id: 'cat-3', name: 'Food', description: 'Food reviews, cooking, and restaurant content', profileCount: 22, color: 'orange' },
  { id: 'cat-4', name: 'Fashion', description: 'Style, clothing, and accessories influencers', profileCount: 15, color: 'purple' },
  { id: 'cat-5', name: 'Travel', description: 'Travel vlogs, destinations, and tourism content', profileCount: 9, color: 'teal' },
  { id: 'cat-6', name: 'Fitness', description: 'Workout routines, health tips, and wellness', profileCount: 14, color: 'green' },
  { id: 'cat-7', name: 'Entertainment', description: 'Comedy, music, acting, and celebrity content', profileCount: 20, color: 'amber' },
  { id: 'cat-8', name: 'Education', description: 'Learning, tutorials, and educational content', profileCount: 8, color: 'indigo' },
  { id: 'cat-9', name: 'Gaming', description: 'Game reviews, streaming, and esports', profileCount: 11, color: 'red' },
  { id: 'cat-10', name: 'Lifestyle', description: 'Daily life, home decor, and family content', profileCount: 16, color: 'gray' },
]

function ColorSwatchPicker({ value, onChange }: { value: ColorKey; onChange: (c: ColorKey) => void }) {
  return (
    <div className="space-y-2">
      <Label>Color</Label>
      <div className="flex flex-wrap gap-2">
        {(Object.entries(COLOR_PRESETS) as [ColorKey, typeof COLOR_PRESETS[ColorKey]][]).map(([key, preset]) => (
          <button
            key={key}
            type="button"
            onClick={() => onChange(key)}
            className={cn(
              'h-6 w-6 rounded-full cursor-pointer transition-all',
              preset.swatch,
              value === key ? 'ring-2 ring-offset-2 ring-current' : 'hover:scale-110'
            )}
            aria-label={preset.label}
          />
        ))}
      </div>
    </div>
  )
}

export default function CategoriesPage() {
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [editCategory, setEditCategory] = useState<Category | null>(null)
  const [newColor, setNewColor] = useState<ColorKey>('blue')
  const [editColor, setEditColor] = useState<ColorKey>('blue')

  const handleEdit = (category: Category) => {
    setEditCategory(category)
    setEditColor(category.color)
    setEditDialogOpen(true)
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Categories"
        description="Organize profiles into categories for targeted analysis"
        actions={
          <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (open) setNewColor('blue') }}>
            <DialogTrigger asChild>
              <Button className="cursor-pointer"><Plus className="mr-2 h-4 w-4" />Add Category</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Create Category</DialogTitle><DialogDescription>Define a new category to organize profiles.</DialogDescription></DialogHeader>
              <form onSubmit={(e) => { e.preventDefault(); setDialogOpen(false); toast.success('Category created') }} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="cat-name">Category Name</Label>
                  <Input id="cat-name" placeholder="e.g. KOL, Brand Ambassador" required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="cat-desc">Description</Label>
                  <Textarea id="cat-desc" placeholder="Describe this category..." rows={3} />
                </div>
                <ColorSwatchPicker value={newColor} onChange={setNewColor} />
                <Button type="submit" className="w-full cursor-pointer">Create Category</Button>
              </form>
            </DialogContent>
          </Dialog>
        }
      />

      {mockCategories.length === 0 ? (
        <EmptyState icon={<Tag className="h-12 w-12" />} title="No categories yet" description="Create categories to organize your profiles" />
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Category</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="text-center">Profiles</TableHead>
                <TableHead className="w-[100px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {mockCategories.map(category => (
                <TableRow key={category.id}>
                  <TableCell>
                    <Badge variant="outline" className={`${COLOR_PRESETS[category.color].badge} border-0`}>{category.name}</Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{category.description}</TableCell>
                  <TableCell className="text-center font-mono font-medium">{category.profileCount}</TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon" className="h-7 w-7 cursor-pointer" onClick={() => handleEdit(category)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 cursor-pointer text-destructive hover:text-destructive" onClick={() => toast.success('Category deleted')}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Edit Category Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit Category</DialogTitle><DialogDescription>Update category details.</DialogDescription></DialogHeader>
          {editCategory && (
            <form onSubmit={(e) => { e.preventDefault(); setEditDialogOpen(false); toast.success('Category updated') }} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="edit-cat-name">Category Name</Label>
                <Input id="edit-cat-name" defaultValue={editCategory.name} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-cat-desc">Description</Label>
                <Textarea id="edit-cat-desc" defaultValue={editCategory.description} rows={3} />
              </div>
              <ColorSwatchPicker value={editColor} onChange={setEditColor} />
              <Button type="submit" className="w-full cursor-pointer">Save Changes</Button>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
