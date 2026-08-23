import test from "node:test"
import assert from "node:assert/strict"

import { getBaselinePermissions, hasBaselinePermission, PARTNER_DELEGATABLE_PERMISSIONS } from "../permissions"

test("baseline OTA : agent_resa hérite du rôle existant (lib/auth/rbac.ts), inchangé", () => {
  assert.equal(hasBaselinePermission("agent_resa", "reservations.create"), true)
  assert.equal(hasBaselinePermission("agent_resa", "reservations.view"), true)
  assert.equal(hasBaselinePermission("agent_resa", "accounting.view"), false)
  assert.equal(hasBaselinePermission("agent_resa", "staff.create"), false)
})

test("baseline OTA : agent_compta a finance/paiements, pas la gestion du personnel", () => {
  assert.equal(hasBaselinePermission("agent_compta", "accounting.view"), true)
  assert.equal(hasBaselinePermission("agent_compta", "accounting.payments.process"), true)
  assert.equal(hasBaselinePermission("agent_compta", "staff.create"), false)
})

test("baseline OTA : super_admin a tout (admin.system.config)", () => {
  assert.equal(hasBaselinePermission("super_admin", "admin.system.config"), true)
})

test("baseline partenaire : partner_owner NE possède PAS staff.* par défaut — jamais automatique", () => {
  assert.equal(hasBaselinePermission("partner_owner", "staff.create"), false)
  assert.equal(hasBaselinePermission("partner_owner", "staff.edit"), false)
  assert.equal(hasBaselinePermission("partner_owner", "admin.users.create"), false)
})

test("baseline partenaire : partner_owner a reservations/clients (agence-wide, pas de partition par agent)", () => {
  assert.equal(hasBaselinePermission("partner_owner", "reservations.view"), true)
  assert.equal(hasBaselinePermission("partner_owner", "reservations.create"), true)
  assert.equal(hasBaselinePermission("partner_owner", "clients.manage" as never), false) // clé inexistante
  assert.equal(hasBaselinePermission("partner_owner", "clients.edit"), true)
})

test("baseline partenaire : partner_agent — reservations.create/view seulement, jamais staff.*", () => {
  const perms = getBaselinePermissions("partner_agent")
  assert.deepEqual([...perms].sort(), ["reservations.create", "reservations.view"])
  assert.equal(hasBaselinePermission("partner_agent", "staff.edit"), false)
  assert.equal(hasBaselinePermission("partner_agent", "clients.edit"), false)
})

test("rôle inconnu/null : baseline vide, jamais un accès par défaut", () => {
  assert.deepEqual(getBaselinePermissions(null), [])
  assert.deepEqual(getBaselinePermissions(undefined), [])
  assert.deepEqual(getBaselinePermissions("not_a_real_role"), [])
})

test("PARTNER_DELEGATABLE_PERMISSIONS : jamais staff.*/admin.*/accounting.refunds.* — un agent ne peut jamais recevoir de quoi gérer des utilisateurs ou approuver un remboursement", () => {
  for (const p of PARTNER_DELEGATABLE_PERMISSIONS) {
    assert.ok(!p.startsWith("staff."), `${p} ne devrait pas être délégable`)
    assert.ok(!p.startsWith("admin."), `${p} ne devrait pas être délégable`)
    assert.ok(p !== "accounting.refunds.process", `${p} ne devrait pas être délégable`)
  }
  assert.ok(PARTNER_DELEGATABLE_PERMISSIONS.includes("reservations.view"))
})
