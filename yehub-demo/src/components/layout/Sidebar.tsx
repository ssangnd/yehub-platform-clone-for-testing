import { useState } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import {
  Home, LayoutDashboard, FolderKanban, Megaphone, Star, FileText, UsersRound,
  PanelLeftClose, PanelLeftOpen, ChevronDown, Tag, Award, LogOut, Settings, Moon, Sun,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { ROUTES } from '@/lib/constants/routes'
import { hasGlobalModuleAccess } from '@/lib/constants/roles'
import { useAuth } from '@/hooks/useAuth'
import { useTheme } from '@/hooks/useTheme'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Sheet, SheetContent } from '@/components/ui/sheet'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

interface SidebarProps {
  collapsed: boolean
  onToggle: () => void
  mobileOpen: boolean
  onMobileClose: () => void
}

interface NavItem {
  label: string
  path: string
  icon: React.ComponentType<{ className?: string }>
  children?: NavItem[]
}

const mainNav: NavItem[] = [
  { label: 'Home', path: ROUTES.HOME, icon: Home },
  { label: 'Dashboard', path: ROUTES.DASHBOARD, icon: LayoutDashboard },
  { label: 'Projects', path: ROUTES.PROJECTS, icon: FolderKanban },
  { label: 'Campaigns', path: ROUTES.CAMPAIGNS, icon: Megaphone },
  {
    label: 'Profiles', path: ROUTES.PROFILES, icon: Star,
    children: [
      { label: 'Categories', path: ROUTES.CATEGORIES, icon: Tag },
      { label: 'Tiers', path: ROUTES.TIERS, icon: Award },
    ],
  },
  { label: 'Posts', path: ROUTES.POSTS, icon: FileText },
]

const adminNav: NavItem[] = [
  { label: 'Users', path: ROUTES.ADMIN, icon: UsersRound },
]

function NavItemLink({ item, collapsed }: { item: NavItem; collapsed: boolean }) {
  const location = useLocation()
  const navigate = useNavigate()
  const isCampaignDetail = location.pathname.includes('/campaigns/')
  const isInSection = !!(item.children && location.pathname.startsWith(item.path))
  const isActive = item.path === ROUTES.CAMPAIGNS
    ? location.pathname === item.path || isCampaignDetail
    : item.path === ROUTES.PROJECTS
      ? location.pathname.startsWith(item.path) && !isCampaignDetail
      : location.pathname === item.path || isInSection

  if (item.children && !collapsed) {
    return (
      <div>
        <button
          type="button"
          onClick={() => navigate(item.path)}
          className={cn(
            'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors duration-150 cursor-pointer',
            'hover:bg-accent hover:text-accent-foreground',
            isActive ? 'bg-primary/10 text-primary' : 'text-muted-foreground',
          )}
        >
          <item.icon className="h-5 w-5 shrink-0" />
          <span className="flex-1 text-left">{item.label}</span>
          <ChevronDown className={cn('h-4 w-4 shrink-0 transition-transform duration-200', isInSection && 'rotate-180')} />
        </button>
        {isInSection && (
          <div className="ml-4 mt-0.5 space-y-0.5 border-l pl-2">
            {item.children.map(child => (
              <NavLink
                key={child.path}
                to={child.path}
                className={({ isActive }) => cn(
                  'flex items-center gap-2.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors duration-150 cursor-pointer',
                  'hover:bg-accent hover:text-accent-foreground',
                  isActive ? 'bg-primary/10 text-primary' : 'text-muted-foreground',
                )}
              >
                <child.icon className="h-4 w-4 shrink-0" />
                <span>{child.label}</span>
              </NavLink>
            ))}
          </div>
        )}
      </div>
    )
  }

  if (collapsed) {
    return (
      <div className="flex justify-center">
        <NavLink
          to={item.path}
          end={!item.children && item.path === '/'}
          className={() => cn(
            'group/nav relative flex items-center justify-center h-10 w-10 rounded-lg transition-colors duration-150 cursor-pointer',
            'hover:bg-accent hover:text-accent-foreground',
            isActive ? 'bg-primary/10 text-primary' : 'text-muted-foreground',
          )}
        >
          <item.icon className="h-5 w-5" />
          <span className="pointer-events-none absolute left-full ml-2 rounded-md bg-popover px-2 py-1 text-xs font-medium text-popover-foreground shadow-md border opacity-0 group-hover/nav:opacity-100 transition-opacity whitespace-nowrap z-50">
            {item.label}
          </span>
        </NavLink>
      </div>
    )
  }

  return (
    <NavLink
      to={item.path}
      end={item.path === '/'}
      className={() => cn(
        'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors duration-150 cursor-pointer',
        'hover:bg-accent hover:text-accent-foreground',
        isActive ? 'bg-primary/10 text-primary' : 'text-muted-foreground',
      )}
    >
      <item.icon className="h-5 w-5 shrink-0" />
      <span>{item.label}</span>
    </NavLink>
  )
}

function NavSection({ items, label, collapsed }: { items: NavItem[]; label?: string; collapsed: boolean }) {
  return (
    <div className={collapsed ? 'space-y-2' : 'space-y-1'}>
      {label && !collapsed && (
        <p className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {label}
        </p>
      )}
      {items.map((item) => (
        <NavItemLink key={item.path} item={item} collapsed={collapsed} />
      ))}
    </div>
  )
}

