/**
 * Drizzle-kit config — TunisiaGo.
 *
 * Commandes :
 *   pnpm db:generate   → produit du SQL dans `drizzle/` à partir de `lib/db/schema.ts`
 *   pnpm db:push       → applique le schéma directement (dev seulement)
 *   pnpm db:migrate    → applique les migrations versionnées (prod)
 *   pnpm db:studio     → ouvre Drizzle Studio sur la DB
 *
 * IMPORTANT : ce fichier n'est JAMAIS exécuté à runtime — uniquement par drizzle-kit
 * en CLI. Donc on peut utiliser `dotenv/config` ici sans impact bundle.
 */

import "dotenv/config"
import { defineConfig } from "drizzle-kit"

const url = process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL ?? ""

if (!url) {
  // Tolérant : permet à `pnpm db:generate` de marcher sans DB (génération offline).
  console.warn(
    "[drizzle.config] DATABASE_URL/DATABASE_DIRECT_URL non définie — `db:push` et `db:migrate` échoueront.",
  )
}

export default defineConfig({
  schema: "./lib/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url },
  casing: "snake_case",
  strict: true,
  verbose: true,
})
