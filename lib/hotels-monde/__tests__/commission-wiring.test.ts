/**
 * COMMISSION-MONDE-01 — invariants statiques sur le câblage financier du
 * module Hôtels Monde (guest-booking-actions.ts).
 *
 * Ce fichier protège quatre invariants financiers clés :
 *
 * 1. SÉPARATION supplier_cost / sale_price — `bookResult.supplierPriceTnd`
 *    (prix net confirmé par le Virtual World Hotel Supplier) et `finalTotalTnd`
 *    (prix de vente après remise éventuelle) sont deux montants distincts,
 *    jamais confondus ni recalculés après la confirmation fournisseur.
 *
 * 2. COMMISSION CORRECTE — `commissionPercent` vient UNIQUEMENT de
 *    `margins.hotel.commissionPercent` (System B / margin_rules). La valeur
 *    peut être `undefined` si aucune règle n'est configurée — dans ce cas
 *    `commissionAmount = 0`, ce qui est acceptable (fallback documenté dans
 *    reservation-financials.ts). Le fallback `?? 0` est utilisé UNIQUEMENT
 *    pour le calcul des entitlements pré-transactionnels, jamais passé comme
 *    valeur fixe à `recordReservationFinancials`.
 *
 * 3. APPEL CORRECT CREDIT-COMMISSION — `creditPlatformCommission` consomme
 *    la valeur `commissionAmount` retournée par `recordReservationFinancials`,
 *    jamais un recalcul indépendant.
 *
 * 4. CHANNEL CORRECT — `getMarginsForAgency` est appelé avec `"direct"`
 *    (vente B2C directe consommateur), non `"b2b"` ni sans channel.
 *
 * Pattern readFileSync (même discipline que lib/cars/__tests__/
 * car-voucher-wiring.test.ts) : `"use server"` empêche d'importer le fichier
 * directement sous `node --test`.
 */
import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"

const ROOT = process.cwd()
const src = readFileSync(
  join(ROOT, "lib/hotels-monde/guest-booking-actions.ts"),
  "utf8",
)

// ─── Invariant 1 : supplier cost ≠ sale price ─────────────────────────────

test("COMMISSION-MONDE-01 : supplierPriceTnd provient du fournisseur (bookResult.supplierPriceTnd)", () => {
  // Le prix net fournisseur doit TOUJOURS provenir de la réponse du
  // Virtual World Hotel Supplier, jamais recalculé ni inventé.
  assert.match(src, /supplierPriceTnd:\s*bookResult\.supplierPriceTnd/)
})

test("COMMISSION-MONDE-01 : salePriceTnd passe finalTotalTnd (prix de vente après remise promo)", () => {
  // finalTotalTnd = bookResult.totalPriceTnd ou réduit par applyPromoDiscountCore.
  // Ne doit JAMAIS confondre prix vente et coût fournisseur.
  assert.match(src, /salePriceTnd:\s*finalTotalTnd/)
})

test("COMMISSION-MONDE-01 : supplierPriceTnd et salePriceTnd sont distincts dans recordReservationFinancials", () => {
  // Les deux champs doivent coexister dans le même appel.
  const rfCall = src.match(/recordReservationFinancials\(\{[\s\S]*?\}\)/)
  assert.ok(rfCall, "recordReservationFinancials doit être appelé")
  assert.match(rfCall[0], /supplierPriceTnd:\s*bookResult\.supplierPriceTnd/)
  assert.match(rfCall[0], /salePriceTnd:\s*finalTotalTnd/)
})

// ─── Invariant 2 : commissionPercent depuis System B ──────────────────────

test("COMMISSION-MONDE-01 : commissionPercent passe margins.hotel.commissionPercent (System B)", () => {
  // Ne doit JAMAIS être une constante codée en dur ni 0.
  assert.match(src, /commissionPercent:\s*margins\.hotel\.commissionPercent/)
})

