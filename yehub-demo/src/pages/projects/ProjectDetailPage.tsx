import { useState } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { Plus, ArrowLeft, Pencil } from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { MetricCard } from '@/components/common/MetricCard'
import { StatusBadge } from '@/components/common/StatusBadge'
import { PlatformBadge } from '@/components/common/PlatformBadge'
import { EmptyState } from '@/components/common/EmptyState'
import { DataTable, type Column } from '@/components/common/DataTable'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { mockProjects } from '@/mocks/fixtures/projects'
import { mockCampaigns } from '@/mocks/fixtures/campaigns'
import { mockPosts } from '@/mocks/fixtures/posts'
import { formatDateRange } from '@/lib/utils/format'
import { ProjectMembersTab } from './components/ProjectMembersTab'
import { EditProjectDialog } from './components/EditProjectDialog'
import type { Campaign } from '@/types/campaign'
import type { Project } from '@/types/project'

export default function ProjectDetailPage() {
  const { projectId } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const [editDialogOpen, setEditDialogOpen] = useState(false)

  const initialProject = mockProjects.find(p => p.id === projectId)
  const [project, setProject] = useState<Project | undefined>(initialProject)
  const campaigns = mockCampaigns.filter(c => c.projectId === projectId)

  // URL-based tab: /projects/:projectId → campaigns, /projects/:projectId/members → members
  const activeTab = location.pathname.endsWith('/members') ? 'members' : 'campaigns'

  if (!project) {
    return (
      <EmptyState
        title="Project not found"
        action={<Button onClick={() => navigate('/projects')} className="cursor-pointer"><ArrowLeft className="mr-2 h-4 w-4" />Back to Projects</Button>}
      />
    )
  }

  const columns: Column<Campaign>[] = [
    {
      key: 'name',
      header: 'Campaign',
      sortable: true,
      render: (c) => (
        <div>
          <p className="font-medium">{c.name}</p>
          <p className="text-xs text-muted-foreground">{c.description}</p>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (c) => <StatusBadge status={c.status} />,
    },
    {
      key: 'platforms',
      header: 'Platforms',
      render: (c) => (
        <div className="flex gap-1">
          {c.platforms.map(p => <PlatformBadge key={p} platform={p} size="sm" />)}
        </div>
      ),
    },
    {
      key: 'dateRange',
      header: 'Date Range',
      render: (c) => <span className="text-sm">{formatDateRange(c.startDate, c.endDate)}</span>,
    },
    {
      key: 'postCount',
      header: 'Posts',
      sortable: true,
      render: (c) => <span className="font-mono">{c.postCount}</span>,
    },
    {
      key: 'completionRate' as keyof Campaign,
      header: 'Completion',
      render: (c) => {
        const campaignPosts = mockPosts.filter(p => p.campaignId === c.id)
        let rate: number
        if (campaignPosts.length > 0) {
          const totalTarget = campaignPosts.reduce((sum, p) => sum + p.kpiTargets.engagement + p.kpiTargets.buzz + p.kpiTargets.interaction + p.kpiTargets.view, 0)
          const totalCurrent = campaignPosts.reduce((sum, p) => sum + p.kpiCurrents.engagement + p.kpiCurrents.buzz + p.kpiCurrents.interaction + p.kpiCurrents.view, 0)
          rate = totalTarget > 0 ? Math.round((totalCurrent / totalTarget) * 100) : 0
        } else if (c.status === 'completed') {
          rate = 100
        } else if (c.status === 'active') {
          const hash = c.id.split('').reduce((a, ch) => a + ch.charCodeAt(0), 0)
          rate = 30 + (hash % 41)
        } else {
          rate = 0
        }
        return <span className="font-mono">{rate}%</span>
      },
    },
    {
      key: 'engagementRate',
      header: 'Eng. Rate',
      sortable: true,
      render: (c) => <span className="font-mono">{c.engagementRate}%</span>,
    },
  ]

  const handleTabChange = (value: string) => {
    if (value === 'members') {
      navigate(`/projects/${projectId}/members`)
    } else {
      navigate(`/projects/${projectId}`)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 mb-2">
        <Button variant="ghost" size="icon" onClick={() => navigate('/projects')} className="cursor-pointer" aria-label="Back">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <span className="text-sm text-muted-foreground">Projects</span>
      </div>

      <PageHeader
        title={
          <div className="flex items-center gap-3">
            <div className="size-10 shrink-0 rounded-lg border bg-muted overflow-hidden flex items-center justify-center">
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
              <span className={`text-sm font-bold text-muted-foreground${project.logo ? ' hidden' : ''}`}>
                {project.clientName.charAt(0)}
              </span>
            </div>
            <span>{project.name}</span>
          </div>
        }
        description={
          <div className="space-y-1.5">
            <span>{project.clientName} - {project.description}</span>
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs font-medium text-muted-foreground">Categories:</span>
              {project.categories.length > 0 ? (
                project.categories.map(cat => (
                  <Badge key={cat} variant="secondary">{cat}</Badge>
                ))
              ) : (
                <span className="text-xs text-muted-foreground">N/A</span>
              )}
            </div>
          </div>
        }
        actions={
          <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setEditDialogOpen(true)} className="cursor-pointer">
            <Pencil className="mr-2 h-4 w-4" />Edit Project
          </Button>
          <Button className="cursor-pointer" onClick={() => navigate(`/projects/${projectId}/campaigns/new`)}>
            <Plus className="mr-2 h-4 w-4" />New Campaign
          </Button>
          </div>
        }
      />

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Campaigns" value={project.totalCampaigns} />
        <MetricCard label="Active" value={project.activeCampaigns} />
        <MetricCard label="Total Comments" value={project.totalComments} />
        <MetricCard label="Total Posts" value={project.totalPosts} />
      </div>

      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <TabsList>
          <TabsTrigger value="campaigns" className="cursor-pointer">Campaigns</TabsTrigger>
          <TabsTrigger value="members" className="cursor-pointer">Members</TabsTrigger>
        </TabsList>
        <TabsContent value="campaigns" className="mt-4">
          <DataTable
            columns={columns}
            data={campaigns}
            keyExtractor={(c) => c.id}
            onRowClick={(c) => navigate(`/projects/${projectId}/campaigns/${c.id}`)}
            emptyMessage="No campaigns yet"
          />
        </TabsContent>
        <TabsContent value="members" className="mt-4">
          <ProjectMembersTab projectId={project.id} />
        </TabsContent>
      </Tabs>

      <EditProjectDialog
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        project={project}
        onSave={setProject}
      />
    </div>
  )
}
