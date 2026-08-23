import test from "node:test"
import assert from "node:assert/strict"

import { checkRoleChangeAllowed, checkNotSelfTarget } from "../users-logic"

test("checkNotSelfTarget : refuse quand l'acteur cible son propre compte", () => {
  const result = checkNotSelfTarget({ actorUserId: "u1", targetUserId: "u1" })
  assert.equal(result.ok, false)
})

test("checkNotSelfTarget : autorise quand la cible est un autre utilisateur", () => {
  const result = checkNotSelfTarget({ actorUserId: "u1", targetUserId: "u2" })
  assert.equal(result.ok, true)
})

test("checkRoleChangeAllowed : refuse l'auto-modification", () => {
  const result = checkRoleChangeAllowed({
    actorRole: "manager",
    actorUserId: "u1",
    targetUserId: "u1",
    nextRole: "agent_resa",
  })
  assert.equal(result.ok, false)
})

test("checkRoleChangeAllowed : un manager ne peut pas accorder super_admin", () => {
  const result = checkRoleChangeAllowed({
    actorRole: "manager",
    actorUserId: "u1",
    targetUserId: "u2",
    nextRole: "super_admin",
  })
  assert.equal(result.ok, false)
})

test("checkRoleChangeAllowed : un super_admin peut accorder super_admin", () => {
  const result = checkRoleChangeAllowed({
    actorRole: "super_admin",
    actorUserId: "u1",
    targetUserId: "u2",
    nextRole: "super_admin",
  })
  assert.equal(result.ok, true)
})

test("checkRoleChangeAllowed : un manager ne peut pas modifier un compte déjà super_admin", () => {
  const result = checkRoleChangeAllowed({
    actorRole: "manager",
    actorUserId: "u1",
    targetUserId: "u2",
    targetCurrentRole: "super_admin",
    nextRole: "agent_resa",
  })
  assert.equal(result.ok, false)
})

test("checkRoleChangeAllowed : un manager peut modifier un compte non-super_admin vers un rôle non-super_admin", () => {
  const result = checkRoleChangeAllowed({
    actorRole: "manager",
    actorUserId: "u1",
    targetUserId: "u2",
    targetCurrentRole: "agent_resa",
    nextRole: "agent_compta",
  })
  assert.equal(result.ok, true)
})

test("checkRoleChangeAllowed : un super_admin peut modifier un compte super_admin existant", () => {
  const result = checkRoleChangeAllowed({
    actorRole: "super_admin",
    actorUserId: "u1",
    targetUserId: "u2",
    targetCurrentRole: "super_admin",
    nextRole: "manager",
  })
  assert.equal(result.ok, true)
})
