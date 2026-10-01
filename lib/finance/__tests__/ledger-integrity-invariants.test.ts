/**
 * LEDGER-INTEGRITY-01 + ECON-ENTITLEMENTS-INTEGRITY-01 — invariants statiques.
 *
 * Tables append-only protégées par REVOKE au niveau PostgreSQL :
 *   - `wallet_ledger`, `partner_credit_movements`, `commission_settlement_entries`
 *     (0084, LEDGER-INTEGRITY-01)
 *   - `economic_entitlements` (0092, ECON-ENTITLEMENTS-INTEGRITY-01)
 *
 * Depuis ces migrations, `app_runtime` ne peut plus qu'insérer et lire.
 * Ce test empêche qu'un futur code applicatif réintroduise une mutation
 * (qui échouerait en production avec "permission denied") ou un upsert
 * `onConflictDoUpdate` (qui exige le privilège UPDATE).
 *
 * Vérification statique sur le code source réel, comme
 * commission-wiring-invariants.test.ts.
 */
import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync, readdirSync, statSync } from "node:fs"
import { join } from "node:path"

const ROOT = process.cwd()
const LEDGER_TABLES_TS = [
  "walletLedger",
  "partnerCreditMovements",
  "commissionSettlementEntries",
  "economicEntitlements",
]
const LEDGER_TABLES_SQL = [
  "wallet_ledger",
  "partner_credit_movements",
  "commission_settlement_entries",
  "economic_entitlements",
]

function sourceFiles(dir: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === "__tests__" || name.startsWith(".")) continue
    const full = join(dir, name)
    if (statSync(full).isDirectory()) out.push(...sourceFiles(full))
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(full)
  }
  return out
}

const appSources = ["lib", "app", "components"].flatMap((d) => sourceFiles(join(ROOT, d)))

test("aucun .update()/.delete() Drizzle sur un ledger dans le code applicatif", () => {
  const offenders: string[] = []
  for (const file of appSources) {
    const src = readFileSync(file, "utf8")
    for (const t of LEDGER_TABLES_TS) {
      if (new RegExp(`\\.(update|delete)\\(\\s*${t}\\s*\\)`).test(src)) offenders.push(`${file} → ${t}`)
    }
  }
  assert.deepEqual(offenders, [], "mutation d'un ledger interdite (append-only, 0084)")
})

test("aucun UPDATE/DELETE/TRUNCATE SQL brut sur un ledger dans le code applicatif", () => {
  const offenders: string[] = []
  for (const file of appSources) {
    const src = readFileSync(file, "utf8")
    for (const t of LEDGER_TABLES_SQL) {
      if (new RegExp(`\\b(UPDATE|DELETE\\s+FROM|TRUNCATE)\\s+(public\\.)?${t}\\b`, "i").test(src)) {
        offenders.push(`${file} → ${t}`)
      }
    }
  }
  assert.deepEqual(offenders, [])
})

test("aucun upsert onConflictDoUpdate sur un ledger (exigerait le privilège UPDATE retiré par 0084)", () => {
  const offenders: string[] = []
  for (const file of appSources) {
    const src = readFileSync(file, "utf8")
    for (const t of LEDGER_TABLES_TS) {
      const re = new RegExp(`insert\\(\\s*${t}\\s*\\)[\\s\\S]{0,600}?onConflictDoUpdate`)
      if (re.test(src)) offenders.push(`${file} → ${t}`)
    }
  }
  assert.deepEqual(offenders, [])
})

test("migration 0084 : REVOKE UPDATE/DELETE/TRUNCATE aux rôles runtime sur les 3 ledgers + unicité commission par réservation", () => {
  const mig = readFileSync(join(ROOT, "drizzle/manual/0084_ledger_integrity_01.sql"), "utf8")
  for (const t of ["wallet_ledger", "partner_credit_movements", "commission_settlement_entries"]) {
    assert.match(
      mig,
      new RegExp(`REVOKE UPDATE, DELETE, TRUNCATE ON TABLE ${t}\\s+FROM app_runtime, anon, authenticated, service_role;`),
      `REVOKE manquant pour ${t}`,
    )
  }
  assert.match(mig, /CREATE UNIQUE INDEX IF NOT EXISTS wallet_ledger_commission_per_reservation_uniq/)
  assert.match(mig, /WHERE type = 'commission' AND category = 'commission' AND reservation_id IS NOT NULL/)
})

test("migration 0092 : REVOKE UPDATE/DELETE/TRUNCATE aux rôles runtime sur economic_entitlements", () => {
  const mig = readFileSync(join(ROOT, "drizzle/manual/0092_econ_entitlements_integrity_01.sql"), "utf8")
  assert.match(
    mig,
    /REVOKE UPDATE, DELETE, TRUNCATE ON TABLE economic_entitlements\s+FROM app_runtime, anon, authenticated, service_role;/,
    "REVOKE manquant pour economic_entitlements",
  )
})
