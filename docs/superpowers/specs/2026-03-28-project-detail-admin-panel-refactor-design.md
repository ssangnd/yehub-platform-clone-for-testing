# ProjectDetailPage & AdminPanelPage Refactor Design

**Date:** 2026-03-28
**Branch:** feat/rbac-refactor

## Goal

Apply the same Folder Structure Best Practices and React Conventions used in the `ProjectsListPage` refactor to `ProjectDetailPage.tsx` and `admin-panel.tsx`. Pure structural refactor — no behavioral changes.

---

## Part 1: ProjectDetailPage

### File Changes

| Action | Path | Responsibility |
|--------|------|----------------|
| CREATE | `src/pages/projects/ProjectDetailPage/index.tsx` | Thin page shell (~70 lines) |
| CREATE | `src/pages/projects/ProjectDetailPage/use-project-detail.ts` | 2 queries + role logic |
| MOVE | `src/pages/projects/ProjectDetailPage/components/ProjectMembersTab.tsx` | From `projects/components/` — only used here |
| MOVE | `src/pages/projects/ProjectDetailPage/components/AddMemberDialog.tsx` | From `projects/components/` — only used here |
| DELETE | `src/pages/projects/ProjectDetailPage.tsx` | Replaced by folder |
| STAYS | `src/pages/projects/components/EditProjectDialog.tsx` | Shared with `ProjectItem` in `ProjectsListPage` |
| STAYS | `src/pages/projects/components/ProjectCategoryPicker.tsx` | Shared via `EditProjectDialog` |

### Resulting Structure

```
projects/
├── ProjectDetailPage/
│   ├── index.tsx
│   ├── use-project-detail.ts
│   └── components/
│       ├── ProjectMembersTab.tsx
│       └── AddMemberDialog.tsx
├── ProjectsListPage/
│   └── ...
└── components/
    ├── EditProjectDialog.tsx
    └── ProjectCategoryPicker.tsx
```

### Component Responsibilities

**`use-project-detail`** hook — owns all data concerns:
- `useQuery` for project (`['project', id]`)
- `useQuery` for myRole (`['project-me', id]`, disabled for admins)
- `useAuthStore` for `isAdmin`
- `useCan` for `canManageByRole`
- Derived: `canManageMembers = isAdmin || canManageByRole`
- Returns: `project`, `projectError`, `myRoleData`, `roleError`, `isAdmin`, `canManageMembers`

**`ProjectDetailPage/index.tsx`** — owns rendering concerns:
- `editOpen` state (dialog UI only)
- `useSetPageTitle`
- `useEffect` for error navigation (stays in component — side effect tied to render lifecycle)
- Early returns for error/loading states
- `handleTabChange` helper
- Renders: breadcrumb, `PageHeader`, metrics grid, `Tabs`, `EditProjectDialog`

**`ProjectMembersTab`** — unchanged logic, just moved to `ProjectDetailPage/components/`

**`AddMemberDialog`** — unchanged logic, just moved to `ProjectDetailPage/components/`; update relative import of any shared deps if needed

---

## Part 2: AdminPanelPage

### File Changes

| Action | Path | Responsibility |
|--------|------|----------------|
| CREATE | `src/pages/admin/AdminPanelPage/index.tsx` | Thin page shell (~140 lines, keeps small helpers inline) |
| CREATE | `src/pages/admin/AdminPanelPage/use-admin-users.ts` | Query + sort + pagination state |
| CREATE | `src/pages/admin/AdminPanelPage/components/InviteUserDialog.tsx` | Invite user form dialog |
| CREATE | `src/pages/admin/AdminPanelPage/components/UserDetailDialog.tsx` | User detail + 5 confirmation dialogs |
| DELETE | `src/pages/admin/admin-panel.tsx` | Replaced by folder |
| UPDATE | `src/router.tsx` | Change import path from `admin/admin-panel` to `admin/AdminPanelPage` |

### Resulting Structure

```
admin/
└── AdminPanelPage/
    ├── index.tsx
    ├── use-admin-users.ts
    └── components/
        ├── InviteUserDialog.tsx
        └── UserDetailDialog.tsx
```

### Component Responsibilities

**`use-admin-users`** hook — owns data + filter state:
- `sortKey`, `setSortKey`, `sortDir`, `setSortDir`, `page`, `setPage` state
- `useQuery` for paginated user list (`['admin-users', sortKey, sortDir, page]`)
- `handleSort` (toggles direction or sets new key, resets page to 1)
- Returns: `data`, `isLoading`, `isError`, `totalPages`, `paginatedUsers`, `sortKey`, `sortDir`, `page`, `setPage`, `handleSort`

**`AdminPanelPage/index.tsx`** — owns rendering:
- `inviteOpen`, `selectedUserId` dialog state
- Inline helpers: `RoleBadge`, `StatusBadge`, `SortIcon` (3–10 lines each, YAGNI — no separate files)
- Renders: `PageHeader`, table, pagination, `InviteUserDialog`, `UserDetailDialog`

**`InviteUserDialog`** — extracted as-is (~100 lines). No import path changes needed (all `@/` aliases).

**`UserDetailDialog`** — extracted as-is (~360 lines). Contains 5 nested confirmation dialogs; inherent complexity from the feature, not decomposed further. All `@/` aliases, no relative imports to update.

### Router Update

```ts
// Before
import('@/pages/admin/admin-panel').then((m) => ({ default: m.AdminPanelPage }))

// After
import('@/pages/admin/AdminPanelPage').then((m) => ({ default: m.AdminPanelPage }))
```

---

## Out of Scope

- No logic changes in any component
- No styling changes
- `ProjectMembersTab` internal logic (including `AddMemberDialog` usage) is untouched
- `UserDetailDialog` confirmation dialog structure is untouched
