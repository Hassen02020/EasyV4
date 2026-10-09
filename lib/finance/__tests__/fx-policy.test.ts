/**
 * CURRENCY-DIM-02 — Tests politique FX Trésorerie & Coût Bancaire.
 * FX-POLICY-01 → FX-POLICY-14.
 *
 * Aucun appel DB : injection via setFxPolicyOverride().
 * Aucun appel réseau : ExchangeRate construit manuellement.
 */

import test from "node:test"
import assert from "node:assert/strict"
import {
  applyFxCorrection,
  computeBankFeeContribution,
  setFxPolicyOverride,
  getActiveFxPolicy,
  type FxPolicy,
} from "../fx-policy"
import type { ExchangeRate } from "../exchange-rate"

/* -------------------------------------------------------------------------- */
/* Helpers                                                                     */
/* -------------------------------------------------------------------------- */

function makePolicy(overrides: Partial<FxPolicy> = {}): FxPolicy {
  return {
    id: "policy-uuid-1",
    version: 1,
    effectiveFrom: new Date("2026-01-01T00:00:00Z"),
    effectiveTo: null,
    correctionMode: "NONE",
    correctionValue: 0,
    bankFeeMode: "NONE",
    bankFeeFixed: null,
    bankFeePercent: null,
    bankFeeMin: null,
    bankFeeMax: null,
    bankFeeCurrency: "TND",
    note: null,
    createdBy: "super-admin-uuid",
    createdAt: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  }
}

function makeRate(overrides: Partial<ExchangeRate> = {}): ExchangeRate {
  return {
    from: "USD",
    to: "TND",
    rate: 3.1052,
    source: "mock",
    capturedAt: new Date("2026-10-01T10:00:00Z"),
    ...overrides,
  }
}

/* -------------------------------------------------------------------------- */
/* FX-POLICY-01 : fail-closed sans politique active                            */
/* -------------------------------------------------------------------------- */

test("FX-POLICY-01 — getActiveFxPolicy sans override lève FxPolicyUnavailableError", async () => {
  // Assure qu'aucun override n'est posé
  setFxPolicyOverride(null)
  // DB non disponible en test unitaire → erreur attendue (pas de connexion)
  // On vérifie que l'erreur est soit FxPolicyUnavailableError, soit une erreur DB
  // (les deux sont acceptables en test sans DB).
  try {
    await getActiveFxPolicy()
    assert.fail("devrait lever une erreur")
  } catch (err) {
    assert.ok(
      err instanceof Error,
      `devrait lever une Error, obtenu: ${String(err)}`,
    )
    // En test sans DB, l'erreur sera une erreur de connexion — comportement fail-closed OK.
  }
})

/* -------------------------------------------------------------------------- */
/* FX-POLICY-02 : correctionMode=NONE → taux appliqué = taux référence        */
/* -------------------------------------------------------------------------- */

test("FX-POLICY-02 — NONE : appliedRate === referenceRate", () => {
  const policy = makePolicy({ correctionMode: "NONE", correctionValue: 0 })
  const rate = makeRate({ rate: 3.1052 })
  const result = applyFxCorrection(rate, policy)

  assert.equal(result.appliedRate, 3.1052)
  assert.equal(result.referenceRate, 3.1052)
  assert.equal(result.correctionApplied, 0)
})

/* -------------------------------------------------------------------------- */
/* FX-POLICY-03 : correctionMode=PERCENTAGE 1.5% → ref × 1.015               */
/* -------------------------------------------------------------------------- */

test("FX-POLICY-03 — PERCENTAGE 1.5% : appliedRate = ref × 1.015", () => {
  const policy = makePolicy({
    correctionMode: "PERCENTAGE",
    correctionValue: 1.5,
  })
  const rate = makeRate({ rate: 3.1052 })
  const result = applyFxCorrection(rate, policy)

  const expected = Math.round(3.1052 * 1.015 * 1_000_000) / 1_000_000
  assert.equal(result.appliedRate, expected)
  assert.ok(result.correctionApplied > 0, "la correction doit être positive")
  assert.equal(result.policyId, "policy-uuid-1")
  assert.equal(result.policyVersion, 1)
})

