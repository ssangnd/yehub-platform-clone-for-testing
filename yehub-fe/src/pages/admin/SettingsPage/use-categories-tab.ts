import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import axios from 'axios'
import { toast } from 'sonner'
import { categoriesApi } from '@/api/categories'
import { queryKeys } from '@/lib/constants/query-keys'

export function useCategoriesTab() {
  const queryClient = useQueryClient()

  const { data, isLoading, isError } = useQuery({
    queryKey: queryKeys.categories,
    queryFn: categoriesApi.list,
  })

  const createMutation = useMutation({
    mutationFn: (name: string) => categoriesApi.create(name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.categories })
      toast.success('Category created')
    },
    onError: (err) => {
      const msg = axios.isAxiosError(err)
        ? ((err.response?.data as { message?: string })?.message ?? 'Failed to create category')
        : 'Failed to create category'
      toast.error(msg)
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) => categoriesApi.update(id, name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.categories })
      // Cached projects embed the category name; drop them so the next fetch
      // shows the renamed value everywhere.
      queryClient.invalidateQueries({ queryKey: queryKeys.projects.all })
      queryClient.invalidateQueries({ queryKey: ['project'], exact: false })
      toast.success('Category updated')
    },
    onError: (err) => {
      const msg = axios.isAxiosError(err)
        ? ((err.response?.data as { message?: string })?.message ?? 'Failed to update category')
        : 'Failed to update category'
      toast.error(msg)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => categoriesApi.remove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.categories })
      // Cached projects may still reference the deleted category; drop them so the
      // next project form load pulls a fresh server-side view of categories.
      queryClient.invalidateQueries({ queryKey: queryKeys.projects.all })
      queryClient.invalidateQueries({ queryKey: ['project'], exact: false })
      toast.success('Category deleted')
    },
    onError: () => toast.error('Failed to delete category'),
  })

  const items = (data ?? []).map((c) => ({
    id: c.id,
    name: c.name,
    usage_count: c.project_count ?? 0,
  }))

  return { items, isLoading, isError, createMutation, updateMutation, deleteMutation }
}
