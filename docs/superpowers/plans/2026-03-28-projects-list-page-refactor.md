# ProjectsListPage Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Break `ProjectsListPage.tsx` into focused, colocated files following the Folder Structure Best Practices and React Conventions in `yehub-fe/CLAUDE.md`.

**Architecture:** Extract `ProjectLogo` to `src/components/common/`, data-fetching logic into `use-projects-list` hook, and page-private sub-components into `ProjectsListPage/components/`. The page shell becomes a thin orchestrator (~60 lines). No behavioral changes — purely structural.

**Tech Stack:** React 19, TypeScript, TanStack React Query v5, React Router Dom v7, Tailwind CSS v4, shadcn/ui, Lucide React

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| CREATE | `src/components/common/ProjectLogo.tsx` | Shared logo display (replaces inline defs in both pages) |
| CREATE | `src/hooks/use-projects-list.ts` | Query + filter state (page, search, showArchived) |
| CREATE | `src/pages/projects/ProjectsListPage/components/ProjectsTableHeader.tsx` | Static `<TableHeader>` |
| CREATE | `src/pages/projects/ProjectsListPage/components/ProjectsPagination.tsx` | Pagination UI |
| CREATE | `src/pages/projects/ProjectsListPage/components/ProjectItem.tsx` | Table row + archiveMutation + editOpen state + EditProjectDialog |
| MOVE   | `src/pages/projects/ProjectsListPage/components/CreateProjectDialog.tsx` | From `projects/components/` — only used here |
| CREATE | `src/pages/projects/ProjectsListPage/index.tsx` | Thin page shell |
| DELETE | `src/pages/projects/ProjectsListPage.tsx` | Replaced by the folder |
| UPDATE | `src/pages/projects/ProjectDetailPage.tsx` | Import ProjectLogo from common |

---

## Task 1: Create `ProjectLogo` common component

**Files:**
- Create: `src/components/common/ProjectLogo.tsx`
- Modify: `src/pages/projects/ProjectsListPage.tsx`
- Modify: `src/pages/projects/ProjectDetailPage.tsx`

- [ ] **Step 1: Create `src/components/common/ProjectLogo.tsx`**

```tsx
import type { Project } from '@/api/projects'

export function ProjectLogo({ project, size = 9 }: { project: Project; size?: number }) {
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
```

> Note: `ProjectDetailPage` used `text-sm` for the fallback letter; unified to `text-xs` here (structural refactor, negligible visual diff).

- [ ] **Step 2: Replace the inline `ProjectLogo` in `ProjectsListPage.tsx`**

Remove lines 49–68 (the `ProjectLogo` function) and add the import at the top:

```tsx
import { ProjectLogo } from '@/components/common/ProjectLogo'
```

- [ ] **Step 3: Replace the inline `ProjectLogo` in `ProjectDetailPage.tsx`**

Remove lines 20–33 (the `ProjectLogo` function) and add the import:

```tsx
import { ProjectLogo } from '@/components/common/ProjectLogo'
```

- [ ] **Step 4: Verify no type errors**

```bash
cd yehub-fe && pnpm build 2>&1 | tail -20
```

Expected: no TypeScript errors mentioning `ProjectLogo`.

- [ ] **Step 5: Commit**

```bash
git add yehub-fe/src/components/common/ProjectLogo.tsx \
        yehub-fe/src/pages/projects/ProjectsListPage.tsx \
        yehub-fe/src/pages/projects/ProjectDetailPage.tsx
git commit -m "refactor: extract ProjectLogo to src/components/common"
```

---

## Task 2: Create `use-projects-list` hook

**Files:**
- Create: `src/hooks/use-projects-list.ts`

- [ ] **Step 1: Create `src/hooks/use-projects-list.ts`**

```ts
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { projectsApi } from '@/api/projects'
import { useDebounce } from '@/hooks/use-debounce'

const PAGE_LIMIT = 20

export function useProjectsList() {
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [showArchived, setShowArchived] = useState(false)

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

  const handleSearchChange = (value: string) => {
    setSearch(value)
    setPage(1)
  }

  const handleToggleArchived = () => {
    setShowArchived((v) => !v)
    setPage(1)
  }

  return {
    projects: projectsPage?.data ?? [],
    totalPages: projectsPage?.totalPages ?? 1,
    isLoading,
    page,
    setPage,
    search,
    handleSearchChange,
    showArchived,
    handleToggleArchived,
  }
}
```

- [ ] **Step 2: Verify no type errors**

```bash
cd yehub-fe && pnpm build 2>&1 | tail -20
```

Expected: build succeeds (hook is not yet consumed, so no import errors).

- [ ] **Step 3: Commit**

```bash
git add yehub-fe/src/hooks/use-projects-list.ts
git commit -m "refactor: add use-projects-list hook"
```

---

## Task 3: Create `ProjectsTableHeader` component

