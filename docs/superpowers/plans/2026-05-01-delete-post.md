# Delete Post Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow ADMIN and project MANAGER to permanently delete a post (with cascading comments and profile-post links) from the post detail page and the campaign-detail posts list.

**Architecture:** Backend switches `PostsService.remove` from soft-delete (`update { deleted_at }`) to hard-delete (`prisma.post.delete`); cascade is handled by existing `onDelete: Cascade` FKs on `Comment.post_id` and `ProfilePost.post_id`. Frontend adds a new `delete_post` permission, a delete dropdown on the post detail page, and an opt-in `renderActions` slot on the shared `PostsTable` consumed by `CampaignPostsTab` via a new `PostRowActions` component.

**Tech Stack:** NestJS 11, Prisma 7, Jest (backend); React 19, TanStack Query v5, shadcn/ui, Sonner toasts (frontend).

---

## Files

**Backend**
- Modify: `yehub-be/src/posts/posts.service.ts` (lines 603-620, `remove()` method)
- Modify: `yehub-be/src/posts/posts.controller.ts` (line 142, Swagger summary)
- Modify: `yehub-be/src/posts/posts.service.spec.ts` (add new `describe('PostsService.remove', ...)` block — none currently exists)

**Frontend**
- Modify: `yehub-fe/src/hooks/use-can.ts` (add `delete_post` action)
- Modify: `yehub-fe/src/pages/posts/PostDetailPage/use-post-detail.ts` (add `useDeletePost` hook + extend `usePostDetail`)
- Modify: `yehub-fe/src/pages/posts/PostDetailPage/index.tsx` (replace "More" button with delete dropdown)
- Modify: `yehub-fe/src/components/common/PostsTable.tsx` (add optional `renderActions` slot)
- Create: `yehub-fe/src/pages/campaigns/CampaignDetailPage/components/PostRowActions.tsx`
- Modify: `yehub-fe/src/pages/campaigns/CampaignDetailPage/components/CampaignPostsTab.tsx` (compute `canDeletePost`, pass `renderActions`)
- Modify: `yehub-fe/src/pages/campaigns/CampaignDetailPage/index.tsx` (pass `canDeletePost` and `isAdmin` to `CampaignPostsTab`)

The existing `postsApi.deletePost` in `yehub-fe/src/api/posts.ts` is already in place — no change.
The existing `useCampaignPosts` hook already has a `deletePost` mutation but it is unused — `PostRowActions` will own its own mutation per the project's state-ownership convention, and the unused mutation in `useCampaignPosts` will be removed in Task 8.

---

## Phase 1 — Backend: hard delete

### Task 1: Add tests for `PostsService.remove`

**Files:**
- Test: `yehub-be/src/posts/posts.service.spec.ts`

The current spec file only covers `bulkUpload`. We add a new `describe` block for `remove()` with three cases: success path calls `prisma.post.delete`, COMPLETED campaign rejects, missing post 404s.

- [ ] **Step 1: Write the failing tests**

Add this `describe` block at the end of `yehub-be/src/posts/posts.service.spec.ts`, after the closing `});` of the `bulkUpload` describe (around line 255). It uses its own `mockPrisma` so it does not interfere with the existing tests.

