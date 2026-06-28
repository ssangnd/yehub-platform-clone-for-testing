# ProjectDetailPage & AdminPanelPage Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply the established Folder Structure Best Practices to `ProjectDetailPage.tsx` and `admin-panel.tsx` — extracting query logic into co-located hooks and page-private sub-components into page folders.

**Architecture:** Same pattern as `ProjectsListPage`: page becomes a `PascalCase/index.tsx` folder, data-fetching moves to a co-located `use-*.ts` hook, page-only sub-components move inside `components/`. No behavioral changes.

**Tech Stack:** React 19, TypeScript, TanStack React Query v5, React Router Dom v7, Tailwind CSS v4, shadcn/ui, Lucide React

---

## File Map

### Part 1 — ProjectDetailPage

| Action | Path |
|--------|------|
| CREATE | `src/pages/projects/ProjectDetailPage/use-project-detail.ts` |
| MOVE | `src/pages/projects/ProjectDetailPage/components/ProjectMembersTab.tsx` |
| MOVE | `src/pages/projects/ProjectDetailPage/components/AddMemberDialog.tsx` |
| CREATE | `src/pages/projects/ProjectDetailPage/index.tsx` |
| DELETE | `src/pages/projects/ProjectDetailPage.tsx` |

### Part 2 — AdminPanelPage

| Action | Path |
|--------|------|
| CREATE | `src/pages/admin/AdminPanelPage/components/InviteUserDialog.tsx` |
| CREATE | `src/pages/admin/AdminPanelPage/components/UserDetailDialog.tsx` |
| CREATE | `src/pages/admin/AdminPanelPage/use-admin-users.ts` |
| CREATE | `src/pages/admin/AdminPanelPage/index.tsx` |
| DELETE | `src/pages/admin/admin-panel.tsx` |
| UPDATE | `src/router.tsx` line 32 |

---

## Task 1: Create `use-project-detail` hook

**Files:**
- Create: `src/pages/projects/ProjectDetailPage/use-project-detail.ts`

- [ ] **Step 1: Create the directory and file**

```bash
mkdir -p yehub-fe/src/pages/projects/ProjectDetailPage
```

Create `src/pages/projects/ProjectDetailPage/use-project-detail.ts`:

```ts
import { useQuery } from '@tanstack/react-query'
import { projectsApi } from '@/api/projects'
import { useCan } from '@/hooks/use-can'
import { useAuthStore } from '@/store/auth.store'

export function useProjectDetail(id: string | undefined) {
  const isAdmin = useAuthStore((s) => s.user?.role === 'ADMIN')

  const { data: project, isError: projectError } = useQuery({
    queryKey: ['project', id],
    queryFn: () => projectsApi.getProject(id!).then((r) => r.data),
    enabled: !!id,
  })

  const { data: myRoleData, isError: roleError } = useQuery({
    queryKey: ['project-me', id],
    queryFn: () => projectsApi.getMyRole(id!).then((r) => r.data),
    enabled: !!id && !isAdmin,
  })

  const myRole = myRoleData?.role ?? null
  const canManageByRole = useCan('manage_members', myRole)
  const canManageMembers = isAdmin || canManageByRole

  return {
    project,
    projectError,
    myRoleData,
    roleError,
    isAdmin,
    canManageMembers,
  }
}
```

- [ ] **Step 2: Verify**

```bash
cd yehub-fe && pnpm build 2>&1 | tail -5
```

Expected: `✓ built` with no errors.

- [ ] **Step 3: Commit**

```bash
git add yehub-fe/src/pages/projects/ProjectDetailPage/use-project-detail.ts
git commit -m "refactor: add use-project-detail hook"
```

---

## Task 2: Move `ProjectMembersTab` and `AddMemberDialog`

**Files:**
- Create: `src/pages/projects/ProjectDetailPage/components/ProjectMembersTab.tsx`
- Create: `src/pages/projects/ProjectDetailPage/components/AddMemberDialog.tsx`
- Delete: `src/pages/projects/components/ProjectMembersTab.tsx`
- Delete: `src/pages/projects/components/AddMemberDialog.tsx`

