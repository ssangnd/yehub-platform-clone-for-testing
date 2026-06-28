import { useQuery } from '@tanstack/react-query'
import { projectsApi } from '@/api/projects'
import { useDebounce } from '@/hooks/use-debounce'
import { useUrlState } from '@/hooks/use-url-state'
import { queryKeys } from '@/lib/constants/query-keys'

const PAGE_LIMIT = 20

export function useProjectsList() {
  const { searchParams, page, setPage, update, setParam } = useUrlState()

  const search = searchParams.get('q') ?? ''
  const showArchived = searchParams.get('archived') === '1'

  const debouncedSearch = useDebounce(search, 300)

  const { data: projectsPage, isLoading } = useQuery({
    queryKey: queryKeys.projects.list(page, debouncedSearch, showArchived),
    queryFn: () =>
      projectsApi.listProjects({
        q: debouncedSearch || undefined,
        page,
        limit: PAGE_LIMIT,
        active: !showArchived,
      }),
  })

  const handleSearchChange = (value: string) => setParam('q', value)

  const handleToggleArchived = () => {
    update((next) => {
      if (showArchived) next.delete('archived')
      else next.set('archived', '1')
      next.set('page', '1')
    })
  }

  return {
    projects: projectsPage?.data ?? [],
    totalPages: projectsPage?.totalPages ?? 1,
    isLoading,
    page,
    setPage,
    search,
    handleSearchChange,
    showArchived,
    handleToggleArchived,
  }
}
