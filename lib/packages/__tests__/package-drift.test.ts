/**
 * PACKAGE-DRIFT-01 — invariants sur la garde anti-drift de prix pour
 * les chemins de réservation Package B2C guest et B2B partenaire.
 *
 * Invariants protégés :
 *
 *  T1  — vatRatePct présent dans PackageGuestBookingFormProps.
 *  T2  — expectedTotalTnd transmis vers createGuestPackageBooking (form B2C).
 *  T3  — computePriceBreakdown importé dans le form B2C.
 *  T4  — page /packages/[slug]/book appelle getActiveFiscalRule et transmet vatRatePct.
 *  T5  — garde priceDrifted avant le premier .insert( (position structurelle, B2C).
 *  T6  — PRICE_CHANGED dans booking-actions (B2C + B2B).
 *  T7  — vatRatePct dans kind="departure" du type BookableOption (B2B options).
 *  T8  — expectedTotalTnd transmis dans createPackageBooking (B2B composant).
 *  T9  — harness : computePriceBreakdown avec unitChildPriceTnd=undefined donne
 *         même totalTnd que avec unitChildPriceTnd=adultPrice*0.5 (parité fallback 50 %).
 *  T10 — harness : priceDrifted(undefined, 119) → false (bypass silencieux documenté —
 *         guard inactive si vatRatePct absent, server fail-closed FISCAL_RULE_NOT_FOUND).
 */

import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { computePriceBreakdown, priceDrifted } from "../../booking/pricing.js"

const ROOT = process.cwd()
const read = (p: string) => readFileSync(join(ROOT, p), "utf8")

const formSrc = read("components/packages/package-guest-booking-form.tsx")
const pageSrc = read("app/(public)/[locale]/packages/[slug]/book/page.tsx")
const bookingActionsSrc = read("lib/packages/booking-actions.ts")
const optionsSrc = read("lib/b2b/product-booking-options-actions.ts")
const b2bComponentSrc = read("components/pro/authorized-products-list.tsx")

// ─── T1 — vatRatePct prop dans PackageGuestBookingFormProps ───────────────────

test("PACKAGE-DRIFT-01 T1: vatRatePct présent dans PackageGuestBookingFormProps", () => {
  const propsIdx = formSrc.indexOf("PackageGuestBookingFormProps")
  assert.ok(propsIdx !== -1, "PackageGuestBookingFormProps non trouvé")
  assert.match(formSrc.slice(propsIdx, propsIdx + 700), /vatRatePct/)
})

// ─── T2 — expectedTotalTnd transmis dans createGuestPackageBooking ────────────

test("PACKAGE-DRIFT-01 T2: expectedTotalTnd transmis vers createGuestPackageBooking dans le form B2C", () => {
  const callIdx = formSrc.indexOf("createGuestPackageBooking(")
  assert.ok(callIdx !== -1, "createGuestPackageBooking non trouvé dans le form")
  assert.match(formSrc.slice(callIdx, callIdx + 400), /expectedTotalTnd/)
})

// ─── T3 — computePriceBreakdown importé dans le form ────────────────────────

test("PACKAGE-DRIFT-01 T3: computePriceBreakdown importé depuis @/lib/booking/pricing dans le form B2C", () => {
  assert.match(formSrc, /computePriceBreakdown/)
  assert.match(formSrc, /from.*@\/lib\/booking\/pricing/)
})

// ─── T4 — page packages/[slug]/book — getActiveFiscalRule + vatRatePct ────────

test("PACKAGE-DRIFT-01 T4: page packages/book appelle getActiveFiscalRule et transmet vatRatePct au form", () => {
  assert.match(pageSrc, /getActiveFiscalRule/)
  assert.match(pageSrc, /from.*@\/lib\/finance\/fiscal-rules/)
  const formCallIdx = pageSrc.indexOf("<PackageGuestBookingForm")
  assert.ok(
    formCallIdx !== -1,
    "<PackageGuestBookingForm non trouvé dans la page",
  )
  assert.match(pageSrc.slice(formCallIdx, formCallIdx + 1200), /vatRatePct/)
})

// ─── T5 — garde priceDrifted avant .insert( (position structurelle, B2C) ─────

