# yehub-fe Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor yehub-fe to use route constants, lazy-loaded router, coming-soon stubs for unimplemented sidebar pages, API-driven pagination/search/sort, and React Hook Form on all forms.

**Architecture:** Incremental, file-by-file changes. Route constants are created first (Task 1) since they are used everywhere. API layer is updated before components that depend on it. No test framework exists — `pnpm build` and `pnpm lint` serve as verification.

**Tech Stack:** React 19, Vite, TypeScript, React Router Dom v7, TanStack React Query v5, React Hook Form v7, Zod v4, shadcn/ui, Axios, Zustand v5, Tailwind CSS v4.

**Working directory for all commands:** `yehub-fe/`

---

### Task 1: Route Constants

**Files:**
- Create: `yehub-fe/src/lib/constants/routes.ts`

- [ ] **Step 1: Create the routes constants file**

```ts
// yehub-fe/src/lib/constants/routes.ts
export const ROUTES = {
  LOGIN: '/login',
  INVITATION: '/invitation/:token',
  FORGOT_PASSWORD: '/forgot-password',
  RESET_PASSWORD: '/reset-password',
  HOME: '/',
  PROJECTS: '/projects',
  PROJECT_DETAIL: '/projects/:id',
  PROJECT_MEMBERS: '/projects/:id/members',
  CAMPAIGNS: '/campaigns',
  POSTS: '/posts',
  PROFILES_INFLUENCERS: '/profiles/influencers',
  PROFILES_BRANDS: '/profiles/brands',
  PROFILE: '/profile',
  MY_ACCOUNT: '/my-account',
  USERS: '/users',
} as const
```

- [ ] **Step 2: Verify**

```bash
cd yehub-fe && pnpm build
```
Expected: build succeeds (new file has no consumers yet, no errors).

- [ ] **Step 3: Commit**

```bash
git add yehub-fe/src/lib/constants/routes.ts
git commit -m "feat(fe): add route constants"
```

---

### Task 2: Update Route Guards to Use ROUTES

**Files:**
- Modify: `yehub-fe/src/components/protected-route.tsx`
- Modify: `yehub-fe/src/components/admin-route.tsx`

- [ ] **Step 1: Update `protected-route.tsx`**

Replace the entire file:

```tsx
// yehub-fe/src/components/protected-route.tsx
import { createContext, useContext, useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Navigate, Outlet } from 'react-router-dom'
import { authApi } from '@/api/auth'
import { useAuthStore } from '@/store/auth.store'
import { AppSidebar } from '@/components/app-sidebar'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import { ROUTES } from '@/lib/constants/routes'

const PageTitleContext = createContext<{
  title: string
  setTitle: (title: string) => void
}>({ title: '', setTitle: () => {} })

export function useSetPageTitle(title: string) {
  const { setTitle } = useContext(PageTitleContext)
  useEffect(() => {
    setTitle(title)
  }, [title, setTitle])
}

export function ProtectedRoute() {
  const { refreshToken, setUser } = useAuthStore()
  const [title, setTitle] = useState('')

  const { isLoading } = useQuery({
    queryKey: ['me'],
    queryFn: () => authApi.getMe().then((user) => { setUser(user); return user }),
    enabled: !!refreshToken,
    retry: false,
  })

  if (!refreshToken) {
    return <Navigate to={ROUTES.LOGIN} replace />
  }

  if (isLoading) {
    return null
  }

  return (
    <PageTitleContext.Provider value={{ title, setTitle }}>
      <SidebarProvider
        style={
          {
            '--sidebar-width': 'calc(var(--spacing) * 60)',
            '--sidebar-accent': 'oklch(0.962 0.059 95.617)',
            '--sidebar-accent-foreground': 'oklch(0.471 0.12 89.689)',
          } as React.CSSProperties
        }
      >
        <AppSidebar />
        <SidebarInset>
          <div className='flex flex-1 flex-col'>
            <Outlet />
          </div>
        </SidebarInset>
      </SidebarProvider>
    </PageTitleContext.Provider>
  )
}
```

- [ ] **Step 2: Update `admin-route.tsx`**

Replace the entire file:

```tsx
// yehub-fe/src/components/admin-route.tsx
import { useEffect } from 'react'
import { Navigate, Outlet } from 'react-router-dom'
import { toast } from 'sonner'
import { useAuthStore } from '@/store/auth.store'
import { ROUTES } from '@/lib/constants/routes'

export function AdminRoute() {
  const user = useAuthStore((s) => s.user)
  const isAdmin = user?.role === 'ADMIN'

  useEffect(() => {
    if (user && !isAdmin) {
      toast.error('You do not have access to the admin panel')
    }
  }, [user, isAdmin])

  if (!user || !isAdmin) {
    return <Navigate to={ROUTES.PROJECTS} replace />
  }

  return <Outlet />
}
```

Note: removed `console.log(user)` and fixed the relative imports to use `@/` alias.

- [ ] **Step 3: Verify**

```bash
cd yehub-fe && pnpm build
```
Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
git add yehub-fe/src/components/protected-route.tsx yehub-fe/src/components/admin-route.tsx
git commit -m "feat(fe): use ROUTES constants in route guards"
```

---

### Task 3: NotFoundPage + Updated Router

**Files:**
- Create: `yehub-fe/src/pages/NotFoundPage.tsx`
- Modify: `yehub-fe/src/router.tsx`

- [ ] **Step 1: Create `NotFoundPage`**

```tsx
// yehub-fe/src/pages/NotFoundPage.tsx
import { useNavigate } from 'react-router-dom'
import { FileQuestion } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ROUTES } from '@/lib/constants/routes'