Both files use only `@/` aliases internally **except** `ProjectMembersTab` which imports `AddMemberDialog` from `./AddMemberDialog`. Since both move together into the same `components/` folder, that relative import stays unchanged.

- [ ] **Step 1: Create the components directory**

```bash
mkdir -p yehub-fe/src/pages/projects/ProjectDetailPage/components
```

- [ ] **Step 2: Copy `AddMemberDialog.tsx` — content is identical, no import changes**

Create `src/pages/projects/ProjectDetailPage/components/AddMemberDialog.tsx` with the full content of `src/pages/projects/components/AddMemberDialog.tsx` (all imports are `@/` aliases — nothing to change).

- [ ] **Step 3: Copy `ProjectMembersTab.tsx` — content is identical, no import changes**

Create `src/pages/projects/ProjectDetailPage/components/ProjectMembersTab.tsx` with the full content of `src/pages/projects/components/ProjectMembersTab.tsx`. The import `from './AddMemberDialog'` is still valid since both files are now siblings in `ProjectDetailPage/components/`.

- [ ] **Step 4: Delete the old files**

```bash
rm yehub-fe/src/pages/projects/components/ProjectMembersTab.tsx
rm yehub-fe/src/pages/projects/components/AddMemberDialog.tsx
```

- [ ] **Step 5: Verify**

```bash
cd yehub-fe && pnpm build 2>&1 | tail -10
```

Expected: Build fails with `Cannot find module './components/ProjectMembersTab'` from `ProjectDetailPage.tsx` — that is expected and is fixed in Task 3.

- [ ] **Step 6: Commit**

```bash
git add yehub-fe/src/pages/projects/ProjectDetailPage/components/ProjectMembersTab.tsx \
        yehub-fe/src/pages/projects/ProjectDetailPage/components/AddMemberDialog.tsx
git rm yehub-fe/src/pages/projects/components/ProjectMembersTab.tsx \
       yehub-fe/src/pages/projects/components/AddMemberDialog.tsx
git commit -m "refactor: move ProjectMembersTab and AddMemberDialog into ProjectDetailPage/components"
```

---

## Task 3: Create `ProjectDetailPage/index.tsx` and remove old file

**Files:**
- Create: `src/pages/projects/ProjectDetailPage/index.tsx`
- Delete: `src/pages/projects/ProjectDetailPage.tsx`

> Key import change: `EditProjectDialog` was at `./components/EditProjectDialog`. Inside the new folder it becomes `../components/EditProjectDialog`.
> Router import `@/pages/projects/ProjectDetailPage` resolves to `ProjectDetailPage/index.tsx` automatically — **no router change needed**.

- [ ] **Step 1: Create `src/pages/projects/ProjectDetailPage/index.tsx`**

```tsx
import { useState, useEffect } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { ArrowLeft, Pencil, Plus, FolderKanban } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { PageHeader } from '@/components/common/PageHeader'
import { MetricCard } from '@/components/common/MetricCard'
import { EmptyState } from '@/components/common/EmptyState'
import { ProjectLogo } from '@/components/common/ProjectLogo'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useSetPageTitle } from '@/components/protected-route'
import { PageWrapper } from '@/components/common/PageWrapper'
import { EditProjectDialog } from '../components/EditProjectDialog'
import { ProjectMembersTab } from './components/ProjectMembersTab'
import { useProjectDetail } from './use-project-detail'

export function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const queryClient = useQueryClient()
  const [editOpen, setEditOpen] = useState(false)

  const { project, projectError, myRoleData, roleError, isAdmin, canManageMembers } =
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
              <span className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                Archived
              </span>
            )}
          </div>
        }
        description={
          <div className="space-y-1.5">
            {(project.client_name || project.description) && (
              <span>
                {[project.client_name, project.description].filter(Boolean).join(' — ')}
              </span>
            )}
            {project.categories.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5">
                {project.categories.map((cat) => (
                  <Badge key={cat.id} variant="secondary">{cat.name}</Badge>
                ))}
              </div>
            )}
          </div>
        }
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => setEditOpen(true)} className="cursor-pointer">
              <Pencil className="mr-2 h-4 w-4" />
              Edit Project
            </Button>
            <Button className="cursor-pointer" disabled>
              <Plus className="mr-2 h-4 w-4" />
              New Campaign
            </Button>
          </div>
        }
      />

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Campaigns" value={project.campaign_count} />
        <MetricCard label="Active Campaigns" value="—" />
        <MetricCard label="Members" value={project.member_count} />
        <MetricCard label="Posts" value={0} />
      </div>

      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <TabsList>
          <TabsTrigger value="campaigns" className="cursor-pointer">Campaigns</TabsTrigger>
          <TabsTrigger value="members" className="cursor-pointer">Members</TabsTrigger>
        </TabsList>
        <TabsContent value="campaigns" className="mt-4">
          <EmptyState
            icon={<FolderKanban className="h-10 w-10" />}
            title="No campaigns yet"
            description="Campaigns will appear here once created."
          />
        </TabsContent>
        <TabsContent value="members" className="mt-4">
          <ProjectMembersTab projectId={id!} canManage={canManageMembers} />
        </TabsContent>
      </Tabs>

      <EditProjectDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        project={project}
        onSave={(updated) => {
          queryClient.setQueryData(['project', id], updated)
        }}
      />
    </PageWrapper>
  )
}
```

