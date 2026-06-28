import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, FolderKanban, MoreVertical, Pencil, Archive, ArchiveRestore, Upload } from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { SearchBar } from '@/components/common/SearchBar'
import { EmptyState } from '@/components/common/EmptyState'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { mockProjects } from '@/mocks/fixtures/projects'
import { formatRelativeTime } from '@/lib/utils/format'
import { toast } from 'sonner'
import { EditProjectDialog } from './components/EditProjectDialog'
import { ProjectCategoryPicker } from './components/ProjectCategoryPicker'
import type { Project } from '@/types/project'

export default function ProjectsListPage() {
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [showArchived, setShowArchived] = useState(false)
  const [projects, setProjects] = useState<Project[]>(mockProjects)
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [selectedProject, setSelectedProject] = useState<Project | null>(null)
  const [createLogoPreview, setCreateLogoPreview] = useState<string>('')
  const [createCategories, setCreateCategories] = useState<string[]>([])
  const createLogoInputRef = useRef<HTMLInputElement>(null)

  const handleLogoFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => setCreateLogoPreview(reader.result as string)
    reader.readAsDataURL(file)
  }

  const filtered = projects.filter(p => {
    const matchesSearch =
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.clientName.toLowerCase().includes(search.toLowerCase())
    const matchesStatus = showArchived ? p.status === 'archived' : p.status === 'active'
    return matchesSearch && matchesStatus
  })

  const archivedCount = projects.filter(p => p.status === 'archived').length

  const handleCreateProject = (e: React.FormEvent) => {
    e.preventDefault()
    setDialogOpen(false)
    toast.success('Project created successfully')
  }

  const handleArchive = (projectId: string) => {
    setProjects(prev =>
      prev.map(p => p.id === projectId ? { ...p, status: 'archived' as const } : p)
    )
    toast.success('Project archived')
  }

  const handleRestore = (projectId: string) => {
    setProjects(prev =>
      prev.map(p => p.id === projectId ? { ...p, status: 'active' as const } : p)
    )
    toast.success('Project restored')
  }

  const handleEdit = (project: Project) => {
    setSelectedProject(project)
    setEditDialogOpen(true)
  }

  const handleSaveEdit = (updated: Project) => {
    setProjects(prev => prev.map(p => p.id === updated.id ? updated : p))
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Projects"
        description="Manage your client projects"
        actions={
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button className="cursor-pointer">
                <Plus className="mr-2 h-4 w-4" />
                New Project
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create New Project</DialogTitle>
                <DialogDescription>Fill in the details to create a new project.</DialogDescription>
              </DialogHeader>
              <form onSubmit={(e) => { handleCreateProject(e); setCreateLogoPreview(''); setCreateCategories([]) }} className="space-y-4">
                <div className="space-y-2">
                  <Label>Logo</Label>
                  <div
                    className="group/logo relative size-24 rounded-lg border-2 border-dashed bg-muted overflow-hidden flex items-center justify-center cursor-pointer hover:border-primary/50 transition-colors"
                    onClick={() => !createLogoPreview && createLogoInputRef.current?.click()}
                  >
                    {createLogoPreview ? (
                      <>
                        <img src={createLogoPreview} alt="Preview" className="size-full object-contain p-2" />
                        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-black/60 opacity-0 group-hover/logo:opacity-100 transition-opacity">
                          <button
                            type="button"
                            className="text-xs font-medium text-white hover:underline cursor-pointer"
                            onClick={(e) => { e.stopPropagation(); createLogoInputRef.current?.click() }}
                          >
                            Change
                          </button>
                          <button
                            type="button"
                            className="text-xs font-medium text-white/80 hover:text-white hover:underline cursor-pointer"
                            onClick={(e) => { e.stopPropagation(); setCreateLogoPreview(''); if (createLogoInputRef.current) createLogoInputRef.current.value = '' }}
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
                    ref={createLogoInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleLogoFileChange}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="project-name">Project Name</Label>
                  <Input id="project-name" placeholder="e.g. Vinamilk Q2 2026" required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="client-name">Client Name</Label>
                  <Input id="client-name" placeholder="e.g. Vinamilk" required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="project-desc">Description</Label>
                  <Textarea id="project-desc" placeholder="Project description..." />
                </div>
                <ProjectCategoryPicker selected={createCategories} onChange={setCreateCategories} />
                <Button type="submit" className="w-full cursor-pointer">Create Project</Button>
              </form>
            </DialogContent>
          </Dialog>
        }
      />

      <div className="flex items-center gap-3">
        <SearchBar value={search} onChange={setSearch} placeholder="Search projects..." className="max-w-md" />
        <Button
          variant={showArchived ? 'default' : 'outline'}
          size="sm"
          className="cursor-pointer shrink-0"
          onClick={() => setShowArchived(!showArchived)}
        >
          <Archive className="mr-2 h-4 w-4" />
          Archived ({archivedCount})
        </Button>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={<FolderKanban className="h-12 w-12" />}
          title={showArchived ? 'No archived projects' : 'No projects found'}
          description={showArchived ? 'Archived projects will appear here' : 'Try a different search term or create a new project'}
        />
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[300px]">Project</TableHead>
                <TableHead className="text-center">Total Campaigns</TableHead>
                <TableHead className="text-center">Planned Campaigns</TableHead>
                <TableHead className="text-center">Active Campaigns</TableHead>
                <TableHead className="text-right">Last Activity</TableHead>
                <TableHead className="w-[50px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map(project => (
                <TableRow
                  key={project.id}
                  className="cursor-pointer"
                  onClick={() => navigate(`/projects/${project.id}`)}
                >
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div className="size-9 shrink-0 rounded-lg border bg-muted overflow-hidden flex items-center justify-center">
                        {project.logo ? (
                          <img
                            src={project.logo}
                            alt={project.clientName}
                            className="size-full object-contain p-1"
                            onError={(e) => {
                              e.currentTarget.style.display = 'none'
                              e.currentTarget.nextElementSibling?.classList.remove('hidden')
                            }}
                          />
                        ) : null}
                        <span className={`text-xs font-bold text-muted-foreground${project.logo ? ' hidden' : ''}`}>
                          {project.clientName.charAt(0)}
                        </span>
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold truncate">{project.name}</p>
                        <p className="text-xs text-muted-foreground truncate">{project.clientName}</p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-center font-mono font-bold">{project.totalCampaigns}</TableCell>
                  <TableCell className="text-center font-mono font-bold">{project.totalCampaigns - project.activeCampaigns}</TableCell>
                  <TableCell className="text-center font-mono font-bold">{project.activeCampaigns}</TableCell>
                  <TableCell className="text-right text-xs text-muted-foreground">
                    {formatRelativeTime(project.updatedAt)}
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 cursor-pointer"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                        <DropdownMenuItem className="cursor-pointer" onClick={() => handleEdit(project)}>
                          <Pencil className="mr-2 h-4 w-4" />
                          Edit
                        </DropdownMenuItem>
                        {project.status === 'active' ? (
                          <DropdownMenuItem className="cursor-pointer" onClick={() => handleArchive(project.id)}>
                            <Archive className="mr-2 h-4 w-4" />
                            Archive
                          </DropdownMenuItem>
                        ) : (
                          <DropdownMenuItem className="cursor-pointer" onClick={() => handleRestore(project.id)}>
                            <ArchiveRestore className="mr-2 h-4 w-4" />
                            Restore
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <EditProjectDialog
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        project={selectedProject}
        onSave={handleSaveEdit}
      />
    </div>
  )
}
