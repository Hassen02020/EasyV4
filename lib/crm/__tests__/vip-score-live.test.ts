/**
 * VIP-SCORE-02 — preuve live contre un Postgres réel : un contact avec
 * plusieurs demandes historiques (CONTACT-LEAD-HISTORY-01) score plus
 * haut qu'un contact avec une seule demande, toutes choses égales par
 * ailleurs — et un lead sans contact persisté ne casse jamais le calcul
 * (`engagementLeadCount` retombe sur 1, jamais une exception). Même
 * convention que les autres tests live de ce dépôt.
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
import { agencies, contacts, leads } from "@/lib/db/schema"
import { getVipScoreForLeadCore } from "../vip-score-core"
import { defaultLeadScoreRuleMap } from "../lead-scoring-core"
import { createLeadCore } from "../leads-core"
import { resolveOrCreateContactCore } from "../contact-core"

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
      name: "VIP-SCORE-02 Agency",
      agencyType: "ota",
      slug: `vip-score-02-${agencyId.slice(0, 8)}`,
    }),
  )
})

after(async () => {
  if (!dbAvailable) return
  await withSystemContext(async (tx) => {
    await tx.delete(contacts).where(eq(contacts.agencyId, agencyId))
    await tx.delete(leads).where(eq(leads.agencyId, agencyId))
    await tx.delete(agencies).where(eq(agencies.id, agencyId))
  })
})

function ctx(): TenantContext {
  return { agencyId, userId: "", isSuperAdmin: true }
}

test("getVipScoreForLeadCore : un contact à 3 demandes historiques score plus haut qu'un contact à 1 demande, toutes choses égales par ailleurs", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  const scoreRules = defaultLeadScoreRuleMap()

  const emailSingle = "vip-score-engagement-single@example.test"
  const leadSingle = await withTenantContext(ctx(), (tx) =>
    createLeadCore(tx, {
      agencyId,
      firstName: "Single",
      email: emailSingle,
      productType: "general",
      sourcePage: "web",
    }),
  )
  await withTenantContext(ctx(), (tx) =>
    resolveOrCreateContactCore(tx, {
      agencyId,
      channel: "email",
      rawRef: emailSingle,
    }),
  )

  const emailRepeat = "vip-score-engagement-repeat@example.test"
  const leadRepeat1 = await withTenantContext(ctx(), (tx) =>
    createLeadCore(tx, {
      agencyId,
      firstName: "Repeat 1",
      email: emailRepeat,
      productType: "general",
      sourcePage: "web",
    }),
  )
  await withTenantContext(ctx(), (tx) =>
    createLeadCore(tx, {
      agencyId,
      firstName: "Repeat 2",
      email: emailRepeat,
      productType: "general",
      sourcePage: "web",
    }),
  )
  await withTenantContext(ctx(), (tx) =>
    createLeadCore(tx, {
      agencyId,
      firstName: "Repeat 3",
      email: emailRepeat,
      productType: "general",
      sourcePage: "web",
    }),
  )
  await withTenantContext(ctx(), (tx) =>
    resolveOrCreateContactCore(tx, {
      agencyId,
      channel: "email",
      rawRef: emailRepeat,
    }),
  )

  const resultSingle = await withTenantContext(ctx(), (tx) =>
    getVipScoreForLeadCore(tx, {
      agencyId,
      leadId: leadSingle.id,
      scoreRules,
      now: new Date("2026-01-01T00:00:00Z"),
    }),
  )
  const resultRepeat = await withTenantContext(ctx(), (tx) =>
    getVipScoreForLeadCore(tx, {
      agencyId,
      leadId: leadRepeat1.id,
      scoreRules,
      now: new Date("2026-01-01T00:00:00Z"),
    }),
  )

  assert.ok(resultSingle)
  assert.ok(resultRepeat)

  const engagementSingle = resultSingle!.score.breakdown.find(
    (b) => b.signal === "engagement",
  )!
  const engagementRepeat = resultRepeat!.score.breakdown.find(
    (b) => b.signal === "engagement",
  )!

  assert.equal(engagementSingle.rawValue, 1)
  assert.equal(engagementRepeat.rawValue, 3)
  assert.equal(engagementSingle.points, 0)
  assert.ok(engagementRepeat.points > engagementSingle.points)
  assert.ok(
    resultRepeat!.score.total > resultSingle!.score.total,
    "un contact à 3 demandes historiques doit scorer plus haut qu'un contact à 1 demande",
  )
})

test("getVipScoreForLeadCore : lead sans contact persisté => engagementLeadCount retombe sur 1, jamais une exception", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  const scoreRules = defaultLeadScoreRuleMap()

  const lead = await withTenantContext(ctx(), (tx) =>
    createLeadCore(tx, {
      agencyId,
      firstName: "Sans contact",
      email: "vip-score-no-contact@example.test",
      productType: "general",
      sourcePage: "web",
    }),
  )

  const result = await withTenantContext(ctx(), (tx) =>
    getVipScoreForLeadCore(tx, {
      agencyId,
      leadId: lead.id,
      scoreRules,
      now: new Date("2026-01-01T00:00:00Z"),
    }),
  )

  assert.ok(result)
  const engagement = result!.score.breakdown.find(
    (b) => b.signal === "engagement",
  )!
  assert.equal(engagement.rawValue, 1)
  assert.equal(engagement.points, 0)
})