- [ ] **Step 2: Delete the old flat file**

```bash
rm yehub-fe/src/pages/projects/ProjectDetailPage.tsx
```

- [ ] **Step 3: Full build check**

```bash
cd yehub-fe && pnpm build 2>&1 | tail -10
```

Expected: `✓ built` with no TypeScript errors.

- [ ] **Step 4: Lint check**

```bash
cd yehub-fe && pnpm lint 2>&1 | tail -10
```

Expected: no new errors in the files we touched.

- [ ] **Step 5: Commit**

```bash
git add yehub-fe/src/pages/projects/ProjectDetailPage/index.tsx
git rm yehub-fe/src/pages/projects/ProjectDetailPage.tsx
git commit -m "refactor: replace ProjectDetailPage flat file with folder structure"
```

---

## Task 4: Extract `InviteUserDialog` component

**Files:**
- Create: `src/pages/admin/AdminPanelPage/components/InviteUserDialog.tsx`

- [ ] **Step 1: Create the directory**

```bash
mkdir -p yehub-fe/src/pages/admin/AdminPanelPage/components
```

- [ ] **Step 2: Create `src/pages/admin/AdminPanelPage/components/InviteUserDialog.tsx`**

This is the `InviteUserDialog` function extracted from `admin-panel.tsx` lines 68–173, with its own imports.

