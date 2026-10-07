/**
 * CUSTOMER-360-VIP-SCORE-01 — preuve live contre un Postgres réel que
 * getCustomer360Core surface bien le score VIP (lib/crm/vip-score-core.ts),
 * jusqu'ici calculé mais sans aucun appelant réel ailleurs dans
 * l'application. Même convention que les autres tests live de ce dépôt.
 */
import test, { before, after } from "node:test"
import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { eq, sql } from "drizzle-orm"
import {
  withSystemContext,
  withTenantContext,
  type TenantContext,
} from "@/lib/db/tenant-context"
import { agencies, leads } from "@/lib/db/schema"
import { getCustomer360Core } from "../customer-360-core"
import { createLeadCore } from "@/lib/crm/leads-core"
import { defaultLeadScoreRuleMap } from "@/lib/crm/lead-scoring-core"

async function isDbAvailable(): Promise<boolean> {
  try {
    await withSystemContext(async (tx) => {
      await tx.execute(sql`select 1`)
    })
    return true
  } catch {
    return false
  }
}

let dbAvailable = false
const skipReason = () => "Postgres local indisponible (DATABASE_URL)."

let agencyId = ""

before(async () => {
  dbAvailable = await isDbAvailable()
  if (!dbAvailable) return
  agencyId = randomUUID()
  await withSystemContext((tx) =>
    tx.insert(agencies).values({
      id: agencyId,
      name: "CUSTOMER-360-VIP-SCORE-01 Agency",
      agencyType: "ota",
      slug: `customer-360-vip-${agencyId.slice(0, 8)}`,
    }),
  )
})

after(async () => {
  if (!dbAvailable) return
  await withSystemContext(async (tx) => {
    await tx.delete(leads).where(eq(leads.agencyId, agencyId))
    await tx.delete(agencies).where(eq(agencies.id, agencyId))
  })
})

function ctx(): TenantContext {
  return { agencyId, userId: "", isSuperAdmin: true }
}

test("getCustomer360Core : expose un score VIP transparent (breakdown explicite), jamais un verdict VIP", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())

  const lead = await withTenantContext(ctx(), (tx) =>
    createLeadCore(tx, {
      agencyId,
      firstName: "Client 360",
      email: "customer-360-vip@example.test",
      productType: "general",
      sourcePage: "web",
    }),
  )

  const result = await withTenantContext(ctx(), (tx) =>
    getCustomer360Core(tx, {
      agencyId,
      leadId: lead.id,
      scoreRules: defaultLeadScoreRuleMap(),
    }),
  )

  assert.ok(result)
  assert.equal(typeof result!.vipScore.total, "number")
  assert.ok(Array.isArray(result!.vipScore.breakdown))
  assert.equal(result!.vipScore.breakdown.length, 6)
  const engagement = result!.vipScore.breakdown.find(
    (b) => b.signal === "engagement",
  )!
  assert.equal(
    engagement.rawValue,
    1,
    "sans contact persisté, engagementLeadCount retombe sur 1",
  )
  // Jamais de champ "isVip"/"verdict" quelconque — uniquement un nombre et
  // son breakdown (décision produit permanente : pas de seuil VIP ici).
  assert.ok(!("isVip" in result!.vipScore))
  assert.ok(!("verdict" in result!.vipScore))
})

test("getCustomer360Core : lead introuvable => null, jamais une exception", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())

  const result = await withTenantContext(ctx(), (tx) =>
    getCustomer360Core(tx, {
      agencyId,
      leadId: randomUUID(),
      scoreRules: defaultLeadScoreRuleMap(),
    }),
  )
  assert.equal(result, null)
})
