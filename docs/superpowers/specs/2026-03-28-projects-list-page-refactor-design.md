# ProjectsListPage Refactor Design

**Date:** 2026-03-28
**Branch:** feat/rbac-refactor

## Goal

Refactor `ProjectsListPage.tsx` to follow the Folder Structure Best Practices and React Conventions documented in `yehub-fe/CLAUDE.md`:
- Single responsibility per file (separate data fetching from rendering)
- Page-private sub-components colocated inside the page's own folder
- Eliminate `ProjectLogo` duplication between `ProjectsListPage` and `ProjectDetailPage`

---

## File Changes

### New files

| File | Purpose |
|------|---------|
| `src/components/common/ProjectLogo.tsx` | Shared logo component (removes duplication across both pages) |
| `src/hooks/use-projects-list.ts` | Query + filter state hook for the projects list |
| `src/pages/projects/ProjectsListPage/index.tsx` | Trimmed page shell (~60 lines) |
| `src/pages/projects/ProjectsListPage/components/ProjectItem.tsx` | Single table row; owns `archiveMutation`, `editOpen` state, and renders `EditProjectDialog` |
| `src/pages/projects/ProjectsListPage/components/ProjectsTableHeader.tsx` | Static `<TableHeader>` markup |
| `src/pages/projects/ProjectsListPage/components/ProjectsPagination.tsx` | Pagination UI; props: `page`, `setPage`, `totalPages` |

### Moved files

| From | To |
|------|----|
| `projects/components/CreateProjectDialog.tsx` | `ProjectsListPage/components/CreateProjectDialog.tsx` |

### Updated files

| File | Change |
|------|--------|
| `projects/components/` | Retains only shared components: `EditProjectDialog`, `AddMemberDialog`, `ProjectCategoryPicker` |
| `ProjectDetailPage.tsx` | Import `ProjectLogo` from `src/components/common/ProjectLogo` |
| `ProjectsListPage.tsx` (old) | Deleted — replaced by `ProjectsListPage/index.tsx` |

---

## Component Responsibilities

### `useProjectsList` hook
Owns all data and filter concerns:
- `page`, `setPage`
- `search`, `handleSearchChange` (resets page to 1)
- `showArchived`, `handleToggleArchived` (resets page to 1)
- `debouncedSearch`
- `useQuery` for paginated projects list
- Returns: `projects`, `totalPages`, `isLoading`

Does **not** own: `archiveMutation`, dialog open/close state.

### `ProjectsListPage/index.tsx`
Thin orchestrator:
- `createOpen` state (dialog UI only)
- Destructures `useProjectsList()`
- Renders: `PageHeader`, filter bar, `<Table>` with `<ProjectsTableHeader>` + `<ProjectItem>` per project, `<ProjectsPagination>`, `<CreateProjectDialog>`

### `ProjectItem`
- Props: `project: Project`
- Owns: `editOpen` state, `editProject` ref, `archiveMutation`
- Renders: full `<TableRow>` including dropdown menu and `<EditProjectDialog>`

### `ProjectsTableHeader`
- No props
- Renders the static `<TableHeader><TableRow>` with column headings

### `ProjectsPagination`
- Props: `page: number`, `setPage: (updater: (p: number) => number) => void`, `totalPages: number`
- Renders only when `totalPages > 1`

### `ProjectLogo` (common)
- Props: `project: Project`, `size?: number`
- Replaces the identical inline definitions in both `ProjectsListPage` and `ProjectDetailPage`

---

## Folder Structure Result

```
src/
├── components/common/
│   └── ProjectLogo.tsx
├── hooks/
│   └── use-projects-list.ts
└── pages/projects/
    ├── ProjectsListPage/
    │   ├── index.tsx
    │   └── components/
    │       ├── ProjectItem.tsx
    │       ├── ProjectsTableHeader.tsx
    │       ├── ProjectsPagination.tsx
    │       └── CreateProjectDialog.tsx
    ├── ProjectDetailPage.tsx
    └── components/
        ├── EditProjectDialog.tsx
        ├── AddMemberDialog.tsx
        └── ProjectCategoryPicker.tsx
```

---

## Out of Scope

- No logic changes — this is a structural refactor only
- No new features, API changes, or styling changes
- `ProjectDetailPage` is only updated for the `ProjectLogo` import
