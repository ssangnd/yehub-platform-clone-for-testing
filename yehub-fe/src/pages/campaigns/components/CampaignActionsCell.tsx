import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import axios from 'axios'
import { Copy, Eye, MoreVertical, Pencil, Play, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { campaignsApi, type Campaign } from '@/api/campaigns'
import { queryKeys } from '@/lib/constants/query-keys'

interface CampaignActionsCellProps {
  campaign: Campaign
  projectId: string
  canEdit: boolean
  canDelete: boolean
  canCreate: boolean
}

export function CampaignActionsCell({ campaign, projectId, canEdit, canDelete, canCreate }: CampaignActionsCellProps) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [launchOpen, setLaunchOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)

  const isDraft = campaign.status === 'DRAFT'
  const isCompleted = campaign.status === 'COMPLETED'
  const basePath = `/projects/${projectId}/campaigns/${campaign.id}`

  const invalidateLists = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.campaigns.all })
    queryClient.invalidateQueries({ queryKey: queryKeys.campaigns.byProject(projectId) })
    queryClient.invalidateQueries({ queryKey: queryKeys.projects.all })
  }

  const launchMutation = useMutation({
    mutationFn: () => campaignsApi.changeCampaignStatus(campaign.id, 'ACTIVE'),
    onSuccess: () => {
      invalidateLists()
      toast.success('Campaign launched')
    },
    onError: (err) => {
      if (axios.isAxiosError(err)) {
        const msg = (err.response?.data as { message?: string })?.message ?? 'Failed to launch campaign'
        toast.error(msg)
      }
    },
  })

  const deleteMutation = useMutation({
    mutationFn: () => campaignsApi.deleteCampaign(campaign.id),
    onSuccess: () => {
      invalidateLists()
      toast.success('Campaign deleted')
    },
    onError: (err) => {
      if (axios.isAxiosError(err)) {
        const msg = (err.response?.data as { message?: string })?.message ?? 'Failed to delete campaign'
        toast.error(msg)
      }
    },
  })

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 cursor-pointer"
              onClick={(e) => e.stopPropagation()}
              aria-label="Campaign actions"
            />
          }
        >
          <MoreVertical className="h-4 w-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
          <DropdownMenuItem className="cursor-pointer" onClick={() => navigate(basePath)}>
            <Eye className="mr-2 h-4 w-4" />
            View
          </DropdownMenuItem>
          {canEdit && !isCompleted && (
            <DropdownMenuItem className="cursor-pointer" onClick={() => navigate(`${basePath}/edit`)}>
              <Pencil className="mr-2 h-4 w-4" />
              Edit
            </DropdownMenuItem>
          )}
          {canEdit && isDraft && (
            <DropdownMenuItem className="cursor-pointer" onClick={() => setLaunchOpen(true)}>
              <Play className="mr-2 h-4 w-4" />
              Launch
            </DropdownMenuItem>
          )}
          {canCreate && (
            <DropdownMenuItem
              className="cursor-pointer"
              onClick={() => navigate(`/projects/${projectId}/campaigns/new?from=${campaign.id}`)}
            >
              <Copy className="mr-2 h-4 w-4" />
              Duplicate
            </DropdownMenuItem>
          )}
          {canDelete && isDraft && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="cursor-pointer text-destructive focus:text-destructive"
                onClick={() => setDeleteOpen(true)}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Delete
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={launchOpen} onOpenChange={setLaunchOpen}>
        <AlertDialogContent onClick={(e) => e.stopPropagation()}>
          <AlertDialogHeader>
            <AlertDialogTitle>Launch this campaign?</AlertDialogTitle>
            <AlertDialogDescription>
              Launching will activate the campaign and start polling jobs for all posts. You can pause it later from the
              campaign detail page.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                launchMutation.mutate()
                setLaunchOpen(false)
              }}
              disabled={launchMutation.isPending}
            >
              Launch
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent onClick={(e) => e.stopPropagation()}>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this draft campaign?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete &ldquo;{campaign.name}&rdquo;. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                deleteMutation.mutate()
                setDeleteOpen(false)
              }}
              disabled={deleteMutation.isPending}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