function UserProfile({ collapsed }: { collapsed: boolean }) {
  const { user, logout } = useAuth()
  const { theme, toggleTheme } = useTheme()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)

  const initials = user?.name
    ?.split(' ')
    .map(n => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase() || 'U'

  const isAdmin = user?.globalRole === 'admin'

  if (collapsed) {
    return (
      <button
        type="button"
        onClick={() => navigate(ROUTES.MY_ACCOUNT)}
        className="group/profile flex items-center justify-center h-10 w-10 mx-auto rounded-lg transition-colors duration-150 cursor-pointer hover:bg-accent hover:text-accent-foreground"
      >
        <Avatar className="h-8 w-8 shrink-0">
          <AvatarImage src={user?.avatar} alt={user?.name} />
          <AvatarFallback className="text-xs">{initials}</AvatarFallback>
        </Avatar>
      </button>
    )
  }

  return (
    <div className="flex items-center gap-1">
      {/* Left zone: navigate to my-account */}
      <button
        type="button"
        onClick={() => navigate(ROUTES.MY_ACCOUNT)}
        className="flex flex-1 items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors duration-150 cursor-pointer hover:bg-accent hover:text-accent-foreground min-w-0"
      >
        <Avatar className="h-8 w-8 shrink-0">
          <AvatarImage src={user?.avatar} alt={user?.name} />
          <AvatarFallback className="text-xs">{initials}</AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{user?.name}</p>
          <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
        </div>
      </button>

      {/* Right zone: chevron opens dropdown */}
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors duration-150 cursor-pointer hover:bg-accent hover:text-accent-foreground"
          >
            <ChevronDown className={cn('h-4 w-4 transition-transform duration-200', open && 'rotate-180')} />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent side="top" align="end" className="w-56">
          {isAdmin && (
            <DropdownMenuItem onClick={() => navigate(ROUTES.ADMIN_SETTINGS)} className="cursor-pointer">
              <Settings className="mr-2 h-4 w-4" />
              Settings
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onClick={(e) => { e.preventDefault(); toggleTheme() }} className="cursor-pointer">
            {theme === 'dark' ? <Sun className="mr-2 h-4 w-4" /> : <Moon className="mr-2 h-4 w-4" />}
            {theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={logout} className="cursor-pointer text-destructive">
            <LogOut className="mr-2 h-4 w-4" />
            Log out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

function SidebarContent({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const { user } = useAuth()
  const globalRole = user?.globalRole
  const visibleMainNav = mainNav.filter(item => {
    if (item.path === ROUTES.DASHBOARD) return globalRole && hasGlobalModuleAccess(globalRole, 'dashboard', 'read')
    if (item.path === ROUTES.PROFILES) return globalRole && hasGlobalModuleAccess(globalRole, 'profiles', 'read')
    return true
  })
  const showAdmin = globalRole && hasGlobalModuleAccess(globalRole, 'users', 'read')

  return (
    <div className="flex h-full flex-col">
      {/* Header: logo + collapse toggle */}
      <div className={cn(
        'flex h-14 items-center border-b px-4',
        collapsed ? 'justify-center' : 'justify-between'
      )}>
        {collapsed ? (
          <Button
            variant="ghost"
            size="icon"
            onClick={onToggle}
            className="hidden md:flex h-8 w-8 cursor-pointer"
            aria-label="Expand sidebar"
          >
            <PanelLeftOpen className="h-4 w-4" />
          </Button>
        ) : (
          <>
            <img
              src="/logo.png"
              alt="Yehub &amp; Partners"
              className="h-8 w-auto object-contain object-left"
            />
            <Button
              variant="ghost"
              size="icon"
              onClick={onToggle}
              className="hidden md:flex h-8 w-8 cursor-pointer shrink-0"
              aria-label="Collapse sidebar"
            >
              <PanelLeftClose className="h-4 w-4" />
            </Button>
          </>
        )}
      </div>

      {/* Navigation */}
      {collapsed ? (
        <div className="flex-1 py-4 overflow-visible">
          <nav className="space-y-1">
            <NavSection items={visibleMainNav} collapsed={collapsed} />
            {showAdmin && (
              <>
                <Separator className="my-3" />
                <NavSection items={adminNav} collapsed={collapsed} />
              </>
            )}
          </nav>
        </div>
      ) : (
        <ScrollArea className="flex-1 px-2 py-4">
          <nav className="space-y-1">
            <NavSection items={visibleMainNav} collapsed={collapsed} />
            {showAdmin && (
              <>
                <Separator className="my-3" />
                <NavSection items={adminNav} collapsed={collapsed} />
              </>
            )}
          </nav>
        </ScrollArea>
      )}

      {/* User profile at bottom */}
      <div className="border-t p-2">
        <UserProfile collapsed={collapsed} />
      </div>
    </div>
  )
}

export function Sidebar({ collapsed, onToggle, mobileOpen, onMobileClose }: SidebarProps) {
  return (
    <>
      {/* Desktop sidebar */}
      <aside className={cn(
        'hidden md:flex flex-col border-r bg-sidebar transition-all duration-200 z-30 overflow-visible',
        collapsed ? 'w-16' : 'w-64'
      )}>
        <SidebarContent collapsed={collapsed} onToggle={onToggle} />
      </aside>

      {/* Mobile sidebar */}
      <Sheet open={mobileOpen} onOpenChange={onMobileClose}>
        <SheetContent side="left" className="w-64 p-0">
          <SidebarContent collapsed={false} onToggle={onMobileClose} />
        </SheetContent>
      </Sheet>
    </>
  )
}
