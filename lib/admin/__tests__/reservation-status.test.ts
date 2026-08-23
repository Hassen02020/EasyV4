import test from "node:test"
import assert from "node:assert/strict"

import {
  isTransitionAllowed,
  getAllowedTransitions,
  RESERVATION_STATUS_ALLOWED_ROLES,
} from "../reservation-status"

test("isTransitionAllowed : transitions métier valides", () => {
  assert.equal(isTransitionAllowed("pending", "confirmed"), true)
  assert.equal(isTransitionAllowed("pending", "cancelled"), true)
  assert.equal(isTransitionAllowed("confirmed", "cancelled"), true)
  assert.equal(isTransitionAllowed("confirmed", "completed"), true)
})

test("isTransitionAllowed : rejette les statuts terminaux et l'identité", () => {
  assert.equal(isTransitionAllowed("refunded", "confirmed"), false)
  assert.equal(isTransitionAllowed("expired", "confirmed"), false)
  assert.equal(isTransitionAllowed("pending", "pending"), false)
})

test("getAllowedTransitions : reflète exactement la state machine", () => {
  assert.deepEqual([...getAllowedTransitions("pending")].sort(), ["cancelled", "confirmed", "expired", "on_request"])
  assert.deepEqual(getAllowedTransitions("refunded"), [])
})

test("RESERVATION_STATUS_ALLOWED_ROLES (Phase 21.2, P1) : exclut agent_compta/agent_excursions et tout rôle partenaire B2B", () => {
  assert.deepEqual([...RESERVATION_STATUS_ALLOWED_ROLES].sort(), ["agent_resa", "manager", "super_admin"])
  assert.equal((RESERVATION_STATUS_ALLOWED_ROLES as readonly string[]).includes("agent_compta"), false)
  assert.equal((RESERVATION_STATUS_ALLOWED_ROLES as readonly string[]).includes("agent_excursions"), false)
  assert.equal((RESERVATION_STATUS_ALLOWED_ROLES as readonly string[]).includes("partner_owner"), false)
  assert.equal((RESERVATION_STATUS_ALLOWED_ROLES as readonly string[]).includes("partner_agent"), false)
})
