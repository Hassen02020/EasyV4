/**
 * Tests pour lib/booking/customer-identity.ts (Phase "CUSTOMER RESERVATION
 * LINK") — la règle de non-ambiguïté qui décide si une réservation guest
 * peut être rattachée au compte client authentifié.
 */

import { strict as assert } from "node:assert"
import { test } from "node:test"
import { emailsMatch } from "../customer-identity"

test("emailsMatch : email identique → true", () => {
  assert.equal(emailsMatch("client@example.com", "client@example.com"), true)
})

test("emailsMatch : insensible à la casse", () => {
  assert.equal(emailsMatch("Client@Example.com", "client@example.com"), true)
})

test("emailsMatch : insensible aux espaces superflus", () => {
  assert.equal(emailsMatch("  client@example.com  ", "client@example.com"), true)
})

test("emailsMatch : email différent → false (jamais de rattachement ambigu)", () => {
  assert.equal(emailsMatch("client@example.com", "quelquun-dautre@example.com"), false)
})

test("emailsMatch : correspondance PARTIELLE (alias/sous-chaîne) → false", () => {
  assert.equal(emailsMatch("client@example.com", "client+voyage@example.com"), false)
  assert.equal(emailsMatch("client@example.com", "client@example.com.fake.tld"), false)
})

test("emailsMatch : session non connectée (undefined/null) → false, jamais un rattachement guest", () => {
  assert.equal(emailsMatch(undefined, "client@example.com"), false)
  assert.equal(emailsMatch(null, "client@example.com"), false)
})

test("emailsMatch : email voyageur absent → false", () => {
  assert.equal(emailsMatch("client@example.com", undefined), false)
  assert.equal(emailsMatch("client@example.com", ""), false)
})
