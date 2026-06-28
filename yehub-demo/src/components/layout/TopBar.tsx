import { useNavigate, useLocation } from 'react-router-dom'
import { Menu, Sun, Moon, LogOut, Settings } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { useTheme } from '@/hooks/useTheme'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ROUTES } from '@/lib/constants/routes'

interface TopBarProps {
  onMenuClick: () => void
}

function getBreadcrumb(pathname: string): string {
  const segments = pathname.split('/').filter(Boolean)
  if (segments.length === 0) return 'Dashboard'
  const labels: Record<string, string> = {
    projects: 'Projects',
    campaigns: 'Campaigns',
    posts: 'Posts',
    comments: 'Comments',
    profiles: 'Profiles',
    insights: 'Insights',
    sentiment: 'Sentiment',
    emotions: 'Emotions',
    topics: 'Topics',
    'pain-points': 'Pain Points',
    'cultural-signals': 'Cultural Signals',
    alerts: 'Alerts',
    'my-account': 'My Account',
    settings: 'Settings',
    admin: 'Admin',
    compare: 'Compare',
    members: 'Members',
  }
  // Skip ID-like segments (e.g. proj-1, camp-1, post-1, UUIDs)
  return segments
    .filter(s => !!labels[s])
    .map(s => labels[s])
    .join(' / ')
}

export function TopBar({ onMenuClick }: TopBarProps) {
  const { user, logout } = useAuth()
  const { theme, toggleTheme } = useTheme()
  const navigate = useNavigate()
  const location = useLocation()

  const initials = user?.name
    ?.split(' ')
    .map(n => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase() || 'U'
  const isAdmin = user?.globalRole === 'admin'

  return (
    <header className="flex h-14 items-center justify-between border-b bg-background px-4">
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          size="icon"
          className="md:hidden cursor-pointer"
          onClick={onMenuClick}
          aria-label="Open menu"
        >
          <Menu className="h-5 w-5" />
        </Button>
        <h1 className="font-mono text-sm font-medium text-muted-foreground">
          {getBreadcrumb(location.pathname)}
        </h1>
      </div>

      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          onClick={toggleTheme}
          className="cursor-pointer"
          aria-label="Toggle theme"
        >
          {theme === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="relative h-8 w-8 rounded-full cursor-pointer">
              <Avatar className="h-8 w-8">
                <AvatarImage src={user?.avatar} alt={user?.name} />
                <AvatarFallback className="text-xs">{initials}</AvatarFallback>
              </Avatar>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <div className="flex items-center gap-2 p-2">
              <Avatar className="h-8 w-8">
                <AvatarImage src={user?.avatar} alt={user?.name} />
                <AvatarFallback className="text-xs">{initials}</AvatarFallback>
              </Avatar>
              <div className="flex flex-col space-y-0.5">
                <p className="text-sm font-medium">{user?.name}</p>
                <p className="text-xs text-muted-foreground">{user?.email}</p>
              </div>
            </div>
            <DropdownMenuSeparator />
            {isAdmin && (
              <DropdownMenuItem onClick={() => navigate(ROUTES.ADMIN_SETTINGS)} className="cursor-pointer">
                <Settings className="mr-2 h-4 w-4" />
                Settings
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={logout} className="cursor-pointer text-destructive">
              <LogOut className="mr-2 h-4 w-4" />
              Log out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}
