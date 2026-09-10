import nextCoreWebVitals from "eslint-config-next/core-web-vitals"
import nextTypescript from "eslint-config-next/typescript"

const eslintConfig = [
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    // `scripts/` : outils CLI internes (stress-test, migrations) exécutés via
    // `tsx`, hors bundle Next.js — pas soumis aux règles next/core-web-vitals.
    ignores: [
      ".next/**",
      "node_modules/**",
      "next-env.d.ts",
      "scripts/**",
    ],
  },
]

export default eslintConfig
