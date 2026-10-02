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

const src = readFileSync(
  join(process.cwd(), "lib/network/product-booking-actions.ts"),
  "utf8",
)

function countOccurrences(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1
}

test("createNetworkProductBooking : résolution de session RÉELLE (resolveSessionContext) — jamais un staff/super_admin substitué à l'agence revendeuse", () => {
  assert.match(src, /await resolveSessionContext\(\)/)
  assert.equal(countOccurrences(src, "requireSuperAdmin"), 0)
})

test("COMMERCIAL-CONVERGENCE-01 : utilise le moteur de marge RÉEL et configurable (getMarginsForAgency/applyMargin, module 'network') — jamais margin-calculator.ts (marginRules sans aucun chemin d'écriture), jamais supplierPriceTnd = salePriceTnd", () => {
  assert.match(
    src,
    /const networkMarginRule = \(\s*\n?\s*await getMarginsForAgency\(agencyId, createdByUserId\)\s*\n?\s*\)\.network/,
  )
  assert.match(
    src,
    /const totalTnd = applyMargin\(costPriceTnd, networkMarginRule\)/,
  )
  assert.equal(countOccurrences(src, "findApplicableMarginRule"), 0)
  assert.equal(src.includes('from "@/lib/finance/margin-calculator"'), false)
  assert.match(src, /\.network\b/)
  assert.match(src, /supplierPriceTnd: costPriceTnd,/)
})

test("COMMERCIAL-CONVERGENCE-01 : la marge est calculée AVANT la transaction de réservation, comme lib/booking/actions.ts et lib/hotels-monde/guest-booking-actions.ts (jamais imbriquée dans withTenantContext)", () => {
  const marginIdx = src.indexOf("getMarginsForAgency(")
  const txIdx = src.indexOf("withTenantContext(")
  assert.ok(
    marginIdx > 0 && txIdx > 0 && marginIdx < txIdx,
    "getMarginsForAgency doit être appelé avant withTenantContext",
  )
})

