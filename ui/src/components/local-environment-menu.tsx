import * as React from "react"
import { ComputerIcon } from "lucide-react"

import { useTheme } from "@/components/theme-provider"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import { getHealth, useApiQuery } from "@/lib/api"

type ThemeMode = "light" | "dark" | "system"

function isThemeMode(value: string): value is ThemeMode {
  return value === "light" || value === "dark" || value === "system"
}

export function LocalEnvironmentMenu() {
  const { theme, setTheme } = useTheme()
  const request = React.useCallback((signal?: AbortSignal) => getHealth(signal), [])
  const health = useApiQuery("local-environment-health", request, {
    pollMs: 10_000,
  })
  const status = health.loading
    ? "Verificando"
    : health.error || !health.data?.ok
      ? "Bridge indisponível"
      : "Bridge online"

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton size="lg" aria-label="Ambiente local">
              <ComputerIcon />
              <span className="flex min-w-0 flex-col items-start">
                <span>Ambiente local</span>
                <span className="text-xs text-muted-foreground">{status}</span>
              </span>
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            side="top"
            align="start"
            collisionPadding={16}
            className="min-w-56"
          >
            <DropdownMenuLabel>Estado da Bridge</DropdownMenuLabel>
            <div className="px-2 pb-1 text-sm text-muted-foreground">{status}</div>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>Tema</DropdownMenuLabel>
            <DropdownMenuRadioGroup
              value={theme}
              onValueChange={(value) => {
                if (isThemeMode(value)) {
                  setTheme(value)
                }
              }}
            >
              <DropdownMenuRadioItem value="light">Claro</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="dark">Escuro</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="system">Sistema</DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
