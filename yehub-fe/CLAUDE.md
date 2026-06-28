# Project Guidelines for Claude

## Package Manager

This project uses **pnpm**. Always use `pnpm` — never `npm` or `yarn`.

```bash
pnpm add <package>       # install a dependency
pnpm add -D <package>    # install a dev dependency
pnpm remove <package>    # remove a dependency
pnpm install             # install all dependencies
```

## Tech Stack

- **Framework:** React 19 + Vite + TypeScript
- **Styling:** Tailwind CSS v4
- **UI Components:** shadcn/ui + `@base-ui/react` primitives, `vaul` (drawer)
- **Routing:** React Router Dom v7
- **Data Fetching:** TanStack React Query v5
- **API Client:** Axios (`src/api/client.ts`) with JWT access/refresh token interceptors
- **Forms:** React Hook Form v7 + Zod v4
- **Global State:** Zustand v5 (`src/store/`)
- **Charts:** Recharts
- **Icons:** Lucide React
- **Toasts:** Sonner

## Common Commands

```bash
pnpm dev                 # start dev server (Vite)
pnpm build               # tsc + vite build
pnpm lint                # ESLint
pnpm preview             # preview production build
```

## Environment Variables

Required in `.env`:

```
VITE_API_URL=http://localhost:3000/v1
```

All env vars are accessed via `src/env.ts` — never read `import.meta.env` directly in components.

## Project Structure

```
src/
├── api/                 # Axios API functions, one file per domain
│   ├── client.ts        # Axios instance + auth interceptors
│   ├── auth.ts
│   ├── projects.ts
│   └── ...
├── components/
│   ├── common/          # Shared reusable components (PascalCase)
│   ├── ui/              # shadcn/ui primitives (do not edit manually)
│   ├── app-sidebar.tsx  # Layout/shell components (kebab-case)
│   ├── protected-route.tsx
│   └── admin-route.tsx
├── hooks/               # Custom hooks (kebab-case, use- prefix)
├── lib/
│   ├── constants/       # App-wide constants (roles, etc.)
│   ├── format.ts        # Formatting utilities
│   ├── schemas.ts       # Shared Zod schemas
│   └── utils.ts         # cn() and other helpers
├── pages/               # Feature pages
│   ├── login.tsx        # Simple pages: kebab-case flat files
│   ├── projects/        # Complex features: dedicated folder
│   │   ├── ProjectsListPage.tsx
│   │   ├── ProjectDetailPage.tsx
│   │   └── components/  # Page-specific sub-components
│   └── admin/
├── store/               # Zustand stores
│   ├── auth.store.ts
│   └── theme.store.ts
├── router.tsx           # createBrowserRouter definition
├── env.ts               # Typed env var access
└── main.tsx
```

## Naming Conventions

- **Components:** PascalCase for component names and their files (`ProjectsListPage.tsx`, `EmptyState.tsx`).
- **Non-component files & folders:** kebab-case (`use-mobile.ts`, `auth.store.ts`, `protected-route.tsx`, `forgot-password.tsx`).
- **Simple pages are the one exception:** single-file pages with no sub-components use kebab-case (`login.tsx`, `forgot-password.tsx`). Once a page needs its own sub-components, convert it to a PascalCase folder — see _Folder Structure Best Practices_ below.
- **File extension:** Use `.tsx` for any file that contains JSX; `.ts` otherwise.

## Folder Structure Best Practices

- **Simple pages** (single file, no sub-components): flat kebab-case file under `src/pages/` (e.g., `login.tsx`).
- **Complex features** (multiple pages sharing sub-components): dedicated PascalCase folder with a `components/` subfolder (e.g., `pages/projects/`). Sub-components shared across pages in the feature go here.
- **Complex pages** (a single page with its own sub-components): the page becomes a PascalCase folder with `index.tsx` as the entry point and a `components/` subfolder for page-only sub-components.
- **Colocation:** sub-components used only by one page live inside that page's folder. Sub-components shared between pages in the same feature live in the feature's `components/` folder. Cross-feature reusables go in `src/components/common/`.

