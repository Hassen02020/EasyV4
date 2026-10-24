/**
 * WALLET-PAYMEE-INIT-01 — invariants statiques de submitCustomerTopUp
 * (même convention que r9-02-b2c-topup-invariants.test.ts). Le comportement
 * webhook réel est couvert par
 * lib/payment/__tests__/paymee-topup-webhook-route.integration.test.ts.
 */
import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"

const actionSrc = readFileSync(
  join(process.cwd(), "lib/finance/b2c-topup-actions.ts"),
  "utf8",
)

test("configuration Paymee vérifiée AVANT toute écriture de demande", () => {
  const check = actionSrc.indexOf("if (!provider.configured)")
  const insert = actionSrc.indexOf(".insert(customerTopupRequests)")
  assert.ok(check > 0, "contrôle de configuration absent")
  assert.ok(insert > 0, "insertion de demande introuvable")
  assert.ok(check < insert, "le contrôle doit précéder l'insertion")
})

test("la recharge est initiée avec purpose wallet_topup et la locale du client", () => {
  assert.match(actionSrc, /purpose: "wallet_topup"/)
  assert.match(actionSrc, /locale,/)
})

test('module "use server" : n\'exporte que des fonctions async et des types', () => {
  // Next refuse tout autre export (constante, objet) : le module entier
  // devient vide côté client et le build échoue (CI, commit 94566fde).
  const exports = actionSrc.match(/^export\s+(\S+\s+\S+)/gm) ?? []
  assert.ok(exports.length > 0)
  for (const e of exports) {
    assert.match(e, /^export\s+(async function|type|interface)\b/, e)
  }
})
