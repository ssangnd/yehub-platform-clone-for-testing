import { useState } from 'react'
import { Plus, Award, Loader2 } from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { showApiError } from '@/lib/errors'
import { PageHeader } from '@/components/common/PageHeader'
import { EmptyState } from '@/components/common/EmptyState'
import { PageWrapper } from '@/components/common/PageWrapper'
import { queryKeys } from '@/lib/constants/query-keys'
import { kolTiersApi } from '@/api/kol-tiers'
import { type TierFormValues } from '@/lib/schemas'
import { Button } from '@/components/ui/button'
import { TierFormDialog } from './components/TierFormDialog'
import { TierCard } from './components/TierCard'

function toPayload(values: TierFormValues) {
  return {
    name: values.name,
    description: values.description?.trim() || null,
    color: values.color,
    minFollowers: Number(values.minFollowers),
    maxFollowers: values.maxFollowers ? Number(values.maxFollowers) : null,
  }
}

export default function TiersPage() {
  const queryClient = useQueryClient()
  const [createOpen, setCreateOpen] = useState(false)

  const { data: tiers = [], isLoading } = useQuery({
    queryKey: queryKeys.kolTiers,
    queryFn: kolTiersApi.list,
  })

  const createMutation = useMutation({
    mutationFn: (values: TierFormValues) => kolTiersApi.create(toPayload(values)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.kolTiers })
      setCreateOpen(false)
      toast.success('Tier created')
    },
    onError: (error) => showApiError(error, { fallback: 'Failed to create tier' }),
  })

  if (isLoading) {
    return (
      <PageWrapper>
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </PageWrapper>
    )
  }

  return (
    <PageWrapper>
      <PageHeader
        title="Tiers"
        description="Classify profiles by follower count and influence level"
        actions={
          <Button className="cursor-pointer" onClick={() => setCreateOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Add Tier
          </Button>
        }
      />

      {tiers.length === 0 ? (
        <EmptyState
          icon={<Award className="h-12 w-12" />}
          title="No tiers yet"
          description="Create tiers to classify profiles by influence level"
        />
      ) : (
        <div className="space-y-3">
          {tiers.map((tier) => (
            <TierCard key={tier.id} tier={tier} />
          ))}
        </div>
      )}

      <TierFormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSubmit={(values) => createMutation.mutate(values)}
        isPending={createMutation.isPending}
      />
    </PageWrapper>
  )
}
