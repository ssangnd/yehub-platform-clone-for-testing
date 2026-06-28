import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { ArrowLeft } from 'lucide-react'
import { toast } from 'sonner'

import { PageWrapper } from '@/components/common/PageWrapper'
import { ROUTES } from '@/lib/constants/routes'
import { queryKeys } from '@/lib/constants/query-keys'
import { kolCategoriesApi } from '@/api/kol-categories'
import { kolTiersApi } from '@/api/kol-tiers'
import { profilesApi, type PlatformType } from '@/api/profiles'
import { showApiError } from '@/lib/errors'
import { Button } from '@/components/ui/button'
import { Form } from '@/components/ui/form'
import { addProfileSchema, emptyAddProfileForm, SOCIAL_PLATFORMS, type AddProfileFormValues } from './schema'
import { BasicInfoCard } from './components/BasicInfoCard'
import { ContactInfoCard } from './components/ContactInfoCard'
import { SocialAccountsCard } from './components/SocialAccountsCard'

function toPayload(values: AddProfileFormValues) {
  const tags = (values.tagsInput ?? '')
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean)

  const socialAccounts: { platform: PlatformType; url: string }[] = []
  for (const { key } of SOCIAL_PLATFORMS) {
    const raw = (values.socialUrls[key] ?? '').trim()
    if (raw) socialAccounts.push({ platform: key, url: raw })
  }

  return {
    name: values.name,
    gender: values.gender,
    email: values.email || undefined,
    phone: values.phone || undefined,
    avatar: values.avatar || undefined,
    tags: tags.length > 0 ? tags : undefined,
    tierId: values.tierId,
    categoryIds: values.categoryIds,
    socialAccounts,
  }
}

export default function AddProfilePage() {
  const navigate = useNavigate()

  const form = useForm<AddProfileFormValues>({
    resolver: zodResolver(addProfileSchema),
    defaultValues: emptyAddProfileForm,
  })

  const { data: categories = [] } = useQuery({
    queryKey: queryKeys.kolCategories,
    queryFn: kolCategoriesApi.list,
  })

  const { data: tiers = [] } = useQuery({
    queryKey: queryKeys.kolTiers,
    queryFn: kolTiersApi.list,
  })

  const createMutation = useMutation({
    mutationFn: profilesApi.create,
    onSuccess: () => {
      toast.success('Profile created')
      navigate(ROUTES.PROFILES)
    },
    onError: (error) => showApiError(error, { fallback: 'Failed to create profile' }),
  })

  return (
    <PageWrapper>
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="cursor-pointer" aria-label="Back">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-2xl font-bold">Add Profile</h1>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit((values) => createMutation.mutate(toPayload(values)))} className="space-y-6">
          <BasicInfoCard form={form} categories={categories} tiers={tiers} />
          <ContactInfoCard form={form} />
          <SocialAccountsCard form={form} />

          <div className="flex justify-end gap-3">
            <Button type="button" variant="outline" onClick={() => navigate(-1)} className="cursor-pointer">
              Cancel
            </Button>
            <Button type="submit" className="cursor-pointer" disabled={createMutation.isPending}>
              Create Profile
            </Button>
          </div>
        </form>
      </Form>
    </PageWrapper>
  )
}