export default function NotFoundPage() {
  const navigate = useNavigate()

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="text-center space-y-6">
        <FileQuestion className="h-16 w-16 text-muted-foreground mx-auto" />
        <div className="space-y-2">
          <h1 className="text-4xl font-bold font-mono">404</h1>
          <p className="text-lg text-muted-foreground">Page not found</p>
          <p className="text-sm text-muted-foreground max-w-md">
            The page you're looking for doesn't exist or has been moved.
          </p>
        </div>
        <Button className="cursor-pointer" onClick={() => navigate(ROUTES.PROJECTS)}>
          Go to Projects
        </Button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Rewrite `router.tsx`**

Replace the entire file:

```tsx
// yehub-fe/src/router.tsx
import { lazy, Suspense } from 'react'
import { createBrowserRouter } from 'react-router-dom'
import { ProtectedRoute } from '@/components/protected-route'
import { AdminRoute } from '@/components/admin-route'
import { ROUTES } from '@/lib/constants/routes'

// Auth pages (named exports — wrap with default adapter)
const LoginPage = lazy(() =>
  import('@/pages/login').then((m) => ({ default: m.LoginPage }))
)
const InvitationPage = lazy(() =>
  import('@/pages/invitation').then((m) => ({ default: m.InvitationPage }))
)
const ForgotPasswordPage = lazy(() =>
  import('@/pages/forgot-password').then((m) => ({ default: m.ForgotPasswordPage }))
)
const ResetPasswordPage = lazy(() =>
  import('@/pages/reset-password').then((m) => ({ default: m.ResetPasswordPage }))
)

// Protected pages (named exports)
const ProfilePage = lazy(() =>
  import('@/pages/profile').then((m) => ({ default: m.ProfilePage }))
)
const MyAccountPage = lazy(() =>
  import('@/pages/my-account').then((m) => ({ default: m.MyAccountPage }))
)
const ProjectsListPage = lazy(() =>
  import('@/pages/projects/ProjectsListPage').then((m) => ({ default: m.ProjectsListPage }))
)
const ProjectDetailPage = lazy(() =>
  import('@/pages/projects/ProjectDetailPage').then((m) => ({ default: m.ProjectDetailPage }))
)
const AdminPanelPage = lazy(() =>
  import('@/pages/admin/admin-panel').then((m) => ({ default: m.AdminPanelPage }))
)

// New pages (default exports)
const HomePage = lazy(() => import('@/pages/home/HomePage'))
const CampaignsPage = lazy(() => import('@/pages/campaigns/CampaignsPage'))
const PostsPage = lazy(() => import('@/pages/posts/PostsPage'))
const InfluencersPage = lazy(() => import('@/pages/profiles/InfluencersPage'))
const BrandsPage = lazy(() => import('@/pages/profiles/BrandsPage'))
const NotFoundPage = lazy(() => import('@/pages/NotFoundPage'))

function SuspenseWrapper({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<div />}>{children}</Suspense>
}

export const router = createBrowserRouter([
  {
    path: ROUTES.LOGIN,
    element: <SuspenseWrapper><LoginPage /></SuspenseWrapper>,
  },
  {
    path: ROUTES.INVITATION,
    element: <SuspenseWrapper><InvitationPage /></SuspenseWrapper>,
  },
  {
    path: ROUTES.FORGOT_PASSWORD,
    element: <SuspenseWrapper><ForgotPasswordPage /></SuspenseWrapper>,
  },
  {
    path: ROUTES.RESET_PASSWORD,
    element: <SuspenseWrapper><ResetPasswordPage /></SuspenseWrapper>,
  },
  {
    element: <ProtectedRoute />,
    children: [
      {
        path: ROUTES.HOME,
        element: <SuspenseWrapper><HomePage /></SuspenseWrapper>,
      },
      {
        path: ROUTES.PROFILE,
        element: <SuspenseWrapper><ProfilePage /></SuspenseWrapper>,
      },
      {
        path: ROUTES.MY_ACCOUNT,
        element: <SuspenseWrapper><MyAccountPage /></SuspenseWrapper>,
      },
      {
        path: ROUTES.PROJECTS,
        element: <SuspenseWrapper><ProjectsListPage /></SuspenseWrapper>,
      },
      {
        path: ROUTES.PROJECT_DETAIL,
        element: <SuspenseWrapper><ProjectDetailPage /></SuspenseWrapper>,
      },
      {
        path: ROUTES.PROJECT_MEMBERS,
        element: <SuspenseWrapper><ProjectDetailPage /></SuspenseWrapper>,
      },
      {
        path: ROUTES.CAMPAIGNS,
        element: <SuspenseWrapper><CampaignsPage /></SuspenseWrapper>,
      },
      {
        path: ROUTES.POSTS,
        element: <SuspenseWrapper><PostsPage /></SuspenseWrapper>,
      },
      {
        path: ROUTES.PROFILES_INFLUENCERS,
        element: <SuspenseWrapper><InfluencersPage /></SuspenseWrapper>,
      },
      {
        path: ROUTES.PROFILES_BRANDS,
        element: <SuspenseWrapper><BrandsPage /></SuspenseWrapper>,
      },
      {
        element: <AdminRoute />,
        children: [
          {
            path: ROUTES.USERS,
            element: <SuspenseWrapper><AdminPanelPage /></SuspenseWrapper>,
          },
        ],
      },
    ],
  },
  {
    path: '*',
    element: <SuspenseWrapper><NotFoundPage /></SuspenseWrapper>,
  },
])
```

- [ ] **Step 3: Verify — build will fail until stub pages exist**

```bash
cd yehub-fe && pnpm build 2>&1 | grep "error"
```

Expected: errors about missing modules `@/pages/home/HomePage`, `@/pages/campaigns/CampaignsPage`, etc. This is expected — Task 4 creates them.

- [ ] **Step 4: Commit what we have**

```bash
git add yehub-fe/src/pages/NotFoundPage.tsx yehub-fe/src/router.tsx
git commit -m "feat(fe): lazy-load router with ROUTES constants and NotFoundPage"
```

---

### Task 4: Coming Soon Stub Pages

**Files:**
- Create: `yehub-fe/src/pages/home/HomePage.tsx`
- Create: `yehub-fe/src/pages/campaigns/CampaignsPage.tsx`
- Create: `yehub-fe/src/pages/posts/PostsPage.tsx`
- Create: `yehub-fe/src/pages/profiles/InfluencersPage.tsx`
- Create: `yehub-fe/src/pages/profiles/BrandsPage.tsx`

- [ ] **Step 1: Create `HomePage`**

```tsx
// yehub-fe/src/pages/home/HomePage.tsx
export default function HomePage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-2">
      <h1 className="text-2xl font-bold">Home</h1>
      <p className="text-muted-foreground">Coming soon</p>
    </div>
  )
}
```

- [ ] **Step 2: Create `CampaignsPage`**

```tsx
// yehub-fe/src/pages/campaigns/CampaignsPage.tsx
export default function CampaignsPage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-2">
      <h1 className="text-2xl font-bold">Campaigns</h1>
      <p className="text-muted-foreground">Coming soon</p>
    </div>
  )
}
```

- [ ] **Step 3: Create `PostsPage`**

```tsx
// yehub-fe/src/pages/posts/PostsPage.tsx
export default function PostsPage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-2">
      <h1 className="text-2xl font-bold">Posts</h1>
      <p className="text-muted-foreground">Coming soon</p>
    </div>
  )
}
```

- [ ] **Step 4: Create `InfluencersPage`**

```tsx
// yehub-fe/src/pages/profiles/InfluencersPage.tsx
export default function InfluencersPage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-2">
      <h1 className="text-2xl font-bold">Influencers</h1>
      <p className="text-muted-foreground">Coming soon</p>
    </div>
  )
}
```

- [ ] **Step 5: Create `BrandsPage`**

```tsx
// yehub-fe/src/pages/profiles/BrandsPage.tsx
export default function BrandsPage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-2">
      <h1 className="text-2xl font-bold">Brands</h1>
      <p className="text-muted-foreground">Coming soon</p>
    </div>
  )
}
```

- [ ] **Step 6: Verify**

```bash
cd yehub-fe && pnpm build
```
Expected: build succeeds with no errors.

- [ ] **Step 7: Commit**

```bash
git add yehub-fe/src/pages/home/HomePage.tsx \
        yehub-fe/src/pages/campaigns/CampaignsPage.tsx \
        yehub-fe/src/pages/posts/PostsPage.tsx \
        yehub-fe/src/pages/profiles/InfluencersPage.tsx \
        yehub-fe/src/pages/profiles/BrandsPage.tsx
git commit -m "feat(fe): add coming-soon stub pages for home, campaigns, posts, profiles"
```

---

### Task 5: Update Sidebar and Navigation Links to Use ROUTES

**Files:**
- Modify: `yehub-fe/src/components/app-sidebar.tsx`
- Modify: `yehub-fe/src/pages/login.tsx`
- Modify: `yehub-fe/src/pages/invitation.tsx`
- Modify: `yehub-fe/src/pages/reset-password.tsx`
- Modify: `yehub-fe/src/pages/my-account.tsx`
- Modify: `yehub-fe/src/pages/profile.tsx`

- [ ] **Step 1: Update `app-sidebar.tsx`**

Add `import { ROUTES } from '@/lib/constants/routes'` and replace all hardcoded path strings:

```tsx
// yehub-fe/src/components/app-sidebar.tsx
import * as React from "react"
import { NavLink, useLocation } from "react-router-dom"
import { NavUser } from "@/components/nav-user"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarTrigger,
} from "@/components/ui/sidebar"
import {
  HomeIcon,
  FolderIcon,
  MegaphoneIcon,
  UsersIcon,
  FileTextIcon,
  ChevronDownIcon,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { useAuthStore } from "@/store/auth.store"
import { ROUTES } from "@/lib/constants/routes"

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const location = useLocation()
  const user = useAuthStore((s) => s.user)
  const isAdmin = user?.role === 'ADMIN'
  const [profilesOpen, setProfilesOpen] = React.useState(false)

  function isActive(to: string, exact = false) {
    if (exact) return location.pathname === to
    return location.pathname === to || location.pathname.startsWith(to + "/")
  }

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader className="flex flex-row items-center p-2 gap-2">
        <div className="flex items-center gap-2 group-data-[collapsible=icon]:hidden flex-1 min-w-0 overflow-hidden pl-1">
          <div className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-amber-400 text-white text-xs font-bold select-none">
            Y
          </div>
          <div className="leading-none min-w-0">
            <div className="font-semibold text-sm">YeHub</div>
            <div className="text-xs text-muted-foreground">& Partners</div>
          </div>
        </div>
        <SidebarTrigger className="shrink-0 ml-auto group-data-[collapsible=icon]:ml-0" />
      </SidebarHeader>

      <SidebarContent>
        <SidebarMenu className="px-2 py-1 gap-0.5">
          <SidebarMenuItem>
            <SidebarMenuButton
              tooltip="Home"
              isActive={isActive(ROUTES.HOME, true)}
              render={<NavLink to={ROUTES.HOME} />}
            >
              <HomeIcon />
              <span>Home</span>
            </SidebarMenuButton>
          </SidebarMenuItem>

          <SidebarMenuItem>
            <SidebarMenuButton
              tooltip="Projects"
              isActive={isActive(ROUTES.PROJECTS)}
              render={<NavLink to={ROUTES.PROJECTS} />}
            >
              <FolderIcon />
              <span>Projects</span>
            </SidebarMenuButton>
          </SidebarMenuItem>

          <SidebarMenuItem>
            <SidebarMenuButton
              tooltip="Campaigns"
              isActive={isActive(ROUTES.CAMPAIGNS)}
              render={<NavLink to={ROUTES.CAMPAIGNS} />}
            >
              <MegaphoneIcon />
              <span>Campaigns</span>
            </SidebarMenuButton>
          </SidebarMenuItem>

          <SidebarMenuItem>
            <SidebarMenuButton
              tooltip="Profiles"
              onClick={() => setProfilesOpen((v) => !v)}
            >
              <UsersIcon />
              <span>Profiles</span>
              <ChevronDownIcon
                className={cn(
                  "ml-auto size-4 shrink-0 transition-transform duration-200",
                  profilesOpen && "rotate-180"
                )}
              />
            </SidebarMenuButton>
            {profilesOpen && (
              <SidebarMenuSub>
                <SidebarMenuSubItem>
                  <SidebarMenuSubButton
                    isActive={isActive(ROUTES.PROFILES_INFLUENCERS)}
                    render={<NavLink to={ROUTES.PROFILES_INFLUENCERS} />}
                  >
                    Influencers
                  </SidebarMenuSubButton>
                </SidebarMenuSubItem>
                <SidebarMenuSubItem>
                  <SidebarMenuSubButton
                    isActive={isActive(ROUTES.PROFILES_BRANDS)}
                    render={<NavLink to={ROUTES.PROFILES_BRANDS} />}
                  >
                    Brands
                  </SidebarMenuSubButton>
                </SidebarMenuSubItem>
              </SidebarMenuSub>
            )}
          </SidebarMenuItem>

          <SidebarMenuItem>
            <SidebarMenuButton
              tooltip="Posts"
              isActive={isActive(ROUTES.POSTS)}
              render={<NavLink to={ROUTES.POSTS} />}
            >
              <FileTextIcon />
              <span>Posts</span>
            </SidebarMenuButton>
          </SidebarMenuItem>

          {isAdmin && (
            <SidebarMenuItem>
              <SidebarMenuButton
                tooltip="Users"
                isActive={isActive(ROUTES.USERS)}
                render={<NavLink to={ROUTES.USERS} />}
              >
                <UsersIcon />
                <span>Users</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          )}
        </SidebarMenu>
      </SidebarContent>

      <SidebarFooter>
        <NavUser />
      </SidebarFooter>
    </Sidebar>
  )
}
```

- [ ] **Step 2: Update navigation in `login.tsx`**

Change `navigate('/profile')` to `navigate(ROUTES.PROFILE)`. Add the import at the top:

```tsx
import { ROUTES } from '@/lib/constants/routes'
```

Replace the navigate call in `onSuccess`:
```tsx
onSuccess: (data) => {
  setTokens(data.access_token, data.refresh_token)
  toast.success('Logged in successfully')
  navigate(ROUTES.PROFILE)
},
```

- [ ] **Step 3: Update `invitation.tsx`**

This file uses relative imports (`from '../api/auth'`, etc.) — update to `@/` alias and add ROUTES.

Replace the imports block at the top:
```tsx
import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { CheckCircle2, AlertCircle } from 'lucide-react'
import { authApi } from '@/api/auth'
import { acceptInvitationSchema } from '@/lib/schemas'
import type { AcceptInvitationFormValues } from '@/lib/schemas'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { ROUTES } from '@/lib/constants/routes'
```

Replace `navigate('/login')` with `navigate(ROUTES.LOGIN)`.

- [ ] **Step 4: Update `reset-password.tsx`**

Add `import { ROUTES } from '@/lib/constants/routes'`.

Replace `navigate('/login')` with `navigate(ROUTES.LOGIN)`.

Replace `<Link to='/forgot-password'>` with `<Link to={ROUTES.FORGOT_PASSWORD}>` (both occurrences).

- [ ] **Step 5: Update `my-account.tsx`**

Add `import { ROUTES } from '@/lib/constants/routes'`.

Replace `navigate('/login')` with `navigate(ROUTES.LOGIN)`.

- [ ] **Step 6: Update `profile.tsx`**

Add `import { ROUTES } from '@/lib/constants/routes'`.

Replace `navigate('/login')` with `navigate(ROUTES.LOGIN)`.

- [ ] **Step 7: Verify**

```bash
cd yehub-fe && pnpm build
```
Expected: build succeeds.

- [ ] **Step 8: Commit**

```bash
git add yehub-fe/src/components/app-sidebar.tsx \
        yehub-fe/src/pages/login.tsx \
        yehub-fe/src/pages/invitation.tsx \
        yehub-fe/src/pages/reset-password.tsx \
        yehub-fe/src/pages/my-account.tsx \
        yehub-fe/src/pages/profile.tsx
git commit -m "feat(fe): replace hardcoded route strings with ROUTES constants"
```

---

### Task 6: useDebounce Hook

**Files:**
- Create: `yehub-fe/src/hooks/use-debounce.ts`

- [ ] **Step 1: Create the hook**

```ts
// yehub-fe/src/hooks/use-debounce.ts
import { useState, useEffect } from 'react'

export function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value)

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])

  return debounced
}
```

- [ ] **Step 2: Verify**

```bash
cd yehub-fe && pnpm build
```
Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
git add yehub-fe/src/hooks/use-debounce.ts
git commit -m "feat(fe): add useDebounce hook"
```

---

### Task 7: API Layer Updates

**Files:**
- Modify: `yehub-fe/src/api/projects.ts`
- Modify: `yehub-fe/src/api/admin.ts`

- [ ] **Step 1: Update `projects.ts`**

Replace the entire file:

```ts
// yehub-fe/src/api/projects.ts
import { apiClient } from './client'
import type { Category } from './categories'

export type ProjectRole = 'MANAGER' | 'EXECUTIVE' | 'ANALYST' | 'VIEWER'

export interface Project {
  id: string
  name: string
  description: string | null
  client_name: string | null
  logo: string | null
  categories: Category[]
  active: boolean
  created_at: string
  updated_at: string
  member_count: number
  campaign_count: number
}

export interface ProjectsPage {
  data: Project[]
  total: number
  page: number
  totalPages: number
}

export interface ProjectStats {
  total: number
  active: number
  archived: number
  totalCampaigns: number
}

export interface ProjectMember {
  user_id: string
  email: string
  name: string
  role: ProjectRole
  joined_at: string
}

export interface CreateProjectPayload {
  name: string
  description?: string
  client_name?: string
  logo?: string
  category_ids?: string[]
}

export interface UpdateProjectPayload {
  name?: string
  description?: string
  client_name?: string
  logo?: string
  category_ids?: string[]
  active?: boolean
}

export const projectsApi = {
  createProject: (data: CreateProjectPayload) =>
    apiClient.post<Project>('/projects', data),

  listProjects: (params?: {
    q?: string
    page?: number
    limit?: number
    active?: boolean
  }) =>
    apiClient
      .get<ProjectsPage>('/projects', { params })
      .then((r) => r.data),

  getProjectStats: () =>
    apiClient.get<ProjectStats>('/projects/stats').then((r) => r.data),

  getProject: (id: string) => apiClient.get<Project>(`/projects/${id}`),

  updateProject: (id: string, data: UpdateProjectPayload) =>
    apiClient.patch<Project>(`/projects/${id}`, data),

  deleteProject: (id: string) => apiClient.delete(`/projects/${id}`),

  getMyRole: (projectId: string) =>
    apiClient.get<{ role: ProjectRole; joined_at: string }>(
      `/projects/${projectId}/me`,
    ),

  listMembers: (projectId: string) =>
    apiClient.get<ProjectMember[]>(`/projects/${projectId}/members`),

  addMember: (projectId: string, data: { user_id: string; role: ProjectRole }) =>
    apiClient.post<ProjectMember>(`/projects/${projectId}/members`, data),

  updateMember: (projectId: string, userId: string, role: ProjectRole) =>
    apiClient.patch<ProjectMember>(
      `/projects/${projectId}/members/${userId}`,
      { role },
    ),

  removeMember: (projectId: string, userId: string) =>
    apiClient.delete(`/projects/${projectId}/members/${userId}`),

  getNonMembers: (
    projectId: string,
    params?: { q?: string; limit?: number },
  ) =>
    apiClient
      .get<{ id: string; email: string; name: string }[]>(
        `/projects/${projectId}/non-members`,
        { params },
      )
      .then((r) => r.data),
}
```

- [ ] **Step 2: Update `admin.ts`**

Replace the entire file:

```ts
// yehub-fe/src/api/admin.ts
import { apiClient } from './client'
import type { GlobalRole } from './auth'
import type { ProjectRole } from './projects'

export interface AdminUser {
  id: string
  email: string
  name: string
  role: GlobalRole
  active: boolean
  last_login_at: string | null
  created_at: string
  project_count: number
}

export interface AdminUserDetail {
  id: string
  email: string
  name: string
  role: GlobalRole
  active: boolean
  last_login_at: string | null
  created_at: string
  memberships: {
    project_id: string
    project_name: string
    role: ProjectRole
    joined_at: string
  }[]
}

export const adminApi = {
  listUsers: (params?: {
    sortBy?: 'name' | 'role' | 'last_login_at'
    sortDir?: 'asc' | 'desc'
  }) =>
    apiClient
      .get<AdminUser[]>('/admin/users', { params })
      .then((r) => r.data),

  getUser: (id: string) =>
    apiClient.get<AdminUserDetail>(`/admin/users/${id}`).then((r) => r.data),

  inviteUser: (data: { name: string; email: string; role: GlobalRole }) =>
    apiClient.post('/admin/users/invite', data).then((r) => r.data),

  updateRole: (id: string, role: GlobalRole) =>
    apiClient
      .patch(`/admin/users/${id}/role`, { role })
      .then((r) => r.data),

  disableUser: (id: string) =>
    apiClient.patch(`/admin/users/${id}/disable`).then((r) => r.data),

  enableUser: (id: string) =>
    apiClient.patch(`/admin/users/${id}/enable`).then((r) => r.data),

  removeUser: (id: string) =>
    apiClient.delete(`/admin/users/${id}`).then((r) => r.data),

  removeUserMembership: (userId: string, projectId: string) =>
    apiClient
      .delete(`/admin/users/${userId}/memberships/${projectId}`)
      .then((r) => r.data),
}
```

- [ ] **Step 3: Verify**

```bash
cd yehub-fe && pnpm build 2>&1 | head -40
```

Expected: TypeScript errors in `ProjectsListPage.tsx` about the changed `listProjects` return type (it now returns `ProjectsPage` not `Project[]`). This is expected — we fix it in Task 9. The errors should say something like "Property 'filter' does not exist on type 'ProjectsPage'".

- [ ] **Step 4: Commit**

```bash
git add yehub-fe/src/api/projects.ts yehub-fe/src/api/admin.ts
git commit -m "feat(fe): add pagination/search/sort params to projects and admin APIs"
```

---

### Task 8: Project Form Schema

**Files:**
- Modify: `yehub-fe/src/lib/schemas.ts`

- [ ] **Step 1: Add `projectFormSchema` to `schemas.ts`**

Append to the end of `src/lib/schemas.ts` (before the last type export lines, keeping existing content intact):

```ts
export const projectFormSchema = z.object({
  name: z.string().min(1, 'Project name is required'),
  client_name: z.string().optional(),
  description: z.string().optional(),
})
export type ProjectFormValues = z.infer<typeof projectFormSchema>
```

The file should end as:

```ts
export type LoginFormValues = z.infer<typeof loginSchema>
export type AcceptInvitationFormValues = z.infer<typeof acceptInvitationSchema>
export type InviteUserFormValues = z.infer<typeof inviteUserSchema>
export type UpdateProfileFormValues = z.infer<typeof updateProfileSchema>
export type ChangePasswordFormValues = z.infer<typeof changePasswordSchema>
export type ForgotPasswordFormValues = z.infer<typeof forgotPasswordSchema>
export type ResetPasswordFormValues = z.infer<typeof resetPasswordSchema>
export type ProjectFormValues = z.infer<typeof projectFormSchema>
```

- [ ] **Step 2: Commit** (no verify needed — pure addition, build checked in next task)

```bash
git add yehub-fe/src/lib/schemas.ts
git commit -m "feat(fe): add projectFormSchema to schemas"
```

---

### Task 9: CreateProjectDialog (Extract + RHF)

**Files:**
- Create: `yehub-fe/src/pages/projects/components/CreateProjectDialog.tsx`

This component is extracted from `ProjectsListPage.tsx` and rewritten with React Hook Form.

- [ ] **Step 1: Create `CreateProjectDialog.tsx`**

```tsx
// yehub-fe/src/pages/projects/components/CreateProjectDialog.tsx
import { useState, useRef } from 'react'
import { Upload } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import axios from 'axios'
import { projectsApi } from '@/api/projects'
import { uploadsApi } from '@/api/uploads'
import { projectFormSchema, type ProjectFormValues } from '@/lib/schemas'
import type { Category } from '@/api/categories'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { ProjectCategoryPicker } from './ProjectCategoryPicker'

interface CreateProjectDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function CreateProjectDialog({
  open,
  onOpenChange,
}: CreateProjectDialogProps) {
  const queryClient = useQueryClient()
  const [logo, setLogo] = useState('')
  const [logoUploading, setLogoUploading] = useState(false)
  const [categories, setCategories] = useState<Category[]>([])
  const logoRef = useRef<HTMLInputElement>(null)

  const form = useForm<ProjectFormValues>({
    resolver: zodResolver(projectFormSchema),
    defaultValues: { name: '', client_name: '', description: '' },
  })

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      form.reset()
      setLogo('')
      setCategories([])
    }
    onOpenChange(next)
  }

  const createMutation = useMutation({
    mutationFn: (values: ProjectFormValues) =>
      projectsApi.createProject({
        name: values.name.trim(),
        client_name: values.client_name?.trim() || undefined,
        description: values.description?.trim() || undefined,
        logo: logo || undefined,
        category_ids: categories.map((c) => c.id),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] })
      queryClient.invalidateQueries({ queryKey: ['projects-stats'] })
      toast.success('Project created')
      handleOpenChange(false)
    },
    onError: (err) => {
      if (axios.isAxiosError(err)) {
        const msg =
          (err.response?.data as { message?: string })?.message ??
          'Failed to create project'
        toast.error(msg)
      }
    },
  })

  const handleLogoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setLogoUploading(true)
    try {
      const url = await uploadsApi.upload(file)
      setLogo(url)
    } catch {
      toast.error('Failed to upload logo')
    } finally {
      setLogoUploading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create New Project</DialogTitle>
          <DialogDescription>
            Fill in the details to create a new project.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form
            onSubmit={form.handleSubmit((v) => createMutation.mutate(v))}
            className="space-y-4"
          >
            {/* Logo upload */}
            <div className="space-y-2">
              <span className="text-sm font-medium">Logo (optional)</span>
              <div
                className="group/logo relative size-24 rounded-lg border-2 border-dashed bg-muted overflow-hidden flex items-center justify-center cursor-pointer hover:border-primary/50 transition-colors"
                onClick={() => !logo && logoRef.current?.click()}
              >
                {logo ? (
                  <>
                    <img
                      src={logo}
                      alt="Preview"
                      className="size-full object-contain p-2"
                    />
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-black/60 opacity-0 group-hover/logo:opacity-100 transition-opacity">
                      <button
                        type="button"
                        className="text-xs font-medium text-white hover:underline cursor-pointer"
                        onClick={(e) => {
                          e.stopPropagation()
                          logoRef.current?.click()
                        }}
                      >
                        Change
                      </button>
                      <button
                        type="button"
                        className="text-xs font-medium text-white/80 hover:text-white hover:underline cursor-pointer"
                        onClick={(e) => {
                          e.stopPropagation()
                          setLogo('')
                          if (logoRef.current) logoRef.current.value = ''
                        }}
                      >
                        Remove
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="flex flex-col items-center gap-1">
                    {logoUploading ? (
                      <span className="text-xs text-muted-foreground">
                        Uploading…
                      </span>
                    ) : (
                      <>
                        <Upload className="h-5 w-5 text-muted-foreground" />
                        <span className="text-xs text-muted-foreground">
                          Upload
                        </span>
                      </>
                    )}
                  </div>
                )}
              </div>
              <input
                ref={logoRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleLogoChange}
              />
            </div>

            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Project Name</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g. Vinamilk Q2 2026" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="client_name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Client Name</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g. Vinamilk" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <Textarea placeholder="Project description…" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <ProjectCategoryPicker
              selected={categories}
              onChange={setCategories}
            />

            <Button
              type="submit"
              className="w-full cursor-pointer"
              disabled={createMutation.isPending || logoUploading}
            >
              {createMutation.isPending ? 'Creating…' : 'Create Project'}
            </Button>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 2: Verify**

```bash
cd yehub-fe && pnpm build 2>&1 | grep "error" | grep -v "node_modules"
```
Expected: only existing errors from `ProjectsListPage.tsx` (the API type mismatch). No new errors.

- [ ] **Step 3: Commit**

```bash
git add yehub-fe/src/pages/projects/components/CreateProjectDialog.tsx
git commit -m "feat(fe): extract CreateProjectDialog with React Hook Form"
```

---

### Task 10: EditProjectDialog — Apply RHF

**Files:**
- Modify: `yehub-fe/src/pages/projects/components/EditProjectDialog.tsx`

- [ ] **Step 1: Replace `EditProjectDialog.tsx`**

```tsx
// yehub-fe/src/pages/projects/components/EditProjectDialog.tsx
import { useState, useEffect, useRef } from 'react'
import { Upload } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import axios from 'axios'
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
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { projectsApi, type Project } from '@/api/projects'
import { uploadsApi } from '@/api/uploads'
import { projectFormSchema, type ProjectFormValues } from '@/lib/schemas'
import type { Category } from '@/api/categories'
import { ProjectCategoryPicker } from './ProjectCategoryPicker'

interface EditProjectDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  project: Project | null
  onSave: (updated: Project) => void
}

export function EditProjectDialog({
  open,
  onOpenChange,
  project,
  onSave,
}: EditProjectDialogProps) {
  const queryClient = useQueryClient()
  const logoInputRef = useRef<HTMLInputElement>(null)
  const [logo, setLogo] = useState('')
  const [logoUploading, setLogoUploading] = useState(false)
  const [categories, setCategories] = useState<Category[]>([])

  const form = useForm<ProjectFormValues>({
    resolver: zodResolver(projectFormSchema),
    defaultValues: { name: '', client_name: '', description: '' },
  })

  useEffect(() => {
    if (open && project) {
      form.reset({
        name: project.name,
        client_name: project.client_name ?? '',
        description: project.description ?? '',
      })
      setLogo(project.logo ?? '')
      setCategories([...project.categories])
    }
  }, [open, project, form])

  const updateMutation = useMutation({
    mutationFn: (values: ProjectFormValues) =>
      projectsApi.updateProject(project!.id, {
        name: values.name.trim(),
        client_name: values.client_name?.trim() || undefined,
        description: values.description?.trim() || undefined,
        logo: logo || undefined,
        category_ids: categories.map((c) => c.id),
      }),
    onSuccess: ({ data }) => {
      queryClient.invalidateQueries({ queryKey: ['projects'] })
      queryClient.setQueryData(['project', data.id], data)
      onSave(data)
      onOpenChange(false)
      toast.success('Project updated')
    },
    onError: (error) => {
      if (axios.isAxiosError(error)) {
        const msg =
          (error.response?.data as { message?: string })?.message ??
          'Failed to update project'
        toast.error(msg)
      }
    },
  })

  const handleLogoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setLogoUploading(true)
    try {
      const url = await uploadsApi.upload(file)
      setLogo(url)
    } catch {
      toast.error('Failed to upload logo')
    } finally {
      setLogoUploading(false)
    }
  }

  if (!project) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit Project</DialogTitle>
          <DialogDescription>Update the project details.</DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form
            onSubmit={form.handleSubmit((v) => updateMutation.mutate(v))}
            className="space-y-4"
          >
            <Separator />

            {/* Logo */}
            <div className="space-y-2">
              <span className="text-sm font-medium">Logo (optional)</span>
              <div
                className="group/logo relative size-24 rounded-lg border-2 border-dashed bg-muted overflow-hidden flex items-center justify-center cursor-pointer hover:border-primary/50 transition-colors"
                onClick={() => !logo && logoInputRef.current?.click()}
              >
                {logo ? (
                  <>
                    <img
                      src={logo}
                      alt="Logo"
                      className="size-full object-contain p-2"
                    />
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-black/60 opacity-0 group-hover/logo:opacity-100 transition-opacity">
                      <button
                        type="button"
                        className="text-xs font-medium text-white hover:underline cursor-pointer"
                        onClick={(e) => {
                          e.stopPropagation()
                          logoInputRef.current?.click()
                        }}
                      >
                        Change
                      </button>
                      <button
                        type="button"
                        className="text-xs font-medium text-white/80 hover:text-white hover:underline cursor-pointer"
                        onClick={(e) => {
                          e.stopPropagation()
                          setLogo('')
                          if (logoInputRef.current) logoInputRef.current.value = ''
                        }}
                      >
                        Remove
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="flex flex-col items-center gap-1">
                    {logoUploading ? (
                      <span className="text-xs text-muted-foreground">
                        Uploading…
                      </span>
                    ) : (
                      <>
                        <Upload className="h-5 w-5 text-muted-foreground" />
                        <span className="text-xs text-muted-foreground">
                          Upload
                        </span>
                      </>
                    )}
                  </div>
                )}
              </div>
              <input
                ref={logoInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleLogoChange}
              />
            </div>

            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Project Name</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="client_name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Client Name</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g. Vinamilk" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Project description…"
                      rows={3}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <ProjectCategoryPicker
              selected={categories}
              onChange={setCategories}
            />

            <Separator />
            <div className="flex justify-end gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                className="cursor-pointer"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                className="cursor-pointer"
                disabled={updateMutation.isPending || logoUploading}
              >
                {updateMutation.isPending ? 'Saving…' : 'Save Changes'}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 2: Verify**

```bash
cd yehub-fe && pnpm build 2>&1 | grep "error" | grep -v "node_modules"
```
Expected: only existing `ProjectsListPage.tsx` errors remain.

- [ ] **Step 3: Commit**

```bash
git add yehub-fe/src/pages/projects/components/EditProjectDialog.tsx
git commit -m "feat(fe): apply React Hook Form to EditProjectDialog"
```

---

### Task 11: ProjectsListPage — API Paging & Search

**Files:**
- Modify: `yehub-fe/src/pages/projects/ProjectsListPage.tsx`

This is the largest change. Replace the entire file:

- [ ] **Step 1: Replace `ProjectsListPage.tsx`**

```tsx
// yehub-fe/src/pages/projects/ProjectsListPage.tsx
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Plus,
  FolderKanban,
  MoreVertical,
  Pencil,
  Archive,
  ArchiveRestore,
} from 'lucide-react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { PageHeader } from '@/components/common/PageHeader'
import { SearchBar } from '@/components/common/SearchBar'
import { EmptyState } from '@/components/common/EmptyState'
import { MetricCard } from '@/components/common/MetricCard'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination'
import { projectsApi, type Project } from '@/api/projects'
import { useAuthStore } from '@/store/auth.store'
import { useCanGlobal } from '@/hooks/use-can'
import { useDebounce } from '@/hooks/use-debounce'
import { formatRelativeTime } from '@/lib/format'
import { EditProjectDialog } from './components/EditProjectDialog'
import { CreateProjectDialog } from './components/CreateProjectDialog'

