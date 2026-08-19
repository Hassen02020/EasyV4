import nextCoreWebVitals from "eslint-config-next/core-web-vitals"
import nextTypescript from "eslint-config-next/typescript"

const eslintConfig = [
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    // `extra/` est exclu du build TypeScript (voir tsconfig.json "exclude") :
    // code de référence archivé, non servi par l'App Router.
    // `scripts/` : outils CLI internes (stress-test, migrations) exécutés via
    // `tsx`, hors bundle Next.js — pas soumis aux règles next/core-web-vitals.
    ignores: [
      ".next/**",
      "node_modules/**",
      "next-env.d.ts",
      "extra/**",
      "scripts/**",
    ],
  },
]

export default eslintConfig
