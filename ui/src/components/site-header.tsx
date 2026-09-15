import { SidebarTrigger } from "@/components/ui/sidebar"
import { ProjectSwitcher } from "@/features/projects/project-switcher"

export function SiteHeader({
  title,
  onManageProjects,
}: {
  title: string
  onManageProjects: () => void
}) {
  return (
    <header className="flex h-(--header-height) shrink-0 items-center gap-2 border-b transition-[width,height] ease-linear">
      <div className="flex w-full min-w-0 items-center gap-2 px-4 lg:px-6">
        <SidebarTrigger className="-ml-1" />
        <span className="min-w-0 flex-1 truncate text-sm font-medium">{title}</span>
        <ProjectSwitcher onManage={onManageProjects} />
      </div>
    </header>
  )
}
