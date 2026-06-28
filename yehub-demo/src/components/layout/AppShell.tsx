import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import { Menu } from 'lucide-react'
import { Sidebar } from './Sidebar'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export function AppShell() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true)
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Skip to content - accessibility */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:top-2 focus:left-2 focus:bg-primary focus:text-primary-foreground focus:px-4 focus:py-2 focus:rounded-md focus:text-sm focus:font-medium"
      >
        Skip to content
      </a>
      <Sidebar
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
        mobileOpen={mobileSidebarOpen}
        onMobileClose={() => setMobileSidebarOpen(false)}
      />
      <div className="flex flex-1 flex-col overflow-hidden min-w-0">
        {/* Mobile menu button */}
        <Button
          variant="ghost"
          size="icon"
          className="md:hidden absolute top-3 left-3 z-40 h-9 w-9 cursor-pointer"
          onClick={() => setMobileSidebarOpen(true)}
          aria-label="Open menu"
        >
          <Menu className="h-5 w-5" />
        </Button>
        <main
          id="main-content"
          className={cn(
            'flex-1 overflow-y-auto overscroll-contain min-h-0 p-4 md:p-6',
            'transition-all duration-200'
          )}
        >
          <Outlet />
        </main>
      </div>
    </div>
  )
}
