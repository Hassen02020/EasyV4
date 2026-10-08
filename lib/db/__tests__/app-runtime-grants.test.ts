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
})
