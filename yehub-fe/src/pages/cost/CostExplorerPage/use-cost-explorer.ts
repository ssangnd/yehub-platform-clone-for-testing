import { useCallback, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { format, subDays } from 'date-fns'
import { costApi, type CostFilters } from '@/api/cost'
import type { Platform } from '@/api/campaigns'
import { queryKeys } from '@/lib/constants/query-keys'

function defaultRange() {
  const today = new Date()
  return {
    from: format(subDays(today, 29), 'yyyy-MM-dd'),
    to: format(today, 'yyyy-MM-dd'),
  }
}

function parseCsv(value: string | null): string[] {
  return value ? value.split(',').filter(Boolean) : []
}

export function useCostExplorer() {
  const [searchParams, setSearchParams] = useSearchParams()
  const fallback = useMemo(() => defaultRange(), [])

  const filters: CostFilters = useMemo(
    () => ({
      from: searchParams.get('from') ?? fallback.from,
      to: searchParams.get('to') ?? fallback.to,
      platforms: parseCsv(searchParams.get('platforms')) as Platform[],
      project_ids: parseCsv(searchParams.get('project_ids')),
      campaign_ids: parseCsv(searchParams.get('campaign_ids')),
    }),
    [searchParams, fallback],
  )

  // Writes only non-default/non-empty values to the URL.
  const setFilters = useCallback(
    (next: CostFilters) => {
      const params = new URLSearchParams()
      params.set('from', next.from)
      params.set('to', next.to)
      if (next.platforms.length) params.set('platforms', next.platforms.join(','))
      if (next.project_ids.length) params.set('project_ids', next.project_ids.join(','))
      if (next.campaign_ids.length) params.set('campaign_ids', next.campaign_ids.join(','))
      setSearchParams(params, { replace: true })
    },
    [setSearchParams],
  )

  const query = useQuery({
    queryKey: queryKeys.cost.overview(filters as unknown as Record<string, unknown>),
    queryFn: () => costApi.getOverview(filters),
    enabled: filters.from <= filters.to,
  })

  return { filters, setFilters, ...query }
}
