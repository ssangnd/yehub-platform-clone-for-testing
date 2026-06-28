import * as React from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { NavUser } from '@/components/nav-user'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarTrigger,
  useSidebar,
} from '@/components/ui/sidebar'
import { FolderIcon, MegaphoneIcon, UsersIcon, FileTextIcon, WalletIcon, ChevronDownIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/store/auth.store'
import { useSystemLogo } from '@/hooks/use-system-logo'
import { useCanGlobal } from '@/hooks/use-can'
import { ROUTES } from '@/lib/constants/routes'

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const location = useLocation()
  const user = useAuthStore((s) => s.user)
  const isAdmin = user?.role === 'ADMIN'
  const canViewProfiles = useCanGlobal('view_profiles', user?.role ?? null)
  const [profilesOpen, setProfilesOpen] = React.useState(false)
  const { isMobile, setOpenMobile } = useSidebar()
  const { url: logoUrl } = useSystemLogo()

  function isActive(to: string, exact = false) {
    if (exact) return location.pathname === to
    return location.pathname === to || location.pathname.startsWith(to + '/')
  }

  function closeMobileSidebar() {
    if (isMobile) setOpenMobile(false)
  }

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader className="flex flex-row items-center p-2 gap-2">
        <div className="flex items-center group-data-[collapsible=icon]:hidden flex-1 min-w-0 overflow-hidden pl-1">
          <img src={logoUrl} alt="YeHub" className="h-8 max-w-full object-contain" />
        </div>
        <SidebarTrigger className="shrink-0 ml-auto group-data-[collapsible=icon]:ml-0" />
      </SidebarHeader>

      <SidebarContent>
        <SidebarMenu className="px-2 py-1 gap-0.5">
          <SidebarMenuItem>
            <SidebarMenuButton
              tooltip="Projects"
              isActive={isActive(ROUTES.PROJECTS)}
              render={<NavLink to={ROUTES.PROJECTS} />}
              onClick={closeMobileSidebar}
            >
              <FolderIcon />
              <span>Projects</span>
            </SidebarMenuButton>
          </SidebarMenuItem>

          <SidebarMenuItem>
            <SidebarMenuButton
              tooltip="Campaigns"
              isActive={isActive(ROUTES.CAMPAIGNS)}
              render={<NavLink to={ROUTES.CAMPAIGNS} />}
              onClick={closeMobileSidebar}
            >
              <MegaphoneIcon />
              <span>Campaigns</span>
            </SidebarMenuButton>
          </SidebarMenuItem>

          {canViewProfiles && (
            <SidebarMenuItem>
              <SidebarMenuButton tooltip="Profiles" onClick={() => setProfilesOpen((v) => !v)}>
                <UsersIcon />
                <span>Profiles</span>
                <ChevronDownIcon
                  className={cn(
                    'ml-auto size-4 shrink-0 transition-transform duration-200',
                    profilesOpen && 'rotate-180',
                  )}
                />
              </SidebarMenuButton>
              {profilesOpen && (
                <SidebarMenuSub>
                  <SidebarMenuSubItem>
                    <SidebarMenuSubButton
                      isActive={isActive(ROUTES.PROFILES)}
                      render={<NavLink to={ROUTES.PROFILES} />}
                      onClick={closeMobileSidebar}
                    >
                      All Profiles
                    </SidebarMenuSubButton>
                  </SidebarMenuSubItem>
                  <SidebarMenuSubItem>
                    <SidebarMenuSubButton
                      isActive={isActive(ROUTES.PROFILES_CATEGORIES)}
                      render={<NavLink to={ROUTES.PROFILES_CATEGORIES} />}
                      onClick={closeMobileSidebar}
                    >
                      Categories
                    </SidebarMenuSubButton>
                  </SidebarMenuSubItem>
                  <SidebarMenuSubItem>
                    <SidebarMenuSubButton
                      isActive={isActive(ROUTES.PROFILES_TIERS)}
                      render={<NavLink to={ROUTES.PROFILES_TIERS} />}
                      onClick={closeMobileSidebar}
                    >
                      Tiers
                    </SidebarMenuSubButton>
                  </SidebarMenuSubItem>
                </SidebarMenuSub>
              )}
            </SidebarMenuItem>
          )}

          <SidebarMenuItem>
            <SidebarMenuButton
              tooltip="Posts"
              isActive={isActive(ROUTES.POSTS)}
              render={<NavLink to={ROUTES.POSTS} />}
              onClick={closeMobileSidebar}
            >
              <FileTextIcon />
              <span>Posts</span>
            </SidebarMenuButton>
          </SidebarMenuItem>

          {isAdmin && (
            <>
              <SidebarMenuItem>
                <SidebarMenuButton
                  tooltip="Users"
                  isActive={isActive(ROUTES.USERS)}
                  render={<NavLink to={ROUTES.USERS} />}
                  onClick={closeMobileSidebar}
                >
                  <UsersIcon />
                  <span>Users</span>
                </SidebarMenuButton>
              </SidebarMenuItem>

              <SidebarMenuItem>
                <SidebarMenuButton
                  tooltip="Cost Explorer"
                  isActive={isActive(ROUTES.COST)}
                  render={<NavLink to={ROUTES.COST} />}
                  onClick={closeMobileSidebar}
                >
                  <WalletIcon />
                  <span>Cost Explorer</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </>
          )}
        </SidebarMenu>
      </SidebarContent>

      <SidebarFooter>
        <NavUser />
      </SidebarFooter>
    </Sidebar>
  )
}
