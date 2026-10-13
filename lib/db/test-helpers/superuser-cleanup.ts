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
 *
 * DURCI (revue 2026-10-13) : `DATABASE_DIRECT_URL` n'est PAS garanti pointer
 * sur une base jetable. `lib/db/README.md` documente cette variable, pour un
 * `.env.local` de développement réel, comme "la connexion directe (port
 * 5432)" vers LE MÊME projet Supabase que `DATABASE_URL` (juste sans
 * pooler) — potentiellement la base de production si ce `.env.local` y
 * pointe. Cette fonction exécute des `DELETE` avec des privilèges superuser :
 * elle doit refuser de s'exécuter contre toute cible qui n'est pas
 * positivement identifiée comme une base de test locale, jamais faire
 * confiance à la variable d'environnement seule — et ne jamais ignorer
 * silencieusement une configuration de nettoyage absente (un résidu de
 * fixture non nettoyé peut fausser un test ultérieur, observé réellement sur
 * ce chantier lors du débogage par réexécutions successives).
 */
import type { Sql } from "postgres"

const ALLOWED_TEST_HOSTS = new Set(["localhost", "127.0.0.1", "::1"])

function assertSafeTestDatabaseUrl(rawUrl: string): void {
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "cleanupAsSuperuser refusé : NODE_ENV=production. Ce helper n'est " +
        "destiné qu'aux suites de test contre une base Postgres jetable.",
    )
  }
  let parsed: URL
  try {
    parsed = new URL(rawUrl)
  } catch {
    throw new Error(
      "cleanupAsSuperuser refusé : DATABASE_DIRECT_URL n'est pas une URL " +
        "valide — nettoyage impossible plutôt qu'une tentative sur une " +
        "cible non vérifiée.",
    )
  }
  if (!ALLOWED_TEST_HOSTS.has(parsed.hostname)) {
    throw new Error(
      `cleanupAsSuperuser refusé : hôte "${parsed.hostname}" non autorisé. ` +
        "Seuls localhost/127.0.0.1/::1 sont acceptés (base de test jetable " +
        "uniquement) — DATABASE_DIRECT_URL peut légitimement pointer vers " +
        "le projet Supabase réel en développement local (voir " +
        "lib/db/README.md), ce qui en ferait une cible interdite ici.",
    )
  }
}

export async function cleanupAsSuperuser(
  run: (sql: Sql) => Promise<unknown>,
): Promise<void> {
  const directUrl = process.env.DATABASE_DIRECT_URL
  if (!directUrl) {
    throw new Error(
      "cleanupAsSuperuser appelé sans DATABASE_DIRECT_URL — jamais un no-op " +
        "silencieux : le nettoyage de fixture est requis pour l'isolation " +
        "des tests suivants, pas optionnel. Définir DATABASE_DIRECT_URL " +
        "(ex. postgresql://postgres:postgres@localhost:5432/<db>) avant " +
        "d'exécuter cette suite.",
    )
  }
  assertSafeTestDatabaseUrl(directUrl)
  const postgres = (await import("postgres")).default
  const sql = postgres(directUrl, { max: 1 })
  try {
    await run(sql)
  } finally {
    await sql.end()
  }
}
