/**
 * ACTIVITY-B2C-DRIFT-01 — invariants sur la garde anti-drift de prix pour
 * le chemin de réservation Activité / Attraction B2C guest.
 *
 * Invariants protégés :
 *
 *  T1  — vatRatePct présent dans ActivityGuestBookingFormProps.
 *  T2  — expectedTotalTnd transmis vers createGuestActivityBooking (form).
 *  T3  — computePriceBreakdown importé dans le form (même formule que serveur).
 *  T4  — page /activities/[slug]/book appelle getActiveFiscalRule et transmet vatRatePct.
 *  T5  — page /attractions/[slug]/book idem.
 *  T6  — garde priceDrifted avant l'insert (non-régression structurelle).
 *  T7  — PRICE_CHANGED dans la map d'erreurs (non-régression).
 *  T8  — computePriceBreakdown(100, 1 adulte, vatRate=19) → totalTnd=119.
 *  T9  — priceDrifted(100, 119) → true  (HT ≠ TTC : preuve que sans fix la garde casserait).
 *  T10 — priceDrifted(undefined, 119) → false  (fallback silencieux sans règle fiscale).
 *  T11 — harness : priceDrifted(expectedTtc, recomputedTtc) → false quand les deux
 *         correspondent (bonne réservation — guard ne bloque pas).
 *  T12 — harness : priceDrifted(stalePrice, recomputedTtc) → true quand le prix
 *         catalogue a changé entre affichage et submit (PRICE_CHANGED serait levé
 *         AVANT tout insert DB — prouvé par position de garde T6 + throw T7).
 */

import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { computePriceBreakdown, priceDrifted } from "../../booking/pricing.js"

const ROOT = process.cwd()
const read = (p: string) => readFileSync(join(ROOT, p), "utf8")

const formSrc = read("components/activities/activity-guest-booking-form.tsx")
const actBookSrc = read("app/(public)/[locale]/activities/[slug]/book/page.tsx")
const attBookSrc = read(
  "app/(public)/[locale]/attractions/[slug]/book/page.tsx",
)
const guestActionSrc = read("lib/activities/guest-booking-actions.ts")

// ─── T1 — vatRatePct dans ActivityGuestBookingFormProps ──────────────────────

test("ACTIVITY-B2C-DRIFT-01 T1: vatRatePct présent dans ActivityGuestBookingFormProps", () => {
  const propsIdx = formSrc.indexOf("ActivityGuestBookingFormProps")
  assert.ok(propsIdx !== -1, "ActivityGuestBookingFormProps non trouvé")
  assert.match(formSrc.slice(propsIdx, propsIdx + 600), /vatRatePct/)
})

// ─── T2 — expectedTotalTnd dans l'appel createGuestActivityBooking ───────────

test("ACTIVITY-B2C-DRIFT-01 T2: expectedTotalTnd transmis vers createGuestActivityBooking dans le form", () => {
  const callIdx = formSrc.indexOf("createGuestActivityBooking(")
  assert.ok(
    callIdx !== -1,
    "createGuestActivityBooking non trouvé dans le form",
  )
  assert.match(formSrc.slice(callIdx, callIdx + 400), /expectedTotalTnd/)
})

// ─── T3 — computePriceBreakdown importé dans le form ────────────────────────

test("ACTIVITY-B2C-DRIFT-01 T3: computePriceBreakdown importé depuis @/lib/booking/pricing dans le form", () => {
  assert.match(formSrc, /computePriceBreakdown/)
  assert.match(formSrc, /from.*@\/lib\/booking\/pricing/)
})

// ─── T4 — page activities/[slug]/book — getActiveFiscalRule + vatRatePct ─────

test("ACTIVITY-B2C-DRIFT-01 T4: page activities/book appelle getActiveFiscalRule et transmet vatRatePct au form", () => {
  assert.match(actBookSrc, /getActiveFiscalRule/)
  assert.match(actBookSrc, /from.*@\/lib\/finance\/fiscal-rules/)
  const formCallIdx = actBookSrc.indexOf("<ActivityGuestBookingForm")
  assert.ok(
    formCallIdx !== -1,
    "<ActivityGuestBookingForm non trouvé dans la page",
  )
  assert.match(actBookSrc.slice(formCallIdx, formCallIdx + 900), /vatRatePct/)
})

// ─── T5 — page attractions/[slug]/book — getActiveFiscalRule + vatRatePct ────

test("ACTIVITY-B2C-DRIFT-01 T5: page attractions/book appelle getActiveFiscalRule et transmet vatRatePct au form", () => {
  assert.match(attBookSrc, /getActiveFiscalRule/)
  assert.match(attBookSrc, /from.*@\/lib\/finance\/fiscal-rules/)
  const formCallIdx = attBookSrc.indexOf("<ActivityGuestBookingForm")
  assert.ok(
    formCallIdx !== -1,
    "<ActivityGuestBookingForm non trouvé dans la page",
  )
  assert.match(attBookSrc.slice(formCallIdx, formCallIdx + 900), /vatRatePct/)
})

// ─── T6 — garde priceDrifted avant l'insert (position structurelle) ──────────

test("ACTIVITY-B2C-DRIFT-01 T6: priceDrifted positionnée avant l'insert dans guest-booking-actions", () => {
  const guardIdx = guestActionSrc.indexOf("priceDrifted(")
  const insertIdx = guestActionSrc.indexOf(".insert(")
  assert.ok(
    guardIdx !== -1,
    "priceDrifted non trouvé dans guest-booking-actions",
  )
  assert.ok(insertIdx !== -1, ".insert non trouvé dans guest-booking-actions")
  assert.ok(
    guardIdx < insertIdx,
    `garde priceDrifted (idx=${guardIdx}) DOIT précéder .insert (idx=${insertIdx})`,
  )
})

