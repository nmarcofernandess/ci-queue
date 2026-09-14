import { SidebarTrigger } from "@/components/ui/sidebar"
import { ServerCogIcon } from "lucide-react"

export function SiteHeader() {
  return (
    <header className="flex h-(--header-height) shrink-0 items-center gap-2 border-b transition-[width,height] ease-linear">
      <div className="flex w-full items-center gap-2 px-4 lg:px-6">
        <SidebarTrigger className="-ml-1" />
        <a
          href="#status"
          className="flex items-center gap-2 text-sm font-medium"
          aria-label="Abrir Status do CI Queue"
        >
          <ServerCogIcon aria-hidden="true" className="size-4" />
          <span>CI Queue</span>
        </a>
      </div>
    </header>
  )
}
