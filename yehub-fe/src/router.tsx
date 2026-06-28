import { lazy } from 'react'
import { createBrowserRouter, Outlet } from 'react-router-dom'
import { AuthOnly } from '@/components/auth-only'
import { GuestOnly } from '@/components/guest-only'
import { ProtectedRoute } from '@/components/protected-route'
import { AdminRoute } from '@/components/admin-route'
import { ProfilesRoute } from '@/components/profiles-route'
import { ROUTES } from '@/lib/constants/routes'
import { SuspenseWrapper } from '@/components/common/SuspenseWrapper'
import { RouteErrorBoundary } from '@/components/common/RouteErrorBoundary'

// Auth pages (named exports — wrap with default adapter)
const LoginPage = lazy(() => import('@/pages/login').then((m) => ({ default: m.LoginPage })))
const InvitationPage = lazy(() => import('@/pages/invitation').then((m) => ({ default: m.InvitationPage })))
const ForgotPasswordPage = lazy(() =>
  import('@/pages/forgot-password').then((m) => ({ default: m.ForgotPasswordPage })),
)
const ResetPasswordPage = lazy(() => import('@/pages/reset-password').then((m) => ({ default: m.ResetPasswordPage })))

const MyAccountPage = lazy(() => import('@/pages/MyAccountPage').then((m) => ({ default: m.MyAccountPage })))
const ProjectsListPage = lazy(() =>
  import('@/pages/projects/ProjectsListPage').then((m) => ({ default: m.ProjectsListPage })),
)
const ProjectDetailPage = lazy(() =>
  import('@/pages/projects/ProjectDetailPage').then((m) => ({ default: m.ProjectDetailPage })),
)
const AdminPanelPage = lazy(() => import('@/pages/admin/AdminPanelPage').then((m) => ({ default: m.AdminPanelPage })))
const SettingsPage = lazy(() => import('@/pages/admin/SettingsPage').then((m) => ({ default: m.SettingsPage })))
const CostExplorerPage = lazy(() =>
  import('@/pages/cost/CostExplorerPage').then((m) => ({ default: m.CostExplorerPage })),
)

// New pages (default exports)
const HomePage = lazy(() => import('@/pages/home/HomePage'))
const CampaignsListPage = lazy(() =>
  import('@/pages/campaigns/CampaignsListPage').then((m) => ({ default: m.CampaignsListPage })),
)
const PostsPage = lazy(() => import('@/pages/posts/PostsPage'))
const ProfilesListPage = lazy(() =>
  import('@/pages/profiles/ProfilesListPage').then((m) => ({ default: m.ProfilesListPage })),
)
const AddProfilePage = lazy(() => import('@/pages/profiles/AddProfilePage'))
const ProfileDetailPage = lazy(() => import('@/pages/profiles/ProfileDetailPage'))
const CategoriesPage = lazy(() => import('@/pages/profiles/CategoriesPage'))
const TiersPage = lazy(() => import('@/pages/profiles/TiersPage'))
const CampaignFormPage = lazy(() =>
  import('@/pages/campaigns/CampaignFormPage').then((m) => ({ default: m.CampaignFormPage })),
)
const CampaignDetailPage = lazy(() =>
  import('@/pages/campaigns/CampaignDetailPage').then((m) => ({ default: m.CampaignDetailPage })),
)
const PostDetailPage = lazy(() => import('@/pages/posts/PostDetailPage'))
const NotFoundPage = lazy(() => import('@/pages/NotFoundPage'))

