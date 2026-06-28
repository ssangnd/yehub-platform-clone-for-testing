import { useState } from 'react'
import { PageHeader } from '@/components/layout/PageHeader'
import { useAuth } from '@/hooks/useAuth'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'

export default function MyAccountPage() {
  const { user } = useAuth()
  const [name, setName] = useState(user?.name ?? '')
  const initials = user?.name?.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() || 'U'

  return (
    <div className="space-y-6 max-w-2xl">
      <PageHeader title="My Account" description="Manage your account preferences" />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Profile</CardTitle>
          <CardDescription>Your personal information</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            <Avatar className="h-16 w-16">
              <AvatarImage src={user?.avatar} alt={user?.name} />
              <AvatarFallback className="text-xl">{initials}</AvatarFallback>
            </Avatar>
            <Button variant="outline" className="cursor-pointer">Change avatar</Button>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input id="name" value={name} onChange={e => setName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" defaultValue={user?.email} disabled />
            </div>
          </div>
          <Button className="cursor-pointer" onClick={() => toast.success('Profile updated')}>Save changes</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Notifications</CardTitle>
          <CardDescription>Manage notification preferences</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {[
            { label: 'Volume Spike Alerts', desc: 'Get notified when comment volume spikes' },
            { label: 'Sentiment Drops', desc: 'Alert when negative sentiment increases' },
            { label: 'Keyword Detections', desc: 'Notify when monitored keywords appear' },
            { label: 'Campaign Status Changes', desc: 'Updates when campaigns start or end' },
          ].map(item => (
            <div key={item.label} className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">{item.label}</p>
                <p className="text-xs text-muted-foreground">{item.desc}</p>
              </div>
              <Switch defaultChecked />
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}