```typescript
describe('PostsService.remove', () => {
  let service: PostsService;

  const removePrisma = {
    post: {
      findUnique: jest.fn(),
      delete: jest.fn(),
      update: jest.fn(),
    },
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PostsService,
        { provide: PrismaService, useValue: removePrisma },
      ],
    }).compile();
    service = module.get(PostsService);
  });

  it('hard-deletes the post and lets cascade FKs remove comments + profile links', async () => {
    removePrisma.post.findUnique.mockResolvedValue({
      id: 'post-1',
      deleted_at: null,
      campaign: { status: CampaignStatus.ACTIVE },
    });
    removePrisma.post.delete.mockResolvedValue({ id: 'post-1' });

    await service.remove('post-1');

    expect(removePrisma.post.delete).toHaveBeenCalledWith({
      where: { id: 'post-1' },
    });
    expect(removePrisma.post.update).not.toHaveBeenCalled();
  });

  it('throws NotFoundException when the post does not exist', async () => {
    removePrisma.post.findUnique.mockResolvedValue(null);

    await expect(service.remove('missing')).rejects.toThrow('Post not found');
    expect(removePrisma.post.delete).not.toHaveBeenCalled();
  });

  it('throws NotFoundException when the post is already soft-deleted (legacy)', async () => {
    removePrisma.post.findUnique.mockResolvedValue({
      id: 'post-1',
      deleted_at: new Date(),
      campaign: { status: CampaignStatus.ACTIVE },
    });

    await expect(service.remove('post-1')).rejects.toThrow('Post not found');
    expect(removePrisma.post.delete).not.toHaveBeenCalled();
  });

  it('rejects with BadRequestException when the campaign is COMPLETED', async () => {
    removePrisma.post.findUnique.mockResolvedValue({
      id: 'post-1',
      deleted_at: null,
      campaign: { status: CampaignStatus.COMPLETED },
    });

    await expect(service.remove('post-1')).rejects.toThrow(
      'Cannot remove posts from a completed campaign',
    );
    expect(removePrisma.post.delete).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the new tests to verify the cascade test fails (others may pass already)**

Run from `yehub-be/`:

```bash
pnpm test -- posts.service.spec
```

Expected: the four new tests run. The success-path test FAILS because the current implementation calls `prisma.post.update`, not `prisma.post.delete`. The 404 / completed-campaign tests should already PASS against the existing implementation (no behavior change).

If the pre-existing `bulkUpload` tests fail because the second `describe` mutated state, double-check that the new `removePrisma` mock is local to the new `describe` block and does not leak.

- [ ] **Step 3: Commit the failing test**

```bash
git add yehub-be/src/posts/posts.service.spec.ts
git commit -m "test(posts): add failing tests for PostsService.remove hard delete"
```

---

### Task 2: Switch `PostsService.remove` to hard delete

**Files:**
- Modify: `yehub-be/src/posts/posts.service.ts`

- [ ] **Step 1: Replace the soft-delete with `delete`**

Open `yehub-be/src/posts/posts.service.ts`. Find the `remove` method (lines 603-620) and replace its body so the final `update` call becomes a `delete`. The pre-checks stay identical.

The full new method:

```typescript
async remove(postId: string) {
  const post = await this.prisma.post.findUnique({
    where: { id: postId },
    include: { campaign: { select: { status: true } } },
  });
  if (!post || post.deleted_at) throw new NotFoundException('Post not found');

  if (post.campaign.status === CampaignStatus.COMPLETED) {
    throw new BadRequestException(
      'Cannot remove posts from a completed campaign',
    );
  }

  await this.prisma.post.delete({
    where: { id: postId },
  });
}
```

- [ ] **Step 2: Run the `remove` tests and verify all pass**

Run from `yehub-be/`:

```bash
pnpm test -- posts.service.spec
```

Expected: all four `PostsService.remove` tests PASS, plus the existing `bulkUpload` suite continues to pass.

- [ ] **Step 3: Run the full backend test suite**

Run from `yehub-be/`:

```bash
pnpm test
```

Expected: 18 suites pass, total test count is now 219 (215 baseline + 4 new). Zero failures.

- [ ] **Step 4: Commit**

```bash
git add yehub-be/src/posts/posts.service.ts
git commit -m "feat(posts): hard-delete posts and cascade comments + profile links"
```

---

### Task 3: Update Swagger summary on the controller

**Files:**
- Modify: `yehub-be/src/posts/posts.controller.ts`

- [ ] **Step 1: Update the `@ApiOperation` summary**

In `yehub-be/src/posts/posts.controller.ts` around line 142, change:

```typescript
@ApiOperation({ summary: 'Soft-delete a post' })
```

to:

```typescript
@ApiOperation({ summary: 'Delete a post' })
```

- [ ] **Step 2: Run lint to confirm clean**

Run from `yehub-be/`:

```bash
pnpm lint
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add yehub-be/src/posts/posts.controller.ts
git commit -m "docs(posts): update Swagger summary for DELETE /posts/:id"
```

---

## Phase 2 — Frontend: permission entry

### Task 4: Add `delete_post` to the permission table

**Files:**
- Modify: `yehub-fe/src/hooks/use-can.ts`

- [ ] **Step 1: Edit the permission table**

Open `yehub-fe/src/hooks/use-can.ts`. The full file becomes:

```typescript
import type { ProjectRole } from '../api/projects'
import type { GlobalRole } from '../api/auth'

type ProjectAction =
  | 'edit'
  | 'manage_members'
  | 'export'
  | 'search'
  | 'create_campaign'
  | 'configure_alerts'
  | 'edit_campaign'
  | 'delete_campaign'
  | 'manage_posts'
  | 'delete_post'

type GlobalAction = 'create_project' | 'manage_users'

