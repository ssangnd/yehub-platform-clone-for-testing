import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '@/lib/constants/query-keys'
import { ROUTES } from '@/lib/constants/routes'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar } from '@/components/ui/sidebar'
import { EllipsisVerticalIcon, LogOutIcon, MoonIcon, SunIcon, SettingsIcon } from 'lucide-react'
import { useAuthStore } from '@/store/auth.store'
import { useThemeStore } from '@/store/theme.store'
import { useCanGlobal } from '@/hooks/use-can'
import { usePresignedUrl } from '@/hooks/use-presigned-url'
import { authApi } from '@/api/auth'

export function NavUser() {
  const { isMobile, setOpenMobile } = useSidebar()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { user, clearAuth } = useAuthStore()
  const { theme, toggleTheme } = useThemeStore()
  const canManageUsers = useCanGlobal('manage_users', user?.role ?? null)
  const { url: avatarUrl } = usePresignedUrl(user?.avatar)
  const [logoutDialogOpen, setLogoutDialogOpen] = useState(false)
  const [isLoggingOut, setIsLoggingOut] = useState(false)

  function closeMobileSidebar() {
    if (isMobile) setOpenMobile(false)
  }

  function handleMyAccountClick() {
    closeMobileSidebar()
    navigate(ROUTES.MY_ACCOUNT)
  }

  function handleSettingsClick() {
    closeMobileSidebar()
    navigate(ROUTES.SETTINGS)
  }

  function handleThemeToggle() {
    closeMobileSidebar()
    toggleTheme()
  }

  function handleLogoutClick() {
    setLogoutDialogOpen(true)
  }

  const initials = user?.name
    ? user.name
        .split(' ')
        .map((n) => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2)
    : '??'

  async function handleLogout() {
    setIsLoggingOut(true)
    try {
      await authApi.logout()
    } catch {
      // proceed with local logout even if the server call fails
    }
    queryClient.removeQueries({ queryKey: queryKeys.me })
    navigate(ROUTES.LOGIN)
    clearAuth()
  }

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger render={<SidebarMenuButton size="lg" className="aria-expanded:bg-muted" />}>
            <Avatar className="size-8 rounded-lg">
              <AvatarImage src={avatarUrl} alt={user?.name} />
              <AvatarFallback className="rounded-lg">{initials}</AvatarFallback>
            </Avatar>
            <div className="grid flex-1 text-left text-sm leading-tight">
              <span className="truncate font-medium">{user?.name}</span>
              <span className="truncate text-xs text-foreground/70">{user?.email}</span>
            </div>
            <EllipsisVerticalIcon className="ml-auto size-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent className="min-w-56" side={isMobile ? 'bottom' : 'right'} align="end" sideOffset={4}>
            <DropdownMenuItem className="flex items-center gap-2 p-1.5" onClick={handleMyAccountClick}>
              <Avatar className="size-8">
                <AvatarImage src={avatarUrl} alt={user?.name} />
                <AvatarFallback className="rounded-lg">{initials}</AvatarFallback>
              </Avatar>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-medium">{user?.name}</span>
                <span className="truncate text-xs text-muted-foreground">{user?.email}</span>
              </div>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            {canManageUsers && (
              <DropdownMenuItem onClick={handleSettingsClick}>
                <SettingsIcon />
                Settings
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onClick={handleThemeToggle}>
              {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
              {theme === 'dark' ? 'Light mode' : 'Dark mode'}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleLogoutClick}>
              <LogOutIcon />
              Log out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>

      <Dialog
        open={logoutDialogOpen}
        onOpenChange={(next) => {
          if (isLoggingOut) return
          setLogoutDialogOpen(next)
        }}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Log out?</DialogTitle>
            <DialogDescription>
              You will be signed out of your account and returned to the login page.
            </DialogDescription>
          </DialogHeader>
          <div className="mt-2 flex justify-end gap-3">
            <Button variant="outline" onClick={() => setLogoutDialogOpen(false)} disabled={isLoggingOut}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleLogout} disabled={isLoggingOut}>
              {isLoggingOut ? 'Logging out…' : 'Log out'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </SidebarMenu>
  )
}
