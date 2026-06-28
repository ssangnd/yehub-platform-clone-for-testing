import { useState } from 'react'
import { PageHeader } from '@/components/layout/PageHeader'
import { ComparisonChart } from '@/components/charts/ComparisonChart'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { mockCampaigns } from '@/mocks/fixtures/campaigns'
import { formatNumber } from '@/lib/utils/format'

export default function CampaignComparisonPage() {
  const activeCampaigns = mockCampaigns.filter(c => c.status === 'active' || c.status === 'completed')
  const [camp1Id, setCamp1Id] = useState(activeCampaigns[0]?.id || '')
  const [camp2Id, setCamp2Id] = useState(activeCampaigns[1]?.id || '')

  const camp1 = mockCampaigns.find(c => c.id === camp1Id)
  const camp2 = mockCampaigns.find(c => c.id === camp2Id)

  const comparisonData = [
    { label: 'Comments', campaign1: camp1?.commentCount || 0, campaign2: camp2?.commentCount || 0 },
    { label: 'Engagements', campaign1: camp1?.engagementCount || 0, campaign2: camp2?.engagementCount || 0 },
    { label: 'Posts', campaign1: camp1?.postCount || 0, campaign2: camp2?.postCount || 0 },
  ]

  const series = [
    { key: 'campaign1', label: camp1?.name || 'Campaign 1', color: '#f4c10b' },
    { key: 'campaign2', label: camp2?.name || 'Campaign 2', color: '#F59E0B' },
  ]

  return (
    <div className="space-y-6">
      <PageHeader title="Campaign Comparison" description="Compare metrics across campaigns" />

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label>Campaign 1</Label>
          <Select value={camp1Id} onValueChange={setCamp1Id}>
            <SelectTrigger><SelectValue placeholder="Select campaign" /></SelectTrigger>
            <SelectContent>
              {activeCampaigns.map(c => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Campaign 2</Label>
          <Select value={camp2Id} onValueChange={setCamp2Id}>
            <SelectTrigger><SelectValue placeholder="Select campaign" /></SelectTrigger>
            <SelectContent>
              {activeCampaigns.map(c => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {camp1 && camp2 && (
        <>
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">{camp1.name}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div><p className="text-xl font-mono font-bold">{formatNumber(camp1.commentCount)}</p><p className="text-xs text-muted-foreground">Comments</p></div>
                  <div><p className="text-xl font-mono font-bold">{formatNumber(camp1.engagementCount)}</p><p className="text-xs text-muted-foreground">Engagements</p></div>
                  <div><p className="text-xl font-mono font-bold">{camp1.engagementRate}%</p><p className="text-xs text-muted-foreground">Eng. Rate</p></div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">{camp2.name}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div><p className="text-xl font-mono font-bold">{formatNumber(camp2.commentCount)}</p><p className="text-xs text-muted-foreground">Comments</p></div>
                  <div><p className="text-xl font-mono font-bold">{formatNumber(camp2.engagementCount)}</p><p className="text-xs text-muted-foreground">Engagements</p></div>
                  <div><p className="text-xl font-mono font-bold">{camp2.engagementRate}%</p><p className="text-xs text-muted-foreground">Eng. Rate</p></div>
                </div>
              </CardContent>
            </Card>
          </div>

          <ComparisonChart data={comparisonData} series={series} title="Metric Comparison" />
        </>
      )}
    </div>
  )
}