**Files:**
- Create: `src/pages/projects/ProjectsListPage/components/ProjectsTableHeader.tsx`

- [ ] **Step 1: Create the directory and file**

```bash
mkdir -p yehub-fe/src/pages/projects/ProjectsListPage/components
```

Create `src/pages/projects/ProjectsListPage/components/ProjectsTableHeader.tsx`:

```tsx
import {
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

export function ProjectsTableHeader() {
  return (
    <TableHeader>
      <TableRow>
        <TableHead className="w-[300px]">Project</TableHead>
        <TableHead className="text-center">Total Campaigns</TableHead>
        <TableHead className="text-center">Active Campaigns</TableHead>
        <TableHead className="text-right">Last Activity</TableHead>
        <TableHead className="w-[50px]" />
      </TableRow>
    </TableHeader>
  )
}
```

- [ ] **Step 2: Verify**

```bash
cd yehub-fe && pnpm build 2>&1 | tail -20
```

Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
git add yehub-fe/src/pages/projects/ProjectsListPage/components/ProjectsTableHeader.tsx
git commit -m "refactor: add ProjectsTableHeader component"
```

---

## Task 4: Create `ProjectsPagination` component

**Files:**
- Create: `src/pages/projects/ProjectsListPage/components/ProjectsPagination.tsx`

- [ ] **Step 1: Create `src/pages/projects/ProjectsListPage/components/ProjectsPagination.tsx`**

```tsx
import type { Dispatch, SetStateAction } from 'react'
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination'

interface ProjectsPaginationProps {
  page: number
  setPage: Dispatch<SetStateAction<number>>
  totalPages: number
}

export function ProjectsPagination({ page, setPage, totalPages }: ProjectsPaginationProps) {
  if (totalPages <= 1) return null

  return (
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
  )
}
```

- [ ] **Step 2: Verify**

```bash
cd yehub-fe && pnpm build 2>&1 | tail -20
```

Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
git add yehub-fe/src/pages/projects/ProjectsListPage/components/ProjectsPagination.tsx
git commit -m "refactor: add ProjectsPagination component"
```

---

## Task 5: Create `ProjectItem` component

**Files:**
- Create: `src/pages/projects/ProjectsListPage/components/ProjectItem.tsx`

- [ ] **Step 1: Create `src/pages/projects/ProjectsListPage/components/ProjectItem.tsx`**

```tsx
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { MoreVertical, Pencil, Archive, ArchiveRestore } from 'lucide-react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { TableCell, TableRow } from '@/components/ui/table'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'
import { projectsApi, type Project } from '@/api/projects'
import { ProjectLogo } from '@/components/common/ProjectLogo'
import { formatRelativeTime } from '@/lib/format'
import { EditProjectDialog } from '../../components/EditProjectDialog'

interface ProjectItemProps {
  project: Project
}

export function ProjectItem({ project }: ProjectItemProps) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [editOpen, setEditOpen] = useState(false)

  const archiveMutation = useMutation({
    mutationFn: () =>
      projectsApi.updateProject(project.id, { active: !project.active }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] })
      toast.success(project.active ? 'Project archived' : 'Project restored')
    },
  })

  return (
    <>
      <TableRow
        className="cursor-pointer"
        onClick={() => navigate(`/projects/${project.id}`)}
      >
        <TableCell>
          <div className="flex items-center gap-3">
            <ProjectLogo project={project} size={9} />
            <div className="min-w-0">
              <p className="text-sm font-semibold truncate">{project.name}</p>
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
        <TableCell className="text-center font-mono font-bold">—</TableCell>
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
            <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
              <DropdownMenuItem
                className="cursor-pointer"
                onClick={() => setEditOpen(true)}
              >
                <Pencil className="mr-2 h-4 w-4" />
                Edit
              </DropdownMenuItem>
              {project.active ? (
                <DropdownMenuItem
                  className="cursor-pointer"
                  onClick={() => archiveMutation.mutate()}
                >
                  <Archive className="mr-2 h-4 w-4" />
                  Archive
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem
                  className="cursor-pointer"
                  onClick={() => archiveMutation.mutate()}
                >
                  <ArchiveRestore className="mr-2 h-4 w-4" />
                  Restore
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </TableCell>
      </TableRow>

      <EditProjectDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        project={project}
        onSave={() => {}}
      />
    </>
  )
}
```

> `EditProjectDialog` already calls `onOpenChange(false)` and `queryClient.invalidateQueries` internally on success — `onSave` here is a no-op.

- [ ] **Step 2: Verify**

