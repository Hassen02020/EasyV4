/**
 * LEDGER-INTEGRITY-01 — invariants statiques.
 *
 * Les ledgers (`wallet_ledger`, `partner_credit_movements`,
 * `commission_settlement_entries`) sont append-only : depuis 0084, le rôle
 * runtime `app_runtime` n'a plus UPDATE/DELETE/TRUNCATE sur ces tables en
 * base. Ce test empêche qu'un futur code applicatif réintroduise une
 * mutation (qui échouerait en production avec "permission denied") ou un
 * upsert `onConflictDoUpdate` (qui exige le privilège UPDATE).
 *
 * Vérification statique sur le code source réel, comme
 * commission-wiring-invariants.test.ts.
 */
import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync, readdirSync, statSync } from "node:fs"
import { join } from "node:path"

const ROOT = process.cwd()
const LEDGER_TABLES_TS = ["walletLedger", "partnerCreditMovements", "commissionSettlementEntries"]
const LEDGER_TABLES_SQL = ["wallet_ledger", "partner_credit_movements", "commission_settlement_entries"]

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
  for (const t of LEDGER_TABLES_SQL) {
    assert.match(
      mig,
      new RegExp(`REVOKE UPDATE, DELETE, TRUNCATE ON TABLE ${t}\\s+FROM app_runtime, anon, authenticated, service_role;`),
      `REVOKE manquant pour ${t}`,
    )
  }
  assert.match(mig, /CREATE UNIQUE INDEX IF NOT EXISTS wallet_ledger_commission_per_reservation_uniq/)
  assert.match(mig, /WHERE type = 'commission' AND category = 'commission' AND reservation_id IS NOT NULL/)
})
