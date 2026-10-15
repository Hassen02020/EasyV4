/**
 * Test de la logique d'activation du bouton "Déclarer un règlement" —
 * trouvé en QA visuelle (2026-10-13) : le bouton restait désactivé SANS
 * AUCUNE explication quand `debts` ne contenait aucune créance éligible,
 * lu à tort comme "le bouton ne marche pas" alors que c'est le comportement
 * voulu (protège la comptabilité : jamais de règlement sans créance réelle).
 *
 * `getEligibleSupplierDebts` est la logique exacte dont dépend
 * `disabled={eligible.length === 0}` sur le bouton (voir
 * components/admin/supplier-settlement-buttons.tsx) — ce test prouve son
 * comportement pour les deux états sans navigateur ni base de données.
 */
import test from "node:test"
import assert from "node:assert/strict"
import { getEligibleSupplierDebts } from "../supplier-settlement-ui"
import type { SupplierDueEntitlement } from "../supplier-settlement"

function makeDebt(
  overrides: Partial<SupplierDueEntitlement>,
): SupplierDueEntitlement {
  return {
    entitlementId: "e1",
    reservationId: "r1",
    amount: "1000.00",
    reservationStatus: "confirmed",
    recognizedDebt: "1000.00",
    paidReal: "0.00",
    netDecaisse: "0.00",
    overpaid: "0.00",
    remaining: "1000.00",
    disputedCancellation: false,
    ...overrides,
  }
}

test("getEligibleSupplierDebts : aucune créance -> bouton reste désactivé (comportement reproduit en QA : fournisseur de test sans entitlement)", () => {
  const eligible = getEligibleSupplierDebts([])
  assert.equal(eligible.length, 0)
})

test("getEligibleSupplierDebts : créances avec remaining=0 uniquement (trop-payé seul) -> jamais éligibles, bouton reste désactivé", () => {
  const debts = [makeDebt({ remaining: "0.00", overpaid: "50.00" })]
  const eligible = getEligibleSupplierDebts(debts)
  assert.equal(
    eligible.length,
    0,
    "un trop-payé seul ne doit jamais rendre le bouton 'Déclarer' actif — c'est une correction comptable, pas un nouveau règlement",
  )
})

test("getEligibleSupplierDebts : une créance réelle avec remaining > 0 -> éligible, le formulaire peut s'ouvrir (eligible.length > 0 désactive plus le bouton)", () => {
  const debts = [
    makeDebt({ entitlementId: "e1", remaining: "1000.00" }),
    makeDebt({ entitlementId: "e2", remaining: "0.00", overpaid: "20.00" }),
  ]
  const eligible = getEligibleSupplierDebts(debts)
  assert.equal(
    eligible.length,
    1,
    "seule la créance avec reste à payer > 0 doit être retenue",
  )
  assert.equal(eligible[0]!.entitlementId, "e1")
})

test("getEligibleSupplierDebts : plusieurs créances avec reste à payer -> toutes éligibles", () => {
  const debts = [
    makeDebt({ entitlementId: "e1", remaining: "500.00" }),
    makeDebt({ entitlementId: "e2", remaining: "300.00" }),
  ]
  const eligible = getEligibleSupplierDebts(debts)
  assert.equal(eligible.length, 2)
})