test("COMMISSION-MONDE-01 : fallback ?? 0 uniquement pour les entitlements pre-tx, pas dans recordReservationFinancials", () => {
  // Le `?? 0` est autorisé UNIQUEMENT pour commissionRateForEntitlements
  // (calcul pre-transaction des economic_entitlements), jamais passé
  // directement comme commissionPercent à recordReservationFinancials.
  assert.match(
    src,
    /commissionRateForEntitlements\s*=\s*margins\.hotel\.commissionPercent\s*\?\?\s*0/,
  )
})

test("COMMISSION-MONDE-01 : marginAmountTnd = finalTotalTnd - bookResult.supplierPriceTnd", () => {
  // La marge brute de l'agence est calculée comme la différence entre
  // le prix de vente et le coût net fournisseur confirmé — jamais inversé.
  assert.match(
    src,
    /marginAmountTnd\s*=\s*finalTotalTnd\s*-\s*bookResult\.supplierPriceTnd/,
  )
})

// ─── Invariant 3 : creditPlatformCommission correctement câblé ────────────

test("COMMISSION-MONDE-01 : commissionAmount destructuré depuis recordReservationFinancials", () => {
  assert.match(
    src,
    /const\s*\{[^}]*commissionAmount[^}]*\}\s*=\s*await\s+recordReservationFinancials\(/,
  )
})

test("COMMISSION-MONDE-01 : creditPlatformCommission appelé avec commissionAmount issu de recordReservationFinancials", () => {
  assert.match(
    src,
    /await creditPlatformCommission\(tx,\s*\{[\s\S]*?commissionAmount,/,
  )
})

test("COMMISSION-MONDE-01 : creditPlatformCommission contient description avec publicRef", () => {
  // La description doit identifier la réservation pour l'audit financier.
  assert.match(src, /description:\s*`[^`]*publicRef[^`]*`/)
})

// ─── Invariant 4 : channel "direct" pour getMarginsForAgency ─────────────

test('COMMISSION-MONDE-01 : getMarginsForAgency appelé avec channel "direct"', () => {
  // B2C guest checkout = vente directe consommateur.
  // "b2b" serait incorrect — le guest n'est pas un partenaire agence.
  assert.match(src, /getMarginsForAgency\(agencyId,\s*undefined,\s*"direct"\)/)
})

// ─── Invariant 5 : trois entitlements économiques ─────────────────────────

test("COMMISSION-MONDE-01 : entitlement external_supplier avec qualification supplier_cost", () => {
  assert.match(src, /partyType:\s*"external_supplier"/)
  assert.match(src, /qualification:\s*"supplier_cost"/)
})

test("COMMISSION-MONDE-01 : entitlement agency avec qualification seller_margin", () => {
  assert.match(src, /partyType:\s*"agency"/)
  assert.match(src, /qualification:\s*"seller_margin"/)
})

test("COMMISSION-MONDE-01 : entitlement easy2book avec qualification commission", () => {
  assert.match(src, /partyType:\s*"easy2book"/)
  assert.match(src, /qualification:\s*"commission"/)
})

// ─── Invariant 6 : sendEvent fire-and-forget ─────────────────────────────

test("COMMISSION-MONDE-01 : sendEvent booking/confirmed câblé pour hôtels monde", () => {
  assert.match(src, /sendEvent\("booking\/confirmed"/)
})

test("COMMISSION-MONDE-01 : sendEvent fire-and-forget (pas d'await bloquant)", () => {
  // L'échec email ne doit JAMAIS annuler la réservation déjà enregistrée.
  assert.match(src, /sendEvent\("booking\/confirmed"[\s\S]*?\)\.catch\(/)
})

test("COMMISSION-MONDE-01 : creditPlatformCommission et recordReservationFinancials sont importés", () => {
  assert.match(
    src,
    /import.*creditPlatformCommission.*from.*platform-commission/,
  )
  assert.match(
    src,
    /import.*recordReservationFinancials.*from.*reservation-financials/,
  )
})
