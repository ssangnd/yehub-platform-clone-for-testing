# yehub-fe Refactor Design

**Date:** 2026-03-28
**Scope:** `yehub-fe` only
**Approach:** Incremental, file-by-file (Approach A)

---

## 1. Router & Route Constants

### New file: `src/lib/constants/routes.ts`

```ts
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

### Updated `src/router.tsx`

- All path strings replaced with `ROUTES.*` constants
- All page imports converted to `React.lazy()`
- `SuspenseWrapper` component (matching demo pattern) wraps every route element:
  ```tsx
  function SuspenseWrapper({ children }: { children: React.ReactNode }) {
    return <Suspense fallback={<div />}>{children}</Suspense>
  }
  ```
- `path: '*'` renders `<NotFoundPage />` instead of redirecting to login
- `path: '/'` renders `<HomePage />` instead of redirecting to `/projects`
- New routes added: `/campaigns`, `/posts`, `/profiles/influencers`, `/profiles/brands`

---

## 2. Missing Pages (Coming Soon)

Five new stub pages, all default exports for `React.lazy()` compatibility:

| File | Route |
|------|-------|
| `src/pages/home/HomePage.tsx` | `/` |
| `src/pages/campaigns/CampaignsPage.tsx` | `/campaigns` |
| `src/pages/posts/PostsPage.tsx` | `/posts` |
| `src/pages/profiles/InfluencersPage.tsx` | `/profiles/influencers` |
| `src/pages/profiles/BrandsPage.tsx` | `/profiles/brands` |

Each renders a centered layout with the page title and "Coming soon" description. No AppShell wrapping — the router layout handles that.

### `src/pages/NotFoundPage.tsx`

Modeled after the demo version:
- Full-screen centered layout
- `FileQuestion` icon from lucide-react
- "404" heading + "Page not found" text
- "Go to Projects" button using `ROUTES.PROJECTS`

---

## 3. Projects Page — API Paging & Search

### API changes (`src/api/projects.ts`)

`listProjects` gains optional query params:
```ts
listProjects: (params?: { q?: string; page?: number; limit?: number; active?: boolean }) =>
  apiClient.get<{ data: Project[]; total: number; page: number; totalPages: number }>('/projects', { params })
```

A separate `getProjectStats` call (no filters) powers the metric cards so counts always reflect totals.

### `ProjectsListPage.tsx` changes

- State: `page`, `search` (debounced 300ms), `showArchived`
- `useQuery` key: `['projects', page, debouncedSearch, showArchived]` — re-fetches on any change
- Search change resets `page` to 1
- Archive toggle resets `page` to 1
- Client-side `filter()` removed entirely
- Pagination rendered below the table using the shadcn `Pagination` component
- Metric cards use a separate `useQuery(['projects-stats'])` with no filters

---

## 4. AddMemberDialog — API-Based Search

### API changes (`src/api/projects.ts`)

`getNonMembers` gains optional params:
```ts
getNonMembers: (projectId: string, params?: { q?: string; limit?: number }) =>
  apiClient.get<{ id: string; email: string; name: string }[]>(
    `/projects/${projectId}/non-members`,
    { params }
  ).then(r => r.data)
```

### `AddMemberDialog.tsx` changes

- Add `search` state tied to `CommandInput` value
- `useQuery` key: `['non-members', projectId, search]` with debounce (~300ms)
- Default call (empty search): `limit=10` — fetches first 10 available users
- Search call: `q=search&limit=10` — fetches first 10 best matches
- `shouldFilter={false}` on `Command` — API handles matching, not client
- Loading indicator shown in `CommandList` while query is fetching

---

## 5. Users Page — Sort by API

### API changes (`src/api/admin.ts`)

`listUsers` gains optional sort params:
```ts
listUsers: (params?: { sortBy?: 'name' | 'role' | 'last_login_at'; sortDir?: 'asc' | 'desc' }) =>
  apiClient.get<AdminUser[]>('/admin/users', { params }).then(r => r.data)
```

### `admin-panel.tsx` changes

- Remove `useMemo` client-side sort entirely
- `useQuery` key: `['admin-users', sortKey, sortDir]` — re-fetches on sort change
- Column header click updates `sortKey`/`sortDir` → triggers new API call
- `page` resets to 1 on sort change

---

## 6. Forms — React Hook Form + Zod

### `src/lib/schemas.ts` additions

Both create and edit share the same shape, so one schema covers both:

```ts
export const projectFormSchema = z.object({
  name: z.string().min(1, 'Project name is required'),
  client_name: z.string().optional(),
  description: z.string().optional(),
})
export type ProjectFormValues = z.infer<typeof projectFormSchema>
```

### `EditProjectDialog.tsx`

- Replace `useState` for `name`, `clientName`, `description` with `useForm<ProjectFormValues>({ resolver: zodResolver(projectFormSchema) })`
- `useEffect` on `open` calls `form.reset({ name, client_name, description })` instead of individual setters
- Wrap text inputs in `<Form>`, `<FormField>`, `<FormItem>`, `<FormLabel>`, `<FormControl>`, `<FormMessage>`
- `logo` and `categories` remain local `useState` (file upload + custom picker)
- Submit calls `form.handleSubmit(onSubmit)`

### Create Project form → `src/pages/projects/components/CreateProjectDialog.tsx`

- Extract from `ProjectsListPage` into a dedicated component
- Apply same RHF + zod pattern with `projectFormSchema`
- `logo` and `categories` remain local state within the dialog
- Removes `createName`, `createClientName`, `createDesc`, `createLogo`, `createLogoUploading`, `createLogoRef`, `createCategories` state from `ProjectsListPage`
- Props: `open`, `onOpenChange`, `onSuccess`

### `AddMemberDialog.tsx`

No RHF needed. It's a selection UI (Command picker + Select). The `disabled={!selectedUserId}` submit guard is sufficient.

---

## Files Changed Summary

| File | Change |
|------|--------|
| `src/lib/constants/routes.ts` | **New** — route constants |
| `src/router.tsx` | Update — lazy imports, SuspenseWrapper, ROUTES constants, new routes |
| `src/pages/NotFoundPage.tsx` | **New** |
| `src/pages/home/HomePage.tsx` | **New** |
| `src/pages/campaigns/CampaignsPage.tsx` | **New** |
| `src/pages/posts/PostsPage.tsx` | **New** |
| `src/pages/profiles/InfluencersPage.tsx` | **New** |
| `src/pages/profiles/BrandsPage.tsx` | **New** |
| `src/api/projects.ts` | Update — add params to `listProjects`, `getNonMembers`; add `getProjectStats` |
| `src/api/admin.ts` | Update — add sort params to `listUsers` |
| `src/lib/schemas.ts` | Update — add `projectFormSchema` |
| `src/pages/projects/ProjectsListPage.tsx` | Update — API paging/search, remove create form state |
| `src/pages/projects/components/CreateProjectDialog.tsx` | **New** — extracted + RHF |
| `src/pages/projects/components/EditProjectDialog.tsx` | Update — apply RHF |
| `src/pages/projects/components/AddMemberDialog.tsx` | Update — API search, debounce |
| `src/pages/admin/admin-panel.tsx` | Update — API sort, remove client-side sort |
