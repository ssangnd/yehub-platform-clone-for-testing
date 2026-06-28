export const PROJECT_CATEGORIES = [
  'FMCG',
  'Tech',
  'Automotive',
  'F&B',
  'E-commerce',
  'Telecom',
  'Finance',
  'Healthcare',
  'Entertainment',
  'Fashion',
]

export interface Project {
  id: string
  name: string
  description: string
  clientName: string
  categories: string[]
  logo?: string
  status: 'active' | 'archived'
  activeCampaigns: number
  totalCampaigns: number
  totalComments: number
  totalPosts: number
  createdAt: string
  updatedAt: string
  createdBy: string
}
