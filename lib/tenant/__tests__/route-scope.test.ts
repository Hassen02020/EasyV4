import test from "node:test"
import assert from "node:assert/strict"

import { isTenantExemptRoute } from "../route-scope"

test("isTenantExemptRoute : exempte /admin et ses sous-routes", () => {
  assert.equal(isTenantExemptRoute("/admin"), true)
  assert.equal(isTenantExemptRoute("/admin/products"), true)
})

test("isTenantExemptRoute : exempte /pro et ses sous-routes", () => {
  assert.equal(isTenantExemptRoute("/pro"), true)
  assert.equal(isTenantExemptRoute("/pro/produits"), true)
})

test("isTenantExemptRoute : exempte /api et ses sous-routes", () => {
  assert.equal(isTenantExemptRoute("/api/health"), true)
})

test("isTenantExemptRoute : exempte /mutuelle et ses sous-routes", () => {
  assert.equal(isTenantExemptRoute("/mutuelle/login"), true)
})

test("isTenantExemptRoute : ne exempte pas les pages storefront publiques", () => {
  assert.equal(isTenantExemptRoute("/"), false)
  assert.equal(isTenantExemptRoute("/omra"), false)
  assert.equal(isTenantExemptRoute("/packages"), false)
  assert.equal(isTenantExemptRoute("/attractions"), false)
})

test("isTenantExemptRoute : ne matche pas un préfixe partiel non délimité", () => {
  // "/produits-admin" ne doit pas être confondu avec "/admin"
  assert.equal(isTenantExemptRoute("/administration"), false)
  assert.equal(isTenantExemptRoute("/proactive"), false)
})