```tsx
import { useQueryClient, useMutation } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { adminApi } from '@/api/admin'
import type { GlobalRole } from '@/api/auth'
import { inviteUserSchema, type InviteUserFormValues } from '@/lib/schemas'
import { GLOBAL_ROLE_CONFIG } from '@/lib/constants/roles'

interface InviteUserDialogProps {
  open: boolean
  onOpenChange: (v: boolean) => void
}

export function InviteUserDialog({ open, onOpenChange }: InviteUserDialogProps) {
  const queryClient = useQueryClient()
  const form = useForm<InviteUserFormValues>({
    resolver: zodResolver(inviteUserSchema),
    defaultValues: { name: '', email: '', role: 'AUTHORIZED_USER' },
  })

  const inviteMutation = useMutation({
    mutationFn: (data: InviteUserFormValues) => adminApi.inviteUser(data),
    onSuccess: () => {
      toast.success('Invitation sent successfully')
      queryClient.invalidateQueries({ queryKey: ['admin-users'] })
      onOpenChange(false)
      form.reset()
    },
    onError: () => toast.error('Failed to send invitation'),
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Invite User</DialogTitle>
          <DialogDescription>Send an invitation email to add a new team member.</DialogDescription>
        </DialogHeader>
        <Separator />
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit((v) => inviteMutation.mutate(v))}
            className="space-y-4"
          >
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Full Name</FormLabel>
                  <FormControl>
                    <Input placeholder="John Doe" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email</FormLabel>
                  <FormControl>
                    <Input type="email" placeholder="user@company.com" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="role"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Role</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {(Object.keys(GLOBAL_ROLE_CONFIG) as GlobalRole[]).map((role) => (
                        <SelectItem key={role} value={role}>
                          {GLOBAL_ROLE_CONFIG[role].label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Separator />
            <div className="flex justify-end gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => { onOpenChange(false); form.reset() }}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={inviteMutation.isPending}>
                {inviteMutation.isPending ? 'Sending…' : 'Send Invitation'}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 3: Verify**

```bash
cd yehub-fe && pnpm build 2>&1 | tail -5
```

Expected: `✓ built`.

- [ ] **Step 4: Commit**

```bash
git add yehub-fe/src/pages/admin/AdminPanelPage/components/InviteUserDialog.tsx
git commit -m "refactor: extract InviteUserDialog to AdminPanelPage/components"
```

---

## Task 5: Extract `UserDetailDialog` component

**Files:**
- Create: `src/pages/admin/AdminPanelPage/components/UserDetailDialog.tsx`

- [ ] **Step 1: Create `src/pages/admin/AdminPanelPage/components/UserDetailDialog.tsx`**

This is the `UserDetailDialog` function extracted from `admin-panel.tsx` lines 177–624, with its own imports.

```tsx
import { useState, useEffect } from 'react'
import { Trash2, Ban, UserCheck, TriangleAlert, X } from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Separator } from '@/components/ui/separator'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { adminApi } from '@/api/admin'
import type { GlobalRole } from '@/api/auth'
import type { ProjectRole } from '@/api/projects'
import { GLOBAL_ROLE_CONFIG, PROJECT_ROLE_CONFIG } from '@/lib/constants/roles'
import { formatRelativeTime } from '@/lib/format'

interface UserDetailDialogProps {
  userId: string
  open: boolean
  onOpenChange: (v: boolean) => void
}

