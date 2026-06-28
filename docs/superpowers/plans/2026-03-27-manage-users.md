# Manage Users Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade the Admin Panel (`/users`) to match the demo UI, add `enableUser` to the backend, and wire up shadcn Table + Pagination with client-side sorting.

**Architecture:** Backend gains a single `PATCH /admin/users/:id/enable` endpoint mirroring the existing `disableUser`. Frontend rewrites `admin-panel.tsx` in-place using shadcn `Table`, `Pagination`, and `Dialog` components — no new wrapper abstractions.

**Tech Stack:** NestJS (Prisma, Jest), React + TypeScript (React Query, react-hook-form, zod, shadcn/ui, Tailwind)

---

## File Map

| Action | Path |
|--------|------|
| Modify | `yehub-be/src/admin/admin.service.ts` |
| Modify | `yehub-be/src/admin/admin.controller.ts` |
| Create | `yehub-be/src/admin/admin.service.spec.ts` |
| Modify | `yehub-fe/src/lib/constants/roles.ts` |
| Modify | `yehub-fe/src/api/admin.ts` |
| Create | `yehub-fe/src/components/ui/pagination.tsx` (via shadcn CLI) |
| Rewrite | `yehub-fe/src/pages/admin/admin-panel.tsx` |

---

## Task 1: BE — Unit test + implement `AdminService.enableUser`

**Files:**
- Create: `yehub-be/src/admin/admin.service.spec.ts`
- Modify: `yehub-be/src/admin/admin.service.ts`

- [ ] **Step 1: Create the test file**

`yehub-be/src/admin/admin.service.spec.ts`:
```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { AdminService } from './admin.service';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { ConfigService } from '@nestjs/config';

describe('AdminService', () => {
  let service: AdminService;
  let prisma: {
    user: { findUnique: jest.Mock; update: jest.Mock; count: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      user: {
        findUnique: jest.fn(),
        update: jest.fn(),
        count: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminService,
        { provide: PrismaService, useValue: prisma },
        { provide: MailService, useValue: { sendInvitation: jest.fn() } },
        { provide: ConfigService, useValue: { get: jest.fn().mockReturnValue('http://localhost:5173') } },
      ],
    }).compile();

    service = module.get<AdminService>(AdminService);
  });

  describe('enableUser', () => {
    it('throws NotFoundException when user does not exist', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.enableUser('non-existent')).rejects.toThrow(NotFoundException);
    });

    it('sets active to true for an existing user', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'user-1', active: false });
      prisma.user.update.mockResolvedValue({ id: 'user-1', active: true });

      await service.enableUser('user-1');

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { active: true },
      });
    });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd yehub-be && pnpm test -- --testPathPattern=admin.service.spec --verbose
```

Expected: FAIL — `service.enableUser is not a function`

- [ ] **Step 3: Add `enableUser` to `AdminService`**

In `yehub-be/src/admin/admin.service.ts`, add after the `disableUser` method:
```typescript
async enableUser(userId: string) {
  const user = await this.prisma.user.findUnique({
    where: { id: userId },
  });
  if (!user) throw new NotFoundException('User not found');

  await this.prisma.user.update({
    where: { id: userId },
    data: { active: true },
  });
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
cd yehub-be && pnpm test -- --testPathPattern=admin.service.spec --verbose
```

Expected: PASS — 2 tests passing

- [ ] **Step 5: Commit**

```bash
cd yehub-be
git add src/admin/admin.service.ts src/admin/admin.service.spec.ts
git commit -m "feat(admin): add enableUser to AdminService"
```

---

## Task 2: BE — Add `PATCH /admin/users/:id/enable` endpoint

**Files:**
- Modify: `yehub-be/src/admin/admin.controller.ts`

- [ ] **Step 1: Add the endpoint**

In `yehub-be/src/admin/admin.controller.ts`, add after the `disableUser` method:
```typescript
@Patch(':id/enable')
@HttpCode(HttpStatus.NO_CONTENT)
@ApiOperation({ summary: 'Enable user account' })
enableUser(@Param('id', ParseUUIDPipe) id: string) {
  return this.adminService.enableUser(id);
}
```

All required imports (`Patch`, `HttpCode`, `HttpStatus`, `Param`, `ParseUUIDPipe`, `ApiOperation`) are already present in the file from the `disableUser` method above it.

- [ ] **Step 2: Verify the build compiles**

```bash
cd yehub-be && pnpm build
```

Expected: Build succeeds with no TypeScript errors.

- [ ] **Step 3: Commit**

```bash
cd yehub-be
git add src/admin/admin.controller.ts
git commit -m "feat(admin): add PATCH /admin/users/:id/enable endpoint"
```

---

## Task 3: FE — Add `GLOBAL_ROLE_CONFIG` constant and `enableUser` API method

**Files:**
- Modify: `yehub-fe/src/lib/constants/roles.ts`
- Modify: `yehub-fe/src/api/admin.ts`

