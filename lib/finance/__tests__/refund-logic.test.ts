import test from "node:test"
import assert from "node:assert/strict"

import { REFUND_ALLOWED_ROLES } from "../refund-logic"

test("REFUND_ALLOWED_ROLES exclut les rôles partenaire B2B et les rôles staff sans droit financier", () => {
  assert.deepEqual([...REFUND_ALLOWED_ROLES].sort(), ["agent_compta", "manager", "super_admin"])
  assert.equal((REFUND_ALLOWED_ROLES as readonly string[]).includes("agent_resa"), false)
  assert.equal((REFUND_ALLOWED_ROLES as readonly string[]).includes("agent_excursions"), false)
  assert.equal((REFUND_ALLOWED_ROLES as readonly string[]).includes("partner_owner"), false)
  assert.equal((REFUND_ALLOWED_ROLES as readonly string[]).includes("partner_agent"), false)
})