**Example — `ProjectsListPage` has private sub-components; `EditProjectDialog` is shared with `ProjectDetailPage`:**

```
pages/projects/
├── ProjectsListPage/
│   ├── index.tsx                  ← the page component
│   └── components/
│       ├── ProjectItem.tsx        ← only used by ProjectsListPage
│       ├── ProjectsTableHeader.tsx
│       ├── ProjectsPagination.tsx
│       └── CreateProjectDialog.tsx
├── ProjectDetailPage.tsx
└── components/
    └── EditProjectDialog.tsx      ← shared by ProjectsListPage + ProjectDetailPage
```

### Decision flow before creating a new page sub-component

Before writing a new component under `pages/`, answer in order:

1. **Is it used by more than one _feature_?** → `src/components/common/`.
2. **Is it used by more than one _page_ in the same feature?** → `pages/<feature>/components/`.
3. **Is it used by only _one_ page?** → that page must be a folder (`pages/<feature>/<PageName>/index.tsx`) with the sub-component in `pages/<feature>/<PageName>/components/`. If the page is currently a flat file, convert it to the folder form first.

**Common mistake — do NOT do this:** dumping page-only sub-components into `pages/<feature>/components/`. That folder is reserved for components shared _across multiple pages_ in the feature. A single-page sub-component belongs in the page's own `components/` folder (step 3 above), not the feature-level one.

**Example — converting a flat page to the folder form** when it grows its first private sub-component:

```
# Before — simple flat page
pages/
└── login.tsx

# After — page has its own sub-components, so it becomes a folder
pages/
└── LoginPage/
    ├── index.tsx
    └── components/
        └── SocialLoginButtons.tsx
```

Route imports keep working: `import LoginPage from './pages/LoginPage'` resolves to `index.tsx`.

## React Conventions

- **Functional components only.** Do not use class components.
- **Single responsibility.** Keep components small and focused; extract sub-components when a component grows.
- **Local state first.** Use `useState`/`useReducer` for component-local state.
- **Global state (Zustand): requires approval.** The existing stores (`auth.store`, `theme.store`) cover auth tokens and theme. Prefer React Query cache or URL state for server/UI state.
  - **Needs approval:** creating a new store, or adding a new _concern_ to an existing store (e.g., putting a UI setting into `auth.store`).
  - **No approval needed:** adding a field that belongs to the store's existing concern (e.g., a new token field in `auth.store`) or renaming/refactoring within one store.
- **Custom hooks:** extract reusable logic into `src/hooks/` with the `use-` prefix (kebab-case filename, `use` function prefix).

### When to extract a sub-component

Extract when **any** of these are true:

- The JSX block represents a distinct, named UI concept (e.g., a table row, a card, a dialog) — give it its own file.
- The block is complex enough that you need to scroll past it to understand the parent component.
- The same JSX structure appears in more than one place.
- A component file exceeds ~150 lines — treat this as a signal to review responsibilities.

Do **not** extract just to reduce line count. A 30-line block that only exists in one place and has no distinct identity should stay inline.

### When to extract a custom hook

Extract when **any** of these are true:

- A component contains `useQuery` or `useMutation` alongside rendering logic — data fetching always goes into a hook.
- A component has 3+ related `useState` calls that represent one concern (e.g., pagination state, filter state).
- The same query or state logic is duplicated across two components.

Keep in the component: dialog open/close state, form state, UI-only toggles that don't involve data fetching.

**Where to put the hook:**

- Used by one page only → co-locate inside that page's folder (e.g., `ProjectsListPage/use-projects-list.ts`)
- Used by multiple components → `src/hooks/`

**Example — extracting data fetching out of a page:**

