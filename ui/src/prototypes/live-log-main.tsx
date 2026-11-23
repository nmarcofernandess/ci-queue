import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { ThemeProvider } from "@/components/theme-provider"
import { LiveLogPrototype } from "./live-log"
import "./live-log.css"

export { createAgent } from "@ui-sdk/react/agent"

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider storageKey="ci-queue-log-prototype-theme">
      <LiveLogPrototype />
    </ThemeProvider>
  </StrictMode>
)
