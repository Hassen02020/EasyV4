/**
 * DEFAULT-PRIVILEGES-GAP-01 — preuve live des grants réels de app_runtime
 * (information_schema), même convention que les autres tests "live" du
 * dépôt : se dégrade en `skip` sans DATABASE_URL/Postgres local disponible.
 *
 * Contexte : un ALTER DEFAULT PRIVILEGES préexistant (rôle postgres,
 * schéma public) accorde automatiquement INSERT/SELECT/UPDATE/DELETE à
 * app_runtime sur TOUTE nouvelle table créée dans public — un GRANT
 * restrictif explicite dans une migration ne retire PAS ce qui a déjà été
 * accordé par défaut. Ce test vérifie les invariants réellement corrigés
 * (migration 0111) pour empêcher une régression silencieuse si une future
 * migration recrée ces tables sans REVOKE explicite.
 *
 * APP-RUNTIME-GRANTS-CI-01 (2026-10-13) : ce fichier existait déjà (4
 * tables couvertes) mais n'était jamais exécuté par le job CI
 * `financial-e2e` (absent de .github/workflows/ci.yml) — c'est précisément
 * pour ça que le gap d'ordre des steps CI (le "Grants finaux app_runtime"
 * qui s'exécutait APRÈS le replay des migrations, annulant leurs REVOKE
 * pour app_runtime) n'a jamais été détecté : aucun test n'assertait
 * l'ABSENCE d'un privilège en CI. Corrigé : (1) le step CI est réordonné
 * (grant table-level déplacé avant le replay), (2) ce fichier est étendu
 * aux 7 autres migrations réelles qui font un REVOKE table-level explicite
 * sur app_runtime (0084, 0092, 0109, 0112, 0113, 0114, 0116, 0117, 0122 —
 * liste vérifiée par recherche multi-lignes sur drizzle/manual/*.sql, une
 * simple recherche ligne-à-ligne rate les REVOKE écrits sur deux lignes),
 * (3) ce fichier est ajouté à la liste financial-e2e de ci.yml.
 */
import test from "node:test"
import assert from "node:assert/strict"
import { sql } from "drizzle-orm"
import { withSystemContext } from "@/lib/db/tenant-context"

async function isDbAvailable(): Promise<boolean> {
  try {
    await withSystemContext(async (tx) => {
      await tx.execute(sql`select 1`)
    })
    return true
  } catch {
    return false
  }
}

async function grantsFor(tableName: string): Promise<Set<string>> {
  const rows = (await withSystemContext((tx) =>
    tx.execute(
      sql`select privilege_type from information_schema.role_table_grants where grantee = 'app_runtime' and table_name = ${tableName}`,
    ),
  )) as unknown as Array<{ privilege_type: string }>
  return new Set(rows.map((r) => r.privilege_type))
}

test("notification_idempotency : app_runtime n'a QUE SELECT/INSERT — jamais UPDATE/DELETE (append-only, jamais purgée)", async (t) => {
  if (!(await isDbAvailable())) {
    return void t.skip(
      "Postgres local indisponible (DATABASE_URL) — voir live-resolution.test.ts pour la procédure.",
    )
  }
  const grants = await grantsFor("notification_idempotency")
  assert.equal(grants.has("SELECT"), true)
  assert.equal(grants.has("INSERT"), true)
  assert.equal(grants.has("UPDATE"), false)
  assert.equal(grants.has("DELETE"), false)
  assert.equal(grants.has("TRUNCATE"), false)
})

test("audit_events : app_runtime a SELECT/INSERT/DELETE (purge réelle à 30j) mais JAMAIS UPDATE", async (t) => {
  if (!(await isDbAvailable())) {
    return void t.skip(
      "Postgres local indisponible (DATABASE_URL) — voir live-resolution.test.ts pour la procédure.",
    )
  }
  const grants = await grantsFor("audit_events")
  assert.equal(grants.has("SELECT"), true)
  assert.equal(grants.has("INSERT"), true)
  assert.equal(
    grants.has("DELETE"),
    true,
    "DELETE doit rester accordé — app/api/cron/purge-audit/route.ts en dépend réellement",
  )
  assert.equal(grants.has("UPDATE"), false)
  assert.equal(grants.has("TRUNCATE"), false)
})

