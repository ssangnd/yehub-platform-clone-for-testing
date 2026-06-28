import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/store/auth.store'
import { useSetPageTitle } from '@/hooks/use-page-title'
import { ROUTES } from '@/lib/constants/routes'
import { PageWrapper } from '@/components/common/PageWrapper'
import { useMyAccount } from './use-my-account'
import { ProfileCard } from './components/ProfileCard'
import { ChangePasswordCard } from './components/ChangePasswordCard'
import { SessionsCard } from './SessionsCard'

export function MyAccountPage() {
  useSetPageTitle('My Account')

  const navigate = useNavigate()
  const { clearAuth } = useAuthStore()
  const { profile, isError, user, initials } = useMyAccount()

  useEffect(() => {
    if (isError) {
      clearAuth()
      navigate(ROUTES.LOGIN)
    }
  }, [isError, clearAuth, navigate])

  return (
    <PageWrapper>
      <div className="space-y-6">
        <div>
          <h1 className="font-display text-2xl font-bold">My Account</h1>
          <p className="text-sm text-muted-foreground">Manage your account preferences</p>
        </div>

        <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-2">
          <div className="space-y-6">
            <ProfileCard profile={profile} user={user} initials={initials} />
            <ChangePasswordCard />
          </div>

          <SessionsCard />
        </div>
      </div>
    </PageWrapper>
  )
}
