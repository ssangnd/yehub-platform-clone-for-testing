# Campaign Management — Design Spec

**Date:** 2026-03-30
**Tickets:** Campaign CRUD & Lifecycle API, Campaign Posts Management API, Campaign Management UI
**Status:** Approved

---

## 1. Overview

Implement campaign management with full lifecycle support and post monitoring. Three tickets are covered:

1. **Campaign CRUD & Lifecycle** — Create, list, update, soft-delete campaigns under projects. Status transitions: Draft → Active → Paused → Stopped → Completed.
2. **Campaign Posts Management** — Add posts by URL with platform auto-detection, bulk CSV upload, paginated listing, polling configuration.
3. **Campaign Management UI** — Campaign list pages (flat + project-scoped), create/edit form, detail page with tabs, posts management view.

## 2. Decisions

| Decision | Choice | Rationale |
|---|---|---|
| CampaignStatus enum | Replace `ARCHIVED` with `STOPPED` | Match ticket spec exactly |
| Soft-delete mechanism | `deleted_at DateTime?` field | Clean filtering, preserves status history |
| Bulk upload format | CSV only (no XLSX for MVP) | Simpler, covers core use case |
| Post social_account_id | Keep as optional | Users add URLs, profile linking happens later |
| Lifecycle events | Direct DB update + BullMQ job start/stop | No event system, keep simple |
| Module structure | Separate CampaignsModule + PostsModule | Matches architecture doc, follows existing patterns |
| Daily cron job | Placeholder only | Not implemented in this scope |

## 3. Database Schema Changes

### 3.1 Enum Changes

**CampaignStatus** — replace `ARCHIVED` with `STOPPED`:
```
DRAFT, ACTIVE, PAUSED, STOPPED, COMPLETED
```

**Platform** — add `THREADS`:
```
FACEBOOK, INSTAGRAM, TIKTOK, YOUTUBE, X, LINKEDIN, THREADS
```

### 3.2 Campaign Model — Add Field

```prisma
deleted_at DateTime? // null = active, set = soft-deleted
```

### 3.3 Post Model — Add Fields

```prisma
polling_enabled  Boolean  @default(true)
last_poll_status String?  // 'success' | 'failed' | 'pending'
comment_count    Int      @default(0)
```

`social_account_id` remains optional (already nullable).

### 3.4 Post Model — Soft Delete

Add `deleted_at DateTime?` to the Post model (same pattern as Campaign). Keep all FK cascades as-is.

### 3.5 Valid Campaign Status Transitions

```
DRAFT    → ACTIVE
ACTIVE   → PAUSED | STOPPED | COMPLETED
PAUSED   → ACTIVE | STOPPED
STOPPED  → (terminal)
COMPLETED → (terminal)
```

## 4. Backend — Campaigns Module