```tsx
// ❌ Before — query and rendering tangled together
function ProjectsListPage() {
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const { data, isLoading } = useQuery({
    queryKey: ['projects', { page, search }],
    queryFn: () => getProjects({ page, search }),
  })
  return <ProjectsTable data={data} isLoading={isLoading} ... />
}

// ✅ After — hook owns the query, page owns the JSX
// ProjectsListPage/use-projects-list.ts
export function useProjectsList() {
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const query = useQuery({
    queryKey: ['projects', { page, search }],
    queryFn: () => getProjects({ page, search }),
  })
  return { page, setPage, search, setSearch, ...query }
}

// ProjectsListPage/index.tsx
function ProjectsListPage() {
  const { data, isLoading, page, setPage, search, setSearch } = useProjectsList()
  return <ProjectsTable data={data} isLoading={isLoading} ... />
}
```

### Local state principles

- **Lift state up only when shared.** If two siblings need the same value, lift to their nearest common ancestor. If only one component needs it, keep it local. (See _State ownership and dialog placement_ below for dialog-specific guidance.)
- **Keep state flat.** Prefer multiple `useState` calls or a shallow object over nested shapes like `state.user.profile.address.street` — easier to update, fewer accidental mutations.
- **Compute, don't store.** If a value can be derived from props or other state, calculate it in render. Do not mirror it into `useState` + `useEffect` — that creates sync bugs when the source changes.

  ```tsx
  // ❌ Don't mirror derived data
  const [filtered, setFiltered] = useState(items.filter(...))
  useEffect(() => setFiltered(items.filter(...)), [items, query])

  // ✅ Derive during render (memoize only if measurably expensive)
  const filtered = items.filter(...)
  ```

### State ownership and dialog placement

Keep state as close as possible to where it's used. Lift state only when it is genuinely shared.

- **Per-item dialogs and their mutations live inside the item component.** If a dialog confirms or edits a specific list item (delete, edit, per-row menu), mount it inside the component that renders that item. The dialog's `open` state and the associated `useMutation` belong there too — the page should not track "the currently-selected item to delete/edit". React Query invalidation already propagates across components, so there is no coupling cost.
- **Page-scoped dialogs stay at the page level.** Create flows (no existing item to attach to) and dialogs triggered from the page header belong in the page component.
- **One form component for both create and edit.** When create and edit share the same fields, build a single `<XFormDialog>` that accepts an optional `item?: T | null` prop (null/undefined = create mode). Reset the form in a `useEffect` when `open` flips to true. Mount it twice if needed: once at the page level for create, once inside the item component for edit.
- **Props are data and callbacks from the parent, not internal UI state.** Do not lift `isOpen`, form field values, or local toggles into props unless the parent legitimately needs to control them (e.g., a route-driven dialog or multiple entry points).

> **Why the `useEffect`-on-open reset is fine despite "compute, don't store" above:** resetting form fields when a dialog opens is a genuine _side effect_ keyed on a transition (closed → open), not derived state mirrored into `useState`. The exception is the `open` transition specifically — don't reuse this pattern to sync props into state.

**Anti-pattern — don't do this:**

```tsx
// Page
const [deleteItem, setDeleteItem] = useState<Item | null>(null)
const deleteMutation = useMutation({ mutationFn: (id: string) => api.delete(id), ... })
{items.map((i) => <ItemCard key={i.id} item={i} onDelete={setDeleteItem} />)}
<DeleteDialog item={deleteItem} onConfirm={() => deleteMutation.mutate(deleteItem!.id)} />
```

**Preferred:**

```tsx
// Page — unaware of delete at all
{items.map((i) => <ItemCard key={i.id} item={i} />)}

// ItemCard owns its own delete flow
const [deleteOpen, setDeleteOpen] = useState(false)
const deleteMutation = useMutation({ mutationFn: () => api.delete(item.id), ... })
<DeleteDialog open={deleteOpen} onOpenChange={setDeleteOpen} item={item} ... />
```

**Shared create/edit dialog example:**