// ─── T7 — PRICE_CHANGED dans la map d'erreurs (non-régression) ───────────────

test("ACTIVITY-B2C-DRIFT-01 T7: PRICE_CHANGED présent dans guest-booking-actions", () => {
  assert.match(guestActionSrc, /PRICE_CHANGED/)
})

// ─── T8 — computePriceBreakdown pur : 1 adulte × 100 DT HT + TVA 19 % → 119 DT TTC ─

test("ACTIVITY-B2C-DRIFT-01 T8: computePriceBreakdown(100 HT, 1 adulte, vatRate=19) → totalTnd=119", () => {
  const bd = computePriceBreakdown({
    unitPriceTnd: 100,
    adults: 1,
    children: 0,
    depositPercent: 100,
    vatRate: 19,
  })
  assert.equal(bd.totalTnd, 119, `TTC attendu 119, reçu ${bd.totalTnd}`)
  assert.equal(bd.subtotalTnd, 100)
  assert.equal(bd.vatTnd, 19)
})

// ─── T9 — HT ≠ TTC : preuve que sans fix la garde casserait ─────────────────

test("ACTIVITY-B2C-DRIFT-01 T9: priceDrifted(100_HT, 119_TTC) → true (sans fix, form envoyait HT au lieu de TTC)", () => {
  // Sans ACTIVITY-B2C-DRIFT-01, le form transmettait HT=100 comme expectedTotalTnd.
  // Le serveur calcule TTC=119. La garde priceDrifted(100, 119) retournerait true
  // → PRICE_CHANGED levé sur toute réservation normale.
  // Ce test prouve que le bug était réel et que le fix (TTC → TTC) est nécessaire.
  const htSentByForm = 100
  const ttcComputedByServer = 119
  assert.equal(
    priceDrifted(htSentByForm, ttcComputedByServer),
    true,
    "HT ≠ TTC : la garde aurait bloqué toutes les réservations sans le fix",
  )
})

// ─── T10 — priceDrifted(undefined, ...) → false (fallback sans règle fiscale) ─

test("ACTIVITY-B2C-DRIFT-01 T10: priceDrifted(undefined, 119) → false (fallback silencieux sans vatRatePct)", () => {
  assert.equal(
    priceDrifted(undefined, 119),
    false,
    "expectedTnd absent → garde inactive (comportement hérité B2B / server-server)",
  )
})

// ─── T11 — harness comportemental : TTC identique → garde ne bloque pas ──────

test("ACTIVITY-B2C-DRIFT-01 T11: harness — forme corrigée : expectedTotaTnd=TTC → priceDrifted retourne false", () => {
  // Simule le chemin corrigé :
  //   Form : vatRatePct=19, adultPrice=100, adults=2, children=0
  //   Form calcule TTC via computePriceBreakdown → expectedTotalTnd = 238
  //   Serveur recalcule TTC identique → breakdownBeforePromo.totalTnd = 238
  //   Résultat : priceDrifted(238, 238) → false → aucun throw → réservation créée
  const adultPrice = 100
  const adults = 2
  const vatRate = 19

  const formBreakdown = computePriceBreakdown({
    unitPriceTnd: adultPrice,
    adults,
    children: 0,
    depositPercent: 100,
    vatRate,
  })
  // Serveur recalcule avec les mêmes données catalogue
  const serverBreakdown = computePriceBreakdown({
    unitPriceTnd: adultPrice,
    adults,
    children: 0,
    depositPercent: 100,
    vatRate,
  })
  assert.equal(formBreakdown.totalTnd, 238)
  assert.equal(serverBreakdown.totalTnd, 238)
  assert.equal(
    priceDrifted(formBreakdown.totalTnd, serverBreakdown.totalTnd),
    false,
    "prix identiques → garde ne doit pas bloquer",
  )
})

// ─── T12 — harness comportemental : prix catalogue changé → guard fire → pas d'insert ─

test("ACTIVITY-B2C-DRIFT-01 T12: harness — prix catalogue modifié entre affichage et submit → priceDrifted retourne true (PRICE_CHANGED AVANT insert prouvé par T6+T7)", () => {
  // Simule : utilisateur voit prix=100 DT HT (affiché), prix recatalogué à 120 DT HT
  // avant que sa soumission n'arrive au serveur.
  const vatRate = 19
  const priceAtDisplayTime = 100
  const priceAtSubmitTime = 120 // catalogue mis à jour côté serveur

  // Form calcule TTC avec le prix de l'affichage
  const formBreakdown = computePriceBreakdown({
    unitPriceTnd: priceAtDisplayTime,
    adults: 1,
    children: 0,
    depositPercent: 100,
    vatRate,
  })
  // Serveur recalcule avec le nouveau prix catalogue
  const serverBreakdown = computePriceBreakdown({
    unitPriceTnd: priceAtSubmitTime,
    adults: 1,
    children: 0,
    depositPercent: 100,
    vatRate,
  })
  assert.equal(
    formBreakdown.totalTnd,
    119,
    `TTC form=119, reçu ${formBreakdown.totalTnd}`,
  )
  assert.equal(
    serverBreakdown.totalTnd,
    142.8,
    `TTC server=142.8, reçu ${serverBreakdown.totalTnd}`,
  )

  // La garde priceDrifted retourne true → côté serveur, PriceChanged est levé
  // avant tout .insert() (prouvé par T6 : guardIdx < insertIdx)
  // → aucune réservation créée, client reçoit PRICE_CHANGED (prouvé par T7).
  assert.equal(
    priceDrifted(formBreakdown.totalTnd, serverBreakdown.totalTnd),
    true,
    "drift détecté : PRICE_CHANGED sera levé avant l'insert DB",
  )
})