### 4.1 Endpoints

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/projects/:projectId/campaigns` | MANAGER, EXECUTIVE | Create campaign (defaults to DRAFT) |
| GET | `/projects/:projectId/campaigns` | Project member | Paginated list, filter by status, excludes soft-deleted |
| GET | `/campaigns` | Authenticated | List campaigns across all user's projects |
| GET | `/campaigns/:id` | Project member | Single campaign with post count, comment count |
| PATCH | `/campaigns/:id` | MANAGER, EXECUTIVE | Update details and/or change status |
| DELETE | `/campaigns/:id` | MANAGER | Soft-delete (sets `deleted_at`) |

### 4.2 Service Logic

- **create()** — Validate project exists, user is member with correct role, set status=DRAFT.
- **findAll()** — Filter by `deleted_at IS NULL`, optional status filter, search by name (`q`), pagination (page/limit). For flat `/campaigns` endpoint: filter by projects the user is a member of (same pattern as Projects module).
- **findOne()** — Include post count and aggregate comment count.
- **update()** — If status change requested, validate transition against allowed map. When transitioning to ACTIVE, create BullMQ placeholder jobs for linked posts. When transitioning to PAUSED/STOPPED, remove repeatable jobs.
- **remove()** — Set `deleted_at = now()`. Does NOT delete posts or collected data.

### 4.3 DTOs

**CreateCampaignDto:**
- `name` — required, string
- `description` — optional, string
- `start_date` — optional, ISO date
- `end_date` — optional, ISO date
- `default_polling_interval` — optional, integer (seconds, default 3600)
- `budget_threshold` — optional, decimal

**UpdateCampaignDto:**
- PartialType of CreateCampaignDto + optional `status` (CampaignStatus)

**ListCampaignsQueryDto:**
- `q` — optional, search by campaign name
- `status` — optional, CampaignStatus filter
- `page` — default 1
- `limit` — default 20

**Paginated response format** (same as Projects):
```json
{ "data": [...], "total": 100, "page": 1, "totalPages": 5 }
```

### 4.4 Cron Placeholder

A `TODO` comment in the service for daily auto-completion of campaigns past `end_date`. No implementation.

## 5. Backend — Posts Module

### 5.1 Endpoints

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/campaigns/:id/posts` | MANAGER, EXECUTIVE | Add single post by URL |
| POST | `/campaigns/:id/posts/bulk` | MANAGER, EXECUTIVE | Bulk upload via CSV (max 500 URLs) |
| GET | `/campaigns/:id/posts` | Project member | Paginated post list |
| PATCH | `/posts/:id` | MANAGER, EXECUTIVE | Update polling interval or enable/disable |
| DELETE | `/posts/:id` | MANAGER | Soft-delete post (sets `deleted_at`) |

### 5.2 Platform URL Detection

Utility function `detectPlatform(url)` returns `{ platform, platform_post_id }` or `null`:

| Platform | URL Patterns |
|---|---|
| Facebook | `facebook.com/*/posts/*`, `fb.watch/*`, `facebook.com/watch/*` |
| Instagram | `instagram.com/p/*`, `instagram.com/reel/*` |
| TikTok | `tiktok.com/@*/video/*`, `vm.tiktok.com/*` |
| YouTube | `youtube.com/watch*`, `youtu.be/*`, `youtube.com/shorts/*` |
| Threads | `threads.net/@*/post/*` |

Unrecognized URLs return 400 with descriptive error.

### 5.3 Bulk Upload Flow

1. Accept CSV file (multipart/form-data)
2. Parse with `papaparse` — expect a `url` column
3. Validate each row: detect platform, check for duplicates (same campaign + platform + platform_post_id)
4. Insert valid rows, collect failures
5. Return: `{ total, success_count, failed_count, failures: [{ url, reason }] }`
6. Reject with 400 if > 500 URLs

### 5.4 Service Logic

- **addPost()** — Detect platform, extract platform_post_id, check uniqueness, create record. Inherit `polling_interval_override` from campaign's `default_polling_interval` if not specified.
- **bulkUpload()** — Parse CSV, loop through detection + validation, batch insert.
- **findAll()** — Filter by `deleted_at IS NULL`. Paginated with search by URL/platform_post_id (`q`), filter by platform and polling_enabled. Returns last_polled_at, comment_count, polling_enabled, last_poll_status.
- **update()** — Only allows updating `polling_interval_override` and `polling_enabled`.
- **remove()** — Soft-delete: set `deleted_at = now()`. Post and its comments are retained.

### 5.5 DTOs

**AddPostDto:**
- `url` — required, IsUrl

**UpdatePostDto:**
- `polling_interval_override` — optional, integer (seconds)
- `polling_enabled` — optional, boolean

**ListPostsQueryDto:**
- `q` — optional, search by URL or platform_post_id
- `platform` — optional, Platform enum filter
- `polling_enabled` — optional, boolean filter
- `page` — default 1
- `limit` — default 20

## 6. Frontend — API Layer

### 6.1 `src/api/campaigns.ts`

