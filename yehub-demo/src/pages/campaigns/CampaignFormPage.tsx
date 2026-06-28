import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { useProjectRole } from '@/hooks/useProjectRole'
import { hasPermission } from '@/lib/constants/roles'
import { EmptyState } from '@/components/common/EmptyState'
import { MetricSelector } from '@/components/common/MetricSelector'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { mockCampaigns } from '@/mocks/fixtures/campaigns'
import { mockProjects } from '@/mocks/fixtures/projects'
import { ALL_CAMPAIGN_METRICS } from '@/types/campaign'
import { toast } from 'sonner'
import type { CampaignMetric, PollingInterval } from '@/types/campaign'
import type { Platform } from '@/types/filters'

const POLLING_OPTIONS: { value: PollingInterval; label: string }[] = [
  { value: '15min', label: 'Every 15 minutes' },
  { value: '1hr', label: 'Every hour' },
  { value: '6hr', label: 'Every 6 hours' },
  { value: '12hr', label: 'Every 12 hours' },
  { value: '24hr', label: 'Every 24 hours' },
]

const PLATFORM_OPTIONS: { value: Platform; label: string }[] = [
  { value: 'facebook', label: 'Facebook' },
  { value: 'instagram', label: 'Instagram' },
  { value: 'tiktok', label: 'TikTok' },
  { value: 'youtube', label: 'YouTube' },
  { value: 'threads', label: 'Threads' },
]

export default function CampaignFormPage() {
  const { projectId, campaignId } = useParams()
  const navigate = useNavigate()

  const isEdit = !!campaignId
  const campaign = isEdit ? mockCampaigns.find(c => c.id === campaignId) : null
  const project = mockProjects.find(p => p.id === projectId)

  const projectRole = useProjectRole(projectId ?? '')
  const canManageCampaigns = projectRole ? hasPermission(projectRole, 'manage_campaigns') : false

  const [name, setName] = useState(campaign?.name ?? '')
  const [description, setDescription] = useState(campaign?.description ?? '')
  const [startDate, setStartDate] = useState(campaign?.startDate?.split('T')[0] ?? '')
  const [endDate, setEndDate] = useState(campaign?.endDate?.split('T')[0] ?? '')
  const [metricInterval, setMetricInterval] = useState<PollingInterval>(campaign?.pollingInterval ?? '1hr')
  const [commentInterval, setCommentInterval] = useState<PollingInterval>(campaign?.commentPollingInterval ?? '6hr')
  const [displayMetrics, setDisplayMetrics] = useState<CampaignMetric[]>(campaign?.displayMetrics ?? [...ALL_CAMPAIGN_METRICS])
  const [platforms, setPlatforms] = useState<Platform[]>(campaign?.platforms ?? [])

  const togglePlatform = (platform: Platform) => {
    setPlatforms(prev =>
      prev.includes(platform) ? prev.filter(p => p !== platform) : [...prev, platform]
    )
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    toast.success(isEdit ? 'Campaign updated successfully' : 'Campaign created successfully')
    if (isEdit) {
      navigate(`/projects/${projectId}/campaigns/${campaignId}`)
    } else {
      navigate(`/projects/${projectId}`)
    }
  }

  const backPath = isEdit ? `/projects/${projectId}/campaigns/${campaignId}` : `/projects/${projectId}`

  if (!canManageCampaigns) {
    return (
      <div className="space-y-6">
        <EmptyState
          title="Access denied"
          description="You don't have permission to create or edit campaigns in this project."
          action={
            <Button variant="outline" onClick={() => navigate(projectId ? `/projects/${projectId}` : '/projects')} className="cursor-pointer">
              <ArrowLeft className="mr-2 h-4 w-4" />Back
            </Button>
          }
        />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={isEdit ? 'Edit Campaign' : 'New Campaign'}
        description={project ? `Project: ${project.name}` : ''}
        actions={
          <Button variant="outline" onClick={() => navigate(backPath)} className="cursor-pointer">
            <ArrowLeft className="mr-2 h-4 w-4" />Back
          </Button>
        }
      />

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="grid gap-6 lg:grid-cols-12">
          {/* Row 1: Basic Information (8 col) + Platform (4 col) */}
          <Card className="lg:col-span-8">
            <CardHeader>
              <CardTitle className="text-base">Basic Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="camp-name">Campaign Name</Label>
                <Input
                  id="camp-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Summer Sale 2026"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="camp-desc">Description</Label>
                <Textarea
                  id="camp-desc"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Campaign description..."
                  rows={3}
                />
              </div>
            </CardContent>
          </Card>

          <Card className="lg:col-span-4">
            <CardHeader>
              <CardTitle className="text-base">Platforms</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 gap-3">
                {PLATFORM_OPTIONS.map(opt => (
                  <label key={opt.value} className="flex items-center gap-2 cursor-pointer">
                    <Checkbox
                      checked={platforms.includes(opt.value)}
                      onCheckedChange={() => togglePlatform(opt.value)}
                    />
                    <span className="text-sm">{opt.label}</span>
                  </label>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Row 2: Schedule (6 col) + Polling Intervals (6 col) */}
          <Card className="lg:col-span-6">
            <CardHeader>
              <CardTitle className="text-base">Schedule</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="start-date">Start Date</Label>
                  <Input
                    id="start-date"
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="end-date">End Date</Label>
                  <Input
                    id="end-date"
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    required
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="lg:col-span-6">
            <CardHeader>
              <CardTitle className="text-base">Polling Intervals</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Metric Polling Interval</Label>
                  <Select value={metricInterval} onValueChange={(v) => setMetricInterval(v as PollingInterval)}>
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {POLLING_OPTIONS.map(opt => (
                        <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Comments Polling Interval</Label>
                  <Select value={commentInterval} onValueChange={(v) => setCommentInterval(v as PollingInterval)}>
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {POLLING_OPTIONS.map(opt => (
                        <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Row 3: Display Metrics (full width) */}
          <Card className="lg:col-span-12">
            <CardHeader>
              <CardTitle className="text-base">Display Metrics</CardTitle>
            </CardHeader>
            <CardContent>
              <MetricSelector selected={displayMetrics} onChange={setDisplayMetrics} />
            </CardContent>
          </Card>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3">
          <Button type="submit" className="cursor-pointer">
            {isEdit ? 'Save Changes' : 'Create Campaign'}
          </Button>
          <Button type="button" variant="outline" onClick={() => navigate(backPath)} className="cursor-pointer">
            Cancel
          </Button>
        </div>
      </form>
    </div>
  )
}
