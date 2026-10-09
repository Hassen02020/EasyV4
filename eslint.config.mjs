import nextCoreWebVitals from "eslint-config-next/core-web-vitals"
import nextTypescript from "eslint-config-next/typescript"

const eslintConfig = [
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    // `scripts/` : outils CLI internes (stress-test, migrations) exécutés via
    // `tsx`, hors bundle Next.js — pas soumis aux règles next/core-web-vitals.
    ignores: [".next/**", "node_modules/**", "next-env.d.ts", "scripts/**"],
  },
  {
    rules: {
      // Paramètres intentionnellement non utilisés dans les stubs/adapters :
      // convention `_name` reconnue par ESLint (argsIgnorePattern + varsIgnorePattern).
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
    },
  },
]

export default eslintConfig
