/**
 * ECON-PILOT-01 — invariants statiques sur
 * `lib/network/economic-pilot-actions.ts`.
 *
 * Le fichier porte `"use server"` et importe `revalidatePath` (next/cache),
 * comme `lib/booking/actions.ts`/`lib/suppliers/portal-actions.ts` — il ne
 * peut donc pas être chargé par `node --test` hors du bundler Next.js (même
 * contrainte documentée dans tenant-continuity-invariants.test.ts).
 * Vérification statique sur le code source réel, même méthode.
 */
import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"

const src = readFileSync(
  join(process.cwd(), "lib/network/economic-pilot-actions.ts"),
  "utf8",
)

function countOccurrences(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1
}

test("createNetworkProduct : gated super_admin (requireSuperAdmin) avant toute écriture", () => {
  const fnIdx = src.indexOf("export async function createNetworkProduct")
  const authIdx = src.indexOf("await requireSuperAdmin()", fnIdx)
  const insertIdx = src.indexOf(".insert(products)", fnIdx)
  assert.ok(
    fnIdx > 0 && authIdx > fnIdx && insertIdx > authIdx,
    "l'auth doit précéder l'insert",
  )
})

test("createNetworkProductTestBooking : gated super_admin avant toute lecture/écriture", () => {
  const fnIdx = src.indexOf(
    "export async function createNetworkProductTestBooking",
  )
  const authIdx = src.indexOf("await requireSuperAdmin()", fnIdx)
  const txIdx = src.indexOf("await withTenantContext(", fnIdx)
  assert.ok(
    fnIdx > 0 && authIdx > fnIdx && authIdx < txIdx,
    "l'auth doit précéder la transaction",
  )
})

test("createNetworkProductTestBooking : utilise margin-calculator.ts réel (findApplicableMarginRule + calculateMargin) — jamais une formule de marge inventée", () => {
  assert.match(
    src,
    /import \{\s*\n\s*findApplicableMarginRule,\s*\n\s*calculateMargin,/,
  )
  assert.equal(countOccurrences(src, "findApplicableMarginRule("), 1)
  assert.equal(countOccurrences(src, "calculateMargin("), 1)
})

test("createNetworkProductTestBooking : recordReservationFinancials reçoit le supplierPriceTnd RÉEL du moteur de marge — jamais supplierPriceTnd = salePriceTnd (le raccourci Activités/Omra n'est pas reproduit ici)", () => {
  const callIdx = src.indexOf("await recordReservationFinancials({")
  const callBlock = src.slice(callIdx, src.indexOf("})", callIdx))
  assert.match(callBlock, /supplierPriceTnd: marginResult\.supplierPriceTnd,/)
  assert.equal(countOccurrences(src, "supplierPriceTnd: totalTnd"), 0)
})

test("createNetworkProductTestBooking : exige un produit avec supplierNodeId ET costPrice renseignés — jamais une réservation Network sur un produit sans coût", () => {
  const fnIdx = src.indexOf(
    "export async function createNetworkProductTestBooking",
  )
  const fnBody = src.slice(
    fnIdx,
    src.indexOf("\nexport async function", fnIdx + 1),
  )
  assert.match(fnBody, /if \(!product\.supplierNodeId\)/)
  assert.match(fnBody, /if \(!product\.costPrice\)/)
})

test("createNetworkProductTestBooking : exige un client réel existant — jamais un client fabriqué/synthétique", () => {
  assert.equal(countOccurrences(src, "Client introuvable"), 1)
  assert.equal(countOccurrences(src, "resolveOrCreateLinkedCustomer"), 0)
})

test("createNetworkProduct et createNetworkProductTestBooking : réutilisent tous deux getDefaultAgencyId() (même précédent que le guest checkout B2C) — jamais un agencyId nullable ni une nouvelle résolution d'agence", () => {
  assert.equal(countOccurrences(src, "await getDefaultAgencyId()"), 2)
})

test("aucune nouvelle table/moteur de marge créé — margin_rules importée et utilisée, aucune référence à un moteur concurrent (flightCommercialRules)", () => {
  assert.match(src, /import \{\s*\n\s*products,[\s\S]{0,120}marginRules,/)
  assert.match(src, /\.from\(marginRules\)/)
  assert.equal(countOccurrences(src, "flightCommercialRules"), 0)
})
