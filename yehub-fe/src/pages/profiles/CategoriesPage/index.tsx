import { useState } from 'react'
import { Plus, Tag } from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { showApiError } from '@/lib/errors'
import { PageHeader } from '@/components/common/PageHeader'
import { EmptyState } from '@/components/common/EmptyState'
import { PageWrapper } from '@/components/common/PageWrapper'
import { queryKeys } from '@/lib/constants/query-keys'
import { kolCategoriesApi } from '@/api/kol-categories'
import { type CategoryFormValues } from '@/lib/schemas'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { CategoryFormDialog } from './components/CategoryFormDialog'
import { CategoryRow } from './components/CategoryRow'

function toPayload(values: CategoryFormValues) {
  return {
    name: values.name,
    description: values.description?.trim() || null,
    color: values.color,
  }
}

export default function CategoriesPage() {
  const queryClient = useQueryClient()
  const [createOpen, setCreateOpen] = useState(false)

  const { data: categories = [], isLoading } = useQuery({
    queryKey: queryKeys.kolCategories,
    queryFn: kolCategoriesApi.list,
  })

  const createMutation = useMutation({
    mutationFn: (values: CategoryFormValues) => kolCategoriesApi.create(toPayload(values)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.kolCategories })
      setCreateOpen(false)
      toast.success('Category created')
    },
    onError: (error) => showApiError(error, { fallback: 'Failed to create category' }),
  })

  if (isLoading) {
    return (
      <PageWrapper>
        <PageHeader title="Categories" description="Organize profiles into categories for targeted analysis" />
        <div className="flex items-center justify-center py-12 text-muted-foreground">Loading...</div>
      </PageWrapper>
    )
  }

  return (
    <PageWrapper>
      <PageHeader
        title="Categories"
        description="Organize profiles into categories for targeted analysis"
        actions={
          <Button className="cursor-pointer" onClick={() => setCreateOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Add Category
          </Button>
        }
      />

      {categories.length === 0 ? (
        <EmptyState
          icon={<Tag className="h-12 w-12" />}
          title="No categories yet"
          description="Create categories to organize your profiles"
        />
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Category</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="text-center">Profiles</TableHead>
                <TableHead className="w-[100px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {categories.map((category) => (
                <CategoryRow key={category.id} category={category} />
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <CategoryFormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSubmit={(values) => createMutation.mutate(values)}
        isPending={createMutation.isPending}
      />
    </PageWrapper>
  )
}
