import type { AppRoute } from "@/components/app-routes"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import {
  ActivityIcon,
  BarChart3Icon,
  GitBranchIcon,
  type LucideIcon,
} from "lucide-react"

type PlaceholderCopy = {
  title: string
  description: string
  icon: LucideIcon
}

const placeholderCopy: Record<AppRoute, PlaceholderCopy> = {
  status: {
    title: "Aguardando a API do CI Queue",
    description:
      "A execução atual, a fila e o histórico aparecerão aqui quando a bridge estiver disponível.",
    icon: ActivityIcon,
  },
  worktrees: {
    title: "Aguardando worktrees observadas",
    description:
      "A lista de worktrees aparecerá aqui quando a bridge expuser o inventário do projeto.",
    icon: GitBranchIcon,
  },
  analysis: {
    title: "Aguardando dados de análise",
    description:
      "As estatísticas e os problemas observados aparecerão aqui quando houver registros da fila.",
    icon: BarChart3Icon,
  },
}

export function RoutePlaceholder({ route }: { route: AppRoute }) {
  const { title, description, icon: Icon } = placeholderCopy[route]

  return (
    <div className="flex flex-1 p-4 lg:p-6">
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Icon />
          </EmptyMedia>
          <EmptyTitle>{title}</EmptyTitle>
          <EmptyDescription>{description}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    </div>
  )
}
