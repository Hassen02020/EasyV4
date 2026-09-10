/**
 * Tests unitaires — `lib/crm/provider.ts`.
 *
 * Objectif : garantir que tant qu'aucun système CRM réel n'est
 * choisi/configuré, l'abstraction `CrmProvider` renvoie honnêtement
 * `CRM_PROVIDER_NOT_CONFIGURED` — jamais une fausse synchronisation.
 */

import test from "node:test"
import assert from "node:assert/strict"

import { getCrmProvider, hasConfiguredCrmProvider } from "@/lib/crm/provider"

test("hasConfiguredCrmProvider() : toujours false — aucun système CRM choisi pour ce projet", () => {
  assert.equal(hasConfiguredCrmProvider(), false)
})

test("getCrmProvider() : provider non configuré", () => {
  const provider = getCrmProvider()
  assert.equal(provider.configured, false)
  assert.equal(provider.name, "not_configured")
})

test("syncBooking() : jamais de fausse synchronisation — code explicite", async () => {
  const provider = getCrmProvider()
  const result = await provider.syncBooking({
    reservationId: "reservation-uuid-test",
    publicRef: "TG-2026-000001",
    agencyId: "agency-uuid-test",
    customerEmail: "client@example.com",
    customerName: "Client Test",
    customerPhone: "+21698123456",
    totalTnd: 1000,
    confirmedAt: new Date().toISOString(),
  })
  assert.equal(result.ok, false)
  assert.equal(result.code, "CRM_PROVIDER_NOT_CONFIGURED")
  assert.ok(result.message && result.message.length > 0)
})
