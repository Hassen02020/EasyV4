/**
 * DISTRIBUTION-02 — invariants statiques sur
 * `lib/network/product-booking-actions.ts`.
 *
 * Le fichier porte `"use server"` — ne peut pas être chargé par
 * `node --test` hors bundler Next.js (même contrainte documentée dans
 * tenant-continuity-invariants.test.ts). Vérification statique sur le code
 * source réel.
 */
import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"

const src = readFileSync(join(process.cwd(), "lib/network/product-booking-actions.ts"), "utf8")

function countOccurrences(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1
}

test("createNetworkProductBooking : résolution de session RÉELLE (resolveSessionContext) — jamais un staff/super_admin substitué à l'agence revendeuse", () => {
  assert.match(src, /await resolveSessionContext\(\)/)
  assert.equal(countOccurrences(src, "requireSuperAdmin"), 0)
})

test("COMMERCIAL-CONVERGENCE-01 : utilise le moteur de marge RÉEL et configurable (getMarginsForAgency/applyMargin, module 'network') — jamais margin-calculator.ts (marginRules sans aucun chemin d'écriture), jamais supplierPriceTnd = salePriceTnd", () => {
  assert.match(src, /const networkMarginRule = \(await getMarginsForAgency\(agencyId, createdByUserId\)\)\.network/)
  assert.match(src, /const totalTnd = applyMargin\(costPriceTnd, networkMarginRule\)/)
  assert.equal(countOccurrences(src, "findApplicableMarginRule"), 0)
  assert.equal(src.includes('from "@/lib/finance/margin-calculator"'), false)
  assert.match(src, /\.network\b/)
  assert.match(src, /supplierPriceTnd: costPriceTnd,/)
})

test("COMMERCIAL-CONVERGENCE-01 : la marge est calculée AVANT la transaction de réservation, comme lib/booking/actions.ts et lib/hotels-monde/guest-booking-actions.ts (jamais imbriquée dans withTenantContext)", () => {
  const marginIdx = src.indexOf("getMarginsForAgency(")
  const txIdx = src.indexOf("withTenantContext(")
  assert.ok(marginIdx > 0 && txIdx > 0 && marginIdx < txIdx, "getMarginsForAgency doit être appelé avant withTenantContext")
})

test("createNetworkProductBooking : débit du crédit partenaire DANS la même transaction (txOverride), idempotencyKey liée à la réservation", () => {
  assert.match(src, /txOverride: tx as Parameters<typeof debitPartnerCredit>\[0\]\["txOverride"\]/)
  assert.match(src, /idempotencyKey: `booking-debit:\$\{reservationId\}`/)
})

test("createNetworkProductBooking : la réservation passe par 'pending' puis 'confirmed' APRÈS le débit — jamais confirmée avant un débit réussi", () => {
  const pendingIdx = src.indexOf('status: "pending"')
  const debitIdx = src.indexOf("await debitPartnerCredit(")
  const confirmedIdx = src.indexOf('status: "confirmed"')
  assert.ok(
    pendingIdx > 0 && pendingIdx < debitIdx && debitIdx < confirmedIdx,
    "ordre attendu : insert pending -> debit -> update confirmed",
  )
})

test("createNetworkProductBooking : vérifie le statut du supplier_node (onboardingStatus === 'active') avant toute réservation — même garde que NETWORK-HARDEN-01", () => {
  assert.match(src, /node\.onboardingStatus !== "active"/)
})

test("aucun nouveau moteur de marge/settlement créé — recordReservationFinancials réutilisé tel quel, commissionPercent/marginRuleId transmis depuis la règle réelle", () => {
  assert.equal(countOccurrences(src, "await recordReservationFinancials("), 1)
  assert.match(src, /commissionPercent: networkMarginRule\.commissionPercent,/)
  assert.match(src, /marginRuleId: networkMarginRule\.ruleId,/)
  assert.equal(countOccurrences(src, "flightCommercialRules"), 0)
})

test("PLATFORM-COMMISSION-NETWORK-01 : creditPlatformCommission réutilisé tel quel (import du module Hotel), appelé UNE fois, DANS la même transaction (tx), APRÈS recordReservationFinancials, avec le commissionAmount qu'il retourne — jamais un second moteur/calcul de commission plateforme", () => {
  assert.match(src, /import \{ creditPlatformCommission \} from "@\/lib\/finance\/platform-commission"/)
  assert.equal(countOccurrences(src, "creditPlatformCommission("), 1)
  assert.match(src, /const \{ commissionAmount \} = await recordReservationFinancials\(/)
  assert.match(src, /await creditPlatformCommission\(tx, \{/)

  const financialsIdx = src.indexOf("await recordReservationFinancials(")
  const creditIdx = src.indexOf("await creditPlatformCommission(tx,")
  const txCloseIdx = src.lastIndexOf("},\n    )")
  assert.ok(
    financialsIdx > 0 && creditIdx > financialsIdx,
    "creditPlatformCommission doit être appelé APRÈS recordReservationFinancials",
  )
  assert.ok(creditIdx < txCloseIdx, "creditPlatformCommission doit être appelé DANS withTenantContext (avant sa fermeture)")
})
