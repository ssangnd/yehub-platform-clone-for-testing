export type AdminUsersListParams = {
  q: string
  roles: readonly string[]
  statuses: readonly string[]
  sortKey: string | null
  sortDir: 'asc' | 'desc'
  page: number
}

export const queryKeys = {
  me: ['me'] as const,

  invitation: (token: string) => ['invitation', token] as const,

  adminUsers: {
    all: ['admin-users'] as const,
    list: (params: AdminUsersListParams) => ['admin-users', 'list', params] as const,
  },

  adminUser: (userId: string) => ['admin-user', userId] as const,

  projects: {
    all: ['projects'] as const,
    list: (page: number, search: string, showArchived: boolean) => ['projects', page, search, showArchived] as const,
    stats: ['projects-stats'] as const,
  },

  project: (id: string) => ['project', id] as const,

  projectMe: (id: string) => ['project-me', id] as const,

  projectMembers: (projectId: string) => ['project-members', projectId] as const,

  nonMembers: {
    byProject: (projectId: string) => ['non-members', projectId] as const,
    list: (projectId: string, search: string) => ['non-members', projectId, search] as const,
  },

  campaigns: {
    all: ['campaigns'] as const,
    list: (page: number, search: string, status: string, sortBy?: string, order?: string) =>
      ['campaigns', page, search, status, sortBy, order] as const,
    byProject: (projectId: string) => ['campaigns', 'project', projectId] as const,
    listByProject: (projectId: string, page: number, search: string, status: string, sortBy?: string, order?: string) =>
      ['campaigns', 'project', projectId, page, search, status, sortBy, order] as const,
  },

  campaign: (id: string) => ['campaign', id] as const,

  campaignMetric: (campaignId: string, metric: string) => ['campaign-metric', campaignId, metric] as const,

  campaignCommentVolume: (campaignId: string) => ['campaign-comment-volume', campaignId] as const,

  campaignPlatformDistribution: (campaignId: string) => ['campaign-platform-distribution', campaignId] as const,

  campaignSpending: (campaignId: string) => ['campaign-spending', campaignId] as const,

  cost: {
    filterOptions: ['cost', 'filter-options'] as const,
    overview: (filters: Record<string, unknown>) => ['cost', 'overview', filters] as const,
  },

  campaignMe: (id: string) => ['campaign-me', id] as const,

  campaignMembers: (campaignId: string) => ['campaign-members', campaignId] as const,

  campaignNonMembers: {
    byCampaign: (campaignId: string) => ['campaign-non-members', campaignId] as const,
    list: (campaignId: string, search: string) => ['campaign-non-members', campaignId, search] as const,
  },

  post: (id: string) => ['post', id] as const,

  posts: {
    all: ['posts'] as const,
    listAll: (page: number, search: string, platform: string, sortBy?: string, sortOrder?: string) =>
      ['posts', page, search, platform, sortBy, sortOrder] as const,
    byCampaign: (campaignId: string) => ['posts', 'campaign', campaignId] as const,
    list: (campaignId: string, page: number, search: string, platform: string, sortBy?: string, sortOrder?: string) =>
      ['posts', 'campaign', campaignId, page, search, platform, sortBy, sortOrder] as const,
  },

  postComments: (postId: string, page: number, sort: string) => ['post-comments', postId, page, sort] as const,

  campaignComments: (
    campaignId: string,
    page: number,
    search: string,
    platform: string,
    sentiment: string,
    sort: string,
  ) => ['campaign-comments', campaignId, page, search, platform, sentiment, sort] as const,

  categories: ['categories'] as const,

  objectives: ['objectives'] as const,

  sessions: ['sessions'] as const,

  presignedUrl: (key: string) => ['presigned-url', key] as const,

  kolCategories: ['kol-categories'] as const,

  kolTiers: ['kol-tiers'] as const,

  profiles: {
    all: ['profiles'] as const,
    list: (params: Record<string, unknown>) => ['profiles', 'list', params] as const,
    tags: ['profiles', 'tags'] as const,
  },

  profile: (id: string) => ['profile', id] as const,

  profilePosts: (profileId: string, page: number, accountIds: string[]) =>
    ['profile-posts', profileId, page, accountIds] as const,

  systemSettings: {
    public: ['system-settings', 'public'] as const,
    all: ['system-settings'] as const,
  },
}