export function UserDetailDialog({ userId, open, onOpenChange }: UserDetailDialogProps) {
  const queryClient = useQueryClient()
  const [confirmRemoveOpen, setConfirmRemoveOpen] = useState(false)
  const [confirmDisableOpen, setConfirmDisableOpen] = useState(false)
  const [confirmEnableOpen, setConfirmEnableOpen] = useState(false)
  const [confirmRoleOpen, setConfirmRoleOpen] = useState(false)
  const [pendingRole, setPendingRole] = useState<GlobalRole | null>(null)
  const [confirmMembershipOpen, setConfirmMembershipOpen] = useState(false)
  const [pendingMembership, setPendingMembership] = useState<{
    projectId: string
    projectName: string
  } | null>(null)

  const { data: user, isLoading } = useQuery({
    queryKey: ['admin-user', userId],
    queryFn: () => adminApi.getUser(userId),
    enabled: open,
  })

  const updateRoleMutation = useMutation({
    mutationFn: (role: GlobalRole) => adminApi.updateRole(userId, role),
    onSuccess: () => {
      toast.success('Role updated')
      queryClient.invalidateQueries({ queryKey: ['admin-users'] })
      queryClient.invalidateQueries({ queryKey: ['admin-user', userId] })
    },
    onError: () => toast.error('Failed to update role'),
  })

  const disableMutation = useMutation({
    mutationFn: () => adminApi.disableUser(userId),
    onSuccess: () => {
      toast.success('Account disabled')
      queryClient.invalidateQueries({ queryKey: ['admin-users'] })
      queryClient.invalidateQueries({ queryKey: ['admin-user', userId] })
    },
    onError: () => toast.error('Failed to disable account'),
  })

  const enableMutation = useMutation({
    mutationFn: () => adminApi.enableUser(userId),
    onSuccess: () => {
      toast.success('Account enabled')
      queryClient.invalidateQueries({ queryKey: ['admin-users'] })
      queryClient.invalidateQueries({ queryKey: ['admin-user', userId] })
    },
    onError: () => toast.error('Failed to enable account'),
  })

  const removeMutation = useMutation({
    mutationFn: () => adminApi.removeUser(userId),
    onSuccess: () => {
      toast.success('User removed')
      queryClient.invalidateQueries({ queryKey: ['admin-users'] })
      onOpenChange(false)
    },
    onError: () => toast.error('Failed to remove user'),
  })

  const removeMembershipMutation = useMutation({
    mutationFn: (projectId: string) => adminApi.removeUserMembership(userId, projectId),
    onSuccess: () => {
      toast.success('Membership removed')
      queryClient.invalidateQueries({ queryKey: ['admin-user', userId] })
      queryClient.invalidateQueries({ queryKey: ['admin-users'] })
    },
    onError: () => toast.error('Failed to remove membership'),
  })

  useEffect(() => {
    if (!open) {
      setPendingRole(null)
      setPendingMembership(null)
    }
  }, [open])

  const promotingToAdmin = user?.role !== 'ADMIN' && pendingRole === 'ADMIN'
  const demotingFromAdmin = user?.role === 'ADMIN' && pendingRole !== 'ADMIN'

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>User Details</DialogTitle>
            <DialogDescription>View user information and project memberships.</DialogDescription>
          </DialogHeader>

          {isLoading ? (
            <p className="py-4 text-sm text-muted-foreground">Loading…</p>
          ) : !user ? (
            <p className="py-4 text-sm text-destructive">Failed to load user.</p>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <Avatar size="lg">
                  <AvatarFallback>{(user.name[0] ?? '?').toUpperCase()}</AvatarFallback>
                </Avatar>
                <div>
                  <p className="font-semibold">{user.name}</p>
                  <p className="text-sm text-muted-foreground">{user.email}</p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-4 text-sm">
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">Role:</span>
                  <Select
                    value={user.role}
                    onValueChange={(v) => {
                      const role = v as GlobalRole
                      if (role === user.role) return
                      setPendingRole(role)
                      setConfirmRoleOpen(true)
                    }}
                  >
                    <SelectTrigger className="h-8 w-36 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(Object.keys(GLOBAL_ROLE_CONFIG) as GlobalRole[]).map((role) => (
                        <SelectItem key={role} value={role}>
                          {GLOBAL_ROLE_CONFIG[role].label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">Status:</span>
                  <Badge
                    variant="outline"
                    className={user.active ? 'bg-green-500/10 text-green-500 border-0' : ''}
                  >
                    {user.active ? 'Active' : 'Inactive'}
                  </Badge>
                </div>
              </div>

              <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
                <span>
                  Last login:{' '}
                  {user.last_login_at ? formatRelativeTime(user.last_login_at) : 'Never'}
                </span>
                <span>Created: {new Date(user.created_at).toLocaleDateString()}</span>
              </div>

              <Separator />

              <div>
                <p className="mb-3 text-sm font-medium">Access</p>
                {user.role === 'ADMIN' ? (
                  <p className="py-4 text-center text-sm text-muted-foreground">
                    Admin has access to all projects.
                  </p>
                ) : user.memberships.length === 0 ? (
                  <p className="py-4 text-center text-sm text-muted-foreground">
                    No project memberships.
                  </p>
                ) : (
                  <div className="max-h-48 space-y-2 overflow-y-auto pr-1">
                    {user.memberships.map((m) => (
                      <div
                        key={m.project_id}
                        className="flex items-center justify-between rounded-md border px-3 py-2"
                      >
                        <p className="text-sm font-medium">{m.project_name}</p>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline">
                            {PROJECT_ROLE_CONFIG[m.role as ProjectRole].label}
                          </Badge>
                          <Button
                            variant="ghost"
                            size="icon-xs"
                            className="text-muted-foreground hover:text-destructive"
                            onClick={() => {
                              setPendingMembership({
                                projectId: m.project_id,
                                projectName: m.project_name,
                              })
                              setConfirmMembershipOpen(true)
                            }}
                          >
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <Separator />

              <div className="flex justify-between">
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => setConfirmRemoveOpen(true)}
                  disabled={removeMutation.isPending}
                >
                  <Trash2 />
                  Remove User
                </Button>
                {user.active ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setConfirmDisableOpen(true)}
                    disabled={disableMutation.isPending}
                  >
                    <Ban />
                    Disable Account
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setConfirmEnableOpen(true)}
                    disabled={enableMutation.isPending}
                  >
                    <UserCheck />
                    Enable Account
                  </Button>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={confirmRemoveOpen} onOpenChange={setConfirmRemoveOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <TriangleAlert className="h-5 w-5 text-destructive" />
              Remove User
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to permanently remove{' '}
              <span className="font-medium text-foreground">{user?.name}</span>? This
              action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="mt-2 flex justify-end gap-3">
            <Button variant="outline" onClick={() => setConfirmRemoveOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={removeMutation.isPending}
              onClick={() => {
                setConfirmRemoveOpen(false)
                removeMutation.mutate()
              }}
            >
              Remove
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmDisableOpen} onOpenChange={setConfirmDisableOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <TriangleAlert className="h-5 w-5 text-amber-500" />
              Disable Account
            </DialogTitle>
            <DialogDescription>
              Disable{' '}
              <span className="font-medium text-foreground">{user?.name}</span>'s account?
              They will be signed out immediately.
            </DialogDescription>
          </DialogHeader>
          <div className="mt-2 flex justify-end gap-3">
            <Button variant="outline" onClick={() => setConfirmDisableOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={disableMutation.isPending}
              onClick={() => {
                setConfirmDisableOpen(false)
                disableMutation.mutate()
              }}
            >
              Disable
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmEnableOpen} onOpenChange={setConfirmEnableOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <TriangleAlert className="h-5 w-5 text-amber-500" />
              Enable Account
            </DialogTitle>
            <DialogDescription>
              Re-activate{' '}
              <span className="font-medium text-foreground">{user?.name}</span>'s account?
            </DialogDescription>
          </DialogHeader>
          <div className="mt-2 flex justify-end gap-3">
            <Button variant="outline" onClick={() => setConfirmEnableOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={enableMutation.isPending}
              onClick={() => {
                setConfirmEnableOpen(false)
                enableMutation.mutate()
              }}
            >
              Enable
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={confirmRoleOpen}
        onOpenChange={(v) => {
          setConfirmRoleOpen(v)
          if (!v) setPendingRole(null)
        }}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <TriangleAlert className="h-5 w-5 text-amber-500" />
              Change Role
            </DialogTitle>
            <DialogDescription>
              {promotingToAdmin ? (
                <>
                  Promoting{' '}
                  <span className="font-medium text-foreground">{user?.name}</span> to
                  Admin will grant full system access including all projects.
                </>
              ) : demotingFromAdmin ? (
                <>
                  Changing{' '}
                  <span className="font-medium text-foreground">{user?.name}</span> from
                  Admin will revoke global access. They will need individual project
                  assignments to regain access.
                </>
              ) : (
                <>
                  Change{' '}
                  <span className="font-medium text-foreground">{user?.name}</span>'s role
                  to{' '}
                  <span className="font-medium text-foreground">
                    {pendingRole ? GLOBAL_ROLE_CONFIG[pendingRole].label : ''}
                  </span>
                  ?
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="mt-2 flex justify-end gap-3">
            <Button
              variant="outline"
              onClick={() => {
                setConfirmRoleOpen(false)
                setPendingRole(null)
              }}
            >
              Cancel
            </Button>
            <Button
              disabled={updateRoleMutation.isPending}
              onClick={() => {
                if (pendingRole) updateRoleMutation.mutate(pendingRole)
                setConfirmRoleOpen(false)
                setPendingRole(null)
              }}
            >
              Confirm
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={confirmMembershipOpen}
        onOpenChange={(v) => {
          setConfirmMembershipOpen(v)
          if (!v) setPendingMembership(null)
        }}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <TriangleAlert className="h-5 w-5 text-amber-500" />
              Remove Project Access
            </DialogTitle>
            <DialogDescription>
              Remove{' '}
              <span className="font-medium text-foreground">{user?.name}</span> from{' '}
              <span className="font-medium text-foreground">
                {pendingMembership?.projectName}
              </span>
              ?
            </DialogDescription>
          </DialogHeader>
          <div className="mt-2 flex justify-end gap-3">
            <Button
              variant="outline"
              onClick={() => {
                setConfirmMembershipOpen(false)
                setPendingMembership(null)
              }}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={removeMembershipMutation.isPending}
              onClick={() => {
                if (pendingMembership)
                  removeMembershipMutation.mutate(pendingMembership.projectId)
                setConfirmMembershipOpen(false)
                setPendingMembership(null)
              }}
            >
              Remove
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
```

- [ ] **Step 2: Verify**

```bash
cd yehub-fe && pnpm build 2>&1 | tail -5
```

Expected: `✓ built`.

- [ ] **Step 3: Commit**

```bash
git add yehub-fe/src/pages/admin/AdminPanelPage/components/UserDetailDialog.tsx
git commit -m "refactor: extract UserDetailDialog to AdminPanelPage/components"
```

---

## Task 6: Create `use-admin-users` hook

**Files:**
- Create: `src/pages/admin/AdminPanelPage/use-admin-users.ts`

- [ ] **Step 1: Create `src/pages/admin/AdminPanelPage/use-admin-users.ts`**

```ts
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { adminApi } from '@/api/admin'

export type SortKey = 'name' | 'role' | 'last_login_at'

const PAGE_SIZE = 10

export function useAdminUsers() {
  const [sortKey, setSortKey] = useState<SortKey | null>(null)
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [page, setPage] = useState(1)

  const { data, isLoading, isError } = useQuery({
    queryKey: ['admin-users', sortKey, sortDir, page],
    queryFn: () =>
      adminApi.listUsers({
        ...(sortKey ? { sortBy: sortKey, sortDir } : {}),
        page,
        limit: PAGE_SIZE,
      }),
  })

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
    setPage(1)
  }

  return {
    data,
    isLoading,
    isError,
    totalPages: data?.totalPages ?? 1,
    paginatedUsers: data?.data ?? [],
    sortKey,
    sortDir,
    page,
    setPage,
    handleSort,
  }
}
```

- [ ] **Step 2: Verify**

```bash
cd yehub-fe && pnpm build 2>&1 | tail -5
```

Expected: `✓ built`.

- [ ] **Step 3: Commit**

```bash
git add yehub-fe/src/pages/admin/AdminPanelPage/use-admin-users.ts
git commit -m "refactor: add use-admin-users hook"
```

---

## Task 7: Create `AdminPanelPage/index.tsx`, update router, delete old file

**Files:**
- Create: `src/pages/admin/AdminPanelPage/index.tsx`
- Modify: `src/router.tsx` line 32
- Delete: `src/pages/admin/admin-panel.tsx`

> Router change: `import('@/pages/admin/admin-panel')` → `import('@/pages/admin/AdminPanelPage')`
> Unlike `ProjectDetailPage`, the folder name differs from the old file name so Vite **cannot** resolve it automatically — the router **must** be updated.

- [ ] **Step 1: Create `src/pages/admin/AdminPanelPage/index.tsx`**

```tsx
import { useState } from 'react'
import { ArrowUp, ArrowDown, ArrowUpDown, UserPlus } from 'lucide-react'
import { useSetPageTitle } from '@/components/protected-route'
import { adminApi } from '@/api/admin'
import type { AdminUser } from '@/api/admin'
import type { GlobalRole } from '@/api/auth'
import { GLOBAL_ROLE_CONFIG } from '@/lib/constants/roles'
import { formatRelativeTime } from '@/lib/format'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination'
import { PageHeader } from '@/components/common/PageHeader'
import { PageWrapper } from '@/components/common/PageWrapper'
import { useAdminUsers, type SortKey } from './use-admin-users'
import { InviteUserDialog } from './components/InviteUserDialog'
import { UserDetailDialog } from './components/UserDetailDialog'

const ROLE_BADGE_VARIANT: Record<GlobalRole, 'destructive' | 'default' | 'secondary'> = {
  ADMIN: 'destructive',
  INTERNAL_USER: 'default',
  AUTHORIZED_USER: 'secondary',
}

function RoleBadge({ role }: { role: GlobalRole }) {
  return <Badge variant={ROLE_BADGE_VARIANT[role]}>{GLOBAL_ROLE_CONFIG[role].label}</Badge>
}

function StatusBadge({ active }: { active: boolean }) {
  return (
    <Badge
      variant="outline"
      className={active ? 'bg-green-500/10 text-green-500 border-0' : ''}
    >
      {active ? 'Active' : 'Inactive'}
    </Badge>
  )
}

function SortIcon({
  colKey,
  sortKey,
  sortDir,
}: {
  colKey: SortKey
  sortKey: SortKey | null
  sortDir: 'asc' | 'desc'
}) {
  if (sortKey !== colKey) return <ArrowUpDown className="ml-1 h-3 w-3 opacity-50" />
  return sortDir === 'asc'
    ? <ArrowUp className="ml-1 h-3 w-3" />
    : <ArrowDown className="ml-1 h-3 w-3" />
}

export function AdminPanelPage() {
  useSetPageTitle('Users')

  const [inviteOpen, setInviteOpen] = useState(false)
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null)

  const {
    isLoading,
    isError,
    totalPages,
    paginatedUsers,
    sortKey,
    sortDir,
    page,
    setPage,
    handleSort,
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

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>
                <Button
                  variant="ghost"
                  size="sm"
                  className="-ml-3 h-8 cursor-pointer"
                  onClick={() => handleSort('name')}
                >
                  User <SortIcon colKey="name" sortKey={sortKey} sortDir={sortDir} />
                </Button>
              </TableHead>
              <TableHead>
                <Button
                  variant="ghost"
                  size="sm"
                  className="-ml-3 h-8 cursor-pointer"
                  onClick={() => handleSort('role')}
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
                  onClick={() => handleSort('last_login_at')}
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
            ) : paginatedUsers.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                  No users found.
                </TableCell>
              </TableRow>
            ) : (
              paginatedUsers.map((user: AdminUser) => (
                <TableRow
                  key={user.id}
                  className="cursor-pointer"
                  onClick={() => setSelectedUserId(user.id)}
                >
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Avatar>
                        <AvatarFallback>{(user.name[0] ?? '?').toUpperCase()}</AvatarFallback>
                      </Avatar>
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
                    <StatusBadge active={user.active} />
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

      {totalPages > 1 && (
        <div className="flex justify-center">
          <Pagination>
            <PaginationContent>
              <PaginationItem>
                <PaginationPrevious
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  aria-disabled={page === 1}
                  className={page === 1 ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
                />
              </PaginationItem>
              <PaginationItem>
                <span className="px-4 text-sm">{page} / {totalPages}</span>
              </PaginationItem>
              <PaginationItem>
                <PaginationNext
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  aria-disabled={page === totalPages}
                  className={page === totalPages ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
                />
              </PaginationItem>
            </PaginationContent>
          </Pagination>
        </div>
      )}

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
```

- [ ] **Step 2: Update the router**

In `src/router.tsx` line 32, change:
```ts
import('@/pages/admin/admin-panel').then((m) => ({ default: m.AdminPanelPage }))
```
To:
```ts
import('@/pages/admin/AdminPanelPage').then((m) => ({ default: m.AdminPanelPage }))
```

- [ ] **Step 3: Delete the old file**

```bash
rm yehub-fe/src/pages/admin/admin-panel.tsx
```

- [ ] **Step 4: Full build check**

```bash
cd yehub-fe && pnpm build 2>&1 | tail -10
```

Expected: `✓ built` with no TypeScript errors.

- [ ] **Step 5: Lint check**

```bash
cd yehub-fe && pnpm lint 2>&1 | tail -10
```

Expected: no new errors in files touched by this task.

- [ ] **Step 6: Commit**

```bash
git add yehub-fe/src/pages/admin/AdminPanelPage/index.tsx \
        yehub-fe/src/router.tsx
git rm yehub-fe/src/pages/admin/admin-panel.tsx
git commit -m "refactor: replace admin-panel flat file with AdminPanelPage folder structure"
```
