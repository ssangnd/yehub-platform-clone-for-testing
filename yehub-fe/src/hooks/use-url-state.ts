import { useCallback, type Dispatch, type SetStateAction } from 'react'
import { useSearchParams } from 'react-router-dom'

type Normalize = (params: URLSearchParams) => void

/**
 * Syncs list/table UI state (pagination, search, filters, sort) to the URL
 * query string so views survive refresh, back/forward and sharing.
 *
 * Centralizes the bug-prone parts: clamping `page`, functional `setPage`
 * updates, dropping the default `page=1`, and writing with `replace: true`
 * (so typing in a search box does not spam browser history).
 *
 * Pass `normalize` to drop a page's own default values (e.g. a default sort
 * direction) so URLs stay clean. It runs on every write, after the mutator.
 */
export function useUrlState(normalize?: Normalize) {
  const [searchParams, setSearchParams] = useSearchParams()

  const page = Math.max(1, Number(searchParams.get('page') ?? '1') || 1)

  const update = useCallback(
    (mutator: (next: URLSearchParams) => void) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          mutator(next)
          normalize?.(next)
          if (next.get('page') === '1') next.delete('page')
          return next
        },
        { replace: true },
      )
    },
    [setSearchParams, normalize],
  )

  const setPage: Dispatch<SetStateAction<number>> = useCallback(
    (value) => {
      update((next) => {
        const current = Math.max(1, Number(next.get('page') ?? '1') || 1)
        const resolved = typeof value === 'function' ? value(current) : value
        next.set('page', String(resolved))
      })
    },
    [update],
  )

  /**
   * Set or clear a single string param and reset pagination to the first page.
   * Empty/nullish values delete the param so it never lingers in the URL.
   */
  const setParam = useCallback(
    (key: string, value: string | null | undefined) => {
      update((next) => {
        if (value) next.set(key, value)
        else next.delete(key)
        next.set('page', '1')
      })
    },
    [update],
  )

  return { searchParams, page, setPage, update, setParam }
}