- `createCampaign(projectId, data)` → POST `/projects/:projectId/campaigns`
- `listCampaignsByProject(projectId, params)` → GET `/projects/:projectId/campaigns`
- `listAllCampaigns(params)` → GET `/campaigns`
- `getCampaign(id)` → GET `/campaigns/:id`
- `updateCampaign(id, data)` → PATCH `/campaigns/:id`
- `deleteCampaign(id)` → DELETE `/campaigns/:id`

### 6.2 `src/api/posts.ts`

- `addPost(campaignId, url)` → POST `/campaigns/:campaignId/posts`
- `bulkUploadPosts(campaignId, file)` → POST `/campaigns/:campaignId/posts/bulk`
- `listPosts(campaignId, params)` → GET `/campaigns/:campaignId/posts`
- `updatePost(postId, data)` → PATCH `/posts/:postId`
- `deletePost(postId)` → DELETE `/posts/:postId`

## 7. Frontend — Routing

```
/campaigns                                    → CampaignsListPage (flat, all projects)
/projects/:projectId/campaigns                → (within ProjectDetailPage Campaigns tab)
/projects/:projectId/campaigns/new            → CampaignFormPage (create)
/projects/:projectId/campaigns/:id            → CampaignDetailPage (tabbed layout)
/projects/:projectId/campaigns/:id/edit       → CampaignFormPage (edit)
/projects/:projectId/campaigns/:id/posts      → CampaignPostsPage (tab)
```

## 8. Frontend — Pages & Components

### 8.1 CampaignsListPage (`/campaigns`)

Flat view across all projects:
- Search bar (debounced), status filter dropdown
- DataTable: Name, Project, Status (badge), Date Range, Posts count, Polling Interval
- Row click → campaign detail
- Pagination

### 8.2 ProjectDetailPage Campaigns Tab

Project-scoped campaign list:
- Same table columns minus Project column
- "New Campaign" button (MANAGER/EXECUTIVE, `useCan('create_campaign')`)
- Row click → `/projects/:projectId/campaigns/:id`

### 8.3 CampaignFormPage

Create/edit form with card-based sections (referencing demo layout):
- **Basic Info:** name (required), description
- **Schedule:** start_date, end_date (date pickers)
- **Settings:** default_polling_interval (select: 15min, 1hr, 6hr, 12hr, 24hr), budget_threshold (currency input)
- React Hook Form + Zod validation
- Create: redirects to campaign detail. Edit: pre-fills, redirects back on save.

### 8.4 CampaignDetailPage

Tabbed layout:
- **Header:** campaign name, status badge, lifecycle action buttons
- **Lifecycle buttons** contextual to status:
  - DRAFT → "Activate"
  - ACTIVE → "Pause", "Stop"
  - PAUSED → "Resume", "Stop"
  - STOPPED/COMPLETED → no actions
- **Tabs:** Overview (placeholder), Posts, Comments (placeholder), Analytics (placeholder)

### 8.5 CampaignPostsPage

Posts tab within campaign detail:
- Search bar, platform filter, pagination
- "Add Post" button → dialog with URL input, real-time platform detection badge
- "Import CSV" button → dialog with file upload, results summary
- DataTable: URL (truncated), Platform (badge), Polling Status, Interval, Last Polled, Comment Count
- Row actions: toggle polling, edit interval, delete

### 8.6 Hooks (co-located with pages)

- `use-campaigns.ts` — query for campaign lists (project-scoped + flat)
- `use-campaign-detail.ts` — query for single campaign + mutations (update, delete, status change)
- `use-campaign-posts.ts` — query for posts list + mutations (add, bulk upload, update, delete)

## 9. Out of Scope

- XLSX bulk upload (CSV only for MVP)
- Daily cron job for auto-completing campaigns (placeholder only)
- Event emitter system for lifecycle events
- Profile/social account linking on post creation
- Campaign Overview tab content
- Campaign Comments tab content
- Campaign Analytics tab content
- BullMQ polling job implementation (placeholder jobs only on lifecycle transitions)
