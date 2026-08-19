/**
 * Régression — frontière /admin (isAllowedIntoAdmin).
 *
 *   pnpm test
 *
 * Bug trouvé pendant le stress test B2B/B2C : le rôle seul ne distinguait
 * pas le staff Easy2Book (agency_type='ota') d'une agence partenaire B2B
 * (agency_type='partner') — manager/agent_resa/agent_compta/agent_excursions
 * sont des rôles que les deux peuvent porter (cf.
 * lib/api/auth-guard.ts::requirePartnerSession). Ce test fige la matrice
 * exacte : aucun rôle "partner" ne doit jamais passer, quel que soit le rôle.
 */

import test from "node:test"
import assert from "node:assert/strict"
import { isAllowedIntoAdmin, isAdminRole } from "../admin-gate"

test("OTA + super_admin → autorisé", () => {
  assert.equal(isAllowedIntoAdmin("super_admin", "ota"), true)
})

test("OTA + manager/agent_resa/agent_compta/agent_excursions → autorisé", () => {
  for (const role of ["manager", "agent_resa", "agent_compta", "agent_excursions"]) {
    assert.equal(isAllowedIntoAdmin(role, "ota"), true, `role=${role}`)
  }
})

test("PARTNER + manager → refusé (le bug trouvé)", () => {
  assert.equal(isAllowedIntoAdmin("manager", "partner"), false)
})

test("PARTNER + agent_resa → refusé", () => {
  assert.equal(isAllowedIntoAdmin("agent_resa", "partner"), false)
})

test("PARTNER + super_admin → refusé (agency_type prime toujours)", () => {
  // Un rôle "super_admin" stocké sur une ligne d'agence partenaire ne
  // devrait jamais exister, mais si c'était le cas, agency_type doit quand
  // même bloquer — défense en profondeur contre une donnée incohérente.
  assert.equal(isAllowedIntoAdmin("super_admin", "partner"), false)
})

test("PARTNER + partner_owner/partner_agent → refusé (jamais des rôles admin)", () => {
  assert.equal(isAllowedIntoAdmin("partner_owner", "partner"), false)
  assert.equal(isAllowedIntoAdmin("partner_agent", "partner"), false)
})

test("OTA + partner_owner/partner_agent → refusé (rôle non-staff)", () => {
  // Ne devrait pas exister en pratique (partner_owner sur une agence OTA),
  // mais isAllowedIntoAdmin doit rester correcte indépendamment des données.
  assert.equal(isAllowedIntoAdmin("partner_owner", "ota"), false)
  assert.equal(isAllowedIntoAdmin("partner_agent", "ota"), false)
})

test("agency_type null/undefined → toujours refusé", () => {
  assert.equal(isAllowedIntoAdmin("super_admin", null), false)
  assert.equal(isAllowedIntoAdmin("super_admin", undefined), false)
  assert.equal(isAllowedIntoAdmin("manager", ""), false)
})

test("role null/undefined/inconnu → toujours refusé", () => {
  assert.equal(isAllowedIntoAdmin(null, "ota"), false)
  assert.equal(isAllowedIntoAdmin(undefined, "ota"), false)
  assert.equal(isAllowedIntoAdmin("not_a_real_role", "ota"), false)
})

test("isAdminRole reconnaît exactement les 5 rôles staff", () => {
  assert.equal(isAdminRole("super_admin"), true)
  assert.equal(isAdminRole("manager"), true)
  assert.equal(isAdminRole("agent_resa"), true)
  assert.equal(isAdminRole("agent_compta"), true)
  assert.equal(isAdminRole("agent_excursions"), true)
  assert.equal(isAdminRole("partner_owner"), false)
  assert.equal(isAdminRole("partner_agent"), false)
  assert.equal(isAdminRole(null), false)
  assert.equal(isAdminRole(undefined), false)
})
