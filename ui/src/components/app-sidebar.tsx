import * as React from "react"

import type { AppRoute } from "@/components/app-routes"
import { LocalEnvironmentMenu } from "@/components/local-environment-menu"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import {
  ActivityIcon,
  BarChart3Icon,
  GitBranchIcon,
  ServerCogIcon,
} from "lucide-react"

type NavigationItem = {
  route: AppRoute
  label: string
  icon: React.ElementType
}

const navigationItems: NavigationItem[] = [
  { route: "status", label: "Status", icon: ActivityIcon },
  { route: "worktrees", label: "Worktrees", icon: GitBranchIcon },
  { route: "analysis", label: "Análise", icon: BarChart3Icon },
]

export function AppSidebar({
  activeRoute,
  ...props
}: React.ComponentProps<typeof Sidebar> & { activeRoute: AppRoute }) {
  return (
    <Sidebar {...props} variant="inset" collapsible="offcanvas">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild size="lg">
              <a href="#status" aria-label="Abrir Status do CI Queue">
                <ServerCogIcon />
                <span className="font-semibold">CI Queue</span>
              </a>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {navigationItems.map((item) => {
                const Icon = item.icon

                return (
                  <SidebarMenuItem key={item.route}>
                    <SidebarMenuButton
                      asChild
                      isActive={activeRoute === item.route}
                      tooltip={item.label}
                    >
                      <a href={`#${item.route}`}>
                        <Icon />
                        <span>{item.label}</span>
                      </a>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <LocalEnvironmentMenu />
      </SidebarFooter>
    </Sidebar>
  )
}
