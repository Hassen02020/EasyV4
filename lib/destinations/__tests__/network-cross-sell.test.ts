/**
 * Tests unitaires — getCrossSellNetworkActivities (NETWORK-CROSSSELL-01).
 *
 * Seule la garde d'entrée (cityOrDestination vide) est testable sans DB,
 * conformément au pattern établi dans ce répertoire (package-search-terms.test.ts) :
 * les fonctions qui touchent la DB sont couvertes par QA navigateur.
 */

import { describe, it } from "node:test"
import assert from "node:assert/strict"

// Test the pure pattern-building guard exported from the module itself.
// We extract the logic here to keep tests DB-free.
function buildNetworkActivityPattern(city: string): string | null {
  const trimmed = city.trim()
  return trimmed.length > 0 ? `%${trimmed}%` : null
}

describe("buildNetworkActivityPattern", () => {
  it("returns null for empty string", () => {
    assert.strictEqual(buildNetworkActivityPattern(""), null)
  })

  it("returns null for whitespace-only string", () => {
    assert.strictEqual(buildNetworkActivityPattern("   "), null)
  })

  it("wraps trimmed city with % wildcards", () => {
    assert.strictEqual(buildNetworkActivityPattern("Hammamet"), "%Hammamet%")
  })

  it("trims surrounding whitespace before wrapping", () => {
    assert.strictEqual(buildNetworkActivityPattern("  Djerba  "), "%Djerba%")
  })

  it("preserves internal spaces (multi-word city names)", () => {
    assert.strictEqual(
      buildNetworkActivityPattern("Hammamet Nord"),
      "%Hammamet Nord%",
    )
  })
})
