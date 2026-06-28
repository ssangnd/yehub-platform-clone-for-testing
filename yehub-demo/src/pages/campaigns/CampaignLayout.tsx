import { useState } from 'react'
import { useParams, useNavigate, NavLink, Outlet } from 'react-router-dom'
import {
  ArrowLeft, LayoutDashboard, FileText, MessageSquare, BarChart3,
  Bell, Pencil, Pause, Play, Square, Rocket, Users,
} from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { StatusBadge } from '@/components/common/StatusBadge'
import { PlatformBadge } from '@/components/common/PlatformBadge'
import { EmptyState } from '@/components/common/EmptyState'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { mockCampaigns } from '@/mocks/fixtures/campaigns'
import { mockProjects } from '@/mocks/fixtures/projects'
import { formatDate } from '@/lib/utils/format'
import { toast } from 'sonner'
import type { CampaignStatus } from '@/types/campaign'
import { useCampaignRole } from '@/hooks/useCampaignRole'
import { hasPermission } from '@/lib/constants/roles'

interface CampaignTab {
  label: string
  path: string
  icon: React.ComponentType<{ className?: string }>
}

const campaignTabs: CampaignTab[] = [
  { label: 'Overview', path: '', icon: LayoutDashboard },
  { label: 'Posts', path: 'posts', icon: FileText },
  { label: 'Comments', path: 'comments', icon: MessageSquare },
  { label: 'Analytics', path: 'analytics', icon: BarChart3 },
  { label: 'Alerts', path: 'alerts', icon: Bell },
  { label: 'Members', path: 'members', icon: Users },
]

export default function CampaignLayout() {
  const { projectId, campaignId } = useParams()
  const navigate = useNavigate()
  const [stopDialogOpen, setStopDialogOpen] = useState(false)
  const [campaignStatus, setCampaignStatus] = useState<CampaignStatus | null>(null)

  const campaign = mockCampaigns.find(c => c.id === campaignId)
  const project = mockProjects.find(p => p.id === projectId)

  const role = useCampaignRole(campaignId ?? '')
  const canManageCampaign = role ? hasPermission(role, 'manage_campaigns') : false

  // Use local state for status so pause/resume updates the UI
  const status = campaignStatus ?? campaign?.status ?? 'draft'

  if (!campaign) {
    return (
      <EmptyState
        title="Campaign not found"
        action={
          <Button onClick={() => navigate(projectId ? `/projects/${projectId}` : '/campaigns')} className="cursor-pointer">
            <ArrowLeft className="mr-2 h-4 w-4" />Back
          </Button>
        }
      />
    )
  }

  if (!role) {
    return (
      <EmptyState
        title="Access denied"
        description="You don't have access to this campaign."
        action={
          <Button onClick={() => navigate('/projects')} className="cursor-pointer">
            <ArrowLeft className="mr-2 h-4 w-4" />Back to Projects
          </Button>
        }
      />
    )
  }

  const basePath = `/projects/${projectId}/campaigns/${campaignId}`

  const handlePauseResume = () => {
    if (status === 'active') {
      setCampaignStatus('paused')
      toast.success('Campaign paused')
    } else if (status === 'paused') {
      setCampaignStatus('active')
      toast.success('Campaign resumed')
    }
  }

  const handleStop = () => {
    setCampaignStatus('stopped')
    setStopDialogOpen(false)
    toast.success('Campaign stopped')
  }

  const isRunning = status === 'active' || status === 'paused'

  return (
    <div className="space-y-6">
      {/* Back navigation */}
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate(projectId ? `/projects/${projectId}` : '/campaigns')}
          className="cursor-pointer"
          aria-label="Back"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <span className="text-sm text-muted-foreground">
          {project?.name || 'Campaigns'}
        </span>
      </div>

      {/* Campaign header */}
      <PageHeader
        title={campaign.name}
        description={campaign.description}
        actions={
          <>
            <StatusBadge status={status} />
            {canManageCampaign && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => navigate(`${basePath}/edit`)}
                  className="cursor-pointer"
                >
                  <Pencil className="mr-2 h-4 w-4" />
                  Edit
                </Button>
                {status === 'draft' && (
                  <Button
                    size="sm"
                    onClick={() => { setCampaignStatus('active'); toast.success('Campaign launched') }}
                    className="cursor-pointer"
                  >
                    <Rocket className="mr-2 h-4 w-4" />
                    Launch
                  </Button>
                )}
                {isRunning && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handlePauseResume}
                    className="cursor-pointer"
                  >
                    {status === 'active' ? (
                      <><Pause className="mr-2 h-4 w-4" />Pause</>
                    ) : (
                      <><Play className="mr-2 h-4 w-4" />Resume</>
                    )}
                  </Button>
                )}
                {isRunning && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setStopDialogOpen(true)}
                    className="cursor-pointer text-destructive hover:text-destructive"
                  >
                    <Square className="mr-2 h-4 w-4" />
                    Stop
                  </Button>
                )}
              </>
            )}
          </>
        }
      />

      {/* Stop campaign confirmation dialog */}
      <Dialog open={stopDialogOpen} onOpenChange={setStopDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Stop Campaign</DialogTitle>
            <DialogDescription>
              Are you sure you want to stop <span className="font-medium text-foreground">{campaign.name}</span>? This will permanently end monitoring. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setStopDialogOpen(false)} className="cursor-pointer">
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleStop} className="cursor-pointer">
              Stop Campaign
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Campaign metadata */}
      <div className="flex flex-wrap gap-2 text-sm text-muted-foreground">
        <Badge variant="outline">
          {formatDate(campaign.startDate)} - {formatDate(campaign.endDate)}
        </Badge>
        <Badge variant="outline">Metrics: {campaign.pollingInterval}</Badge>
        <Badge variant="outline">Comments: {campaign.commentPollingInterval ?? '6hr'}</Badge>
        {campaign.platforms.map(p => (
          <PlatformBadge key={p} platform={p} size="sm" />
        ))}
      </div>

      {/* Tab navigation */}
      <div className="border-b">
        <nav className="flex gap-1 overflow-x-auto" aria-label="Campaign tabs">
          {campaignTabs.map(tab => {
            const to = tab.path ? `${basePath}/${tab.path}` : basePath
            return (
              <NavLink
                key={tab.label}
                to={to}
                end={tab.path === ''}
                className={({ isActive }) => cn(
                  'inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium whitespace-nowrap',
                  'border-b-2 transition-colors duration-150',
                  isActive
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
                )}
              >
                <tab.icon className="h-4 w-4" />
                {tab.label}
              </NavLink>
            )
          })}
        </nav>
      </div>

      {/* Child route content */}
      <Outlet />
    </div>
  )
}
