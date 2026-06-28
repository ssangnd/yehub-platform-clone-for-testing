import { createBrowserRouter } from 'react-router-dom'
import { lazy, Suspense } from 'react'
import { ProtectedRoute } from './ProtectedRoute'
import { RoleGuard } from './RoleGuard'
import { ROUTES } from '@/lib/constants/routes'
import { AppShell } from '@/components/layout/AppShell'
import { LoadingPage } from '@/components/common/LoadingState'
import { ErrorBoundary } from '@/components/common/ErrorBoundary'

// Auth pages
const LoginPage = lazy(() => import('@/pages/auth/LoginPage'))
const PasswordResetPage = lazy(() => import('@/pages/auth/PasswordResetPage'))

// Home page (standalone, no AppShell)
const HomePage = lazy(() => import('@/pages/home/HomePage'))

// Main pages
const DashboardPage = lazy(() => import('@/pages/dashboard/DashboardPage'))
const ProjectsListPage = lazy(() => import('@/pages/projects/ProjectsListPage'))
const ProjectDetailPage = lazy(() => import('@/pages/projects/ProjectDetailPage'))
const CampaignsListPage = lazy(() => import('@/pages/campaigns/CampaignsListPage'))
const CampaignLayout = lazy(() => import('@/pages/campaigns/CampaignLayout'))
const CampaignOverviewPage = lazy(() => import('@/pages/campaigns/CampaignOverviewPage'))
const CampaignPostsPage = lazy(() => import('@/pages/campaigns/CampaignPostsPage'))
const CampaignCommentsPage = lazy(() => import('@/pages/campaigns/CampaignCommentsPage'))
const CampaignComparisonPage = lazy(() => import('@/pages/campaigns/CampaignComparisonPage'))
const CampaignFormPage = lazy(() => import('@/pages/campaigns/CampaignFormPage'))
const CampaignMembersPage = lazy(() => import('@/pages/campaigns/CampaignMembersPage'))
const PostsListPage = lazy(() => import('@/pages/posts/PostsListPage'))
const PostDetailPage = lazy(() => import('@/pages/posts/PostDetailPage'))
const ProfilesListPage = lazy(() => import('@/pages/profiles/ProfilesListPage'))
const AddProfilePage = lazy(() => import('@/pages/profiles/AddProfilePage'))
const ProfileDetailPage = lazy(() => import('@/pages/profiles/ProfileDetailPage'))
const CategoriesPage = lazy(() => import('@/pages/profiles/SegmentsPage'))
const TiersPage = lazy(() => import('@/pages/profiles/TiersPage'))

// Campaign insight/alert tab pages
const AnalyticsPage = lazy(() => import('@/pages/insights/AnalyticsPage'))
const AlertManagementPage = lazy(() => import('@/pages/alerts/AlertManagementPage'))

// System pages
const MyAccountPage = lazy(() => import('@/pages/settings/MyAccountPage'))
const AdminSettingsPage = lazy(() => import('@/pages/admin/AdminSettingsPage'))
const AdminPanelPage = lazy(() => import('@/pages/admin/AdminPanelPage'))

const NotFoundPage = lazy(() => import('@/pages/NotFoundPage'))

function SuspenseWrapper({ children }: { children: React.ReactNode }) {
  return (
    <ErrorBoundary>
      <Suspense fallback={<LoadingPage />}>{children}</Suspense>
    </ErrorBoundary>
  )
}

