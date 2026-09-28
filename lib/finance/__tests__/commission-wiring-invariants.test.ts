/**
 * Invariants statiques — câblage commission dans les pipelines de réservation.
 *
 * Vérifie sur le code source réel (readFileSync) que :
 *  1. Les deux pipelines (B2B actions.ts, B2C guest-actions.ts) importent
 *     `creditPlatformCommission`.
 *  2. Les deux destructurent `{ commissionAmount }` depuis
 *     `recordReservationFinancials`.
 *  3. `creditPlatformCommission` est appelé avec `publicRef` dans la
 *     description (traçabilité).
 *  4. La migration 0066 ne GRANT pas à `authenticated`
 *     (risque sécurité SECURITY DEFINER éliminé par aa7583b).
 *  5. La migration 0066 possède bien un UNIQUE INDEX sur
 *     `commission_settlements(period_start, period_end)`
 *     (protection double-settlement concurrentiel).
 *  6. `commission-settlement.ts` filtre `isNull(walletLedger.settledAt)`
 *     dans l'agrégat (idempotence settlement).
 */

import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"

const ROOT = process.cwd()
const actionsSrc       = readFileSync(join(ROOT, "lib/booking/actions.ts"), "utf8")
const guestActionsSrc  = readFileSync(join(ROOT, "lib/booking/guest-actions.ts"), "utf8")
const migrationSrc     = readFileSync(join(ROOT, "drizzle/manual/0066_commission_wallet_settlement.sql"), "utf8")
const settlementSrc    = readFileSync(join(ROOT, "lib/finance/commission-settlement.ts"), "utf8")

/* -------------------------------------------------------------------------- */
/* Import wiring                                                                */
/* -------------------------------------------------------------------------- */

test("actions.ts : importe creditPlatformCommission depuis lib/finance/platform-commission", () => {
  assert.match(actionsSrc, /import\s*\{[^}]*creditPlatformCommission[^}]*\}\s*from\s*["']@\/lib\/finance\/platform-commission["']/)
})

test("guest-actions.ts : importe creditPlatformCommission depuis lib/finance/platform-commission", () => {
  assert.match(guestActionsSrc, /import\s*\{[^}]*creditPlatformCommission[^}]*\}\s*from\s*["']@\/lib\/finance\/platform-commission["']/)
})

/* -------------------------------------------------------------------------- */
/* Destructuring return value                                                   */
/* -------------------------------------------------------------------------- */

test("actions.ts : destructure { commissionAmount } depuis recordReservationFinancials", () => {
  assert.match(actionsSrc, /const\s*\{\s*commissionAmount\s*\}\s*=\s*await\s+recordReservationFinancials\(/)
})

test("guest-actions.ts : destructure { commissionAmount } depuis recordReservationFinancials", () => {
  assert.match(guestActionsSrc, /const\s*\{\s*commissionAmount\s*\}\s*=\s*await\s+recordReservationFinancials\(/)
})

/* -------------------------------------------------------------------------- */
/* Description avec publicRef (traçabilité réservation → wallet ledger)        */
/* -------------------------------------------------------------------------- */

test("actions.ts : creditPlatformCommission description inclut publicRef", () => {
  assert.match(actionsSrc, /description:\s*`[^`]*\$\{publicRef\}[^`]*`/)
})

test("guest-actions.ts : creditPlatformCommission description inclut publicRef", () => {
  assert.match(guestActionsSrc, /description:\s*`[^`]*\$\{publicRef\}[^`]*`/)
})

/* -------------------------------------------------------------------------- */
/* Sécurité migration — GRANT ne cible pas authenticated                        */
/* -------------------------------------------------------------------------- */

test("migration 0066 : GRANT EXECUTE sur credit_platform_commission n'inclut PAS authenticated", () => {
  // Extrait la ligne GRANT pour cette fonction
  const grantMatch = migrationSrc.match(/GRANT EXECUTE ON FUNCTION credit_platform_commission[^\n;]+(?:TO[^\n;]+)?/i)
  assert.ok(grantMatch, "La ligne GRANT doit exister")
  assert.equal(
    grantMatch[0].toLowerCase().includes("authenticated"),
    false,
    `GRANT ne doit pas cibler authenticated — trouvé : ${grantMatch[0]}`,
  )
})

/* -------------------------------------------------------------------------- */
/* Concurrence settlement — UNIQUE INDEX période                                */
/* -------------------------------------------------------------------------- */

test("migration 0066 : possède un UNIQUE INDEX sur commission_settlements(period_start, period_end)", () => {
  assert.match(
    migrationSrc,
    /CREATE UNIQUE INDEX IF NOT EXISTS commission_settlements_period_uniq/i,
  )
})

/* -------------------------------------------------------------------------- */
/* Idempotence settlement — filtrage settled_at IS NULL                        */
/* -------------------------------------------------------------------------- */

test("commission-settlement.ts : settleCommissions filtre isNull(walletLedger.settledAt) pour éviter de re-settler", () => {
  assert.match(settlementSrc, /isNull\(walletLedger\.settledAt\)/)
})

test("commission-settlement.ts : markSettlementPaid passe status à 'paid'", () => {
  assert.match(settlementSrc, /status:\s*["']paid["']/)
})
