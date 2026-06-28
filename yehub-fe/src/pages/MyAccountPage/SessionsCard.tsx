import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Monitor, Smartphone, Globe, LogOut } from 'lucide-react'
import { toast } from 'sonner'
import { authApi } from '@/api/auth'
import type { SessionInfo } from '@/api/auth'
import { queryKeys } from '@/lib/constants/query-keys'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'

function formatRelativeTime(dateString: string) {
  const date = new Date(dateString)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMinutes = Math.floor(diffMs / 60_000)
  const diffHours = Math.floor(diffMs / 3_600_000)
  const diffDays = Math.floor(diffMs / 86_400_000)

  if (diffMinutes < 1) return 'Just now'
  if (diffMinutes < 60) return `${diffMinutes}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  return `${diffDays}d ago`
}

function DeviceIcon({ osName }: { osName: string }) {
  const isMobile = /android|ios/i.test(osName)
  return isMobile ? <Smartphone className="h-5 w-5" /> : <Monitor className="h-5 w-5" />
}

function SessionRow({
  session,
  onRevoke,
  isRevoking,
}: {
  session: SessionInfo
  onRevoke?: (id: string) => void
  isRevoking?: boolean
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 text-muted-foreground">
          <DeviceIcon osName={session.os_name} />
        </div>
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">{session.device_name}</span>
            {session.is_current && (
              <Badge variant="secondary" className="text-xs">
                This device
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground">{session.os_name}</p>
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Globe className="h-3 w-3" />
            <span>{session.ip_address}</span>
            {session.location && <span>({session.location})</span>}
          </div>
          <p className="text-xs text-muted-foreground">Active {formatRelativeTime(session.last_active_at)}</p>
        </div>
      </div>
      {onRevoke && (
        <Button variant="ghost" size="sm" onClick={() => onRevoke(session.id)} disabled={isRevoking}>
          <LogOut className="mr-1 h-4 w-4" />
          Revoke
        </Button>
      )}
    </div>
  )
}

export function SessionsCard() {
  const queryClient = useQueryClient()

  const { data: sessions = [], isLoading } = useQuery({
    queryKey: queryKeys.sessions,
    queryFn: () => authApi.getSessions(),
  })

  const revokeMutation = useMutation({
    mutationFn: (sessionId: string) => authApi.revokeSession(sessionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.sessions })
      toast.success('Session revoked')
    },
    onError: () => toast.error('Failed to revoke session'),
  })

  const revokeAllMutation = useMutation({
    mutationFn: () => authApi.revokeAllOtherSessions(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.sessions })
      toast.success('All other sessions revoked')
    },
    onError: () => toast.error('Failed to revoke sessions'),
  })

  const currentSession = sessions.find((s) => s.is_current)
  const otherSessions = sessions.filter((s) => !s.is_current)

  if (isLoading) return null

  return (
    <Card>
      <CardHeader>
        <CardTitle>Active Sessions</CardTitle>
        <CardDescription>Manage your active sessions across devices.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {currentSession && (
          <div>
            <h4 className="mb-2 text-sm font-medium">Current Session</h4>
            <SessionRow session={currentSession} />
          </div>
        )}

        {otherSessions.length > 0 && (
          <>
            <Separator />
            <div>
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-sm font-medium">Other Sessions</h4>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => revokeAllMutation.mutate()}
                  disabled={revokeAllMutation.isPending}
                >
                  Revoke all others
                </Button>
              </div>
              <div className="divide-y">
                {otherSessions.map((session) => (
                  <SessionRow
                    key={session.id}
                    session={session}
                    onRevoke={(id) => revokeMutation.mutate(id)}
                    isRevoking={revokeMutation.isPending}
                  />
                ))}
              </div>
            </div>
          </>
        )}

        {otherSessions.length === 0 && (
          <>
            <Separator />
            <p className="text-sm text-muted-foreground">No other active sessions.</p>
          </>
        )}
      </CardContent>
    </Card>
  )
}
