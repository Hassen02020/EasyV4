import test from "node:test"
import assert from "node:assert/strict"

import { normalizeHost } from "../resolve-tenant"

test("normalizeHost : laisse un domaine simple inchangé", () => {
  assert.equal(normalizeHost("exemple.tn"), "exemple.tn")
})

test("normalizeHost : retire le préfixe www.", () => {
  assert.equal(normalizeHost("www.exemple.tn"), "exemple.tn")
})

test("normalizeHost : retire le port", () => {
  assert.equal(normalizeHost("exemple.tn:3000"), "exemple.tn")
})

test("normalizeHost : retire www. et le port ensemble", () => {
  assert.equal(normalizeHost("www.exemple.tn:8080"), "exemple.tn")
})

test("normalizeHost : met en minuscules", () => {
  assert.equal(normalizeHost("Exemple.TN"), "exemple.tn")
})

test("normalizeHost : ne retire pas un www. au milieu du domaine", () => {
  assert.equal(normalizeHost("voyages-www.exemple.tn"), "voyages-www.exemple.tn")
})
