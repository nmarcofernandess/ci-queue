import * as React from "react"

import { AppSidebar } from "@/components/app-sidebar"
import {
  type AppRoute,
  appRouteLabels,
  appRoutes,
} from "@/components/app-routes"
import { RouteContent } from "@/components/app-routes"
import { SiteHeader } from "@/components/site-header"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { Toaster } from "@/components/ui/sonner"
import { TooltipProvider } from "@/components/ui/tooltip"
import {
  ProjectProvider,
  ProjectScopeBoundary,
} from "@/features/projects/project-context"
import { ProjectManagerDrawer } from "@/features/projects/project-manager-drawer"

function routeFromHash(hash: string): AppRoute {
  const candidate = hash.replace(/^#/, "").replace(/^\//, "")

  return appRoutes.find((route) => route === candidate) ?? "status"
}

function useHashRoute() {
  const [route, setRoute] = React.useState<AppRoute>(() =>
    routeFromHash(window.location.hash)
  )

  React.useEffect(() => {
    const handleHashChange = () => setRoute(routeFromHash(window.location.hash))

    window.addEventListener("hashchange", handleHashChange)
    return () => window.removeEventListener("hashchange", handleHashChange)
  }, [])

  return route
}

export function App() {
  const route = useHashRoute()
  const [managingProjects, setManagingProjects] = React.useState(false)

  return (
    <TooltipProvider>
      <ProjectProvider onManage={() => setManagingProjects(true)}>
        <SidebarProvider
          style={
            {
              "--sidebar-width": "calc(var(--spacing) * 72)",
              "--header-height": "calc(var(--spacing) * 12)",
            } as React.CSSProperties
          }
        >
          <AppSidebar activeRoute={route} />
          <SidebarInset className="min-w-0">
            <SiteHeader
              title={appRouteLabels[route]}
              onManageProjects={() => setManagingProjects(true)}
            />
            <ProjectScopeBoundary>
              <RouteContent route={route} />
            </ProjectScopeBoundary>
            {managingProjects ? (
              <ProjectManagerDrawer onClose={() => setManagingProjects(false)} />
            ) : null}
          </SidebarInset>
        </SidebarProvider>
      </ProjectProvider>
      <Toaster position="top-right" />
    </TooltipProvider>
  )
}

export default App
