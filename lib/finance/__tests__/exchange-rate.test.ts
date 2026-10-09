/**
 * CURRENCY-DIM-01 — Tests du module lib/finance/exchange-rate.ts.
 *
 * Couverture :
 *  1. fetchExchangeRateForDisplay retourne le taux du mock provider
 *  2. fetchExchangeRateForDisplay met le résultat en cache (même instance dans TTL)
 *  3. fetchExchangeRateForBooking retourne toujours un taux frais (pas de cache)
 *  4. Les deux lèvent ExchangeRateUnavailableError si le provider échoue
 *  5. from === to → rate=1, source="identity", aucun appel réseau
 *  6. Le taux est arrondi à 4 décimales
 *
 * Conventions :
 *  - Tests purement unitaires — aucun accès DB, aucun appel réseau réel.
 *  - setExchangeRateProvider() injecte le mock ; remis à null en teardown.
 *  - Pas de dépendance Redis (memoize utilise le fallback mémoire en test).
 */
import test, { after, describe } from "node:test"
import assert from "node:assert/strict"

import {
  createMockProvider,
  ExchangeRateUnavailableError,
  fetchExchangeRateForBooking,
  fetchExchangeRateForDisplay,
  setExchangeRateProvider,
} from "../exchange-rate"

/* -------------------------------------------------------------------------- */
/* Helpers                                                                     */
/* -------------------------------------------------------------------------- */

function makeMock(rates: Record<string, number>, fetchSpy?: { count: number }) {
  const base = createMockProvider(rates)
  return {
    ...base,
    async fetchRate(from: string, to: string) {
      if (fetchSpy) fetchSpy.count++
      return base.fetchRate(from, to)
    },
  }
}

/* -------------------------------------------------------------------------- */
/* Tests                                                                       */
/* -------------------------------------------------------------------------- */

describe("exchange-rate module", () => {
  after(() => {
    setExchangeRateProvider(null)
  })

  test("1. fetchExchangeRateForDisplay retourne le taux du mock", async () => {
    setExchangeRateProvider(makeMock({ "USD/TND": 3.1052 }))

    const result = await fetchExchangeRateForDisplay("USD", "TND", 60)

    assert.strictEqual(result.from, "USD")
    assert.strictEqual(result.to, "TND")
    assert.strictEqual(result.rate, 3.1052)
    assert.strictEqual(result.source, "mock")
    assert.ok(result.capturedAt instanceof Date)
  })

  test("2. fetchExchangeRateForDisplay met le résultat en cache dans le TTL", async () => {
    const spy = { count: 0 }
    setExchangeRateProvider(makeMock({ "EUR/TND": 3.35 }, spy))

    // Reset le cache mémoire en utilisant une clé unique avec un provider nommé différemment
    const uniqueProvider = {
      name: `mock-cache-test-${Date.now()}`,
      async fetchRate(from: string, to: string) {
        spy.count++
        return { from, to, rate: 3.35, source: "mock", capturedAt: new Date() }
      },
    }
    setExchangeRateProvider(uniqueProvider)

    // Premier appel — doit appeler fetchRate
    await fetchExchangeRateForDisplay("EUR", "TND", 3600)
    // Deuxième appel — doit utiliser le cache
    await fetchExchangeRateForDisplay("EUR", "TND", 3600)

    assert.strictEqual(
      spy.count,
      1,
      "fetchRate doit être appelé une seule fois dans le TTL",
    )
  })

  test("3. fetchExchangeRateForBooking appelle toujours le provider (pas de cache)", async () => {
    const spy = { count: 0 }
    const uniqueProvider = {
      name: `mock-booking-${Date.now()}`,
      async fetchRate(from: string, to: string) {
        spy.count++
        return {
          from,
          to,
          rate: 3.1052,
          source: "mock",
          capturedAt: new Date(),
        }
      },
    }
    setExchangeRateProvider(uniqueProvider)

    await fetchExchangeRateForBooking("USD", "TND")
    await fetchExchangeRateForBooking("USD", "TND")

    assert.strictEqual(
      spy.count,
      2,
      "fetchRate doit être appelé à chaque booking",
    )
  })

  test("4a. fetchExchangeRateForDisplay lève ExchangeRateUnavailableError si provider échoue", async () => {
    const failingProvider = {
      name: "failing",
      async fetchRate(from: string, to: string): Promise<never> {
        throw new ExchangeRateUnavailableError(
          from,
          to,
          "provider simulé en erreur",
        )
      },
    }
    setExchangeRateProvider(failingProvider)

    await assert.rejects(
      () => fetchExchangeRateForDisplay("GBP", "TND", 60),
      ExchangeRateUnavailableError,
    )
  })

  test("4b. fetchExchangeRateForBooking lève ExchangeRateUnavailableError si provider échoue", async () => {
    const failingProvider = {
      name: "failing-booking",
      async fetchRate(from: string, to: string): Promise<never> {
        throw new ExchangeRateUnavailableError(
          from,
          to,
          "provider simulé en erreur booking",
        )
      },
    }
    setExchangeRateProvider(failingProvider)

    await assert.rejects(
      () => fetchExchangeRateForBooking("GBP", "TND"),
      ExchangeRateUnavailableError,
    )
  })

  test("5a. fetchExchangeRateForDisplay with from===to returns identity rate=1", async () => {
    const spy = { count: 0 }
    setExchangeRateProvider(makeMock({}, spy))

    const result = await fetchExchangeRateForDisplay("TND", "TND", 3600)

    assert.strictEqual(result.rate, 1)
    assert.strictEqual(result.source, "identity")
    assert.strictEqual(spy.count, 0, "aucun appel réseau pour identité")
  })

  test("5b. fetchExchangeRateForBooking with from===to returns identity rate=1", async () => {
    const spy = { count: 0 }
    setExchangeRateProvider(makeMock({}, spy))

    const result = await fetchExchangeRateForBooking("TND", "TND")

    assert.strictEqual(result.rate, 1)
    assert.strictEqual(result.source, "identity")
    assert.strictEqual(spy.count, 0, "aucun appel réseau pour identité")
  })

  test("6. Le taux est arrondi à 4 décimales", async () => {
    // Utilise JPY/TND pour éviter la collision de cache avec le test 1 (USD/TND)
    setExchangeRateProvider(makeMock({ "JPY/TND": 0.020678999 }))

    const result = await fetchExchangeRateForDisplay("JPY", "TND", 60)

    assert.strictEqual(result.rate, 0.0207, "taux arrondi à 4 décimales")
  })

  test("7. createMockProvider lève ExchangeRateUnavailableError pour un taux absent", async () => {
    const provider = createMockProvider({ "USD/TND": 3.1052 })

    await assert.rejects(
      () => provider.fetchRate("JPY", "TND"),
      ExchangeRateUnavailableError,
    )
  })
})