const projectPermissions: Record<ProjectAction, ProjectRole[]> = {
  edit: ['MANAGER'],
  manage_members: ['MANAGER'],
  create_campaign: ['MANAGER', 'EXECUTIVE'],
  configure_alerts: ['MANAGER'],
  edit_campaign: ['MANAGER', 'EXECUTIVE'],
  delete_campaign: ['MANAGER'],
  manage_posts: ['MANAGER', 'EXECUTIVE'],
  delete_post: ['MANAGER'],
  search: ['MANAGER', 'EXECUTIVE', 'ANALYST'],
  export: ['MANAGER', 'EXECUTIVE', 'ANALYST'],
}

const globalPermissions: Record<GlobalAction, GlobalRole[]> = {
  create_project: ['ADMIN', 'INTERNAL_USER'],
  manage_users: ['ADMIN'],
}

export function useCanProject(action: ProjectAction, myRole: ProjectRole | null): boolean {
  if (!myRole) return false
  return projectPermissions[action].includes(myRole)
}

export function useCanGlobal(action: GlobalAction, myRole: GlobalRole | null): boolean {
  if (!myRole) return false
  return globalPermissions[action].includes(myRole)
}

// Backward-compatible alias
export function useCan(action: ProjectAction, myRole: ProjectRole | null): boolean {
  return useCanProject(action, myRole)
}
```

- [ ] **Step 2: Confirm lint passes**

Run from `yehub-fe/`:

```bash
pnpm lint
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add yehub-fe/src/hooks/use-can.ts
git commit -m "feat(use-can): add delete_post action for project MANAGER"
```

---

## Phase 3 — Frontend: post detail page delete

### Task 5: Add a `useDeletePost` mutation hook

**Files:**
- Modify: `yehub-fe/src/pages/posts/PostDetailPage/use-post-detail.ts`

This is the mutation used by the post detail page. It deletes, invalidates the campaign post list + the global posts list, and shows toasts. Navigation lives in the page component, so the hook accepts an `onSuccess` callback.

- [ ] **Step 1: Add the new hook export**

Append the following hook to `yehub-fe/src/pages/posts/PostDetailPage/use-post-detail.ts`. Also add `import axios from 'axios'` at the top with the other imports (if it's not already there).

```typescript
export function useDeletePost(
  postId: string,
  campaignId: string | undefined,
  onSuccess?: () => void,
) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: () => postsApi.deletePost(postId),
    onSuccess: () => {
      if (campaignId) {
        queryClient.invalidateQueries({ queryKey: queryKeys.posts.byCampaign(campaignId) })
      }
      queryClient.invalidateQueries({ queryKey: ['posts'] })
      toast.success('Post deleted')
      onSuccess?.()
    },
    onError: (err) => {
      if (axios.isAxiosError(err)) {
        const msg = (err.response?.data as { message?: string })?.message ?? 'Failed to delete post'
        toast.error(msg)
      } else {
        toast.error('Failed to delete post')
      }
    },
  })
}
```

The full top-of-file import block must end up looking like:

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import axios from 'axios'
import { postsApi } from '@/api/posts'
import { profilesApi } from '@/api/profiles'
import { commentsApi } from '@/api/comments'
import { queryKeys } from '@/lib/constants/query-keys'
import { useState } from 'react'
import { toast } from 'sonner'
```

- [ ] **Step 2: Confirm lint passes**

Run from `yehub-fe/`:

```bash
pnpm lint
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add yehub-fe/src/pages/posts/PostDetailPage/use-post-detail.ts
git commit -m "feat(posts): add useDeletePost mutation hook"
```

---

### Task 6: Wire delete into the post detail page header

**Files:**
- Modify: `yehub-fe/src/pages/posts/PostDetailPage/index.tsx`

Replace the placeholder "More" button with a `DropdownMenu` that contains a single "Delete post" item. Visibility = ADMIN or project MANAGER. Disabled with tooltip when the campaign is COMPLETED. Confirm via `AlertDialog`. On success, navigate back to the campaign posts route.

We need the post's project membership to compute the project-role check. The post detail (`post.project_id`) gives us the project, and `projectsApi.getMyRole` is the established way to read role.

- [ ] **Step 1: Update the imports in `PostDetailPage/index.tsx`**

Replace the current import block (lines 1-46) with:

```tsx
import { useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  ArrowLeft,
  ExternalLink,
  Pencil,
  MoreHorizontal,
  List,
  GitBranch,
  Unlink2,
  Link2,
  User,
  Users,
  Trash2,
} from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { ROUTES } from '@/lib/constants/routes'
import { PlatformBadge } from '@/components/common/PlatformBadge'
import { PLATFORMS } from '@/lib/constants/platforms'
import { PageWrapper } from '@/components/common/PageWrapper'
import { EmptyState } from '@/components/common/EmptyState'
import { PaginationBar } from '@/components/common/PaginationBar'
import { Button, buttonVariants } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { COLOR_PRESETS, type ColorKey } from '@/lib/constants/colors'
import { formatNumber } from '@/lib/format'
import { projectsApi } from '@/api/projects'
import { useAuthStore } from '@/store/auth.store'
import { useCan } from '@/hooks/use-can'
import { queryKeys } from '@/lib/constants/query-keys'
import { usePostDetail, usePostComments, useDeletePost } from './use-post-detail'
import { CommentFeed, type CommentViewMode } from './components/CommentFeed'
import { RecordedMetricsCard } from './components/RecordedMetricsCard'
import { OverallKpiCard } from './components/OverallKpiCard'
import { PostSettingsDialog } from './components/PostSettingsDialog'
import { SocialEmbed } from './components/SocialEmbed'
import { LinkProfileDialog } from './components/LinkProfileDialog'
```

- [ ] **Step 2: Extend the post detail response with campaign status**

`PostDetail` does not currently include the campaign status, but the FE needs it to disable the delete option when COMPLETED. Add it on both ends.

In `yehub-be/src/posts/posts.service.ts`, inside `findOne` (lines 479-571), change the `campaign` select block (lines ~483-491) to include `status`:

```typescript
campaign: {
  select: {
    id: true,
    name: true,
    status: true,
    start_date: true,
    end_date: true,
    project: { select: { id: true, name: true } },
  },
},
```

In the returned object (after `campaign_end_date: post.campaign.end_date,`), add:

```typescript
campaign_status: post.campaign.status,
```

In `yehub-fe/src/api/posts.ts`, extend the `PostDetail` interface:

```typescript
export interface PostDetail extends PostItem {
  campaign_name: string
  campaign_status: 'DRAFT' | 'ACTIVE' | 'PAUSED' | 'COMPLETED'
  campaign_start_date: string | null
  campaign_end_date: string | null
  project_id: string
  project_name: string
  linked_profile: LinkedProfileSummary | null
}
```

- [ ] **Step 3: Add role, permission, dialog state, and mutation inside the component**

All hooks (`useQuery`, `useState`, `useDeletePost`) must run on every render — they go **before** the existing `if (isLoading) { return ... }` and `if (!post) { return ... }` early returns. The `isCompletedCampaign` check uses `post.campaign_status` and so must go **after** the not-found early return where `post` is non-null.

Inside `PostDetailPage()` (in `yehub-fe/src/pages/posts/PostDetailPage/index.tsx`), after the existing destructure of `usePostComments(postId!)` (around line 60), add:

```tsx
const isAdmin = useAuthStore((s) => s.user?.role === 'ADMIN')

const { data: myRoleData } = useQuery({
  queryKey: queryKeys.projectMe(post?.project_id ?? ''),
  queryFn: () => projectsApi.getMyRole(post!.project_id).then((r) => r.data),
  enabled: !!post?.project_id && !isAdmin,
})

const myRole = myRoleData?.role ?? null
const canDeleteByRole = useCan('delete_post', myRole)
const canDeletePost = isAdmin || canDeleteByRole
```

The `useQuery` only fires when `post` is loaded and the user is not an admin — same pattern as `useProjectDetail`.

In the existing `useState` block (lines 62-65), add:

```tsx
const [deleteOpen, setDeleteOpen] = useState(false)
```

Still **before** the early returns, add the mutation. It accepts `post?.campaign_id` (undefined while `post` is loading is fine — the mutation only fires after the user clicks Delete, by which point `post` is non-null because the dialog is gated on `canDeletePost`):

```tsx
const deleteMutation = useDeletePost(postId!, post?.campaign_id, () => {
  if (projectId && campaignId) {
    navigate(ROUTES.CAMPAIGN_POSTS.replace(':projectId', projectId).replace(':campaignId', campaignId))
  } else {
    navigate(-1)
  }
})
```

After the `if (!post) { return ... }` early return (line ~88), and immediately before `const platformLabel = ...`, add:

```tsx
const isCompletedCampaign = post.campaign_status === 'COMPLETED'
```

- [ ] **Step 4: Replace the placeholder "More" button**

Find the existing JSX block (lines 119-122):

```tsx
<Button variant="outline" size="sm" className="cursor-pointer" aria-label="More actions">
  <MoreHorizontal className="mr-2 h-4 w-4" />
  More
</Button>
```

Replace it with:

