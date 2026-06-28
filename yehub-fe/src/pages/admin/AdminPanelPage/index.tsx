import { useState } from 'react'
import { ArrowUp, ArrowDown, ArrowUpDown, UserPlus } from 'lucide-react'
import { useSetPageTitle } from '@/hooks/use-page-title'
import type { AdminUser } from '@/api/admin'
import type { GlobalRole } from '@/api/auth'
import { GLOBAL_ROLE_CONFIG } from '@/lib/constants/roles'
import { formatRelativeTime } from '@/lib/format'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { PageHeader } from '@/components/common/PageHeader'
import { PaginationBar } from '@/components/common/PaginationBar'
import { PageWrapper } from '@/components/common/PageWrapper'
import { PresignedAvatar } from '@/components/common/PresignedAvatar'
import { useAdminUsers, type SortKey } from './use-admin-users'
import { InviteUserDialog } from './components/InviteUserDialog'
import { UserDetailDialog } from './components/UserDetailDialog'
import { UsersFilterToolbar } from './components/UsersFilterToolbar'
import { UsersFilterChips } from './components/UsersFilterChips'
import { StatusBadge } from './components/StatusBadge'

const ROLE_BADGE_VARIANT: Record<GlobalRole, 'destructive' | 'secondary'> = {
  ADMIN: 'destructive',
  INTERNAL_USER: 'secondary',
  AUTHORIZED_USER: 'secondary',
}

function RoleBadge({ role }: { role: GlobalRole }) {
  return <Badge variant={ROLE_BADGE_VARIANT[role]}>{GLOBAL_ROLE_CONFIG[role].label}</Badge>
}

function SortIcon({ colKey, sortKey, sortDir }: { colKey: SortKey; sortKey: SortKey | null; sortDir: 'asc' | 'desc' }) {
  if (sortKey !== colKey) return <ArrowUpDown className="ml-1 h-3 w-3 opacity-50" />
  return sortDir === 'asc' ? <ArrowUp className="ml-1 h-3 w-3" /> : <ArrowDown className="ml-1 h-3 w-3" />
}

export function AdminPanelPage() {
  useSetPageTitle('Users')

  const [inviteOpen, setInviteOpen] = useState(false)
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null)

  const {
    users,
    total,
    totalPages,
    isLoading,
    isError,
    q,
    roles,
    statuses,
    sortKey,
    sortDir,
    page,
    pageSize,
    hasActiveFilters,
    setQ,
    toggleRole,
    toggleStatus,
    toggleSort,
    setPage,
    clearFilters,
  } = useAdminUsers()

  return (
    <PageWrapper>
      <PageHeader
        title="Admin Panel"
        description="Manage users and permissions"
        actions={
          <Button onClick={() => setInviteOpen(true)}>
            <UserPlus />
            Invite User
          </Button>
        }
      />

      <UsersFilterToolbar
        q={q}
        roles={roles}
        statuses={statuses}
        total={total}
        page={page}
        pageSize={pageSize}
        hasActiveFilters={hasActiveFilters}
        onQChange={setQ}
        onToggleRole={toggleRole}
        onToggleStatus={toggleStatus}
        onClearFilters={clearFilters}
      />

      <UsersFilterChips
        q={q}
        roles={roles}
        statuses={statuses}
        onClearQ={() => setQ('')}
        onToggleRole={toggleRole}
        onToggleStatus={toggleStatus}
      />

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>
                <Button
                  variant="ghost"
                  size="sm"
                  className="-ml-3 h-8 cursor-pointer"
                  onClick={() => toggleSort('name')}
                >
                  User <SortIcon colKey="name" sortKey={sortKey} sortDir={sortDir} />
                </Button>
              </TableHead>
              <TableHead>
                <Button
                  variant="ghost"
                  size="sm"
                  className="-ml-3 h-8 cursor-pointer"
                  onClick={() => toggleSort('role')}
                >
                  Role <SortIcon colKey="role" sortKey={sortKey} sortDir={sortDir} />
                </Button>
              </TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Projects</TableHead>
              <TableHead>
                <Button
                  variant="ghost"
                  size="sm"
                  className="-ml-3 h-8 cursor-pointer"
                  onClick={() => toggleSort('last_login_at')}
                >
                  Last Login <SortIcon colKey="last_login_at" sortKey={sortKey} sortDir={sortDir} />
                </Button>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                  Loading users…
                </TableCell>
              </TableRow>
            ) : isError ? (
              <TableRow>
                <TableCell colSpan={5} className="py-8 text-center text-destructive">
                  Failed to load users.
                </TableCell>
              </TableRow>
            ) : users.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                  {hasActiveFilters ? (
                    <div className="flex flex-col items-center gap-2">
                      <span>No users match your filters.</span>
                      <Button variant="outline" size="sm" onClick={clearFilters}>
                        Clear filters
                      </Button>
                    </div>
                  ) : (
                    'No users found.'
                  )}
                </TableCell>
              </TableRow>
            ) : (
              users.map((user: AdminUser) => (
                <TableRow key={user.id} className="cursor-pointer" onClick={() => setSelectedUserId(user.id)}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <PresignedAvatar
                        imageKey={user.avatar}
                        alt={user.name}
                        fallback={(user.name[0] ?? '?').toUpperCase()}
                      />
                      <div>
                        <p className="text-sm font-medium">{user.name}</p>
                        <p className="text-xs text-muted-foreground">{user.email}</p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <RoleBadge role={user.role} />
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={user.status} />
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {user.role === 'ADMIN' ? 'All projects' : `${user.project_count} projects`}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {user.last_login_at ? formatRelativeTime(user.last_login_at) : 'Never'}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <PaginationBar page={page} setPage={setPage} totalPages={totalPages} />

      <InviteUserDialog open={inviteOpen} onOpenChange={setInviteOpen} />

      {selectedUserId && (
        <UserDetailDialog
          userId={selectedUserId}
          open={!!selectedUserId}
          onOpenChange={(v) => {
            if (!v) setSelectedUserId(null)
          }}
        />
      )}
    </PageWrapper>
  )
}
