/**
 * COMMISSION-WIRING-01/flights — invariants statiques sur le câblage financier
 * de lib/vols/flight-financials.ts (finalizeFlightBookingFinancials).
 *
 * Contexte : ce fichier est le point d'ancrage financier UNIQUE des deux
 * chemins de confirmation vol (fulfillFlightBooking et
 * confirmManualFlightBooking). Avant PROVIDER-CONNECTIVITY-BRIDGE, le pipeline
 * actif n'appelait jamais recordReservationFinancials — aucune réservation vol
 * ne figurait au Dashboard Marges. Ce test protège la correction.
 *
 * Invariants protégés :
 *
 * 1. FONCTION EXPORTÉE — `finalizeFlightBookingFinancials` est bien définie.
 *
 * 2. GUARD snapshotId — retour immédiat si `!input.snapshotId` : jamais un
 *    crash sur une réservation sans snapshot.
 *
 * 3. SOURCES DB — supplierAmount et sellingAmount lus depuis
 *    flightPriceSnapshots (snapshot figé, jamais recalculé ici).
 *
 * 4. CONVERSION DB→NUMBER — `Number(snapshot.supplierAmount)` et
 *    `Number(snapshot.sellingAmount)` — colonnes DB string → number, jamais
 *    parseFloat(string) direct.
 *
 * 5. RÈGLE FINANCIÈRE CURRENCY-DIM — si la devise fournisseur n'est pas TND,
 *    appel obligatoire à `fetchExchangeRateForBooking` (taux réel et traçable).
 *    Jamais de taux de repli codé en dur.
 *
 * 6. FAIL-CLOSED FX — pas de `?? 0` ni `?? 1` autour du taux de change :
 *    ExchangeRateUnavailableError remonte et bloque la confirmation.
 *
 * 7. ORDRE recordReservationFinancials → creditPlatformCommission.
 *
 * 8. DESCRIPTION commission contient "Commission vol — réservation".
 *
 * 9. ECONOMIC ENTITLEMENTS — external_supplier (coût fournisseur),
 *    seller_margin (agence), et platform_fee optionnel (FX uniquement).
 *
 * Pattern readFileSync — même discipline que lib/cars/__tests__/
 * car-voucher-wiring.test.ts.
 */
import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"

const ROOT = process.cwd()
const src = readFileSync(
  join(ROOT, "lib/vols/flight-financials.ts"),
  "utf8",
)

// ─── Invariant 1 : fonction exportée ─────────────────────────────────────────

test("COMMISSION-WIRING-01/flights : finalizeFlightBookingFinancials est exportée", () => {
  assert.match(src, /export\s+async\s+function\s+finalizeFlightBookingFinancials/)
})

// ─── Invariant 2 : guard snapshotId ──────────────────────────────────────────

test("COMMISSION-WIRING-01/flights : retour immédiat si !input.snapshotId (jamais crash sur snapshot absent)", () => {
  assert.match(src, /if\s*\(\s*!input\.snapshotId\s*\)\s*return/)
})

// ─── Invariant 3 : sources DB flightPriceSnapshots ───────────────────────────

test("COMMISSION-WIRING-01/flights : supplierAmount lu depuis flightPriceSnapshots (snapshot figé, jamais recalculé)", () => {
  assert.match(src, /supplierAmount:\s*flightPriceSnapshots\.supplierAmount/)
})

test("COMMISSION-WIRING-01/flights : sellingAmount lu depuis flightPriceSnapshots", () => {
  assert.match(src, /sellingAmount:\s*flightPriceSnapshots\.sellingAmount/)
})

// ─── Invariant 4 : conversion DB→number ─────────────────────────────────────

test("COMMISSION-WIRING-01/flights : supplierPriceTndBase = Number(snapshot.supplierAmount) (string DB → number)", () => {
  assert.match(src, /Number\(snapshot\.supplierAmount\)/)
})

test("COMMISSION-WIRING-01/flights : salePriceTnd = Number(snapshot.sellingAmount) (string DB → number)", () => {
  assert.match(src, /Number\(snapshot\.sellingAmount\)/)
})

// ─── Invariant 5 : CURRENCY-DIM — taux de change réel ────────────────────────

test("COMMISSION-WIRING-01/flights : CURRENCY-DIM — fetchExchangeRateForBooking appelé si devise ≠ TND", () => {
  assert.match(src, /fetchExchangeRateForBooking/)
  assert.match(src, /originalCurrency\s*!==\s*["']TND["']/)
})

// ─── Invariant 6 : fail-closed FX — pas de taux de repli codé en dur ─────────

test("COMMISSION-WIRING-01/flights : CURRENCY-DIM fail-closed — pas de taux de repli ??\\ 0 ou ??\\ 1 autour du taux de change", () => {
  assert.doesNotMatch(src, /fetchExchangeRateForBooking[\s\S]{0,100}?\.rate\s*\?\?\s*[01]/)
  assert.doesNotMatch(src, /referenceRate\.rate\s*\?\?\s*[01]/)
})

// ─── Invariant 7 : ordre recordReservationFinancials → creditPlatformCommission ──

test("COMMISSION-WIRING-01/flights : recordReservationFinancials appelé AVANT creditPlatformCommission", () => {
  const recordIdx = src.indexOf("recordReservationFinancials({")
  const creditIdx = src.indexOf("await creditPlatformCommission(tx, {")
  assert.ok(recordIdx > 0, "recordReservationFinancials doit exister")
  assert.ok(creditIdx > 0, "creditPlatformCommission doit exister")
  assert.ok(
    recordIdx < creditIdx,
    "recordReservationFinancials doit précéder creditPlatformCommission",
  )
})

// ─── Invariant 8 : description commission ────────────────────────────────────

test('COMMISSION-WIRING-01/flights : description commission contient "Commission vol — réservation"', () => {
  assert.match(src, /Commission vol — r[eé]servation/)
})

// ─── Invariant 9 : economic entitlements ─────────────────────────────────────

test("COMMISSION-WIRING-01/flights : economicEntitlements contient external_supplier (coût fournisseur)", () => {
  assert.match(src, /partyType:\s*["']external_supplier["']/)
})

test("COMMISSION-WIRING-01/flights : economicEntitlements contient seller_margin (agence)", () => {
  assert.match(src, /qualification:\s*["']seller_margin["']/)
})

test("COMMISSION-WIRING-01/flights : economicEntitlements contient platform_fee conditionnel (FX uniquement, bankFeeTnd > 0)", () => {
  assert.match(src, /qualification:\s*["']platform_fee["']/)
  assert.match(src, /bankFeeTnd\s*>\s*0/)
})