```tsx
{canDeletePost && (
  <DropdownMenu>
    <DropdownMenuTrigger
      render={
        <Button variant="outline" size="sm" className="cursor-pointer" aria-label="More actions" />
      }
    >
      <MoreHorizontal className="mr-2 h-4 w-4" />
      More
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end">
      {isCompletedCampaign ? (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger>
              <DropdownMenuItem
                disabled
                className="text-destructive focus:text-destructive"
                onSelect={(e) => e.preventDefault()}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Delete post
              </DropdownMenuItem>
            </TooltipTrigger>
            <TooltipContent>Cannot delete posts in a completed campaign</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      ) : (
        <DropdownMenuItem
          className="cursor-pointer text-destructive focus:text-destructive"
          onClick={() => setDeleteOpen(true)}
        >
          <Trash2 className="mr-2 h-4 w-4" />
          Delete post
        </DropdownMenuItem>
      )}
    </DropdownMenuContent>
  </DropdownMenu>
)}
```

- [ ] **Step 5: Add the AlertDialog**

After the existing `<PostSettingsDialog ... />` block (around line 188), add:

```tsx
<AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
  <AlertDialogContent>
    <AlertDialogHeader>
      <AlertDialogTitle>Delete this post?</AlertDialogTitle>
      <AlertDialogDescription>
        This permanently removes the post and all of its comments and recorded metrics. This cannot be undone.
      </AlertDialogDescription>
    </AlertDialogHeader>
    <AlertDialogFooter>
      <AlertDialogCancel>Cancel</AlertDialogCancel>
      <AlertDialogAction
        variant="destructive"
        onClick={() => {
          deleteMutation.mutate()
          setDeleteOpen(false)
        }}
        disabled={deleteMutation.isPending}
      >
        Delete
      </AlertDialogAction>
    </AlertDialogFooter>
  </AlertDialogContent>
</AlertDialog>
```

- [ ] **Step 6: Verify the page builds and lints**

Run from `yehub-fe/`:

```bash
pnpm lint && pnpm build
```

Expected: no errors. The build will fail if the `PostDetail.campaign_status` field is missing — confirm Step 2 is in place.

Run from `yehub-be/`:

```bash
pnpm lint && pnpm test
```