- [ ] **Step 1: Add `GLOBAL_ROLE_CONFIG` to roles constants**

Replace the full content of `yehub-fe/src/lib/constants/roles.ts` with:
```typescript
import type { GlobalRole } from '@/api/auth'
import type { ProjectRole } from '@/api/projects'

export const GLOBAL_ROLE_CONFIG: Record<GlobalRole, { label: string; description: string }> = {
  ADMIN: {
    label: 'Admin',
    description: 'Full access to all platform features and settings. Can manage users, configure the system, and oversee all projects.',
  },
  INTERNAL_USER: {
    label: 'Internal User',
    description: 'Manages profiles and monitors dashboards. Cannot access system settings or manage users.',
  },
  AUTHORIZED_USER: {
    label: 'Authorized User',
    description: 'Standard access limited to assigned projects only.',
  },
}

export const PROJECT_ROLE_CONFIG: Record<ProjectRole, {
  label: string
  description: string
}> = {
  MANAGER: {
    label: 'Manager',
    description: 'Manage campaigns and content, invite members',
  },
  EXECUTIVE: {
    label: 'Executive',
    description: 'View all data across projects, export reports',
  },
  ANALYST: {
    label: 'Analyst',
    description: 'Analyze data, create reports, manage campaigns',
  },
  VIEWER: {
    label: 'Viewer',
    description: 'View-only access to project data',
  },
}
```

- [ ] **Step 2: Add `enableUser` to the admin API client**

In `yehub-fe/src/api/admin.ts`, add after the `disableUser` entry in the `adminApi` object:
```typescript
  enableUser: (id: string) =>
    apiClient.patch(`/admin/users/${id}/enable`).then((r) => r.data),
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd yehub-fe && pnpm tsc --noEmit
```

Expected: No errors.

- [ ] **Step 4: Commit**

```bash
cd yehub-fe
git add src/lib/constants/roles.ts src/api/admin.ts
git commit -m "feat(admin): add GLOBAL_ROLE_CONFIG constant and enableUser API method"
```

---

## Task 4: FE — Install shadcn Pagination component

**Files:**
- Create: `yehub-fe/src/components/ui/pagination.tsx` (generated)

- [ ] **Step 1: Install the component**

```bash
cd yehub-fe && pnpm dlx shadcn@latest add pagination
```

When prompted to overwrite anything, accept. This creates `src/components/ui/pagination.tsx`.

- [ ] **Step 2: Verify the file was created**

```bash
ls yehub-fe/src/components/ui/pagination.tsx
```

Expected: File exists.

- [ ] **Step 3: Commit**

```bash
cd yehub-fe
git add src/components/ui/pagination.tsx
git commit -m "feat(ui): add shadcn Pagination component"
```

---

## Task 5: FE — Rewrite `admin-panel.tsx` with new UI

**Files:**
- Rewrite: `yehub-fe/src/pages/admin/admin-panel.tsx`

- [ ] **Step 1: Replace the full file content**