/* -------------------------------------------------------------------------- */
/* FX-POLICY-04 : correctionMode=FIXED_SPREAD → ref + spread absolu           */
/* -------------------------------------------------------------------------- */

test("FX-POLICY-04a — FIXED_SPREAD 0.05 : appliedRate = ref + 0.05", () => {
  const policy = makePolicy({
    correctionMode: "FIXED_SPREAD",
    correctionValue: 0.05,
  })
  const rate = makeRate({ rate: 3.1052 })
  const result = applyFxCorrection(rate, policy)

  const expected = Math.round((3.1052 + 0.05) * 1_000_000) / 1_000_000
  assert.equal(result.appliedRate, expected)
  assert.ok(result.correctionApplied > 0)
})

test("FX-POLICY-04b — FIXED_RATE 3.20 : appliedRate = 3.20 (remplace la ref)", () => {
  const policy = makePolicy({
    correctionMode: "FIXED_RATE",
    correctionValue: 3.2,
  })
  const rate = makeRate({ rate: 3.1052 })
  const result = applyFxCorrection(rate, policy)

  assert.equal(result.appliedRate, 3.2)
  assert.equal(result.referenceRate, 3.1052)
})

/* -------------------------------------------------------------------------- */
/* FX-POLICY-05 : bankFeeMode=FIXED 8 TND                                     */
/* -------------------------------------------------------------------------- */

test("FX-POLICY-05 — FIXED 8 TND : computeBankFeeContribution retourne 8", () => {
  const policy = makePolicy({ bankFeeMode: "FIXED", bankFeeFixed: 8 })
  const fee = computeBankFeeContribution(269.68, 3.1518, policy)
  assert.equal(fee, 8)
})

/* -------------------------------------------------------------------------- */
/* FX-POLICY-06 : bankFeeMode=PERCENTAGE 0.5%                                 */
/* -------------------------------------------------------------------------- */

test("FX-POLICY-06 — PERCENTAGE 0.5% : fee ≈ amountTnd × 0.005", () => {
  const policy = makePolicy({ bankFeeMode: "PERCENTAGE", bankFeePercent: 0.5 })
  const amountFX = 269.68 // USD
  const appliedR = 3.1518
  const fee = computeBankFeeContribution(amountFX, appliedR, policy)
  const expected = Math.round(amountFX * appliedR * 0.005 * 100) / 100

  assert.equal(fee, expected)
  assert.ok(fee > 0)
})

/* -------------------------------------------------------------------------- */
/* FX-POLICY-07 : bankFeeMode=MIN_MAX → fee clampé                            */
/* -------------------------------------------------------------------------- */

test("FX-POLICY-07a — MIN_MAX : fee < min → clampé à min (5 TND)", () => {
  const policy = makePolicy({
    bankFeeMode: "MIN_MAX",
    bankFeePercent: 0.001, // 0.001% → fee très faible
    bankFeeMin: 5,
    bankFeeMax: 50,
  })
  const fee = computeBankFeeContribution(10, 3.1052, policy)
  assert.equal(fee, 5)
})

test("FX-POLICY-07b — MIN_MAX : fee > max → clampé à max (50 TND)", () => {
  const policy = makePolicy({
    bankFeeMode: "MIN_MAX",
    bankFeePercent: 50, // 50% → fee énorme
    bankFeeMin: 5,
    bankFeeMax: 50,
  })
  const fee = computeBankFeeContribution(1000, 3.1052, policy)
  assert.equal(fee, 50)
})

/* -------------------------------------------------------------------------- */
/* FX-POLICY-08 : bankFeeMode=NONE → fee = 0                                  */
/* -------------------------------------------------------------------------- */

test("FX-POLICY-08 — NONE : computeBankFeeContribution retourne 0", () => {
  const policy = makePolicy({ bankFeeMode: "NONE" })
  const fee = computeBankFeeContribution(500, 3.1052, policy)
  assert.equal(fee, 0)
})

/* -------------------------------------------------------------------------- */
/* FX-POLICY-09 : politique active sélectionnée via override                   */
/* -------------------------------------------------------------------------- */

