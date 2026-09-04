/**
 * CRM / Leads — Scoring (étape 2/3). Deux familles de tests :
 * `computeLeadScore` (pure, aucune DB) et les fonctions `-Core` DB-backed
 * (mêmes conventions que leads-core.test.ts).
 */
import test, { before, after } from "node:test"
import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { eq, sql } from "drizzle-orm"
import { withTenantContext, withSystemContext, type TenantContext } from "@/lib/db/tenant-context"
import { agencies, leadScoringRules } from "@/lib/db/schema"
import type { LeadRow } from "../leads-core"
import {
  computeLeadScore,
  defaultLeadScoreRuleMap,
  getLeadScoreRuleMapCore,
  upsertLeadScoreRuleCore,
  DEFAULT_SIGNAL_POINTS,
} from "../lead-scoring-core"

function makeLead(overrides: Partial<LeadRow> = {}): LeadRow {
  return {
    id: randomUUID(),
    firstName: "Test",
    lastName: null,
    email: null,
    phone: null,
    message: null,
    productType: "general",
    productRef: null,
    productLabel: null,
    sourcePage: "/",
    status: "new",
    staffNotes: null,
    handledByUserId: null,
    reservationId: null,
    convertedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }
}

test("computeLeadScore : lead vide (aucun signal) → 0", () => {
  const score = computeLeadScore(makeLead(), defaultLeadScoreRuleMap())
  assert.equal(score.total, 0)
  assert.ok(score.breakdown.every((b) => !b.matched && b.points === 0))
})

test("computeLeadScore : les 4 signaux matchés → somme des 4 points par défaut", () => {
  const lead = makeLead({
    email: "a@example.com",
    phone: "+21620000000",
    message: "Bonjour, je suis intéressé",
    productType: "package",
    productRef: "pkg-1",
  })
  const score = computeLeadScore(lead, defaultLeadScoreRuleMap())
  assert.equal(score.total, DEFAULT_SIGNAL_POINTS * 4)
  assert.ok(score.breakdown.every((b) => b.matched && b.points === DEFAULT_SIGNAL_POINTS))
})

test("computeLeadScore : contact_complete exige email ET téléphone, pas un seul", () => {
  const emailOnly = makeLead({ email: "a@example.com" })
  const score = computeLeadScore(emailOnly, defaultLeadScoreRuleMap())
  const contactItem = score.breakdown.find((b) => b.signal === "contact_complete")!
  assert.equal(contactItem.matched, false)
})

test("computeLeadScore : signal désactivé → matched visible mais 0 point (transparence)", () => {
  const lead = makeLead({ email: "a@example.com", phone: "+21620000000" })
  const rules = defaultLeadScoreRuleMap()
  rules.contact_complete = { points: 40, isActive: false }
  const score = computeLeadScore(lead, rules)
  const item = score.breakdown.find((b) => b.signal === "contact_complete")!
  assert.equal(item.matched, true)
  assert.equal(item.points, 0)
})

test("computeLeadScore : poids configurable — un signal à 0 point n'ajoute rien même matché", () => {
  const lead = makeLead({ productType: "omra" })
  const rules = defaultLeadScoreRuleMap()
  rules.specific_product = { points: 0, isActive: true }
  const score = computeLeadScore(lead, rules)
  assert.equal(score.breakdown.find((b) => b.signal === "specific_product")!.points, 0)
})

/* -------------------------------------------------------------------------- */
/* DB-backed                                                                  */
/* -------------------------------------------------------------------------- */

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
const skipReason = () =>
  "Postgres local indisponible (DATABASE_URL) — voir live-resolution.test.ts pour la procédure."

let agencyA = ""

before(async () => {
  dbAvailable = await isDbAvailable()
  if (!dbAvailable) return
  agencyA = randomUUID()
  await withSystemContext(async (tx) => {
    await tx.insert(agencies).values({
      id: agencyA,
      name: "SCORING Agency A",
      agencyType: "ota",
      slug: `scoring-a-${agencyA.slice(0, 8)}`,
    })
  })
})

after(async () => {
  if (!dbAvailable) return
  await withSystemContext(async (tx) => {
    await tx.delete(leadScoringRules).where(eq(leadScoringRules.agencyId, agencyA))
    await tx.delete(agencies).where(eq(agencies.id, agencyA))
  })
})

test("getLeadScoreRuleMapCore : sans rien configuré, retourne les défauts pour les 4 signaux", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  const ctx: TenantContext = { agencyId: agencyA, userId: "", isSuperAdmin: true }
  const rules = await withTenantContext(ctx, (tx) => getLeadScoreRuleMapCore(tx, { agencyId: agencyA }))
  assert.equal(rules.contact_complete.points, DEFAULT_SIGNAL_POINTS)
  assert.equal(rules.has_message.isActive, true)
})

test("upsertLeadScoreRuleCore : crée puis met à jour (une ligne par agence+signal)", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  const ctx: TenantContext = { agencyId: agencyA, userId: "", isSuperAdmin: true }

  await withTenantContext(ctx, (tx) =>
    upsertLeadScoreRuleCore(tx, { agencyId: agencyA, signal: "has_message", points: 50, isActive: true }),
  )
  let rules = await withTenantContext(ctx, (tx) => getLeadScoreRuleMapCore(tx, { agencyId: agencyA }))
  assert.equal(rules.has_message.points, 50)

  await withTenantContext(ctx, (tx) =>
    upsertLeadScoreRuleCore(tx, { agencyId: agencyA, signal: "has_message", points: 0, isActive: false }),
  )
  rules = await withTenantContext(ctx, (tx) => getLeadScoreRuleMapCore(tx, { agencyId: agencyA }))
  assert.equal(rules.has_message.points, 0)
  assert.equal(rules.has_message.isActive, false)
})
