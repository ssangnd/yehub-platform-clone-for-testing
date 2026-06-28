import { useQuery } from '@tanstack/react-query'
import { projectsApi } from '@/api/projects'
import { useCan } from '@/hooks/use-can'
import { useAuthStore } from '@/store/auth.store'
import { queryKeys } from '@/lib/constants/query-keys'

export function useProjectDetail(id: string | undefined) {
  const isAdmin = useAuthStore((s) => s.user?.role === 'ADMIN')

  const { data: project, isError: projectError } = useQuery({
    queryKey: queryKeys.project(id!),
    queryFn: () => projectsApi.getProject(id!).then((r) => r.data),
    enabled: !!id,
  })

  const { data: myRoleData, isError: roleError } = useQuery({
    queryKey: queryKeys.projectMe(id!),
    queryFn: () => projectsApi.getMyRole(id!).then((r) => r.data),
    enabled: !!id && !isAdmin,
  })

  const myRole = myRoleData?.role ?? null
  const canManageByRole = useCan('manage_members', myRole)
  const canEditByRole = useCan('edit', myRole)
  const canManageMembers = isAdmin || canManageByRole
  const canEdit = isAdmin || canEditByRole

  return {
    project,
    projectError,
    myRoleData,
    myRole,
    roleError,
    isAdmin,
    canManageMembers,
    canEdit,
  }
}
