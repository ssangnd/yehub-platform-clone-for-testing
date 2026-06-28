import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Plus, AlertTriangle, TrendingDown, Search, Clock } from 'lucide-react'
import { mockAlertRules, mockAlertNotifications } from '@/mocks/fixtures/alerts'
import { mockCampaigns } from '@/mocks/fixtures/campaigns'
import { formatRelativeTime } from '@/lib/utils/format'
import { toast } from 'sonner'
import type { AlertType } from '@/types/alert'

const typeConfig: Record<AlertType, { icon: React.ReactNode; label: string; color: string }> = {
  volume_spike: { icon: <TrendingDown className="h-4 w-4" />, label: 'Volume Spike', color: 'bg-blue-500/10 text-blue-500' },
  sentiment_drop: { icon: <AlertTriangle className="h-4 w-4" />, label: 'Sentiment Drop', color: 'bg-red-500/10 text-red-500' },
  keyword_detection: { icon: <Search className="h-4 w-4" />, label: 'Keyword Detection', color: 'bg-purple-500/10 text-purple-500' },
}

export default function AlertManagementPage() {
  const { campaignId: _campaignId } = useParams()
  const [dialogOpen, setDialogOpen] = useState(false)

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button className="cursor-pointer"><Plus className="mr-2 h-4 w-4" />Create Alert Rule</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle>Create Alert Rule</DialogTitle><DialogDescription>Configure conditions to trigger notifications.</DialogDescription></DialogHeader>
            <form onSubmit={(e) => { e.preventDefault(); setDialogOpen(false); toast.success('Alert rule created') }} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="rule-name">Rule Name</Label>
                <Input id="rule-name" placeholder="e.g. Volume Spike - Campaign X" required />
              </div>
              <div className="space-y-2">
                <Label>Alert Type</Label>
                <Select defaultValue="volume_spike">
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="volume_spike">Volume Spike</SelectItem>
                    <SelectItem value="sentiment_drop">Sentiment Drop</SelectItem>
                    <SelectItem value="keyword_detection">Keyword Detection</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="threshold">Threshold</Label>
                  <Input id="threshold" type="number" placeholder="200" required />
                </div>
                <div className="space-y-2">
                  <Label>Unit</Label>
                  <Select defaultValue="percentage">
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="percentage">Percentage</SelectItem>
                      <SelectItem value="count">Count</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Campaign</Label>
                <Select>
                  <SelectTrigger><SelectValue placeholder="Select campaign" /></SelectTrigger>
                  <SelectContent>
                    {mockCampaigns.filter(c => c.status === 'active').map(c => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button type="submit" className="w-full cursor-pointer">Create Rule</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Tabs defaultValue="rules">
        <TabsList>
          <TabsTrigger value="rules" className="cursor-pointer">Alert Rules</TabsTrigger>
          <TabsTrigger value="history" className="cursor-pointer">
            History
            <Badge variant="destructive" className="ml-1.5 h-5 px-1.5 text-[10px]">
              {mockAlertNotifications.filter(n => !n.isRead).length}
            </Badge>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="rules" className="mt-4 space-y-3">
          {mockAlertRules.map(rule => {
            const config = typeConfig[rule.type]
            return (
              <Card key={rule.id}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Badge variant="outline" className={`${config.color} border-0`}>
                        {config.icon}
                        <span className="ml-1">{config.label}</span>
                      </Badge>
                      <div>
                        <p className="font-medium text-sm">{rule.name}</p>
                        <p className="text-xs text-muted-foreground">
                          Threshold: {rule.threshold}{rule.thresholdUnit === 'percentage' ? '%' : ' count'}
                          {rule.keywords && ` | Keywords: ${rule.keywords.join(', ')}`}
                        </p>
                      </div>
                    </div>
                    <Switch
                      checked={rule.status === 'active'}
                      onCheckedChange={() => toast.success(`Rule ${rule.status === 'active' ? 'paused' : 'activated'}`)}
                    />
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </TabsContent>

        <TabsContent value="history" className="mt-4 space-y-3">
          {mockAlertNotifications.map(notif => {
            const config = typeConfig[notif.type]
            return (
              <Card key={notif.id} className={notif.isRead ? 'opacity-70' : ''}>
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <div className={`mt-0.5 rounded-full p-1.5 ${config.color}`}>
                      {config.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-sm">{notif.message}</p>
                        {!notif.isRead && <Badge variant="destructive" className="h-4 px-1 text-[10px]">New</Badge>}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">{notif.details}</p>
                      <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        <span>{formatRelativeTime(notif.triggeredAt)}</span>
                        <span>|</span>
                        <span>{notif.campaignName}</span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </TabsContent>
      </Tabs>
    </div>
  )
}