Expected: backend lint passes, all tests still pass (the `findOne` change adds a new selected field but does not break tests since they don't pin the schema).

- [ ] **Step 7: Manual smoke test**

(Optional but recommended.) Start the backend (`pnpm start:dev` in `yehub-be/`) and frontend (`pnpm dev` in `yehub-fe/`). As an admin user:
1. Navigate to a post detail page on a non-completed campaign. Click "More" → "Delete post" → confirm. Expect a success toast and redirect to the campaign posts list. The post and its comments should be gone (verify with Prisma Studio or by reloading the campaign posts list).
2. Navigate to a post detail page on a COMPLETED campaign. The "More" → "Delete post" item should be disabled with the tooltip.
3. Sign in as an EXECUTIVE on the project. The "More" button should not appear at all.

If the dev server can't be brought up locally, say so explicitly when reporting.

- [ ] **Step 8: Commit**

```bash
git add yehub-be/src/posts/posts.service.ts yehub-fe/src/api/posts.ts yehub-fe/src/pages/posts/PostDetailPage/index.tsx
git commit -m "feat(posts): delete action on PostDetailPage for admin/manager"
```

---

## Phase 4 — Frontend: campaign posts list per-row delete

### Task 7: Add an opt-in `renderActions` slot to `PostsTable`

**Files:**
- Modify: `yehub-fe/src/components/common/PostsTable.tsx`

The shared component already has `renderTrailing` (used here for the KPI cell). Adding a second optional render slot `renderActions` keeps both consumers (the campaign tab uses both, the global posts page uses neither).

- [ ] **Step 1: Extend `PostsTableProps` and `getColumns`**

Replace the file with:

```tsx
import { PlatformBadge } from '@/components/common/PlatformBadge'
import { DataTable, type Column } from '@/components/common/DataTable'
import { formatNumber } from '@/lib/format'
import type { MetricsSnapshot, Platform } from '@/api/posts'

interface PostBase {
  id: string
  url: string | null
  platform: Platform
  platform_post_id: string
  likes: number
  comment_count: number
  shares: number
  views: number
  metrics_snapshot: MetricsSnapshot | null
}

interface PostsTableProps<T extends PostBase> {
  posts: T[]
  renderCampaign?: (post: T) => React.ReactNode
  renderTrailing?: (post: T) => React.ReactNode
  trailingHeader?: string
  renderActions?: (post: T) => React.ReactNode
  hideShares?: boolean
  hideViews?: boolean
  sortBy?: string
  sortOrder?: 'asc' | 'desc'
  onSort?: (key: string) => void
  onRowClick?: (post: T) => void
}

function getColumns<T extends PostBase>({
  renderCampaign,
  renderTrailing,
  trailingHeader,
  renderActions,
  hideShares,
  hideViews,
}: Pick<
  PostsTableProps<T>,
  'renderCampaign' | 'renderTrailing' | 'trailingHeader' | 'renderActions' | 'hideShares' | 'hideViews'
>): Column<T>[] {
  const columns: Column<T>[] = [
    {
      key: 'url',
      header: 'URL',
      className: 'max-w-[300px]',
      render: (post) => (
        <div className="flex items-center gap-2">
          <PlatformBadge platform={post.platform} size="sm" />
          {post.url ? (
            <span className="text-sm font-mono truncate text-primary">{post.url}</span>
          ) : (
            <span className="text-sm font-mono truncate">{post.platform_post_id}</span>
          )}
        </div>
      ),
    },
  ]

  if (renderCampaign) {
    columns.push({
      key: 'campaign',
      header: 'Campaign',
      render: renderCampaign,
    })
  }

  columns.push(
    {
      key: 'likes',
      header: 'Likes',
      sortable: true,
      render: (post) => <span className="font-mono text-sm">{formatNumber(post.likes)}</span>,
    },
    {
      key: 'comment_count',
      header: 'Comments',
      sortable: true,
      render: (post) => <span className="font-mono text-sm">{formatNumber(post.comment_count)}</span>,
    },
  )

  if (!hideShares) {
    columns.push({
      key: 'shares',
      header: 'Shares',
      sortable: true,
      render: (post) => <span className="font-mono text-sm">{formatNumber(post.shares)}</span>,
    })
  }

  if (!hideViews) {
    columns.push({
      key: 'views',
      header: 'Views',
      sortable: true,
      render: (post) => <span className="font-mono text-sm">{formatNumber(post.views)}</span>,
    })
  }

  columns.push({
    key: 'engagement',
    header: 'Engagement',
    render: (post) => (
      <span className="font-mono text-sm">
        {post.metrics_snapshot?.engagement_rate != null ? `${post.metrics_snapshot.engagement_rate}%` : '—'}
      </span>
    ),
  })

  if (renderTrailing) {
    columns.push({
      key: 'trailing',
      header: trailingHeader ?? '',
      render: renderTrailing,
    })
  }

  if (renderActions) {
    columns.push({
      key: 'actions',
      header: '',
      className: 'w-[50px]',
      render: renderActions,
    })
  }

  return columns
}

export function PostsTable<T extends PostBase>({
  posts,
  renderCampaign,
  renderTrailing,
  trailingHeader,
  renderActions,
  hideShares,
  hideViews,
  sortBy,
  sortOrder,
  onSort,
  onRowClick,
}: PostsTableProps<T>) {
  const columns = getColumns<T>({
    renderCampaign,
    renderTrailing,
    trailingHeader,
    renderActions,
    hideShares,
    hideViews,
  })

  return (
    <DataTable
      columns={columns}
      data={posts}
      keyExtractor={(p) => p.id}
      sortKey={sortBy}
      sortOrder={sortOrder}
      onSort={onSort}
      onRowClick={onRowClick}
    />
  )
}
```

- [ ] **Step 2: Lint + build**

Run from `yehub-fe/`:

```bash
pnpm lint && pnpm build
```

Expected: passes. The global posts page does not pass `renderActions`, so its layout is unchanged.

- [ ] **Step 3: Commit**

```bash
git add yehub-fe/src/components/common/PostsTable.tsx
git commit -m "feat(posts-table): add opt-in renderActions slot"
```

---

### Task 8: Create `PostRowActions` component

**Files:**
- Create: `yehub-fe/src/pages/campaigns/CampaignDetailPage/components/PostRowActions.tsx`
- Modify: `yehub-fe/src/pages/campaigns/CampaignDetailPage/components/use-campaign-posts.ts` (remove the unused mutation)

Per `yehub-fe/CLAUDE.md`, dialog state and the mutation live inside the row component. Each row owns its own.

- [ ] **Step 1: Remove the unused `deletePost` mutation from `useCampaignPosts`**

Open `yehub-fe/src/pages/campaigns/CampaignDetailPage/components/use-campaign-posts.ts`. Remove the `deletePost` mutation (lines 62-75) and remove `deletePost` from the returned object. Also remove the now-unused `axios` import if no other usage remains (the `togglePolling` mutation still uses it, so keep the import).

The diff is:

```diff
-  const deletePost = useMutation({
-    mutationFn: (postId: string) => postsApi.deletePost(postId),
-    onSuccess: () => {
-      queryClient.invalidateQueries({ queryKey: queryKeys.posts.byCampaign(campaignId) })
-      queryClient.invalidateQueries({ queryKey: queryKeys.campaigns.all })
-      queryClient.invalidateQueries({ queryKey: queryKeys.campaign(campaignId) })
-      toast.success('Post removed')
-    },
-    onError: (err) => {
-      if (axios.isAxiosError(err)) {
-        toast.error((err.response?.data as { message?: string })?.message ?? 'Failed to delete')
-      }
-    },
-  })
-
   return {
     posts: data?.data ?? [],
     ...
     togglePolling,
-    deletePost,
   }
```

- [ ] **Step 2: Create `PostRowActions.tsx`**

Create `yehub-fe/src/pages/campaigns/CampaignDetailPage/components/PostRowActions.tsx` with:

```tsx
import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import axios from 'axios'
import { MoreVertical, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { postsApi, type PostItem } from '@/api/posts'
import { queryKeys } from '@/lib/constants/query-keys'

interface PostRowActionsProps {
  post: PostItem
  campaignId: string
  canDelete: boolean
  campaignCompleted: boolean
}

export function PostRowActions({ post, campaignId, canDelete, campaignCompleted }: PostRowActionsProps) {
  const queryClient = useQueryClient()
  const [deleteOpen, setDeleteOpen] = useState(false)

  const deleteMutation = useMutation({
    mutationFn: () => postsApi.deletePost(post.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.posts.byCampaign(campaignId) })
      toast.success('Post deleted')
    },
    onError: (err) => {
      if (axios.isAxiosError(err)) {
        const msg = (err.response?.data as { message?: string })?.message ?? 'Failed to delete post'
        toast.error(msg)
      } else {
        toast.error('Failed to delete post')
      }
    },
  })

  if (!canDelete) return null

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 cursor-pointer"
              onClick={(e) => e.stopPropagation()}
              aria-label="Post actions"
            />
          }
        >
          <MoreVertical className="h-4 w-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
          {campaignCompleted ? (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger>
                  <DropdownMenuItem
                    disabled
                    className="text-destructive focus:text-destructive"
                    onSelect={(e) => e.preventDefault()}
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Delete post
                  </DropdownMenuItem>
                </TooltipTrigger>
                <TooltipContent>Cannot delete posts in a completed campaign</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          ) : (
            <DropdownMenuItem
              className="cursor-pointer text-destructive focus:text-destructive"
              onClick={() => setDeleteOpen(true)}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Delete post
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent onClick={(e) => e.stopPropagation()}>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this post?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the post and all of its comments and recorded metrics. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                deleteMutation.mutate()
                setDeleteOpen(false)
              }}
              disabled={deleteMutation.isPending}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
```

- [ ] **Step 3: Lint**

Run from `yehub-fe/`:

```bash
pnpm lint
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add yehub-fe/src/pages/campaigns/CampaignDetailPage/components/PostRowActions.tsx \
        yehub-fe/src/pages/campaigns/CampaignDetailPage/components/use-campaign-posts.ts
git commit -m "feat(posts): add per-row delete actions in PostRowActions"
```

---

### Task 9: Wire `PostRowActions` into `CampaignPostsTab`

**Files:**
- Modify: `yehub-fe/src/pages/campaigns/CampaignDetailPage/components/CampaignPostsTab.tsx`
- Modify: `yehub-fe/src/pages/campaigns/CampaignDetailPage/index.tsx`

- [ ] **Step 1: Extend `CampaignPostsTab` props**

In `CampaignPostsTab.tsx`, add a `canDelete` prop and pass `renderActions` to `PostsTable`. Replace the prop signature and JSX:

```tsx
import { PostRowActions } from './PostRowActions'

export function CampaignPostsTab({
  campaignId,
  canManage,
  canDelete,
  campaign,
}: {
  campaignId: string
  canManage: boolean
  canDelete: boolean
  campaign: Campaign
}) {
```

And in the `<PostsTable ... />` JSX (around line 116), add the `renderActions` prop:

```tsx
<PostsTable
  posts={posts}
  hideShares
  hideViews
  trailingHeader="KPI"
  renderTrailing={(post: PostItem) => <KpiCell post={post} campaign={campaign} />}
  renderActions={(post: PostItem) => (
    <PostRowActions
      post={post}
      campaignId={campaignId}
      canDelete={canDelete}
      campaignCompleted={campaign.status === 'COMPLETED'}
    />
  )}
  sortBy={sortBy}
  sortOrder={sortOrder}
  onSort={toggleSort as (key: string) => void}
  onRowClick={(p) => navigate(`/projects/${projectId}/campaigns/${campaignId}/posts/${p.id}`)}
/>
```

- [ ] **Step 2: Compute `canDeletePost` in `CampaignDetailPage` and pass it**

In `yehub-fe/src/pages/campaigns/CampaignDetailPage/index.tsx`, inside the existing role/permission block (lines 40-52), add:

```tsx
const canDeleteByRole = useCan('delete_post', myRole)
const canDeletePost = isAdmin || canDeleteByRole
```

Then update the existing `<CampaignPostsTab ... />` invocation (line 220):

```tsx
<CampaignPostsTab
  campaignId={campaignId!}
  canManage={canManagePosts && !isCompleted}
  canDelete={canDeletePost}
  campaign={campaign}
/>
```

- [ ] **Step 3: Lint + build**

Run from `yehub-fe/`:

```bash
pnpm lint && pnpm build
```

Expected: no errors.

- [ ] **Step 4: Manual smoke test**

(Optional.) With backend + frontend running:
1. As admin, open a campaign detail page with posts. Each row has a `⋮` button. Clicking it opens a menu with "Delete post"; clicking the row still navigates to detail.
2. Confirm delete: row disappears, success toast, no navigation.
3. As an EXECUTIVE on the project: no `⋮` button on rows.
4. Open a COMPLETED campaign as admin: `⋮` button shows, but "Delete post" is disabled with tooltip.

- [ ] **Step 5: Commit**

```bash
git add yehub-fe/src/pages/campaigns/CampaignDetailPage/components/CampaignPostsTab.tsx \
        yehub-fe/src/pages/campaigns/CampaignDetailPage/index.tsx
git commit -m "feat(posts): wire PostRowActions into CampaignPostsTab"
```

---

## Phase 5 — Final verification

### Task 10: Run full backend + frontend checks

- [ ] **Step 1: Backend**

Run from `yehub-be/`:

```bash
pnpm lint && pnpm test
```

Expected: lint clean, all 219 tests pass (215 baseline + 4 new).

- [ ] **Step 2: Frontend**

Run from `yehub-fe/`:

```bash
pnpm lint && pnpm build
```

Expected: lint clean, build succeeds with no TypeScript errors.

- [ ] **Step 3: GitNexus impact spot-check**

This task affects `PostsService.remove`. Run impact analysis to verify no other call sites are surprised:

```bash
# (Inside Claude Code) call gitnexus_impact({target: "remove", direction: "upstream"})
```

Expected: callers are limited to the controller's `DELETE /posts/:id` handler. If callers exist outside that handler (e.g. internal cron jobs that soft-delete posts), surface them — they may rely on the old soft-delete semantics.

- [ ] **Step 4: Final commit log review**

```bash
git log --oneline main..HEAD
```

Expected (in order):
1. `docs(spec): add design for delete-post feature`
2. `test(posts): add failing tests for PostsService.remove hard delete`
3. `feat(posts): hard-delete posts and cascade comments + profile links`
4. `docs(posts): update Swagger summary for DELETE /posts/:id`
5. `feat(use-can): add delete_post action for project MANAGER`
6. `feat(posts): add useDeletePost mutation hook`
7. `feat(posts): delete action on PostDetailPage for admin/manager`
8. `feat(posts-table): add opt-in renderActions slot`
9. `feat(posts): add per-row delete actions in PostRowActions`
10. `feat(posts): wire PostRowActions into CampaignPostsTab`

If GitNexus spotted issues in Step 3, address them in a follow-up commit before opening the PR.

---

## Self-review notes

**Spec coverage:**
- ✅ Backend hard delete with cascade — Tasks 1-3.
- ✅ `Post.deleted_at` and `deleted_at: null` filters left untouched — confirmed by leaving `posts.service.ts` filters elsewhere alone.
- ✅ FE permissions: new `delete_post` action — Task 4.
- ✅ FE detail page delete with COMPLETED guard + tooltip — Task 6.
- ✅ FE campaign posts list per-row delete with COMPLETED guard + tooltip — Tasks 7-9.
- ✅ Spec excludes global `PostsPage` — `renderActions` is opt-in; only `CampaignPostsTab` passes it.
- ✅ Spec excludes new e2e tests — none planned.
- ✅ Out-of-scope: schema cleanup of `deleted_at` not touched.

**Type consistency:**
- `delete_post` consistent everywhere (use-can, post detail page, campaign tab).
- `PostRowActions` props (`post`, `campaignId`, `canDelete`, `campaignCompleted`) match the call site in `CampaignPostsTab`.
- `useDeletePost(postId, campaignId, onSuccess)` shape matches its single caller.
- `PostDetail.campaign_status` added to both backend response and FE type.
