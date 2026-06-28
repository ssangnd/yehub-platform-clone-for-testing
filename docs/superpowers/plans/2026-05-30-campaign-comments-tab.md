# Campaign Comments Tab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Comments tab after Posts on the Campaign Detail page that lists comments from every post in the campaign.

**Architecture:** Reuse the existing campaign comments API endpoint and the existing post-detail comment card presentation. Keep campaign-specific query state in a small hook colocated with the Campaign Detail components, and render a dedicated tab component from `CampaignDetailPage`.

**Tech Stack:** React 19, React Router, TanStack Query, TypeScript, existing shadcn-style UI components.

---

### Task 1: Add Campaign Comment Query State

**Files:**
- Modify: `yehub-fe/src/lib/constants/query-keys.ts`
- Create: `yehub-fe/src/pages/campaigns/CampaignDetailPage/components/use-campaign-comments.ts`

- [ ] **Step 1: Add a query key**

Add:

```ts
campaignComments: (
  campaignId: string,
  page: number,
  search: string,
  platform: string,
  sentiment: string,
  sort: string,
) => ['campaign-comments', campaignId, page, search, platform, sentiment, sort] as const,
```

- [ ] **Step 2: Create the hook**

Create `useCampaignComments(campaignId: string)` with local state for `page`, `search`, `platformFilter`, `sentimentFilter`, and `sort`. Call `commentsApi.listByCampaign(campaignId, { page, limit: 20, q, platform, sentiment, sort })`, reset page to 1 when filters change, and return comments plus pagination/loading state.

- [ ] **Step 3: Verify types**

Run: `npm run build --workspace yehub-fe` if workspace scripts are configured, otherwise `cd yehub-fe && npm run build`.

Expected: TypeScript compiles without errors.

### Task 2: Add Campaign Comments Tab UI

**Files:**
- Create: `yehub-fe/src/pages/campaigns/CampaignDetailPage/components/CampaignCommentsTab.tsx`

- [ ] **Step 1: Render filters and list**

Create a tab component that renders search, platform select, sentiment select, sort select, a loading state, an empty state, a list of comments, and `PaginationBar`.

- [ ] **Step 2: Show post context**

For each campaign comment, reuse `CommentCard` and add a compact post URL row beneath the comment content so users can see which campaign post the comment belongs to.

- [ ] **Step 3: Verify types**

Run: `cd yehub-fe && npm run build`.

Expected: TypeScript compiles without errors.

### Task 3: Wire the Tab Into Campaign Detail

**Files:**
- Modify: `yehub-fe/src/pages/campaigns/CampaignDetailPage/index.tsx`
- Modify: `yehub-fe/src/lib/constants/routes.ts`

- [ ] **Step 1: Add route constant**

Add:

```ts
CAMPAIGN_COMMENTS: '/projects/:projectId/campaigns/:campaignId/comments',
```

- [ ] **Step 2: Add the tab after Posts**

Import `CampaignCommentsTab`, update active tab detection to include `/comments`, add a `Comments` `NavLink` after `Posts`, and render `CampaignCommentsTab` for the comments route.

- [ ] **Step 3: Verify**

Run: `cd yehub-fe && npm run build`.

Expected: Build completes successfully.

### Self-Review

- Spec coverage: The plan uses the existing campaign comments endpoint, adds the tab after Posts, lists comments for all posts in the campaign, and shows post context.
- Placeholder scan: No placeholders remain.
- Type consistency: Query parameters match `ListCommentsParams`; campaign comment items match `CommentWithPost`.
