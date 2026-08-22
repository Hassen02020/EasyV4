import test from "node:test"
import assert from "node:assert/strict"

import { resolveEffectiveAgencyId } from "../effective-agency"

test("resolveEffectiveAgencyId : préfère le tenant résolu au fallback", () => {
  assert.equal(resolveEffectiveAgencyId("tenant-agency-id", "fallback-agency-id"), "tenant-agency-id")
})

test("resolveEffectiveAgencyId : retombe sur le fallback si aucun tenant", () => {
  assert.equal(resolveEffectiveAgencyId(null, "fallback-agency-id"), "fallback-agency-id")
})

test("resolveEffectiveAgencyId : retombe sur le fallback si tenant undefined", () => {
  assert.equal(resolveEffectiveAgencyId(undefined, "fallback-agency-id"), "fallback-agency-id")
})

test("resolveEffectiveAgencyId : retombe sur le fallback si tenant vide/espaces", () => {
  assert.equal(resolveEffectiveAgencyId("", "fallback-agency-id"), "fallback-agency-id")
  assert.equal(resolveEffectiveAgencyId("   ", "fallback-agency-id"), "fallback-agency-id")
})

test("resolveEffectiveAgencyId : retourne null si ni tenant ni fallback", () => {
  assert.equal(resolveEffectiveAgencyId(null, null), null)
})

test("resolveEffectiveAgencyId : trim le tenant résolu", () => {
  assert.equal(resolveEffectiveAgencyId("  tenant-agency-id  ", "fallback-agency-id"), "tenant-agency-id")
})