test("lead_origin_events : app_runtime n'a QUE SELECT/INSERT — append-only réel (NETWORK-DEMAND-CAPTURE-01)", async (t) => {
  if (!(await isDbAvailable())) {
    return void t.skip(
      "Postgres local indisponible (DATABASE_URL) — voir live-resolution.test.ts pour la procédure.",
    )
  }
  const grants = await grantsFor("lead_origin_events")
  assert.equal(grants.has("SELECT"), true)
  assert.equal(grants.has("INSERT"), true)
  assert.equal(grants.has("UPDATE"), false)
  assert.equal(grants.has("DELETE"), false)
  assert.equal(grants.has("TRUNCATE"), false)
})

test("wallet_ledger : app_runtime n'a QUE SELECT/INSERT — append-only réel (référence, non affecté par le gap)", async (t) => {
  if (!(await isDbAvailable())) {
    return void t.skip(
      "Postgres local indisponible (DATABASE_URL) — voir live-resolution.test.ts pour la procédure.",
    )
  }
  const grants = await grantsFor("wallet_ledger")
  assert.equal(grants.has("SELECT"), true)
  assert.equal(grants.has("INSERT"), true)
  assert.equal(grants.has("UPDATE"), false)
  assert.equal(grants.has("DELETE"), false)
  assert.equal(grants.has("TRUNCATE"), false)
})

/**
 * Les 7 contrôles suivants couvrent les migrations financières/sensibles
 * qui n'avaient encore AUCUNE preuve live en CI (0084, 0092, 0109, 0112,
 * 0113, 0114, 0116, 0117, 0122) — ajoutés par APP-RUNTIME-GRANTS-CI-01.
 */

test("LEDGER-INTEGRITY-01 (0084) : app_runtime n'a QUE SELECT/INSERT sur wallet_ledger/partner_credit_movements/commission_settlement_entries — jamais UPDATE/DELETE/TRUNCATE", async (t) => {
  if (!(await isDbAvailable())) {
    return void t.skip(
      "Postgres local indisponible (DATABASE_URL) — voir live-resolution.test.ts pour la procédure.",
    )
  }
  for (const table of [
    "wallet_ledger",
    "partner_credit_movements",
    "commission_settlement_entries",
  ]) {
    const grants = await grantsFor(table)
    assert.equal(grants.has("SELECT"), true, `${table} : SELECT attendu`)
    assert.equal(grants.has("INSERT"), true, `${table} : INSERT attendu`)
    assert.equal(grants.has("UPDATE"), false, `${table} : UPDATE interdit`)
    assert.equal(grants.has("DELETE"), false, `${table} : DELETE interdit`)
    assert.equal(grants.has("TRUNCATE"), false, `${table} : TRUNCATE interdit`)
  }
})

test("ECON-ENTITLEMENTS-INTEGRITY-01 (0092) : app_runtime n'a QUE SELECT/INSERT sur economic_entitlements — jamais UPDATE/DELETE/TRUNCATE", async (t) => {
  if (!(await isDbAvailable())) {
    return void t.skip(
      "Postgres local indisponible (DATABASE_URL) — voir live-resolution.test.ts pour la procédure.",
    )
  }
  const grants = await grantsFor("economic_entitlements")
  assert.equal(grants.has("SELECT"), true)
  assert.equal(grants.has("INSERT"), true)
  assert.equal(grants.has("UPDATE"), false)
  assert.equal(grants.has("DELETE"), false)
  assert.equal(grants.has("TRUNCATE"), false)
})

test("CANONICAL-HOTELS-01 (0109) : canonical_hotels garde UPDATE mais jamais DELETE ; canonical_hotel_supplier_mappings n'a que SELECT/INSERT", async (t) => {
  if (!(await isDbAvailable())) {
    return void t.skip(
      "Postgres local indisponible (DATABASE_URL) — voir live-resolution.test.ts pour la procédure.",
    )
  }
  const hotels = await grantsFor("canonical_hotels")
  assert.equal(hotels.has("SELECT"), true)
  assert.equal(hotels.has("INSERT"), true)
  assert.equal(hotels.has("UPDATE"), true, "canonical_hotels : UPDATE attendu")
  assert.equal(
    hotels.has("DELETE"),
    false,
    "canonical_hotels : DELETE interdit",
  )
  assert.equal(
    hotels.has("TRUNCATE"),
    false,
    "canonical_hotels : TRUNCATE interdit",
  )

  const mappings = await grantsFor("canonical_hotel_supplier_mappings")
  assert.equal(mappings.has("SELECT"), true)
  assert.equal(mappings.has("INSERT"), true)
  assert.equal(mappings.has("UPDATE"), false, "mappings : UPDATE interdit")
  assert.equal(mappings.has("DELETE"), false, "mappings : DELETE interdit")
  assert.equal(mappings.has("TRUNCATE"), false, "mappings : TRUNCATE interdit")
})

