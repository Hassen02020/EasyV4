import test from "node:test"
import assert from "node:assert/strict"

import { checkDelegationAllowed } from "../permission-grants-logic"
import { PARTNER_DELEGATABLE_PERMISSIONS } from "../permissions"
import { RBAC_PERMISSIONS } from "../rbac-permission-list"

const SUPER_ADMIN = "11111111-1111-1111-1111-111111111111"
const OWNER = "22222222-2222-2222-2222-222222222222"
const AGENT = "33333333-3333-3333-3333-333333333333"
const OTHER_OWNER = "44444444-4444-4444-4444-444444444444"

test("super_admin -> grant global : jamais restreint, cible existante suffit", () => {
  const result = checkDelegationAllowed({
    actorUserId: SUPER_ADMIN,
    targetUserId: AGENT,
    actorIsSuperAdmin: true,
    actorHasStaffEdit: true,
    targetRole: "agent_resa",
    targetFound: true,
    permission: "admin.system.config",
    delegatablePermissions: RBAC_PERMISSIONS,
  })
  assert.deepEqual(result, { ok: true })
})

test("super_admin -> cible introuvable : rejeté", () => {
  const result = checkDelegationAllowed({
    actorUserId: SUPER_ADMIN,
    targetUserId: AGENT,
    actorIsSuperAdmin: true,
    actorHasStaffEdit: true,
    targetRole: null,
    targetFound: false,
    permission: "staff.edit",
    delegatablePermissions: RBAC_PERMISSIONS,
  })
  assert.equal(result.ok, false)
})

test("acteur == cible (auto-modification) : toujours rejeté, super_admin inclus", () => {
  const result = checkDelegationAllowed({
    actorUserId: SUPER_ADMIN,
    targetUserId: SUPER_ADMIN,
    actorIsSuperAdmin: true,
    actorHasStaffEdit: true,
    targetRole: "super_admin",
    targetFound: true,
    permission: "admin.system.config",
    delegatablePermissions: RBAC_PERMISSIONS,
  })
  assert.equal(result.ok, false)
})

test("partner_owner SANS staff.edit : ne peut déléguer aucune permission, même délégable", () => {
  const result = checkDelegationAllowed({
    actorUserId: OWNER,
    targetUserId: AGENT,
    actorIsSuperAdmin: false,
    actorHasStaffEdit: false,
    targetRole: "partner_agent",
    targetFound: true,
    permission: "reservations.view",
    delegatablePermissions: PARTNER_DELEGATABLE_PERMISSIONS,
  })
  assert.equal(result.ok, false)
})

test("partner_owner AVEC staff.edit -> permission délégable -> agent de son agence : autorisé", () => {
  const result = checkDelegationAllowed({
    actorUserId: OWNER,
    targetUserId: AGENT,
    actorIsSuperAdmin: false,
    actorHasStaffEdit: true,
    targetRole: "partner_agent",
    targetFound: true,
    permission: "reservations.view",
    delegatablePermissions: PARTNER_DELEGATABLE_PERMISSIONS,
  })
  assert.deepEqual(result, { ok: true })
})

test("partner_owner AVEC staff.edit -> permission NON délégable (staff.edit lui-même) : rejeté", () => {
  const result = checkDelegationAllowed({
    actorUserId: OWNER,
    targetUserId: AGENT,
    actorIsSuperAdmin: false,
    actorHasStaffEdit: true,
    targetRole: "partner_agent",
    targetFound: true,
    permission: "staff.edit",
    delegatablePermissions: PARTNER_DELEGATABLE_PERMISSIONS,
  })
  assert.equal(result.ok, false)
})

test("partner_owner -> cible n'est pas un partner_agent (un autre owner) : rejeté, jamais un pair", () => {
  const result = checkDelegationAllowed({
    actorUserId: OWNER,
    targetUserId: OTHER_OWNER,
    actorIsSuperAdmin: false,
    actorHasStaffEdit: true,
    targetRole: "partner_owner",
    targetFound: true,
    permission: "reservations.view",
    delegatablePermissions: PARTNER_DELEGATABLE_PERMISSIONS,
  })
  assert.equal(result.ok, false)
})

test("partner_owner -> cible introuvable dans SON agence (cross-agency implicite via la requête scoped) : rejeté", () => {
  const result = checkDelegationAllowed({
    actorUserId: OWNER,
    targetUserId: AGENT,
    actorIsSuperAdmin: false,
    actorHasStaffEdit: true,
    targetRole: null,
    targetFound: false,
    permission: "reservations.view",
    delegatablePermissions: PARTNER_DELEGATABLE_PERMISSIONS,
  })
  assert.equal(result.ok, false)
})
