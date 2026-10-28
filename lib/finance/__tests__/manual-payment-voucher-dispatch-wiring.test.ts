/**
 * VOUCHER-DISPATCH-MULTIMODULE-01 — invariants statiques sur l'extension du
 * dispatch de confirmation dans manual-payment-actions.ts aux modules
 * hotel_monde/omra/package.
 *
 * Avant ce chantier, seul module==="hotel" déclenchait un event après un
 * paiement manuel intégral (voir manual-payment-voucher-wiring.test.ts,
 * inchangé) : un paiement manuel validé pour hotel_monde/omra/package
 * confirmait bien la réservation mais n'envoyait jamais la
 * confirmation/voucher au client — gap silencieux.
 *
 * car/transfer restent volontairement hors périmètre de ce chantier : les
 * champs nécessaires à leur event (rentalDays/insuranceLevel/pickupAt pour
 * car ; date/heure de prise en charge pour transfer) ne sont persistés nulle
 * part en base après la création de la réservation — voir le commentaire
 * dans manual-payment-actions.ts et le rapport du chantier.
 *
 * Pattern readFileSync — même discipline que manual-payment-voucher-wiring.test.ts.
 */
import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"

const ROOT = process.cwd()
const src = readFileSync(
  join(ROOT, "lib/finance/manual-payment-actions.ts"),
  "utf8",
)

// ─── hotel_monde réutilise le même event booking/confirmed que hotel ──────

test('VOUCHER-DISPATCH-01 : garde étendue à detail?.module === "hotel_monde"', () => {
  assert.match(src, /detail\?\.module\s*===\s*["']hotel_monde["']/)
})

test("VOUCHER-DISPATCH-01 : hotel et hotel_monde combinés dans la même condition (pas un second sendEvent dupliqué)", () => {
  assert.match(
    src,
    /detail\?\.module\s*===\s*["']hotel["']\s*\|\|\s*detail\?\.module\s*===\s*["']hotel_monde["']/,
  )
  // Un seul sendEvent("booking/confirmed", ...) dans tout le fichier.
  const matches = src.match(/sendEvent\(["']booking\/confirmed["']/g) ?? []
  assert.equal(matches.length, 1)
})

// ─── Omra : nouvel event booking/omra.confirmed ────────────────────────────

test('VOUCHER-DISPATCH-01 : garde detail?.module === "omra" avant sendEvent omra', () => {
  assert.match(src, /detail\?\.module\s*===\s*["']omra["']/)
})

test("VOUCHER-DISPATCH-01 : omra — utilise sendEvent (pas inngest.send direct)", () => {
  assert.match(src, /await sendEvent\(["']booking\/omra\.confirmed["']/)
})

test("VOUCHER-DISPATCH-01 : omra — payload contient packageName, pilgrimsCount, departureDate, contactEmail, totalTnd", () => {
  const idx = src.indexOf('sendEvent("booking/omra.confirmed"')
  const block = src.slice(idx, idx + 600)
  assert.match(block, /packageName/)
  assert.match(block, /pilgrimsCount/)
  assert.match(block, /departureDate/)
  assert.match(block, /contactEmail/)
  assert.match(block, /totalTnd:\s*Number\.parseFloat\(detail\.tndAmount\)/)
})

test("VOUCHER-DISPATCH-01 : omra — packageName source = omraPackages.name (jamais un champ inventé)", () => {
  assert.match(src, /omraPackageName:\s*omraPackages\.name/)
  assert.match(
    src,
    /omraPackages,\s*\n\s*eq\(omraPackages\.id,\s*reservationOmra\.omraPackageId\)/,
  )
})

test("VOUCHER-DISPATCH-01 : omra — fire-and-forget (.catch) comme le chemin hôtel", () => {
  assert.match(
    src,
    /sendEvent\(["']booking\/omra\.confirmed["'][\s\S]{0,600}?\)\.catch\(/,
  )
})

// ─── Package : nouvel event booking/package.confirmed ─────────────────────

test('VOUCHER-DISPATCH-01 : garde detail?.module === "package" avant sendEvent package', () => {
  assert.match(src, /detail\?\.module\s*===\s*["']package["']/)
})

test("VOUCHER-DISPATCH-01 : package — utilise sendEvent (pas inngest.send direct)", () => {
  assert.match(src, /await sendEvent\(["']booking\/package\.confirmed["']/)
})

test("VOUCHER-DISPATCH-01 : package — payload contient packageName, departureDate, paxCount, contactEmail, totalTnd", () => {
  const idx = src.indexOf('sendEvent("booking/package.confirmed"')
  const block = src.slice(idx, idx + 600)
  assert.match(block, /packageName/)
  assert.match(block, /departureDate/)
  assert.match(block, /paxCount/)
  assert.match(block, /contactEmail/)
  assert.match(block, /totalTnd:\s*Number\.parseFloat\(detail\.tndAmount\)/)
})

test("VOUCHER-DISPATCH-01 : package — packageName source = catalogPackages.title (jamais un champ inventé)", () => {
  assert.match(src, /pkgTitle:\s*catalogPackages\.title/)
  assert.match(
    src,
    /catalogPackages,\s*\n\s*eq\(catalogPackages\.id,\s*reservationPackage\.packageId\)/,
  )
})

test("VOUCHER-DISPATCH-01 : package — paxCount = adults + childrenAges.length (même convention que le module hôtel)", () => {
  assert.match(
    src,
    /paxCount:\s*\n?\s*\(detail\.pkgAdults\s*\?\?\s*0\)\s*\+\s*\(detail\.pkgChildrenAges\?\.length\s*\?\?\s*0\)/,
  )
})

test("VOUCHER-DISPATCH-01 : package — fire-and-forget (.catch) comme le chemin hôtel", () => {
  assert.match(
    src,
    /sendEvent\(["']booking\/package\.confirmed["'][\s\S]{0,600}?\)\.catch\(/,
  )
})

// ─── Validation renforcée : échec de garde jamais silencieux ──────────────

test("VOUCHER-DISPATCH-01 : omra — données manquantes loggées (jamais un échec silencieux)", () => {
  assert.match(src, /booking\/omra\.confirmed non envoyé — données manquantes/)
})

test("VOUCHER-DISPATCH-01 : package — données manquantes loggées (jamais un échec silencieux)", () => {
  assert.match(
    src,
    /booking\/package\.confirmed non envoyé — données manquantes/,
  )
})

// ─── car/transfer : explicitement non câblés dans ce chantier ─────────────

test("VOUCHER-DISPATCH-01 : aucun sendEvent booking/car.confirmed ni booking/transfer.confirmed depuis le paiement manuel (hors périmètre documenté)", () => {
  assert.doesNotMatch(src, /sendEvent\(["']booking\/car\.confirmed["']/)
  assert.doesNotMatch(src, /sendEvent\(["']booking\/transfer\.confirmed["']/)
})
