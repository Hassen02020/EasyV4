import { defineConfig } from "vitest/config"
import path from "path"

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
  test: {
    include: ["lib/**/__tests__/**/*.test.ts", "tests/**/*.test.ts"],
    globals: false,
    environment: "node",
    // Les tests utilisent `node:test` — Vitest est compatible natif
  },
})
