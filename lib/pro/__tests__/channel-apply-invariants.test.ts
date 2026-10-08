/**
 * DISTRIB-CHANNEL-APPLY-01 — invariants statiques sur le câblage du canal
 * de distribution dans tous les call sites de getMarginsForAgency().
 *
 * Principe : aucun appel ne doit omettre le 3e argument (channel).
 * - Portail B2B (booking/actions, transfers/pricing, network/product-booking-actions) → "b2b"
 * - Invités / public (guest-actions, guest-booking-actions, search-public) → "direct"
 * - getActivePartnerMargins via resolvePartnerChannel → "b2b" (testé séparément via server-context.ts)
 *
 * Autonome : pas d'imports @/ pour éviter les cycles ESM.
 */
import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"

const cwd = process.cwd()

function read(rel: string) {
  return readFileSync(join(cwd, rel), "utf8")
}

test("booking/actions.ts : getMarginsForAgency passe channel='b2b'", () => {
  const src = read("lib/booking/actions.ts")
  assert.match(src, /getMarginsForAgency\(agencyId, authUserId, "b2b"\)/)
})

test("transfers/actions.ts : calculateTransferPrice passe channel='b2b'", () => {
  const src = read("lib/transfers/actions.ts")
  assert.match(src, /channel:\s*"b2b",/)
})

test("transfers/guest-booking-actions.ts : calculateTransferPrice ne force pas channel (défaut 'direct')", () => {
  const src = read("lib/transfers/guest-booking-actions.ts")
  assert.doesNotMatch(src, /channel:\s*"b2b"/)
})

test("network/product-booking-actions.ts : getMarginsForAgency passe channel='b2b'", () => {
  const src = read("lib/network/product-booking-actions.ts")
  assert.match(src, /getMarginsForAgency\(agencyId, createdByUserId, "b2b"\)/)
})

test("booking/guest-actions.ts : getMarginsForAgency passe channel='direct'", () => {
  const src = read("lib/booking/guest-actions.ts")
  assert.match(src, /getMarginsForAgency\(agencyId, "", "direct"\)/)
})

test("hotels-monde/guest-booking-actions.ts : getMarginsForAgency passe channel='direct'", () => {
  const src = read("lib/hotels-monde/guest-booking-actions.ts")
  assert.match(src, /getMarginsForAgency\(agencyId, undefined, "direct"\)/)
})

test("api/hotels/search-public : getMarginsForAgency passe channel='direct'", () => {
  const src = read("app/api/hotels/search-public/route.ts")
  assert.match(
    src,
    /getMarginsForAgency\(\s*tenantContext\?\.agencyId \?\? null,\s*undefined,\s*"direct",?\s*\)/,
  )
})

test("api/hotels-monde/search : getMarginsForAgency passe channel='direct'", () => {
  const src = read("app/api/hotels-monde/search/route.ts")
  assert.match(src, /getMarginsForAgency\(agencyId, undefined, "direct"\)/)
})

test("server-context.ts : resolvePartnerChannel exportée", () => {
  const src = read("lib/pro/server-context.ts")
  assert.match(src, /export function resolvePartnerChannel/)
})

test("server-context.ts : getActivePartnerMargins passe resolvePartnerChannel(profile)", () => {
  const src = read("lib/pro/server-context.ts")
  assert.match(
    src,
    /getMarginsForAgency\(\s*profile\.agency\.id,\s*user\.id,\s*resolvePartnerChannel\(profile\),?\s*\)/,
  )
})
