import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { FolderKanban, Plus, Archive, MoreVertical, Pencil, ArchiveRestore } from 'lucide-react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { PageHeader } from '@/components/common/PageHeader'
import { SearchBar } from '@/components/common/SearchBar'
import { EmptyState } from '@/components/common/EmptyState'
import { PageWrapper } from '@/components/common/PageWrapper'
import { PaginationBar } from '@/components/common/PaginationBar'
import { DataTable, type Column } from '@/components/common/DataTable'
import { ProjectLogo } from '@/components/common/ProjectLogo'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { useAuthStore } from '@/store/auth.store'
import { useCanGlobal } from '@/hooks/use-can'
import { projectsApi, type Project } from '@/api/projects'
import { queryKeys } from '@/lib/constants/query-keys'
import { showApiError } from '@/lib/errors'
import { formatRelativeTime } from '@/lib/format'
import { useProjectsList } from './use-projects-list'
import { ProjectFormDialog } from '../components/ProjectFormDialog'

function ActionsCell({ project, onEdit }: { project: Project; onEdit: (p: Project) => void }) {
  const queryClient = useQueryClient()

  const archiveMutation = useMutation({
    mutationFn: () =>
      project.active ? projectsApi.archiveProject(project.id) : projectsApi.unarchiveProject(project.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.projects.all })
      toast.success(project.active ? 'Project archived' : 'Project restored')
    },
    onError: (err) =>
      showApiError(err, { fallback: project.active ? 'Failed to archive project' : 'Failed to restore project' }),
  })

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="ghost" size="icon" className="h-8 w-8 cursor-pointer" onClick={(e) => e.stopPropagation()} />
        }
      >
        <MoreVertical className="h-4 w-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
        <DropdownMenuItem className="cursor-pointer" onClick={() => onEdit(project)}>
          <Pencil className="mr-2 h-4 w-4" />
          Edit
        </DropdownMenuItem>
        {project.active ? (
          <DropdownMenuItem className="cursor-pointer" onClick={() => archiveMutation.mutate()}>
            <Archive className="mr-2 h-4 w-4" />
            Archive
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem className="cursor-pointer" onClick={() => archiveMutation.mutate()}>
            <ArchiveRestore className="mr-2 h-4 w-4" />
            Restore
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function ProjectsListPage() {
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const canCreate = useCanGlobal('create_project', user?.role ?? null)
  const [createOpen, setCreateOpen] = useState(false)
  const [editProject, setEditProject] = useState<Project | null>(null)

  const {
    projects,
    totalPages,
    isLoading,
    page,
    setPage,
    search,
    handleSearchChange,
    showArchived,
    handleToggleArchived,
  } = useProjectsList()

  const columns: Column<Project>[] = [
    {
      key: 'name',
      header: 'Project',
      className: 'w-[300px]',
      render: (project) => (
        <div className="flex items-center gap-3">
          <ProjectLogo project={project} size={9} />
          <div className="min-w-0">
            <p className="text-sm font-semibold truncate">{project.name}</p>
            {project.client_name && <p className="text-xs text-muted-foreground truncate">{project.client_name}</p>}
          </div>
        </div>
      ),
    },
    {
      key: 'campaign_count',
      header: 'Total Campaigns',
      className: 'text-center',
      render: (project) => <span className="font-mono font-bold">{project.campaign_count}</span>,
    },
    {
      key: 'planned_campaign_count',
      header: 'Planned Campaigns',
      className: 'text-center',
      render: (project) => <span className="font-mono font-bold">{project.planned_campaign_count}</span>,
    },
    {
      key: 'active_campaign_count',
      header: 'Active Campaigns',
      className: 'text-center',
      render: (project) => <span className="font-mono font-bold">{project.active_campaign_count}</span>,
    },
    {
      key: 'updated_at',
      header: 'Last Activity',
      className: 'text-right',
      render: (project) => (
        <span className="text-xs text-muted-foreground">{formatRelativeTime(project.updated_at)}</span>
      ),
    },
    ...(showArchived
      ? []
      : [
          {
            key: 'actions',
            header: '',
            className: 'w-[50px]',
            render: (project) => <ActionsCell project={project} onEdit={setEditProject} />,
          } satisfies Column<Project>,
        ]),
  ]

  return (
    <PageWrapper>
      <PageHeader
        title="Projects"
        description="Manage your client projects"
        actions={
          canCreate ? (
            <Button className="cursor-pointer" onClick={() => setCreateOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              New Project
            </Button>
          ) : null
        }
      />

      <div className="flex items-center gap-3">
        <SearchBar value={search} onChange={handleSearchChange} placeholder="Search projects…" className="max-w-md" />
        <Button
          variant={showArchived ? 'default' : 'outline'}
          size="sm"
          className="cursor-pointer shrink-0"
          onClick={handleToggleArchived}
        >
          <Archive className="mr-2 h-4 w-4" />
          Archived
        </Button>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading projects…</p>
      ) : projects.length === 0 ? (
        <EmptyState
          icon={<FolderKanban className="h-12 w-12" />}
          title={showArchived ? 'No archived projects' : 'No projects found'}
          description={
            showArchived
              ? 'Archived projects will appear here.'
              : search
                ? 'Try a different search term or create a new project.'
                : 'Create your first project to get started.'
          }
        />
      ) : (
        <DataTable
          columns={columns}
          data={projects}
          keyExtractor={(p) => p.id}
          onRowClick={(p) => navigate(`/projects/${p.id}`)}
        />
      )}

      <PaginationBar page={page} setPage={setPage} totalPages={totalPages} />

      <ProjectFormDialog open={createOpen} onOpenChange={setCreateOpen} />

      <ProjectFormDialog
        open={!!editProject}
        onOpenChange={(v) => {
          if (!v) setEditProject(null)
        }}
        project={editProject}
      />
    </PageWrapper>
  )
}
