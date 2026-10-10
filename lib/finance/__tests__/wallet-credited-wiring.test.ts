/**
 * VOUCHER-WIRING-01/wallet-callers — invariants statiques sur les deux
 * appelants de sendEvent("wallet/credited") :
 *   - lib/finance/recharge-actions.ts (validation recharge par admin)
 *   - lib/admin/agencies-actions.ts (crédit direct admin)
 *
 * Invariants protégés :
 *
 * RECHARGE-ACTIONS :
 * 1. Conditionné sur notifyAgencyId && notifyTxId && notifyMethod (pas de
 *    faux déclenchement si recharge rejetée).
 * 2. Fire-and-forget .catch() — ne bloque pas la confirmation de recharge.
 * 3. Payload : agencyId, txId, amount, newBalance, method=notifyMethod,
 *    adminUserId.
 *
 * AGENCIES-ACTIONS :
 * 4. Conditionné sur movementId (transaction DB réussie avant l'envoi).
 * 5. Fire-and-forget .catch() — ne bloque pas le crédit admin.
 * 6. method: "ADMIN_DIRECT" — valeur fixe correspondant au label dans
 *    process-wallet-credit.ts (RECHARGE_METHOD_LABEL.ADMIN_DIRECT).
 * 7. Payload : agencyId, txId, amount, newBalance, method="ADMIN_DIRECT",
 *    adminUserId.
 *
 * Pattern readFileSync — même discipline que lib/cars/__tests__/
 * car-voucher-wiring.test.ts.
 */
import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"

const ROOT = process.cwd()
const rechargeSrc = readFileSync(
  join(ROOT, "lib/finance/recharge-actions.ts"),
  "utf8",
)
const agenciesSrc = readFileSync(
  join(ROOT, "lib/admin/agencies-actions.ts"),
  "utf8",
)

// ─── RECHARGE-ACTIONS : Invariant 1 : garde triple ────────────────────────

test("VOUCHER-WIRING-01/recharge : conditionné sur notifyAgencyId && notifyTxId && notifyMethod", () => {
  assert.match(
    rechargeSrc,
    /notifyAgencyId\s*&&\s*notifyTxId\s*&&\s*notifyMethod/,
  )
})

// ─── RECHARGE-ACTIONS : Invariant 2 : fire-and-forget ────────────────────

test("VOUCHER-WIRING-01/recharge : sendEvent wallet/credited est fire-and-forget (.catch)", () => {
  assert.match(
    rechargeSrc,
    /sendEvent\(["']wallet\/credited["'][\s\S]{0,600}?\)\.catch\(/,
  )
})

// ─── RECHARGE-ACTIONS : Invariant 3 : payload ────────────────────────────

test("VOUCHER-WIRING-01/recharge : payload contient agencyId, txId, amount, newBalance, method, adminUserId", () => {
  const idx = rechargeSrc.indexOf('"wallet/credited"')
  const block = rechargeSrc.slice(idx, idx + 400)
  assert.match(block, /agencyId/)
  assert.match(block, /txId/)
  assert.match(block, /amount/)
  assert.match(block, /newBalance/)
  assert.match(block, /method/)
  assert.match(block, /adminUserId/)
})

// ─── AGENCIES-ACTIONS : Invariant 4 : conditionné sur movementId ─────────

test("VOUCHER-WIRING-01/admin-direct : conditionné sur movementId (tx DB réussie)", () => {
  assert.match(
    agenciesSrc,
    /if\s*\(\s*movementId\s*\)[\s\S]{0,100}sendEvent\(["']wallet\/credited["']/,
  )
})

// ─── AGENCIES-ACTIONS : Invariant 5 : fire-and-forget ────────────────────

test("VOUCHER-WIRING-01/admin-direct : sendEvent wallet/credited est fire-and-forget (.catch)", () => {
  assert.match(
    agenciesSrc,
    /sendEvent\(["']wallet\/credited["'][\s\S]{0,600}?\)\.catch\(/,
  )
})

// ─── AGENCIES-ACTIONS : Invariant 6 : method = "ADMIN_DIRECT" ────────────

test('VOUCHER-WIRING-01/admin-direct : method: "ADMIN_DIRECT" (valeur fixe cohérente avec process-wallet-credit label)', () => {
  assert.match(agenciesSrc, /method:\s*["']ADMIN_DIRECT["']/)
})

// ─── AGENCIES-ACTIONS : Invariant 7 : payload ────────────────────────────

test("VOUCHER-WIRING-01/admin-direct : payload contient agencyId, txId=movementId, amount, newBalance, adminUserId", () => {
  const idx = agenciesSrc.indexOf('"wallet/credited"')
  const block = agenciesSrc.slice(idx, idx + 400)
  assert.match(block, /agencyId/)
  assert.match(block, /txId/)
  assert.match(block, /amount/)
  assert.match(block, /newBalance/)
  assert.match(block, /adminUserId/)
})
