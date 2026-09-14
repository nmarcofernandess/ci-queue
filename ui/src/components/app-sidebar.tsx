import type * as React from "react"

import type { AppRoute } from "@/components/app-routes"
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
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@/components/ui/toggle-group"
import { useTheme } from "@/components/theme-provider"
import {
  ActivityIcon,
  BarChart3Icon,
  CircleDashedIcon,
  GitBranchIcon,
  MonitorIcon,
  MoonIcon,
  ServerCogIcon,
  SunIcon,
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

type ThemeMode = "light" | "dark" | "system"

function isThemeMode(value: string): value is ThemeMode {
  return value === "light" || value === "dark" || value === "system"
}

function ThemeModeToggle() {
  const { theme, setTheme } = useTheme()

  return (
    <ToggleGroup
      type="single"
      value={theme}
      onValueChange={(value) => {
        if (isThemeMode(value)) {
          setTheme(value)
        }
      }}
      size="sm"
      aria-label="Tema da interface"
    >
      <Tooltip>
        <TooltipTrigger asChild>
          <ToggleGroupItem value="light" aria-label="Tema claro">
            <SunIcon />
            <span className="sr-only">Claro</span>
          </ToggleGroupItem>
        </TooltipTrigger>
        <TooltipContent side="top" sideOffset={6}>
          Claro
        </TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <ToggleGroupItem value="dark" aria-label="Tema escuro">
            <MoonIcon />
            <span className="sr-only">Escuro</span>
          </ToggleGroupItem>
        </TooltipTrigger>
        <TooltipContent side="top" sideOffset={6}>
          Escuro
        </TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <ToggleGroupItem value="system" aria-label="Tema do sistema">
            <MonitorIcon />
            <span className="sr-only">Sistema</span>
          </ToggleGroupItem>
        </TooltipTrigger>
        <TooltipContent side="top" sideOffset={6}>
          Sistema
        </TooltipContent>
      </Tooltip>
    </ToggleGroup>
  )
}

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
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild>
              <div aria-label="Bridge sem leitura">
                <CircleDashedIcon />
                <span>Bridge sem leitura</span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
        <ThemeModeToggle />
      </SidebarFooter>
    </Sidebar>
  )
}