export const router = createBrowserRouter([
  {
    path: ROUTES.LOGIN,
    element: <SuspenseWrapper><LoginPage /></SuspenseWrapper>,
  },
  {
    path: ROUTES.PASSWORD_RESET,
    element: <SuspenseWrapper><PasswordResetPage /></SuspenseWrapper>,
  },
  {
    element: <ProtectedRoute />,
    children: [
      // Home page — standalone, no AppShell
      {
        path: ROUTES.HOME,
        element: <SuspenseWrapper><HomePage /></SuspenseWrapper>,
      },
      {
        element: <AppShell />,
        children: [
          {
            element: <RoleGuard allowedRoles={['admin', 'internal_user']} />,
            children: [
              {
                path: ROUTES.DASHBOARD,
                element: <SuspenseWrapper><DashboardPage /></SuspenseWrapper>,
              },
            ],
          },
          {
            path: ROUTES.PROJECTS,
            element: <SuspenseWrapper><ProjectsListPage /></SuspenseWrapper>,
          },
          // Project detail — URL-based tabs
          {
            path: '/projects/:projectId',
            children: [
              {
                index: true,
                element: <SuspenseWrapper><ProjectDetailPage /></SuspenseWrapper>,
              },
              {
                path: 'members',
                element: <SuspenseWrapper><ProjectDetailPage /></SuspenseWrapper>,
              },
              // Campaign create/edit pages
              {
                path: 'campaigns/new',
                element: <SuspenseWrapper><CampaignFormPage /></SuspenseWrapper>,
              },
              {
                path: 'campaigns/:campaignId/edit',
                element: <SuspenseWrapper><CampaignFormPage /></SuspenseWrapper>,
              },
              // Campaign detail nested under project
              {
                path: 'campaigns/:campaignId',
                element: <SuspenseWrapper><CampaignLayout /></SuspenseWrapper>,
                children: [
                  {
                    index: true,
                    element: <SuspenseWrapper><CampaignOverviewPage /></SuspenseWrapper>,
                  },
                  {
                    path: 'posts',
                    element: <SuspenseWrapper><CampaignPostsPage /></SuspenseWrapper>,
                  },
                  {
                    path: 'posts/:postId',
                    element: <SuspenseWrapper><PostDetailPage /></SuspenseWrapper>,
                  },
                  {
                    path: 'comments',
                    element: <SuspenseWrapper><CampaignCommentsPage /></SuspenseWrapper>,
                  },
                  {
                    path: 'analytics',
                    element: <SuspenseWrapper><AnalyticsPage /></SuspenseWrapper>,
                  },
                  {
                    path: 'alerts',
                    element: <SuspenseWrapper><AlertManagementPage /></SuspenseWrapper>,
                  },
                  {
                    path: 'members',
                    element: <SuspenseWrapper><CampaignMembersPage /></SuspenseWrapper>,
                  },
                ],
              },
            ],
          },
          // Flat campaigns list (sidebar)
          {
            path: ROUTES.CAMPAIGNS,
            element: <SuspenseWrapper><CampaignsListPage /></SuspenseWrapper>,
          },
          // Campaign compare
          {
            path: ROUTES.CAMPAIGN_COMPARE,
            element: <SuspenseWrapper><CampaignComparisonPage /></SuspenseWrapper>,
          },
          // Flat posts list (sidebar)
          {
            path: ROUTES.POSTS,
            element: <SuspenseWrapper><PostsListPage /></SuspenseWrapper>,
          },
          // Profiles
          {
            element: <RoleGuard allowedRoles={['admin', 'internal_user', 'authorized_user']} />,
            children: [
              {
                path: ROUTES.PROFILES,
                element: <SuspenseWrapper><ProfilesListPage /></SuspenseWrapper>,
              },
              {
                path: ROUTES.PROFILE_NEW,
                element: <SuspenseWrapper><AddProfilePage /></SuspenseWrapper>,
              },
              {
                path: ROUTES.CATEGORIES,
                element: <SuspenseWrapper><CategoriesPage /></SuspenseWrapper>,
              },
              {
                path: ROUTES.TIERS,
                element: <SuspenseWrapper><TiersPage /></SuspenseWrapper>,
              },
              {
                path: ROUTES.PROFILE_DETAIL,
                element: <SuspenseWrapper><ProfileDetailPage /></SuspenseWrapper>,
              },
            ],
          },
          // My Account — accessible to all authenticated users
          {
            path: ROUTES.MY_ACCOUNT,
            element: <SuspenseWrapper><MyAccountPage /></SuspenseWrapper>,
          },
          // Admin (admin only)
          {
            element: <RoleGuard allowedRoles={['admin']} />,
            children: [
              {
                path: ROUTES.ADMIN,
                element: <SuspenseWrapper><AdminPanelPage /></SuspenseWrapper>,
              },
              {
                path: ROUTES.ADMIN_SETTINGS,
                element: <SuspenseWrapper><AdminSettingsPage /></SuspenseWrapper>,
              },
            ],
          },
        ],
      },
    ],
  },
  {
    path: '*',
    element: <SuspenseWrapper><NotFoundPage /></SuspenseWrapper>,
  },
])
