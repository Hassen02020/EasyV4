/**
 * Drizzle client factory pour Easy2Book.
 *
 * Utilisation typique côté API route :
 *   import { getDb } from "@/lib/db/client"
 *   const db = getDb()
 *   await db.select().from(reservations).where(eq(reservations.agencyId, agencyId))
 *
 * En production Vercel : la connexion postgres-js gère un petit pool partagé
 * (max 10 connexions par défaut) — adapté à Supabase Pooler (port 6543).
 *
 * Pour les opérations write (mutations, migrations), on recommande d'utiliser
 * la connexion directe (port 5432) au lieu du pooler. Voir `DATABASE_URL` vs
 * `DATABASE_POOL_URL` dans `.env.example`.
 */

import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js"
import postgres from "postgres"
import * as schema from "./schema"

let _client: ReturnType<typeof postgres> | null = null
let _db: PostgresJsDatabase<typeof schema> | null = null

export function getDb(): PostgresJsDatabase<typeof schema> {
  if (_db) return _db

  const url = process.env.DATABASE_URL
  if (!url) {
    throw new Error(
      "DATABASE_URL non définie. Configure-la dans .env.local (Supabase Pooler URL).",
    )
  }

  _client = postgres(url, {
    max: 10,
    idle_timeout: 20,
    connect_timeout: 30,
    prepare: false,
  })

  _db = drizzle(_client, { schema, casing: "snake_case" })
  return _db
}

/** Pour fermer proprement (tests, scripts). En prod Next.js : pas nécessaire. */
export async function closeDb(): Promise<void> {
  if (_client) {
    await _client.end({ timeout: 5 })
    _client = null
    _db = null
  }
}

export { schema }