test("CONSENT-01 (0112) : lead_consent_events n'a QUE SELECT/INSERT", async (t) => {
  if (!(await isDbAvailable())) {
    return void t.skip(
      "Postgres local indisponible (DATABASE_URL) — voir live-resolution.test.ts pour la procédure.",
    )
  }
  const grants = await grantsFor("lead_consent_events")
  assert.equal(grants.has("SELECT"), true)
  assert.equal(grants.has("INSERT"), true)
  assert.equal(grants.has("UPDATE"), false)
  assert.equal(grants.has("DELETE"), false)
  assert.equal(grants.has("TRUNCATE"), false)
})

test("CONTACT-01 (0113) : contacts garde UPDATE mais jamais DELETE", async (t) => {
  if (!(await isDbAvailable())) {
    return void t.skip(
      "Postgres local indisponible (DATABASE_URL) — voir live-resolution.test.ts pour la procédure.",
    )
  }
  const grants = await grantsFor("contacts")
  assert.equal(grants.has("SELECT"), true)
  assert.equal(grants.has("INSERT"), true)
  assert.equal(grants.has("UPDATE"), true)
  assert.equal(grants.has("DELETE"), false)
  assert.equal(grants.has("TRUNCATE"), false)
})

test("CAMPAIGN-PERSISTENCE-01 (0114) : campaigns garde UPDATE mais jamais DELETE ; campaign_targets n'a que SELECT/INSERT", async (t) => {
  if (!(await isDbAvailable())) {
    return void t.skip(
      "Postgres local indisponible (DATABASE_URL) — voir live-resolution.test.ts pour la procédure.",
    )
  }
  const campaigns = await grantsFor("campaigns")
  assert.equal(campaigns.has("SELECT"), true)
  assert.equal(campaigns.has("INSERT"), true)
  assert.equal(campaigns.has("UPDATE"), true)
  assert.equal(campaigns.has("DELETE"), false)
  assert.equal(campaigns.has("TRUNCATE"), false)

  const targets = await grantsFor("campaign_targets")
  assert.equal(targets.has("SELECT"), true)
  assert.equal(targets.has("INSERT"), true)
  assert.equal(targets.has("UPDATE"), false)
  assert.equal(targets.has("DELETE"), false)
  assert.equal(targets.has("TRUNCATE"), false)
})

test("CAMPAIGN-ATTRIBUTION-01 (0116) : campaign_attributions n'a QUE SELECT/INSERT", async (t) => {
  if (!(await isDbAvailable())) {
    return void t.skip(
      "Postgres local indisponible (DATABASE_URL) — voir live-resolution.test.ts pour la procédure.",
    )
  }
  const grants = await grantsFor("campaign_attributions")
  assert.equal(grants.has("SELECT"), true)
  assert.equal(grants.has("INSERT"), true)
  assert.equal(grants.has("UPDATE"), false)
  assert.equal(grants.has("DELETE"), false)
  assert.equal(grants.has("TRUNCATE"), false)
})

test("PROMO-01 (0117) : promos garde UPDATE mais jamais DELETE", async (t) => {
  if (!(await isDbAvailable())) {
    return void t.skip(
      "Postgres local indisponible (DATABASE_URL) — voir live-resolution.test.ts pour la procédure.",
    )
  }
  const grants = await grantsFor("promos")
  assert.equal(grants.has("SELECT"), true)
  assert.equal(grants.has("INSERT"), true)
  assert.equal(grants.has("UPDATE"), true)
  assert.equal(grants.has("DELETE"), false)
  assert.equal(grants.has("TRUNCATE"), false)
})

test("BEHAVIORAL-SIGNAL-01 (0122) : search_demand_signals garde UPDATE mais jamais DELETE", async (t) => {
  if (!(await isDbAvailable())) {
    return void t.skip(
      "Postgres local indisponible (DATABASE_URL) — voir live-resolution.test.ts pour la procédure.",
    )
  }
  const grants = await grantsFor("search_demand_signals")
  assert.equal(grants.has("SELECT"), true)
  assert.equal(grants.has("INSERT"), true)
  assert.equal(grants.has("UPDATE"), true)
  assert.equal(grants.has("DELETE"), false)
  assert.equal(grants.has("TRUNCATE"), false)
})
