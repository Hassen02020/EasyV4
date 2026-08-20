/**
 * Tests unitaires pour `lib/auth/partner-permissions.ts`.
 *
 * Régression pour le gap "Partner Owner" trouvé en audit : avant ce
 * correctif, `/pro/utilisateurs` (gestion des collaborateurs de l'agence)
 * était accessible à un `partner_agent` sans aucune vérification de rôle.
 */

import test from "node:test"
import assert from "node:assert/strict"
import { canManagePartnerUsers } from "../partner-permissions"

test("canManagePartnerUsers : autorise partner_owner", () => {
  assert.equal(canManagePartnerUsers("partner_owner"), true)
})

test("canManagePartnerUsers : autorise super_admin (vue B2B simulée)", () => {
  assert.equal(canManagePartnerUsers("super_admin"), true)
})

test("canManagePartnerUsers : refuse partner_agent", () => {
  assert.equal(canManagePartnerUsers("partner_agent"), false)
})

test("canManagePartnerUsers : refuse un rôle inconnu/absent", () => {
  assert.equal(canManagePartnerUsers("staff"), false)
  assert.equal(canManagePartnerUsers(null), false)
  assert.equal(canManagePartnerUsers(undefined), false)
  assert.equal(canManagePartnerUsers(""), false)
})
