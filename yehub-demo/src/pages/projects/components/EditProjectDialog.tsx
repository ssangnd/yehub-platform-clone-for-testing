import { useState, useEffect, useRef } from 'react'
import { Upload } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Separator } from '@/components/ui/separator'
import { toast } from 'sonner'
import { ProjectCategoryPicker } from './ProjectCategoryPicker'
import type { Project } from '@/types/project'

interface EditProjectDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  project: Project | null
  onSave: (updated: Project) => void
}

export function EditProjectDialog({ open, onOpenChange, project, onSave }: EditProjectDialogProps) {
  const [name, setName] = useState('')
  const [clientName, setClientName] = useState('')
  const [description, setDescription] = useState('')
  const [logo, setLogo] = useState('')
  const [categories, setCategories] = useState<string[]>([])
  const logoInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open && project) {
      setName(project.name)
      setClientName(project.clientName)
      setDescription(project.description)
      setLogo(project.logo || '')
      setCategories([...project.categories])
    }
  }, [open, project])

  const handleLogoFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => setLogo(reader.result as string)
    reader.readAsDataURL(file)
  }

  if (!project) return null

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onSave({
      ...project,
      name: name.trim(),
      clientName: clientName.trim(),
      description: description.trim(),
      categories,
      logo: logo.trim() || undefined,
      updatedAt: new Date().toISOString(),
    })
    onOpenChange(false)
    toast.success('Project updated successfully')
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit Project</DialogTitle>
          <DialogDescription>Update the project details.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <Separator />
          <div className="space-y-2">
            <Label>Logo</Label>
            <div
              className="group/logo relative size-24 rounded-lg border-2 border-dashed bg-muted overflow-hidden flex items-center justify-center cursor-pointer hover:border-primary/50 transition-colors"
              onClick={() => !logo && logoInputRef.current?.click()}
            >
              {logo ? (
                <>
                  <img src={logo} alt="Preview" className="size-full object-contain p-2" />
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-black/60 opacity-0 group-hover/logo:opacity-100 transition-opacity">
                    <button
                      type="button"
                      className="text-xs font-medium text-white hover:underline cursor-pointer"
                      onClick={(e) => { e.stopPropagation(); logoInputRef.current?.click() }}
                    >
                      Change
                    </button>
                    <button
                      type="button"
                      className="text-xs font-medium text-white/80 hover:text-white hover:underline cursor-pointer"
                      onClick={(e) => { e.stopPropagation(); setLogo(''); if (logoInputRef.current) logoInputRef.current.value = '' }}
                    >
                      Remove
                    </button>
                  </div>
                </>
              ) : (
                <div className="flex flex-col items-center gap-1">
                  <Upload className="h-5 w-5 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">Upload</span>
                </div>
              )}
            </div>
            <input
              ref={logoInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleLogoFileChange}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-project-name">Project Name</Label>
            <Input
              id="edit-project-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Vinamilk Q2 2026"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-client-name">Client Name</Label>
            <Input
              id="edit-client-name"
              value={clientName}
              onChange={(e) => setClientName(e.target.value)}
              placeholder="e.g. Vinamilk"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-project-desc">Description</Label>
            <Textarea
              id="edit-project-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Project description..."
              rows={3}
            />
          </div>
          <ProjectCategoryPicker selected={categories} onChange={setCategories} />
          <Separator />
          <div className="flex justify-end gap-3">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} className="cursor-pointer">Cancel</Button>
            <Button type="submit" className="cursor-pointer">Save Changes</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
