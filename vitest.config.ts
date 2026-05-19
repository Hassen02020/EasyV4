import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    include: [
      "lib/**/__tests__/**/*.test.ts",
      "tests/**/*.test.ts",
    ],
    globals: false,
    environment: "node",
    // Les tests utilisent `node:test` — Vitest est compatible natif
  },
})