```tsx
// ProjectFormDialog.tsx — one component, both modes
type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  project?: Project | null   // null/undefined → create mode
}

export function ProjectFormDialog({ open, onOpenChange, project }: Props) {
  const form = useForm({ resolver: zodResolver(projectSchema), defaultValues: empty })

  useEffect(() => {
    if (open) form.reset(project ?? empty)   // side effect on open transition
  }, [open, project])

  const mutation = useMutation({
    mutationFn: (values) => (project ? api.update(project.id, values) : api.create(values)),
    onSuccess: () => onOpenChange(false),
  })
  // ...render form
}

// Page — mounts it for create
<ProjectFormDialog open={createOpen} onOpenChange={setCreateOpen} />

// ProjectCard — mounts its own instance for edit
<ProjectFormDialog open={editOpen} onOpenChange={setEditOpen} project={project} />
```

## API Layer

- All HTTP calls go through the shared `apiClient` from `src/api/client.ts` — never create a second Axios instance.
- Group API functions by domain in `src/api/<domain>.ts` (e.g., `projects.ts`, `auth.ts`).
- The `client.ts` interceptor handles JWT attachment and silent token refresh automatically — do not duplicate this logic.
- Use **TanStack React Query** for all server state (fetching, caching, mutations). Do not store server data in Zustand or component state.
- Define query/mutation logic in dedicated hooks co-located with the feature or in `src/hooks/`.

## Routing

- All routes are defined in `src/router.tsx` using `createBrowserRouter`.
- Access control: `<ProtectedRoute>` for authentication, `<AdminRoute>` for admin-only pages, `<GuestOnly>` for login/signup pages (redirects logged-in users away).
- Do not lazy-load pages unless bundle size becomes a concern — current setup uses direct imports. (Note: the root `CLAUDE.md` currently says "lazy-loaded pages"; this file is the source of truth for `yehub-fe/`.)

```tsx
// router.tsx
createBrowserRouter([
  {
    path: '/login',
    element: (
      <GuestOnly>
        <LoginPage />
      </GuestOnly>
    ),
  },
  {
    path: '/projects',
    element: (
      <ProtectedRoute>
        <ProjectsListPage />
      </ProtectedRoute>
    ),
  },
  {
    path: '/admin/users',
    element: (
      <AdminRoute>
        <AdminUsersPage />
      </AdminRoute>
    ),
  },
])
```

## Forms

- Use **React Hook Form** for all form state.
- Define validation schemas with **Zod** in `src/lib/schemas.ts` (shared) or co-located with the form.
- Connect via `@hookform/resolvers/zod`.

**Where to put the schema:**

- **Shared** (`src/lib/schemas.ts`) — reused across multiple forms, or referenced by API types. Examples: `loginSchema`, `emailSchema`, `passwordSchema`.
- **Co-located** (next to the component that uses it) — used by exactly one form and not referenced elsewhere. Example: a `ProjectFormDialog.tsx` defining its own `projectFormSchema` inline.

Move a co-located schema to `lib/schemas.ts` the moment a second consumer needs it — do not duplicate.

## UI Components

- Prefer **shadcn/ui** primitives from `src/components/ui/` before building custom equivalents.
- Add new shadcn components via CLI: `pnpm dlx shadcn@latest add <component>` — do not copy files manually.
- Do not edit files under `src/components/ui/` manually; they are managed by the shadcn CLI.

## Authorization

- Use `useCan(action, projectRole)` for project-level permission checks.
- Use `useCanGlobal(action, globalRole)` for global permission checks.
- Permission tables live in `src/hooks/use-can.ts` — add new actions there, not inline in components.

```tsx
const canEditProject = useCan('project.edit', membership.role)
const canManageUsers = useCanGlobal('user.manage', currentUser.globalRole)

{canEditProject && <Button onClick={...}>Edit project</Button>}
{canManageUsers && <AdminPanel />}
```

Do **not** hardcode role checks inline (`if (user.role === 'ADMIN')`) — always go through `useCan`/`useCanGlobal` so permission logic stays centralized.

## Code Style

- TypeScript strict mode is enabled — avoid `any`; use proper types or `unknown`.
- Prettier and ESLint are configured — run `pnpm lint` before committing.
- Use `cn()` from `src/lib/utils.ts` for conditional Tailwind class merging.