const PAGE_LIMIT = 20

function ProjectLogo({ project, size = 9 }: { project: Project; size?: number }) {
  const sizeClass = `size-${size}`
  return (
    <div
      className={`${sizeClass} shrink-0 rounded-lg border bg-muted overflow-hidden flex items-center justify-center`}
    >
      {project.logo ? (
        <img
          src={project.logo}
          alt={project.client_name ?? project.name}
          className="size-full object-contain p-1"
        />
      ) : (
        <span className="text-xs font-bold text-muted-foreground">
          {(project.client_name ?? project.name).charAt(0).toUpperCase()}
        </span>
      )}
    </div>
  )
}

export function ProjectsListPage() {
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const canCreate = useCanGlobal('create_project', user?.role ?? null)
  const queryClient = useQueryClient()

  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [showArchived, setShowArchived] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [editProject, setEditProject] = useState<Project | null>(null)
  const [editOpen, setEditOpen] = useState(false)

  const debouncedSearch = useDebounce(search, 300)

  const { data: projectsPage, isLoading } = useQuery({
    queryKey: ['projects', page, debouncedSearch, showArchived],
    queryFn: () =>
      projectsApi.listProjects({
        q: debouncedSearch || undefined,
        page,
        limit: PAGE_LIMIT,
        active: !showArchived,
      }),
  })

  const { data: stats } = useQuery({
    queryKey: ['projects-stats'],
    queryFn: () => projectsApi.getProjectStats(),
  })

  const projects = projectsPage?.data ?? []
  const totalPages = projectsPage?.totalPages ?? 1

  const handleSearchChange = (value: string) => {
    setSearch(value)
    setPage(1)
  }

  const handleToggleArchived = () => {
    setShowArchived((v) => !v)
    setPage(1)
  }

  const archiveMutation = useMutation({
    mutationFn: (project: Project) =>
      projectsApi.updateProject(project.id, { active: !project.active }),
    onSuccess: (_, project) => {
      queryClient.invalidateQueries({ queryKey: ['projects'] })
      queryClient.invalidateQueries({ queryKey: ['projects-stats'] })
      toast.success(project.active ? 'Project archived' : 'Project restored')
    },
  })

  return (
    <div className="space-y-6">
      <PageHeader
        title="Projects"
        description="Manage your client projects"
        actions={
          canCreate ? (
            <Button
              className="cursor-pointer"
              onClick={() => setCreateOpen(true)}
            >
              <Plus className="mr-2 h-4 w-4" />
              New Project
            </Button>
          ) : null
        }
      />

      {/* Metrics row */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Total Projects" value={stats?.total ?? 0} />
        <MetricCard label="Active" value={stats?.active ?? 0} />
        <MetricCard label="Archived" value={stats?.archived ?? 0} />
        <MetricCard
          label="Total Campaigns"
          value={stats?.totalCampaigns ?? 0}
        />
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <SearchBar
          value={search}
          onChange={handleSearchChange}
          placeholder="Search projects…"
          className="max-w-md"
        />
        <Button
          variant={showArchived ? 'default' : 'outline'}
          size="sm"
          className="cursor-pointer shrink-0"
          onClick={handleToggleArchived}
        >
          <Archive className="mr-2 h-4 w-4" />
          Archived
        </Button>
      </div>

      {/* Table */}
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading projects…</p>
      ) : projects.length === 0 ? (
        <EmptyState
          icon={<FolderKanban className="h-12 w-12" />}
          title={showArchived ? 'No archived projects' : 'No projects found'}
          description={
            showArchived
              ? 'Archived projects will appear here.'
              : search
              ? 'Try a different search term or create a new project.'
              : 'Create your first project to get started.'
          }
        />
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[300px]">Project</TableHead>
                <TableHead className="text-center">Total Campaigns</TableHead>
                <TableHead className="text-center">Active Campaigns</TableHead>
                <TableHead className="text-right">Last Activity</TableHead>
                <TableHead className="w-[50px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {projects.map((project) => (
                <TableRow
                  key={project.id}
                  className="cursor-pointer"
                  onClick={() => navigate(`/projects/${project.id}`)}
                >
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <ProjectLogo project={project} size={9} />
                      <div className="min-w-0">
                        <p className="text-sm font-semibold truncate">
                          {project.name}
                        </p>
                        {project.client_name && (
                          <p className="text-xs text-muted-foreground truncate">
                            {project.client_name}
                          </p>
                        )}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-center font-mono font-bold">
                    {project.campaign_count}
                  </TableCell>
                  <TableCell className="text-center font-mono font-bold">
                    —
                  </TableCell>
                  <TableCell className="text-right text-xs text-muted-foreground">
                    {formatRelativeTime(project.updated_at)}
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        render={
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 cursor-pointer"
                            onClick={(e) => e.stopPropagation()}
                          />
                        }
                      >
                        <MoreVertical className="h-4 w-4" />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent
                        align="end"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <DropdownMenuItem
                          className="cursor-pointer"
                          onClick={() => {
                            setEditProject(project)
                            setEditOpen(true)
                          }}
                        >
                          <Pencil className="mr-2 h-4 w-4" />
                          Edit
                        </DropdownMenuItem>
                        {project.active ? (
                          <DropdownMenuItem
                            className="cursor-pointer"
                            onClick={() => archiveMutation.mutate(project)}
                          >
                            <Archive className="mr-2 h-4 w-4" />
                            Archive
                          </DropdownMenuItem>
                        ) : (
                          <DropdownMenuItem
                            className="cursor-pointer"
                            onClick={() => archiveMutation.mutate(project)}
                          >
                            <ArchiveRestore className="mr-2 h-4 w-4" />
                            Restore
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex justify-center">
          <Pagination>
            <PaginationContent>
              <PaginationItem>
                <PaginationPrevious
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  aria-disabled={page === 1}
                  className={
                    page === 1 ? 'pointer-events-none opacity-50' : 'cursor-pointer'
                  }
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
                    page === totalPages
                      ? 'pointer-events-none opacity-50'
                      : 'cursor-pointer'
                  }
                />
              </PaginationItem>
            </PaginationContent>
          </Pagination>
        </div>
      )}

      <CreateProjectDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
      />

      <EditProjectDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        project={editProject}
        onSave={() => {
          queryClient.invalidateQueries({ queryKey: ['projects'] })
          setEditOpen(false)
        }}
      />
    </div>
  )
}
```

- [ ] **Step 2: Verify**

```bash
cd yehub-fe && pnpm build
```
Expected: build succeeds with no errors.

- [ ] **Step 3: Commit**

```bash
git add yehub-fe/src/pages/projects/ProjectsListPage.tsx
git commit -m "feat(fe): api-driven pagination and search in ProjectsListPage"
```

---

### Task 12: AddMemberDialog — API Search with Debounce

**Files:**
- Modify: `yehub-fe/src/pages/projects/components/AddMemberDialog.tsx`

- [ ] **Step 1: Replace `AddMemberDialog.tsx`**

```tsx
// yehub-fe/src/pages/projects/components/AddMemberDialog.tsx
import { useState } from 'react'
import { UserPlus } from 'lucide-react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
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
import { projectsApi, type ProjectMember, type ProjectRole } from '@/api/projects'
import { PROJECT_ROLE_CONFIG } from '@/lib/constants/roles'
import { useDebounce } from '@/hooks/use-debounce'

