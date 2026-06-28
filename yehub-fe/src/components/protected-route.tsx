import { useState } from 'react'
import { Navigate, Outlet } from 'react-router-dom'
import { useAuthGuard } from '@/hooks/use-auth-guard'
import { AppSidebar } from '@/components/app-sidebar'
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar'
import { ROUTES } from '@/lib/constants/routes'
import { PageTitleContext } from '@/hooks/use-page-title'

export function ProtectedRoute() {
  const { isLoading, isAuthenticated } = useAuthGuard()
  const [title, setTitle] = useState('')

  if (!isAuthenticated) {
    return <Navigate to={ROUTES.LOGIN} replace />
  }

  if (isLoading) {
    return null
  }

  return (
    <PageTitleContext.Provider value={{ title, setTitle }}>
      <SidebarProvider
        style={
          {
            '--sidebar-width': 'calc(var(--spacing) * 60)',
          } as React.CSSProperties
        }
      >
        <AppSidebar />
        <SidebarInset>
          <div className="flex flex-1 flex-col">
            <div className="flex items-center p-2 md:hidden">
              <SidebarTrigger />
            </div>
            <Outlet />
          </div>
        </SidebarInset>
      </SidebarProvider>
    </PageTitleContext.Provider>
  )
}