export const router = createBrowserRouter([
  {
    element: <Outlet />,
    errorElement: <RouteErrorBoundary />,
    children: [
      {
        element: <GuestOnly />,
        children: [
          {
            path: ROUTES.LOGIN,
            element: (
              <SuspenseWrapper>
                <LoginPage />
              </SuspenseWrapper>
            ),
          },
          {
            path: ROUTES.INVITATION,
            element: (
              <SuspenseWrapper>
                <InvitationPage />
              </SuspenseWrapper>
            ),
          },
          {
            path: ROUTES.FORGOT_PASSWORD,
            element: (
              <SuspenseWrapper>
                <ForgotPasswordPage />
              </SuspenseWrapper>
            ),
          },
          {
            path: ROUTES.RESET_PASSWORD,
            element: (
              <SuspenseWrapper>
                <ResetPasswordPage />
              </SuspenseWrapper>
            ),
          },
        ],
      },
      {
        element: <AuthOnly />,
        children: [
          {
            path: ROUTES.HOME,
            element: (
              <SuspenseWrapper>
                <HomePage />
              </SuspenseWrapper>
            ),
          },
        ],
      },
      {
        element: <ProtectedRoute />,
        children: [
          {
            path: ROUTES.MY_ACCOUNT,
            element: (
              <SuspenseWrapper>
                <MyAccountPage />
              </SuspenseWrapper>
            ),
          },
          {
            path: ROUTES.PROJECTS,
            element: (
              <SuspenseWrapper>
                <ProjectsListPage />
              </SuspenseWrapper>
            ),
          },
          {
            path: '/projects/:projectId/campaigns/new',
            element: (
              <SuspenseWrapper>
                <CampaignFormPage />
              </SuspenseWrapper>
            ),
          },
          {
            path: '/projects/:projectId/campaigns/:campaignId/edit',
            element: (
              <SuspenseWrapper>
                <CampaignFormPage />
              </SuspenseWrapper>
            ),
          },
          {
            path: ROUTES.POST_DETAIL,
            element: (
              <SuspenseWrapper>
                <PostDetailPage />
              </SuspenseWrapper>
            ),
          },
          {
            path: '/projects/:projectId/campaigns/:campaignId/*',
            element: (
              <SuspenseWrapper>
                <CampaignDetailPage />
              </SuspenseWrapper>
            ),
          },
          {
            path: `${ROUTES.PROJECT_DETAIL}/*`,
            element: (
              <SuspenseWrapper>
                <ProjectDetailPage />
              </SuspenseWrapper>
            ),
          },
          {
            path: ROUTES.CAMPAIGNS,
            element: (
              <SuspenseWrapper>
                <CampaignsListPage />
              </SuspenseWrapper>
            ),
          },
          {
            path: ROUTES.POSTS,
            element: (
              <SuspenseWrapper>
                <PostsPage />
              </SuspenseWrapper>
            ),
          },
          {
            element: <ProfilesRoute />,
            children: [
              {
                path: ROUTES.PROFILES_NEW,
                element: (
                  <SuspenseWrapper>
                    <AddProfilePage />
                  </SuspenseWrapper>
                ),
              },
              {
                path: ROUTES.PROFILES_CATEGORIES,
                element: (
                  <SuspenseWrapper>
                    <CategoriesPage />
                  </SuspenseWrapper>
                ),
              },
              {
                path: ROUTES.PROFILES_TIERS,
                element: (
                  <SuspenseWrapper>
                    <TiersPage />
                  </SuspenseWrapper>
                ),
              },
              {
                path: ROUTES.PROFILE_DETAIL,
                element: (
                  <SuspenseWrapper>
                    <ProfileDetailPage />
                  </SuspenseWrapper>
                ),
              },
              {
                path: ROUTES.PROFILES,
                element: (
                  <SuspenseWrapper>
                    <ProfilesListPage />
                  </SuspenseWrapper>
                ),
              },
            ],
          },
          {
            element: <AdminRoute />,
            children: [
              {
                path: ROUTES.USERS,
                element: (
                  <SuspenseWrapper>
                    <AdminPanelPage />
                  </SuspenseWrapper>
                ),
              },
              {
                path: ROUTES.COST,
                element: (
                  <SuspenseWrapper>
                    <CostExplorerPage />
                  </SuspenseWrapper>
                ),
              },
              {
                path: ROUTES.SETTINGS,
                element: (
                  <SuspenseWrapper>
                    <SettingsPage />
                  </SuspenseWrapper>
                ),
              },
            ],
          },
        ],
      },
      {
        path: '*',
        element: (
          <SuspenseWrapper>
            <NotFoundPage />
          </SuspenseWrapper>
        ),
      },
    ],
  },
])