test("createNetworkProductBooking : débit du crédit partenaire DANS la même transaction (txOverride), idempotencyKey liée à la réservation", () => {
  assert.match(
    src,
    /txOverride: tx as Parameters<\s*\n?\s*typeof debitPartnerCredit\s*\n?\s*>\[0\]\["txOverride"\]/,
  )
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

test("createNetworkProductBooking : vérifie que le supplier_node est actif avant toute réservation — via network_product_node_is_active() (NETWORK-NODE-VISIBILITY-01), jamais un SELECT direct sur supplier_nodes (super_admin-only en RLS, invisible pour une agence sous app_runtime)", () => {
  assert.match(
    src,
    /network_product_node_is_active\(\$\{booking\.productId\}::uuid\)/,
  )
  assert.match(src, /if \(!nodeIsActive\)/)
  assert.equal(src.includes(".from(supplierNodes)"), false)
  assert.equal(/\bsupplierNodes\b/.test(src.replace(/\/\/.*$/gm, "")), false)
})

test("NETWORK-NODE-VISIBILITY-01 : la migration 0083 crée la fonction SECURITY DEFINER, limitée au produit visible par l'appelant, EXECUTE réservé au backend", () => {
  const mig = readFileSync(
    join(process.cwd(), "drizzle/manual/0083_network_node_visibility_01.sql"),
    "utf8",
  )
  assert.match(
    mig,
    /CREATE OR REPLACE FUNCTION network_product_node_is_active\(p_product_id uuid\)/,
  )
  assert.match(mig, /SECURITY DEFINER/)
  assert.match(mig, /SET search_path = public/)
  assert.match(mig, /RETURNS boolean/)
  assert.match(mig, /p\.agency_id = current_agency_id\(\)/)
  assert.match(mig, /pa\.agency_id = current_agency_id\(\)/)
  assert.match(
    mig,
    /REVOKE EXECUTE ON FUNCTION network_product_node_is_active\(uuid\) FROM anon, authenticated/,
  )
  assert.match(
    mig,
    /GRANT EXECUTE ON FUNCTION network_product_node_is_active\(uuid\) TO service_role, app_runtime/,
  )
})

test("aucun nouveau moteur de marge/settlement créé — recordReservationFinancials réutilisé tel quel, commissionPercent/marginRuleId transmis depuis la règle réelle", () => {
  assert.equal(countOccurrences(src, "await recordReservationFinancials("), 1)
  assert.match(src, /commissionPercent: networkMarginRule\.commissionPercent,/)
  assert.match(src, /marginRuleId: networkMarginRule\.ruleId,/)
  assert.equal(countOccurrences(src, "flightCommercialRules"), 0)
})

test("ECON-BREAKDOWN-01 : 'CURRENT ASSUMPTION — NOT ENFORCED' documentée verbatim là où les lignes de droit sont construites (Network traite costPrice comme TND sans jamais LIRE product.costCurrency dans le code exécutable)", () => {
  assert.match(src, /CURRENT ASSUMPTION — NOT ENFORCED/)
  // `product.costCurrency` n'apparaît que dans les commentaires qui
  // documentent CETTE hypothèse — jamais dans une ligne de code exécutable
  // (aucune lecture réelle de la colonne, aucun garde-fou ajouté, décision
  // Direction 2026-09-30).
  const codeLines = src
    .split("\n")
    .filter(
      (line) => !line.trim().startsWith("//") && !line.trim().startsWith("*"),
    )
    .join("\n")
  assert.equal(
    countOccurrences(codeLines, "costCurrency"),
    0,
    "le call site ne doit PAS lire costCurrency en dehors des commentaires",
  )
})

test("ECON-BREAKDOWN-01 : recordReservationFinancials reçoit exactement 3 lignes economic_entitlements (supplier/seller/easy2book), qualifications et rôles conformes à docs/ECONOMIC_MODEL.md §3.1", () => {
  assert.match(src, /economicEntitlements: \[/)
  assert.match(src, /role: "supplier",\s*\n\s*qualification: "supplier_cost",/)
  assert.match(src, /role: "seller",\s*\n\s*qualification: "seller_margin",/)
  assert.match(src, /role: "easy2book",\s*\n\s*qualification: "commission",/)
  // party_id du fournisseur = supplier_nodes.id RÉEL (product.supplierNodeId), jamais null/inventé
  assert.match(src, /partyId: product\.supplierNodeId,/)
  // party_id du vendeur = l'agence revendeuse réelle (session), jamais l'agence par défaut du produit
  assert.match(src, /partyId: agencyId,\s*\n\s*role: "seller",/)
})

test("ECON-BREAKDOWN-01 : la ligne 'seller_margin' est nette de commission, et la formule de commission dupliquée ici est TEXTUELLEMENT la même que celle de recordReservationFinancials() (même arrondi, même 2 décimales) — jamais une deuxième formule divergente", () => {
  const financialsSrc = readFileSync(
    join(process.cwd(), "lib/finance/reservation-financials.ts"),
    "utf8",
  )
  const callSiteFormula =
    /Math\.round\(\s*\n?\s*marginAmountTnd \* \(commissionRateForEntitlements \/ 100\) \* 100,?\s*\n?\s*\) \/ 100/
  const financialsFormula =
    /Math\.round\(marginAmount \* \(commissionRate \/ 100\) \* 100\) \/ 100/
  assert.match(
    src,
    callSiteFormula,
    "formule de commission absente/différente côté call site",
  )
  assert.match(
    financialsSrc,
    financialsFormula,
    "formule de commission absente/différente côté recordReservationFinancials",
  )
  assert.match(
    src,
    /amount: marginAmountTnd - commissionAmountForEntitlements,/,
  )
})

test("ECON-BREAKDOWN-01 : Σ des 3 montants (supplier_cost + seller_margin net + commission) égale algébriquement totalTnd (= salePriceTnd), pour toute valeur — preuve symbolique, indépendante des valeurs réelles à l'exécution", () => {
  // costPriceTnd + (marginAmountTnd - commissionAmountForEntitlements) + commissionAmountForEntitlements
  //   = costPriceTnd + marginAmountTnd
  //   = costPriceTnd + (totalTnd - costPriceTnd)
  //   = totalTnd
  // Vérifié numériquement ici pour plusieurs couples (coût, marge%, commission%) avec la
  // MÊME formule que product-booking-actions.ts (copie littérale, pas une nouvelle formule).
  function applyMarginLike(net: number, pct: number) {
    return Math.round(net * (1 + pct / 100) * 1000) / 1000
  }
  const cases = [
    { cost: 700, marginPct: 10, commissionPct: 20 },
    { cost: 1000, marginPct: 0, commissionPct: 50 },
    { cost: 123.456, marginPct: 7.5, commissionPct: 0 },
  ]
  for (const c of cases) {
    const totalTnd = applyMarginLike(c.cost, c.marginPct)
    const marginAmountTnd = totalTnd - c.cost
    const commissionAmount =
      Math.round(marginAmountTnd * (c.commissionPct / 100) * 100) / 100
    const supplier = c.cost
    const seller = marginAmountTnd - commissionAmount
    const easy2book = commissionAmount
    const sum = Math.round((supplier + seller + easy2book) * 100) / 100
    const expected = Math.round(totalTnd * 100) / 100
    assert.equal(
      sum,
      expected,
      `Σ lignes (${sum}) ≠ totalTnd (${expected}) pour ${JSON.stringify(c)}`,
    )
  }
})

test("PLATFORM-COMMISSION-NETWORK-01 : creditPlatformCommission réutilisé tel quel (import du module Hotel), appelé UNE fois, DANS la même transaction (tx), APRÈS recordReservationFinancials, avec le commissionAmount qu'il retourne — jamais un second moteur/calcul de commission plateforme", () => {
  assert.match(
    src,
    /import \{ creditPlatformCommission \} from "@\/lib\/finance\/platform-commission"/,
  )
  assert.equal(countOccurrences(src, "creditPlatformCommission("), 1)
  assert.match(
    src,
    /const \{ commissionAmount \} = await recordReservationFinancials\(/,
  )
  assert.match(src, /await creditPlatformCommission\(tx, \{/)

  const financialsIdx = src.indexOf("await recordReservationFinancials(")
  const creditIdx = src.indexOf("await creditPlatformCommission(tx,")
  const txCloseIdx = src.lastIndexOf("},\n    )")
  assert.ok(
    financialsIdx > 0 && creditIdx > financialsIdx,
    "creditPlatformCommission doit être appelé APRÈS recordReservationFinancials",
  )
  assert.ok(
    creditIdx < txCloseIdx,
    "creditPlatformCommission doit être appelé DANS withTenantContext (avant sa fermeture)",
  )
})
