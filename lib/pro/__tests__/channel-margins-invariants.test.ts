/**
 * Marges multi-canal — invariants statiques purs (CHANNEL-MARGINS-UI-01).
 * Sans DB, sans Server Actions. Même pattern que lead-stats-invariants.test.ts :
 * autonome, pas d'imports @/ pour éviter les cycles ESM.
 */
import test from "node:test"
import assert from "node:assert/strict"

type DistributionChannel = "direct" | "b2b" | "white_label" | "api"

const DISTRIBUTION_CHANNELS: readonly DistributionChannel[] = [
  "direct",
  "b2b",
  "white_label",
  "api",
] as const

function isKnownChannel(v: string): v is DistributionChannel {
  return (DISTRIBUTION_CHANNELS as readonly string[]).includes(v)
}

function marginKey(agencyId: string, module: string, channel: string): string {
  return `${agencyId}:${module}:${channel}`
}

function resolveChannel(c: string | undefined): DistributionChannel {
  return (c ?? "direct") as DistributionChannel
}

test("channels: DISTRIBUTION_CHANNELS contient exactement 4 valeurs", () => {
  assert.equal(DISTRIBUTION_CHANNELS.length, 4)
  assert.ok(DISTRIBUTION_CHANNELS.includes("direct"))
  assert.ok(DISTRIBUTION_CHANNELS.includes("b2b"))
  assert.ok(DISTRIBUTION_CHANNELS.includes("white_label"))
  assert.ok(DISTRIBUTION_CHANNELS.includes("api"))
})

test("channels: valeurs connues acceptées", () => {
  for (const c of DISTRIBUTION_CHANNELS) {
    assert.ok(isKnownChannel(c), `${c} doit être reconnu`)
  }
})

test("channels: valeurs inconnues rejetées", () => {
  assert.equal(isKnownChannel("fax"), false)
  assert.equal(isKnownChannel(""), false)
  assert.equal(isKnownChannel("DIRECT"), false)
})

test("channels: même agency+module, canaux différents → clés distinctes", () => {
  const agency = "aaaaaaaa-0000-0000-0000-000000000001"
  const mod = "hotel"
  assert.notEqual(
    marginKey(agency, mod, "direct"),
    marginKey(agency, mod, "b2b"),
  )
  assert.notEqual(
    marginKey(agency, mod, "b2b"),
    marginKey(agency, mod, "white_label"),
  )
})

test("channels: canal undefined → 'direct' par défaut", () => {
  assert.equal(resolveChannel(undefined), "direct")
  assert.equal(resolveChannel("b2b"), "b2b")
  assert.equal(resolveChannel("white_label"), "white_label")
})
