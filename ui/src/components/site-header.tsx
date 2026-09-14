import type { AppRoute } from "@/components/app-routes"
import { Separator } from "@/components/ui/separator"
import { SidebarTrigger } from "@/components/ui/sidebar"

const routeTitles: Record<AppRoute, string> = {
  status: "Status",
  worktrees: "Worktrees",
  analysis: "Análise",
}

export function SiteHeader({ route }: { route: AppRoute }) {
  return (
    <header className="flex h-(--header-height) shrink-0 items-center gap-2 border-b transition-[width,height] ease-linear">
      <div className="flex w-full items-center gap-1 px-4 lg:px-6">
        <SidebarTrigger />
        <Separator
          orientation="vertical"
          className="mx-2 data-[orientation=vertical]:h-4"
        />
        <span className="text-sm font-medium">{routeTitles[route]}</span>
      </div>
    </header>
  )
}
