export interface ApiResponse<T> {
  data: T
  meta?: {
    page: number
    pageSize: number
    total: number
    totalPages: number
  }
}

export interface ApiError {
  message: string
  code: string
  status: number
}

export interface PaginationParams {
  page?: number
  pageSize?: number
}

export interface SortParams {
  sortBy?: string
  sortOrder?: 'asc' | 'desc'
}
