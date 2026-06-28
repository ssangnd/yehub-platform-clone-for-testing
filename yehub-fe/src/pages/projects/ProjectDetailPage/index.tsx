import { useState, useEffect } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { ArrowLeft, Pencil } from 'lucide-react'
import { toast } from 'sonner'
import { PageHeader } from '@/components/common/PageHeader'
import { MetricCard } from '@/components/common/MetricCard'
import { ProjectLogo } from '@/components/common/ProjectLogo'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useSetPageTitle } from '@/hooks/use-page-title'
import { PageWrapper } from '@/components/common/PageWrapper'
import { ProjectFormDialog } from '../components/ProjectFormDialog'
import { ProjectMembersTab } from './components/ProjectMembersTab'
import { ProjectCampaignsTab } from './components/ProjectCampaignsTab'
import { useProjectDetail } from './use-project-detail'

export function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const [editOpen, setEditOpen] = useState(false)

  const { project, projectError, myRoleData, myRole, roleError, isAdmin, canManageMembers, canEdit } =
    useProjectDetail(id)

  useSetPageTitle(project?.name ?? '')

  const activeTab = location.pathname.endsWith('/members') ? 'members' : 'campaigns'

  useEffect(() => {
    if (projectError || roleError) {
      toast.error('Access denied or project not found')
      navigate('/projects')
    }
  }, [projectError, roleError, navigate])

  if (projectError || roleError) return null

  if (!project || (!isAdmin && !myRoleData)) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <p className="text-muted-foreground text-sm">Loading…</p>
      </div>
    )
  }

  const handleTabChange = (value: string) => {
    if (value === 'members') navigate(`/projects/${id}/members`)
    else navigate(`/projects/${id}`)
  }

  return (
    <PageWrapper>
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate('/projects')}
          className="cursor-pointer"
          aria-label="Back"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <span className="text-sm text-muted-foreground">Projects</span>
      </div>

      <PageHeader
        title={
          <div className="flex items-center gap-3">
            <ProjectLogo project={project} size={10} />
            <span>{project.name}</span>
            {!project.active && (
              <span className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">Archived</span>
            )}
          </div>
        }
        description={
          <div className="space-y-1.5">
            {(project.client_name || project.description) && (
              <span>{[project.client_name, project.description].filter(Boolean).join(' — ')}</span>
            )}
            {project.categories.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5">
                {project.categories.map((cat) => (
                  <Badge key={cat.id} variant="secondary">
                    {cat.name}
                  </Badge>
                ))}
              </div>
            )}
          </div>
        }
        actions={
          <div className="flex items-center gap-2">
            {canEdit && project.active && (
              <Button variant="outline" onClick={() => setEditOpen(true)} className="cursor-pointer">
                <Pencil className="mr-2 h-4 w-4" />
                Edit Project
              </Button>
            )}
          </div>
        }
      />

      <div className="grid gap-4 md:grid-cols-4">
        <MetricCard label="Campaigns" value={project.campaign_count} />
        <MetricCard label="Active Campaigns" value={project.active_campaign_count} />
        <MetricCard label="Total Comments" value={project.comment_count} />
        <MetricCard label="Total Posts" value={project.post_count} />
      </div>

      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <TabsList>
          <TabsTrigger value="campaigns" className="cursor-pointer">
            Campaigns
          </TabsTrigger>
          <TabsTrigger value="members" className="cursor-pointer">
            Members
          </TabsTrigger>
        </TabsList>
        <TabsContent value="campaigns" className="mt-4">
          <ProjectCampaignsTab projectId={id!} myRole={myRole} isArchived={!project.active} />
        </TabsContent>
        <TabsContent value="members" className="mt-4">
          <ProjectMembersTab projectId={id!} canManage={canManageMembers && project.active} />
        </TabsContent>
      </Tabs>

      <ProjectFormDialog open={editOpen} onOpenChange={setEditOpen} project={project} />
    </PageWrapper>
  )
}