interface AddMemberDialogProps {
  projectId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onAdd: (member: ProjectMember) => void
}

export function AddMemberDialog({
  projectId,
  open,
  onOpenChange,
  onAdd,
}: AddMemberDialogProps) {
  const queryClient = useQueryClient()
  const [selectedUserId, setSelectedUserId] = useState('')
  const [role, setRole] = useState<ProjectRole>('VIEWER')
  const [search, setSearch] = useState('')

  const debouncedSearch = useDebounce(search, 300)

  const { data: nonMembers = [], isFetching } = useQuery({
    queryKey: ['non-members', projectId, debouncedSearch],
    queryFn: () =>
      projectsApi.getNonMembers(projectId, {
        q: debouncedSearch || undefined,
        limit: 10,
      }),
    enabled: open,
  })

  const selectedUser = nonMembers.find((u) => u.id === selectedUserId)

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      setSelectedUserId('')
      setRole('VIEWER')
      setSearch('')
    }
    onOpenChange(newOpen)
  }

  const addMutation = useMutation({
    mutationFn: () =>
      projectsApi.addMember(projectId, { user_id: selectedUserId, role }),
    onSuccess: ({ data }) => {
      queryClient.invalidateQueries({ queryKey: ['project-members', projectId] })
      queryClient.invalidateQueries({ queryKey: ['non-members', projectId] })
      onAdd(data)
      onOpenChange(false)
      toast.success(
        `Added ${selectedUser?.name ?? 'user'} as ${PROJECT_ROLE_CONFIG[role].label}`,
      )
    },
    onError: () => toast.error('Failed to add member'),
  })

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add Member</DialogTitle>
          <DialogDescription>
            Add a user to this project with a specific role.
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            addMutation.mutate()
          }}
          className="space-y-4"
        >
          <Separator />
          <div className="space-y-2">
            <Label>User *</Label>
            {selectedUser ? (
              <div className="flex items-center justify-between rounded-md border px-3 py-2">
                <div className="flex items-center gap-2">
                  <Avatar className="h-6 w-6">
                    <AvatarFallback className="text-xs">
                      {selectedUser.name[0]}
                    </AvatarFallback>
                  </Avatar>
                  <span className="text-sm">{selectedUser.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {selectedUser.email}
                  </span>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedUserId('')}
                  className="cursor-pointer h-7 text-xs"
                >
                  Change
                </Button>
              </div>
            ) : (
              <Command className="rounded-lg border" shouldFilter={false}>
                <CommandInput
                  placeholder="Search users..."
                  value={search}
                  onValueChange={setSearch}
                />
                <CommandList>
                  {isFetching ? (
                    <div className="py-3 text-center text-sm text-muted-foreground">
                      Searching…
                    </div>
                  ) : (
                    <>
                      <CommandEmpty>No available users.</CommandEmpty>
                      <CommandGroup>
                        {nonMembers.map((u) => (
                          <CommandItem
                            key={u.id}
                            value={u.id}
                            onSelect={() => setSelectedUserId(u.id)}
                            className="cursor-pointer"
                          >
                            <Avatar className="h-6 w-6">
                              <AvatarFallback className="text-xs">
                                {u.name[0]}
                              </AvatarFallback>
                            </Avatar>
                            <span>{u.name}</span>
                            <span className="text-xs text-muted-foreground ml-auto">
                              {u.email}
                            </span>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </>
                  )}
                </CommandList>
              </Command>
            )}
          </div>
          <div className="space-y-2">
            <Label>Role *</Label>
            <Select
              value={role}
              onValueChange={(v) => setRole(v as ProjectRole)}
            >
              <SelectTrigger className="w-full cursor-pointer">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(PROJECT_ROLE_CONFIG) as ProjectRole[]).map(
                  (r) => (
                    <SelectItem key={r} value={r}>
                      <span>{PROJECT_ROLE_CONFIG[r].label}</span>
                      <span className="text-xs text-muted-foreground ml-2">
                        — {PROJECT_ROLE_CONFIG[r].description}
                      </span>
                    </SelectItem>
                  ),
                )}
              </SelectContent>
            </Select>
          </div>
          <Separator />
          <div className="flex justify-end gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="cursor-pointer"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={!selectedUserId || addMutation.isPending}
              className="cursor-pointer"
            >
              <UserPlus className="mr-1.5 h-4 w-4" />
              {addMutation.isPending ? 'Adding…' : 'Add Member'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 2: Verify**

```bash
cd yehub-fe && pnpm build
```
Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
git add yehub-fe/src/pages/projects/components/AddMemberDialog.tsx
git commit -m "feat(fe): api-driven search with debounce in AddMemberDialog"
```

---

### Task 13: admin-panel.tsx — Sort by API

**Files:**
- Modify: `yehub-fe/src/pages/admin/admin-panel.tsx`

The only changes needed are in the `AdminPanelPage` component:

1. Remove the `useMemo` sort
2. Pass `sortKey`/`sortDir` to `adminApi.listUsers`
3. Add them to the `queryKey`

- [ ] **Step 1: Update the `AdminPanelPage` component section**

Find the `AdminPanelPage` function (line 646 in the original). Replace only the query and sort logic — everything else (dialogs, table UI) stays the same.

Replace this block:

```tsx
// OLD — remove this entire block
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
```

With this block:

```tsx
// NEW
const { data: users = [], isLoading, isError } = useQuery({
  queryKey: ['admin-users', sortKey, sortDir],
  queryFn: () =>
    adminApi.listUsers(
      sortKey ? { sortBy: sortKey, sortDir } : undefined,
    ),
})

const totalPages = Math.ceil(users.length / PAGE_SIZE)
const paginatedUsers = users.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
```

Also remove the `useMemo` import from the top of the file if it is no longer used elsewhere.

The `handleSort` function stays unchanged — it already resets `page` to 1 and updates `sortKey`/`sortDir`.

- [ ] **Step 2: Verify**

```bash
cd yehub-fe && pnpm build
```
Expected: build succeeds.

- [ ] **Step 3: Lint**

```bash
cd yehub-fe && pnpm lint
```
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add yehub-fe/src/pages/admin/admin-panel.tsx
git commit -m "feat(fe): sort users by API call in admin panel"
```

---

## Summary

| Task | Files changed | Commit message |
|------|--------------|----------------|
| 1 | `src/lib/constants/routes.ts` (new) | `feat(fe): add route constants` |
| 2 | `protected-route.tsx`, `admin-route.tsx` | `feat(fe): use ROUTES constants in route guards` |
| 3 | `NotFoundPage.tsx` (new), `router.tsx` | `feat(fe): lazy-load router with ROUTES constants and NotFoundPage` |
| 4 | 5 stub pages (new) | `feat(fe): add coming-soon stub pages` |
| 5 | `app-sidebar.tsx`, `login.tsx`, `invitation.tsx`, `reset-password.tsx`, `my-account.tsx`, `profile.tsx` | `feat(fe): replace hardcoded route strings with ROUTES constants` |
| 6 | `hooks/use-debounce.ts` (new) | `feat(fe): add useDebounce hook` |
| 7 | `api/projects.ts`, `api/admin.ts` | `feat(fe): add pagination/search/sort params to APIs` |
| 8 | `lib/schemas.ts` | `feat(fe): add projectFormSchema to schemas` |
| 9 | `components/CreateProjectDialog.tsx` (new) | `feat(fe): extract CreateProjectDialog with React Hook Form` |
| 10 | `components/EditProjectDialog.tsx` | `feat(fe): apply React Hook Form to EditProjectDialog` |
| 11 | `ProjectsListPage.tsx` | `feat(fe): api-driven pagination and search in ProjectsListPage` |
| 12 | `components/AddMemberDialog.tsx` | `feat(fe): api-driven search with debounce in AddMemberDialog` |
| 13 | `pages/admin/admin-panel.tsx` | `feat(fe): sort users by API call in admin panel` |
