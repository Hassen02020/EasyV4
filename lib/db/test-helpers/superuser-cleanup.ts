/**
 * APP-RUNTIME-GRANTS-CI-01 — nettoyage de fixtures de test sur des tables
 * dont app_runtime n'a (à raison) pas DELETE/UPDATE (ledgers/créances
 * append-only : wallet_ledger, partner_credit_movements,
 * economic_entitlements, commission_settlement_entries,
 * canonical_hotel_supplier_mappings…). Même motif que
 * `deleteCanonicalHotelFixtureAsSuperuser` dans
 * lib/db/__tests__/rls-gap-public-tables-01-live.test.ts, factorisé ici
 * puisqu'il se répète désormais dans plusieurs fichiers de test — jamais
 * utilisé pour les assertions elles-mêmes, uniquement pour le nettoyage de
 * fixtures créées par le test (la connexion app_runtime applicative n'a
 * jamais ce chemin en production).
 */
import type { Sql } from "postgres"

export async function cleanupAsSuperuser(
  run: (sql: Sql) => Promise<unknown>,
): Promise<void> {
  const directUrl = process.env.DATABASE_DIRECT_URL
  if (!directUrl) return
  const postgres = (await import("postgres")).default
  const sql = postgres(directUrl, { max: 1 })
  try {
    await run(sql)
  } finally {
    await sql.end()
  }
}
