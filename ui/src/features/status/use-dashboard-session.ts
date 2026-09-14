import * as React from "react"

import { getDashboardSession, useApiQuery } from "@/lib/api"

export function useDashboardSession() {
  const request = React.useCallback(() => getDashboardSession(), [])
  return useApiQuery("dashboard-session", request)
}
