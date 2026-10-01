import test from "node:test"
import assert from "node:assert/strict"
import {
  clearExchangeRateCache,
  ExchangeRateError,
  fetchExchangeRate,
  type ExchangeRateProvider,
} from "../exchange-rate"

function mockProvider(rate = 3.3333): ExchangeRateProvider & { calls: number } {
  return {
    calls: 0,
    async getRate(from, to) {
      this.calls++
      return {
        from,
        to,
        rate,
        source: "mock",
        capturedAt: new Date("2026-10-01T12:00:00Z"),
      }
    },
  }
}

test.afterEach(() => {
  clearExchangeRateCache()
})

test("fetchExchangeRate : provider injecté, direction 1 FROM = X TO et traçabilité conservées", async () => {
  const provider = mockProvider(3.3333)
  const result = await fetchExchangeRate("eur", "tnd", { provider })

  assert.equal(result.from, "EUR")
  assert.equal(result.to, "TND")
  assert.equal(result.rate, 3.3333)
  assert.equal(result.source, "mock")
  assert.equal(result.capturedAt.toISOString(), "2026-10-01T12:00:00.000Z")
  assert.equal(provider.calls, 1)
})

test("fetchExchangeRate : cache 1h réutilise le résultat sans second appel provider", async () => {
  const provider = mockProvider(3.3333)
  const first = await fetchExchangeRate("EUR", "TND", { provider, cacheTtlMs: 60 * 60 * 1000 })
  const second = await fetchExchangeRate("EUR", "TND", { provider, cacheTtlMs: 60 * 60 * 1000 })

  assert.equal(first.rate, second.rate)
  assert.equal(provider.calls, 1)
})

test("fetchExchangeRate : booking par défaut sans cache", async () => {
  const provider = mockProvider(3.3333)
  await fetchExchangeRate("EUR", "TND", { provider })
  await fetchExchangeRate("EUR", "TND", { provider })

  assert.equal(provider.calls, 2)
})

test("fetchExchangeRate : provider indisponible => erreur explicite, aucun fallback", async () => {
  const provider: ExchangeRateProvider = {
    async getRate() {
      throw new ExchangeRateError("FX provider down", "PROVIDER_UNAVAILABLE")
    },
  }

  await assert.rejects(
    fetchExchangeRate("USD", "TND", { provider }),
    (error: unknown) =>
      error instanceof ExchangeRateError && error.code === "PROVIDER_UNAVAILABLE",
  )
})

test("fetchExchangeRate : devise identique ne nécessite pas de provider", async () => {
  const provider = mockProvider()
  const result = await fetchExchangeRate("TND", "TND", { provider })

  assert.equal(result.rate, 1)
  assert.equal(result.source, "identity")
  assert.equal(provider.calls, 0)
})
