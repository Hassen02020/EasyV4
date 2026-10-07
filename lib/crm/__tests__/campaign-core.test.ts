/**
 * CAMPAIGN-01 — tests unitaires de resolveContactRefForChannelCore
 * (fonction pure, aucun accès DB requis). La normalisation elle-même
 * est testée dans contact-core.test.ts — ici on vérifie uniquement le
 * mapping canal → champ brut.
 */
import test from "node:test"
import assert from "node:assert/strict"
import { resolveContactRefForChannelCore } from "../campaign-core"

test("channel email : utilise lead.email brut (non normalisé ici)", () => {
  assert.equal(
    resolveContactRefForChannelCore(
      { email: "Test@Example.COM", phone: null },
      "email",
    ),
    "Test@Example.COM",
  )
})

test("channel email : lead.email absent → null (jamais de valeur fabriquée)", () => {
  assert.equal(
    resolveContactRefForChannelCore(
      { email: null, phone: "+21620000001" },
      "email",
    ),
    null,
  )
})

test("channel whatsapp : utilise lead.phone brut", () => {
  assert.equal(
    resolveContactRefForChannelCore(
      { email: "test@example.com", phone: "+21620000001" },
      "whatsapp",
    ),
    "+21620000001",
  )
})

test("channel call : utilise lead.phone brut", () => {
  assert.equal(
    resolveContactRefForChannelCore(
      { email: null, phone: "+21620000001" },
      "call",
    ),
    "+21620000001",
  )
})

test("channel whatsapp : lead.phone absent → null", () => {
  assert.equal(
    resolveContactRefForChannelCore(
      { email: "test@example.com", phone: null },
      "whatsapp",
    ),
    null,
  )
})

for (const channel of ["instagram", "messenger", "web"] as const) {
  test(`channel ${channel} : aucun champ équivalent sur LeadRow → toujours null`, () => {
    assert.equal(
      resolveContactRefForChannelCore(
        { email: "test@example.com", phone: "+21620000001" },
        channel,
      ),
      null,
    )
  })
}
