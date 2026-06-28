import { useState } from 'react'
import { Pencil, Trash2 } from 'lucide-react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { showApiError } from '@/lib/errors'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { COLOR_PRESETS, type ColorKey } from '@/lib/constants/colors'
import { queryKeys } from '@/lib/constants/query-keys'
import { kolTiersApi, type KolTier } from '@/api/kol-tiers'
import { type TierFormValues } from '@/lib/schemas'
import { DeleteTierDialog } from './DeleteTierDialog'
import { TierFormDialog } from './TierFormDialog'

function formatFollowers(n: number): string {
  if (n >= 1000000) return `${n / 1000000}M`
  if (n >= 1000) return `${n / 1000}K`
  return String(n)
}

function toPayload(values: TierFormValues) {
  return {
    name: values.name,
    description: values.description?.trim() || null,
    color: values.color,
    minFollowers: Number(values.minFollowers),
    maxFollowers: values.maxFollowers ? Number(values.maxFollowers) : null,
  }
}

interface TierCardProps {
  tier: KolTier
}

export function TierCard({ tier }: TierCardProps) {
  const queryClient = useQueryClient()
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)

  const deleteMutation = useMutation({
    mutationFn: () => kolTiersApi.delete(tier.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.kolTiers })
      setDeleteOpen(false)
      toast.success('Tier deleted')
    },
    onError: (error) => showApiError(error, { fallback: 'Failed to delete tier' }),
  })

  const updateMutation = useMutation({
    mutationFn: (values: TierFormValues) => kolTiersApi.update(tier.id, toPayload(values)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.kolTiers })
      setEditOpen(false)
      toast.success('Tier updated')
    },
    onError: (error) => showApiError(error, { fallback: 'Failed to update tier' }),
  })

  const colorKey = (tier.color as ColorKey) || 'blue'
  const badgeClass = COLOR_PRESETS[colorKey]?.badge ?? COLOR_PRESETS.blue.badge

  return (
    <>
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Badge variant="outline" className={`${badgeClass} border-0 text-sm`}>
                {tier.name}
              </Badge>
              <div>
                <p className="text-sm text-muted-foreground">{tier.description}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {formatFollowers(tier.minFollowers)}{' '}
                  {tier.maxFollowers ? `— ${formatFollowers(tier.maxFollowers)}` : '+'} followers
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-sm font-mono">
                <span className="font-medium text-foreground">{tier.profileCount}</span>
                <span className="text-muted-foreground"> profiles</span>
              </span>
              <div className="flex gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 cursor-pointer"
                  onClick={() => setEditOpen(true)}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 cursor-pointer text-destructive hover:text-destructive"
                  onClick={() => setDeleteOpen(true)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <TierFormDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        tier={tier}
        onSubmit={(values) => updateMutation.mutate(values)}
        isPending={updateMutation.isPending}
      />

      <DeleteTierDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        tier={tier}
        onConfirm={() => deleteMutation.mutate()}
        isPending={deleteMutation.isPending}
      />
    </>
  )
}
