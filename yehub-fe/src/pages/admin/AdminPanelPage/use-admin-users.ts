import { useMemo, type Dispatch, type SetStateAction } from 'react'
import { useSearchParams } from 'react-router-dom'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { adminApi, type UserStatus } from '@/api/admin'
import type { GlobalRole } from '@/api/auth'
import { useDebounce } from '@/hooks/use-debounce'
import { queryKeys } from '@/lib/constants/query-keys'

export type SortKey = 'name' | 'role' | 'last_login_at'

const PAGE_SIZE = 10

const VALID_ROLES: readonly GlobalRole[] = ['ADMIN', 'INTERNAL_USER', 'AUTHORIZED_USER']
const VALID_STATUSES: readonly UserStatus[] = ['INVITED', 'ACTIVE', 'INACTIVE']
const VALID_SORT_KEYS: readonly SortKey[] = ['name', 'role', 'last_login_at']

function parseEnumList<T extends string>(raw: string[], allowed: readonly T[]): T[] {
  const set = new Set<T>()
  for (const value of raw) {
    if ((allowed as readonly string[]).includes(value)) set.add(value as T)
  }
  return Array.from(set)
}

export function useAdminUsers() {
  const [searchParams, setSearchParams] = useSearchParams()

  const q = searchParams.get('q') ?? ''
  const roles = useMemo(() => parseEnumList(searchParams.getAll('role'), VALID_ROLES), [searchParams])
  const statuses = useMemo(() => parseEnumList(searchParams.getAll('status'), VALID_STATUSES), [searchParams])
  const rawSortKey = searchParams.get('sortBy')
  const sortKey: SortKey | null =
    rawSortKey && (VALID_SORT_KEYS as readonly string[]).includes(rawSortKey) ? (rawSortKey as SortKey) : null
  const sortDir: 'asc' | 'desc' = searchParams.get('sortDir') === 'desc' ? 'desc' : 'asc'
  const page = Math.max(1, Number(searchParams.get('page') ?? '1') || 1)

  const debouncedQ = useDebounce(q, 300)

  const { data, isLoading, isError } = useQuery({
    queryKey: queryKeys.adminUsers.list({
      q: debouncedQ,
      roles,
      statuses,
      sortKey,
      sortDir,
      page,
    }),
    queryFn: () =>
      adminApi.listUsers({
        ...(sortKey ? { sortBy: sortKey, sortDir } : {}),
        page,
        limit: PAGE_SIZE,
        ...(debouncedQ ? { q: debouncedQ } : {}),
        ...(roles.length > 0 ? { role: roles } : {}),
        ...(statuses.length > 0 ? { status: statuses } : {}),
      }),
    placeholderData: keepPreviousData,
  })

  const mutate = (mutator: (next: URLSearchParams) => void) => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        mutator(next)
        // Normalize: drop empty and default values
        if ((next.get('q') ?? '') === '') next.delete('q')
        if (next.get('sortDir') === 'asc' && !next.get('sortBy')) next.delete('sortDir')
        if (next.get('page') === '1') next.delete('page')
        return next
      },
      { replace: true },
    )
  }

  const setQ = (value: string) => {
    mutate((next) => {
      if (value) next.set('q', value)
      else next.delete('q')
      next.set('page', '1')
    })
  }

  const toggleRole = (role: GlobalRole) => {
    mutate((next) => {
      const current = next.getAll('role')
      next.delete('role')
      const nextList = current.includes(role) ? current.filter((r) => r !== role) : [...current, role]
      nextList.forEach((r) => next.append('role', r))
      next.set('page', '1')
    })
  }

  const toggleStatus = (status: UserStatus) => {
    mutate((next) => {
      const current = next.getAll('status')
      next.delete('status')
      const nextList = current.includes(status) ? current.filter((s) => s !== status) : [...current, status]
      nextList.forEach((s) => next.append('status', s))
      next.set('page', '1')
    })
  }

  const toggleSort = (key: SortKey) => {
    mutate((next) => {
      const currentKey = next.get('sortBy')
      const currentDir = next.get('sortDir')
      if (currentKey === key) {
        next.set('sortDir', currentDir === 'asc' ? 'desc' : 'asc')
      } else {
        next.set('sortBy', key)
        next.set('sortDir', 'asc')
      }
      next.set('page', '1')
    })
  }

  const setPage: Dispatch<SetStateAction<number>> = (value) => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        const currentPage = Math.max(1, Number(next.get('page') ?? '1') || 1)
        const resolved = typeof value === 'function' ? value(currentPage) : value
        next.set('page', String(resolved))
        // Normalize: drop empty and default values (same as `mutate`)
        if ((next.get('q') ?? '') === '') next.delete('q')
        if (next.get('sortDir') === 'asc' && !next.get('sortBy')) next.delete('sortDir')
        if (next.get('page') === '1') next.delete('page')
        return next
      },
      { replace: true },
    )
  }

  const clearFilters = () => {
    mutate((next) => {
      next.delete('q')
      next.delete('role')
      next.delete('status')
      next.set('page', '1')
    })
  }

  const hasActiveFilters = q.length > 0 || roles.length > 0 || statuses.length > 0

  return {
    // data
    users: data?.data ?? [],
    total: data?.total ?? 0,
    totalPages: data?.totalPages ?? 1,
    isLoading,
    isError,
    // state
    q,
    roles,
    statuses,
    sortKey,
    sortDir,
    page,
    hasActiveFilters,
    pageSize: PAGE_SIZE,
    // actions
    setQ,
    toggleRole,
    toggleStatus,
    toggleSort,
    setPage,
    clearFilters,
  }
}
