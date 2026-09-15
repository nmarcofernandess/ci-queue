import path from "path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

// https://vite.dev/config/
const apiOrigin = process.env.CI_QUEUE_API_ORIGIN ?? "http://127.0.0.1:18876"

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
  server: {
    proxy: {
      "/api": { target: apiOrigin, changeOrigin: false },
      "/health": { target: apiOrigin, changeOrigin: false },
    },
  },
})