```bash
cd yehub-fe && pnpm build 2>&1 | tail -20
```

Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
git add yehub-fe/src/pages/projects/ProjectsListPage/components/ProjectItem.tsx
git commit -m "refactor: add ProjectItem component with own mutation and edit state"
```

---

## Task 6: Move `CreateProjectDialog` into `ProjectsListPage/components/`

**Files:**
- Create: `src/pages/projects/ProjectsListPage/components/CreateProjectDialog.tsx`
- Delete: `src/pages/projects/components/CreateProjectDialog.tsx`

`CreateProjectDialog` imports `ProjectCategoryPicker` from `./ProjectCategoryPicker`. After the move, the relative path to `ProjectCategoryPicker` (which stays in `projects/components/`) changes.

- [ ] **Step 1: Copy the file**

Copy `src/pages/projects/components/CreateProjectDialog.tsx` to `src/pages/projects/ProjectsListPage/components/CreateProjectDialog.tsx` with the updated import path:

Change:
```tsx
import { ProjectCategoryPicker } from './ProjectCategoryPicker'
```
To:
```tsx
import { ProjectCategoryPicker } from '../../components/ProjectCategoryPicker'
```

All other content is identical to the source file.

- [ ] **Step 2: Delete the old file**

```bash
rm yehub-fe/src/pages/projects/components/CreateProjectDialog.tsx
```

- [ ] **Step 3: Verify**

```bash
cd yehub-fe && pnpm build 2>&1 | tail -20
```

Expected: build succeeds. (The old `ProjectsListPage.tsx` import will break — that's fine, it gets replaced in Task 7.)

> If the build shows `Cannot find module './components/CreateProjectDialog'` from `ProjectsListPage.tsx`, that is expected and will be fixed in Task 7.

- [ ] **Step 4: Commit**

```bash
git add yehub-fe/src/pages/projects/ProjectsListPage/components/CreateProjectDialog.tsx
git rm yehub-fe/src/pages/projects/components/CreateProjectDialog.tsx
git commit -m "refactor: move CreateProjectDialog into ProjectsListPage/components"
```

---

## Task 7: Create `ProjectsListPage/index.tsx` and remove old file

**Files:**
- Create: `src/pages/projects/ProjectsListPage/index.tsx`
- Delete: `src/pages/projects/ProjectsListPage.tsx`

The router imports `@/pages/projects/ProjectsListPage` as a lazy module. With `ProjectsListPage.tsx` deleted and `ProjectsListPage/index.tsx` in place, Vite resolves the path to `index.tsx` automatically — **no router changes needed**.

- [ ] **Step 1: Create `src/pages/projects/ProjectsListPage/index.tsx`**

```tsx
import { useState } from 'react'
import { FolderKanban, Plus, Archive } from 'lucide-react'
import { PageHeader } from '@/components/common/PageHeader'
import { SearchBar } from '@/components/common/SearchBar'
import { EmptyState } from '@/components/common/EmptyState'
import { Button } from '@/components/ui/button'
import { Table, TableBody } from '@/components/ui/table'
import { useAuthStore } from '@/store/auth.store'
import { useCanGlobal } from '@/hooks/use-can'
import { useProjectsList } from '@/hooks/use-projects-list'
import { PageWrapper } from '@/components/common/PageWrapper'
import { ProjectsTableHeader } from './components/ProjectsTableHeader'
import { ProjectItem } from './components/ProjectItem'
import { ProjectsPagination } from './components/ProjectsPagination'
import { CreateProjectDialog } from './components/CreateProjectDialog'

export function ProjectsListPage() {
  const user = useAuthStore((s) => s.user)
  const canCreate = useCanGlobal('create_project', user?.role ?? null)
  const [createOpen, setCreateOpen] = useState(false)

  const {
    projects,
    totalPages,
    isLoading,
    page,
    setPage,
    search,
    handleSearchChange,
    showArchived,
    handleToggleArchived,
  } = useProjectsList()

  return (
    <PageWrapper>
      <PageHeader
        title="Projects"
        description="Manage your client projects"
        actions={
          canCreate ? (
            <Button className="cursor-pointer" onClick={() => setCreateOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              New Project
            </Button>
          ) : null
        }
      />

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
            <ProjectsTableHeader />
            <TableBody>
              {projects.map((project) => (
                <ProjectItem key={project.id} project={project} />
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <ProjectsPagination page={page} setPage={setPage} totalPages={totalPages} />

      <CreateProjectDialog open={createOpen} onOpenChange={setCreateOpen} />
    </PageWrapper>
  )
}
```

- [ ] **Step 2: Delete the old flat file**

```bash
rm yehub-fe/src/pages/projects/ProjectsListPage.tsx
```

- [ ] **Step 3: Full build check**

```bash
cd yehub-fe && pnpm build 2>&1 | tail -30
```

Expected: clean build, zero TypeScript errors.

- [ ] **Step 4: Lint check**

```bash
cd yehub-fe && pnpm lint 2>&1 | tail -20
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add yehub-fe/src/pages/projects/ProjectsListPage/index.tsx
git rm yehub-fe/src/pages/projects/ProjectsListPage.tsx
git commit -m "refactor: replace ProjectsListPage flat file with folder structure"
```
