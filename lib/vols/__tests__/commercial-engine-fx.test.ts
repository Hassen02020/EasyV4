/**
 * CURRENCY-DIM-01 — applyCommercialEngine() FX pre-conversion tests
 *
 * Tests the async wrapper only; computeCommercialResult() is tested separately
 * in price-snapshot-integrity.test.ts (P15/P15b remain unchanged).
 *
 * No DATABASE_URL required: findBestCommercialRule() catch path returns null
 * → getEnvFallbackRules(B2C) = { fixedFee:15, markupRate:0.04, currency:"TND" }.
 */

import { describe, test, before, after } from "node:test"
import assert from "node:assert/strict"
import {
  applyCommercialEngine,
  UnsupportedCommercialCurrencyMismatchError,
} from "../commercial-engine"
import {
  setExchangeRateProvider,
  createMockProvider,
  ExchangeRateUnavailableError,
} from "@/lib/finance/exchange-rate"

const FAKE_AGENCY = "00000000-0000-0000-0000-000000000001"

describe("applyCommercialEngine — CURRENCY-DIM-01 FX pre-conversion", () => {
  const mockProvider = createMockProvider({
    "EUR/TND": 3.35,
    "USD/TND": 3.1,
  })

  before(() => {
    setExchangeRateProvider(mockProvider)
  })

  after(() => {
    setExchangeRateProvider(null)
  })

  test("P_FX_01 — EUR fournisseur → converti en TND, calcul commercial correct", async () => {
    // 200 EUR × 3.35 = 670 TND
    // fee = 15, markup = 670 * 0.04 = 26.8
    // sellingAmount = 670 + 15 + 26.8 = 711.8
    const result = await applyCommercialEngine(200, "EUR", FAKE_AGENCY)

    assert.equal(result.supplierCurrency, "TND")
    assert.equal(result.sellingCurrency, "TND")
    assert.equal(result.supplierAmount, 670)
    assert.equal(result.fee, 15)
    assert.equal(result.markup, 26.8)
    assert.equal(result.sellingAmount, 711.8)
  })

  test("P_FX_ORIGINAL — supplierOriginalAmount/Currency préservés pour devises ≠ TND", async () => {
    const result = await applyCommercialEngine(200, "EUR", FAKE_AGENCY)

    assert.equal(result.supplierOriginalAmount, 200)
    assert.equal(result.supplierOriginalCurrency, "EUR")
  })

  test("P_FX_TND — fournisseur TND : comportement inchangé, pas d'original stocké", async () => {
    // 500 TND + fee 15 + markup 20 = 535
    const result = await applyCommercialEngine(500, "TND", FAKE_AGENCY)

    assert.equal(result.supplierAmount, 500)
    assert.equal(result.supplierCurrency, "TND")
    assert.equal(result.sellingCurrency, "TND")
    assert.equal(result.sellingAmount, 535)
    assert.equal(result.supplierOriginalAmount, undefined)
    assert.equal(result.supplierOriginalCurrency, undefined)
  })

  test("P_FX_02 — provider absent (devise inconnue) → ExchangeRateUnavailableError propagé (fail-closed)", async () => {
    // GBP not in mock provider — must throw, not invent a rate
    await assert.rejects(
      () => applyCommercialEngine(100, "GBP", FAKE_AGENCY),
      ExchangeRateUnavailableError,
    )
  })

  test("P_FX_USD — USD fournisseur → converti en TND correctement", async () => {
    // 100 USD × 3.1 = 310 TND
    // fee = 15, markup = 310 * 0.04 = 12.4
    // sellingAmount = 310 + 15 + 12.4 = 337.4
    const result = await applyCommercialEngine(100, "USD", FAKE_AGENCY)

    assert.equal(result.supplierAmount, 310)
    assert.equal(result.supplierOriginalAmount, 100)
    assert.equal(result.supplierOriginalCurrency, "USD")
    assert.equal(result.sellingAmount, 337.4)
  })
})