`yehub-fe/src/pages/admin/admin-panel.tsx`:
```tsx
import { useState, useMemo } from 'react'
import { useSetPageTitle } from '@/components/protected-route'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import {
  ArrowUp, ArrowDown, ArrowUpDown,
  UserPlus, Trash2, Ban, UserCheck, TriangleAlert, X,
} from 'lucide-react'
import { adminApi } from '@/api/admin'
import type { AdminUser } from '@/api/admin'
import type { GlobalRole } from '@/api/auth'
import type { ProjectRole } from '@/api/projects'
import { inviteUserSchema } from '@/lib/schemas'
import type { InviteUserFormValues } from '@/lib/schemas'
import { GLOBAL_ROLE_CONFIG, PROJECT_ROLE_CONFIG } from '@/lib/constants/roles'
import { formatRelativeTime } from '@/lib/format'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from '@/components/ui/form'
import {
  Pagination, PaginationContent, PaginationItem,
  PaginationNext, PaginationPrevious,
} from '@/components/ui/pagination'
import { PageHeader } from '@/components/common/PageHeader'

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

// ─── Invite User Dialog ───────────────────────────────────────────────────────

function InviteUserDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
}) {
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
                onClick={() => onOpenChange(false)}
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

// ─── User Detail Dialog ───────────────────────────────────────────────────────

function UserDetailDialog({
  userId,
  open,
  onOpenChange,
}: {
  userId: string
  open: boolean
  onOpenChange: (v: boolean) => void
}) {
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
              {/* Avatar + name */}
              <div className="flex items-center gap-3">
                <Avatar size="lg">
                  <AvatarFallback>{user.name[0].toUpperCase()}</AvatarFallback>
                </Avatar>
                <div>
                  <p className="font-semibold">{user.name}</p>
                  <p className="text-sm text-muted-foreground">{user.email}</p>
                </div>
              </div>

              {/* Role + Status */}
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
                  <StatusBadge active={user.active} />
                </div>
              </div>

              {/* Meta */}
              <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
                <span>
                  Last login:{' '}
                  {user.last_login_at ? formatRelativeTime(user.last_login_at) : 'Never'}
                </span>
                <span>Created: {new Date(user.created_at).toLocaleDateString()}</span>
              </div>

              <Separator />

              {/* Project memberships */}
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
                            onClick={() =>
                              setPendingMembership({
                                projectId: m.project_id,
                                projectName: m.project_name,
                              }) || setConfirmMembershipOpen(true)
                            }
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

              {/* Footer actions */}
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

      {/* Remove User Confirmation */}
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

      {/* Disable Account Confirmation */}
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

      {/* Enable Account Confirmation */}
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

      {/* Change Role Confirmation */}
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

      {/* Remove Membership Confirmation */}
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

// ─── Admin Panel Page ─────────────────────────────────────────────────────────

type SortKey = 'name' | 'role' | 'last_login_at'

const PAGE_SIZE = 10

export function AdminPanelPage() {
  useSetPageTitle('Users')

  const [inviteOpen, setInviteOpen] = useState(false)
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null)
  const [sortKey, setSortKey] = useState<SortKey | null>(null)
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [page, setPage] = useState(1)

  const { data: users = [], isLoading, isError } = useQuery({
    queryKey: ['admin-users'],
    queryFn: adminApi.listUsers,
  })

  const sortedUsers = useMemo(() => {
    if (!sortKey) return users
    return [...users].sort((a, b) => {
      const aVal = a[sortKey]
      const bVal = b[sortKey]
      if (aVal == null && bVal == null) return 0
      if (aVal == null) return sortDir === 'asc' ? 1 : -1
      if (bVal == null) return sortDir === 'asc' ? -1 : 1
      const cmp = aVal < bVal ? -1 : aVal > bVal ? 1 : 0
      return sortDir === 'asc' ? cmp : -cmp
    })
  }, [users, sortKey, sortDir])

  const totalPages = Math.ceil(sortedUsers.length / PAGE_SIZE)
  const paginatedUsers = sortedUsers.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
    setPage(1)
  }

  function SortIcon({ colKey }: { colKey: SortKey }) {
    if (sortKey !== colKey) return <ArrowUpDown className="ml-1 h-3 w-3 opacity-50" />
    return sortDir === 'asc'
      ? <ArrowUp className="ml-1 h-3 w-3" />
      : <ArrowDown className="ml-1 h-3 w-3" />
  }

  return (
    <div className="p-6 space-y-6">
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
                  User <SortIcon colKey="name" />
                </Button>
              </TableHead>
              <TableHead>
                <Button
                  variant="ghost"
                  size="sm"
                  className="-ml-3 h-8 cursor-pointer"
                  onClick={() => handleSort('role')}
                >
                  Role <SortIcon colKey="role" />
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
                  Last Login <SortIcon colKey="last_login_at" />
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
                        <AvatarFallback>{user.name[0].toUpperCase()}</AvatarFallback>
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
                    {user.role === 'ADMIN'
                      ? 'All projects'
                      : `${user.project_count} projects`}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {user.last_login_at
                      ? formatRelativeTime(user.last_login_at)
                      : 'Never'}
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
                <span className="px-4 text-sm">
                  {page} / {totalPages}
                </span>
              </PaginationItem>
              <PaginationItem>
                <PaginationNext
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  aria-disabled={page === totalPages}
                  className={
                    page === totalPages ? 'pointer-events-none opacity-50' : 'cursor-pointer'
                  }
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
    </div>
  )
}
```

Note: The `setPendingMembership(...) || setConfirmMembershipOpen(true)` pattern in the membership remove button is a concise way to call both setters. If you prefer readability, expand it to two lines:
```tsx
onClick={() => {
  setPendingMembership({ projectId: m.project_id, projectName: m.project_name })
  setConfirmMembershipOpen(true)
}}
```

- [ ] **Step 2: Verify TypeScript compiles with no errors**

```bash
cd yehub-fe && pnpm tsc --noEmit
```

Expected: No errors.

- [ ] **Step 3: Start the dev server and manually verify the page**

```bash
cd yehub-fe && pnpm dev
```

Open `http://localhost:5173/users` (must be logged in as an ADMIN).

Verify:
- Table renders with Avatar, colored role badges, green/grey status badges
- Clicking a column header (User, Role, Last Login) sorts the rows; clicking again reverses order
- Pagination appears only when users exceed 10
- "Invite User" button opens a Dialog with Full Name, Email, Role fields
- Clicking a row opens the User Details dialog with the user's info
- Role select in detail dialog shows confirmation before changing
- "Remove User" shows a destructive confirmation dialog
- Active user shows "Disable Account"; inactive shows "Enable Account"
- Removing a membership shows a confirmation dialog

- [ ] **Step 4: Commit**

```bash
cd yehub-fe
git add src/pages/admin/admin-panel.tsx
git commit -m "feat(admin): rewrite admin panel with new UI — Avatar table, sortable columns, Dialog modals, enable/disable account"
```