test("PACKAGE-DRIFT-01 T5: priceDrifted positionnée avant .insert( dans booking-actions (B2C)", () => {
  const guardIdx = bookingActionsSrc.indexOf("priceDrifted(")
  const insertIdx = bookingActionsSrc.indexOf(".insert(")
  assert.ok(guardIdx !== -1, "priceDrifted non trouvé dans booking-actions")
  assert.ok(insertIdx !== -1, ".insert non trouvé dans booking-actions")
  assert.ok(
    guardIdx < insertIdx,
    `garde priceDrifted (idx=${guardIdx}) DOIT précéder .insert (idx=${insertIdx})`,
  )
})

// ─── T6 — PRICE_CHANGED dans booking-actions (B2C + B2B) ─────────────────────

test("PACKAGE-DRIFT-01 T6: PRICE_CHANGED présent dans booking-actions", () => {
  assert.match(bookingActionsSrc, /PRICE_CHANGED/)
})

// ─── T7 — vatRatePct dans kind="departure" du type BookableOption ─────────────

test('PACKAGE-DRIFT-01 T7: vatRatePct présent dans kind="departure" de BookableOption', () => {
  const departureKindIdx = optionsSrc.indexOf('kind: "departure"')
  assert.ok(
    departureKindIdx !== -1,
    'kind: "departure" non trouvé dans options-actions',
  )
  // vatRatePct doit apparaître dans la définition du type (avant le prochain kind:)
  const nextKindIdx = optionsSrc.indexOf('kind: "session"', departureKindIdx)
  assert.match(optionsSrc.slice(departureKindIdx, nextKindIdx), /vatRatePct/)
})

// ─── T8 — expectedTotalTnd transmis dans createPackageBooking (B2B) ───────────

test("PACKAGE-DRIFT-01 T8: expectedTotalTnd transmis dans createPackageBooking dans le composant B2B", () => {
  const callIdx = b2bComponentSrc.indexOf("createPackageBooking(")
  assert.ok(
    callIdx !== -1,
    "createPackageBooking non trouvé dans authorized-products-list",
  )
  assert.match(
    b2bComponentSrc.slice(callIdx, callIdx + 400),
    /expectedTotalTnd/,
  )
})

// ─── T9 — parité fallback 50 % enfant : unitChildPriceTnd=undefined ≡ adultPrice*0.5 ─

test("PACKAGE-DRIFT-01 T9: computePriceBreakdown avec unitChildPriceTnd=undefined donne même totalTnd que unitChildPriceTnd=adultPrice*0.5", () => {
  const adultPrice = 100
  const childFallbackPrice = adultPrice * 0.5
  const vatRate = 19

  const bdImplicit = computePriceBreakdown({
    unitPriceTnd: adultPrice,
    adults: 2,
    children: 1,
    unitChildPriceTnd: undefined, // fallback interne = adultPrice * 0.5
    depositPercent: 100,
    vatRate,
  })
  const bdExplicit = computePriceBreakdown({
    unitPriceTnd: adultPrice,
    adults: 2,
    children: 1,
    unitChildPriceTnd: childFallbackPrice, // même valeur passée explicitement
    depositPercent: 100,
    vatRate,
  })
  assert.equal(
    bdImplicit.totalTnd,
    bdExplicit.totalTnd,
    `fallback 50 % doit produire le même totalTnd : implicite=${bdImplicit.totalTnd}, explicite=${bdExplicit.totalTnd}`,
  )
  // Vérification numérique : HT = 2*100 + 1*50 = 250, TVA = 47.5, TTC = 297.5
  assert.equal(bdImplicit.subtotalTnd, 250)
  assert.equal(bdImplicit.totalTnd, 297.5)
})

// ─── T10 — bypass silencieux documenté : guard inactive si vatRatePct absent ──

test("PACKAGE-DRIFT-01 T10: priceDrifted(undefined, 119) → false (guard inactive quand vatRatePct absent — server fail-closed FISCAL_RULE_NOT_FOUND)", () => {
  assert.equal(
    priceDrifted(undefined, 119),
    false,
    "expectedTnd absent → garde inactive (comportement documenté, server fail-closed)",
  )
})