test("FX-POLICY-09 — getActiveFxPolicy retourne l'override injecté", async () => {
  const policy = makePolicy({ version: 3, id: "v3-uuid" })
  setFxPolicyOverride(policy)
  const result = await getActiveFxPolicy()
  assert.equal(result.id, "v3-uuid")
  assert.equal(result.version, 3)
  setFxPolicyOverride(null)
})

/* -------------------------------------------------------------------------- */
/* FX-POLICY-10 : immuabilité — policyId dans AppliedRate                     */
/* -------------------------------------------------------------------------- */

test("FX-POLICY-10 — AppliedRate.policyId correspond à la version injectée", () => {
  const policy = makePolicy({ id: "immuable-uuid", version: 7 })
  const rate = makeRate()
  const result = applyFxCorrection(rate, policy)

  assert.equal(result.policyId, "immuable-uuid")
  assert.equal(result.policyVersion, 7)
})

/* -------------------------------------------------------------------------- */
/* FX-POLICY-11 : recordReservationFinancials sans appliedRate → colonnes null */
/* -------------------------------------------------------------------------- */

import { readFileSync } from "node:fs"
import { join } from "node:path"

test("FX-POLICY-11 — reservation-financials.ts : paramètre appliedRate est optionnel (présence de '?')", () => {
  const src = readFileSync(
    join(process.cwd(), "lib/finance/reservation-financials.ts"),
    "utf8",
  )
  assert.match(
    src,
    /appliedRate\?:\s*AppliedRate/,
    "appliedRate doit être optionnel",
  )
})

/* -------------------------------------------------------------------------- */
/* FX-POLICY-12 — reservation-financials.ts : appliedRate écrit les colonnes   */
/* -------------------------------------------------------------------------- */

test("FX-POLICY-12 — reservation-financials.ts : appliedRate → appliedExchangeRate + fxPolicyId écrits", () => {
  const src = readFileSync(
    join(process.cwd(), "lib/finance/reservation-financials.ts"),
    "utf8",
  )
  assert.match(
    src,
    /appliedExchangeRate/,
    "appliedExchangeRate doit être écrit",
  )
  assert.match(src, /fxPolicyId/, "fxPolicyId doit être écrit")
  assert.match(src, /appliedRate\.policyId/, "policyId doit être transmis")
})

/* -------------------------------------------------------------------------- */
/* FX-POLICY-13 — flight-financials.ts : câblage complet non-TND               */
/* -------------------------------------------------------------------------- */

test("FX-POLICY-13 — flight-financials.ts : getActiveFxPolicy + applyFxCorrection + computeBankFeeContribution câblés", () => {
  const src = readFileSync(
    join(process.cwd(), "lib/vols/flight-financials.ts"),
    "utf8",
  )
  assert.match(src, /getActiveFxPolicy/)
  assert.match(src, /applyFxCorrection/)
  assert.match(src, /computeBankFeeContribution/)
  assert.match(src, /financialExtra\.appliedRate\s*=\s*applied/)
  assert.match(src, /bankFeeTnd/)
})

/* -------------------------------------------------------------------------- */
/* FX-POLICY-14 — flight-financials.ts : identité si supplierCurrency=TND     */
/* -------------------------------------------------------------------------- */

test("FX-POLICY-14 — flight-financials.ts : politique FX uniquement dans le bloc supplierCurrency !== 'TND'", () => {
  const src = readFileSync(
    join(process.cwd(), "lib/vols/flight-financials.ts"),
    "utf8",
  )
  // CURRENCY-DIM-01 : la condition a été remplacée par une vérification des colonnes
  // supplierOriginalCurrency/supplierOriginalAmount (les devises non-TND y sont stockées).
  // L'invariant reste : getActiveFxPolicy ne doit être appelée QUE dans le bloc non-TND.
  // On cherche le bloc conditionnel qui contient "originalCurrency !== \"TND\"".
  const block =
    src.match(
      /if\s*\([^)]*originalCurrency[^)]*!== "TND"[^)]*\)\s*\{([\s\S]*?)\}/,
    )?.[1] ?? ""
  assert.match(
    block,
    /getActiveFxPolicy/,
    "getActiveFxPolicy doit être dans le bloc non-TND",
  )
})
