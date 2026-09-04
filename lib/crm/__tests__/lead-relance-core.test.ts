/**
 * CRM / Leads — Relance (étape 3/3). `isLeadStale` pure + CRUD réel des
 * réglages (mêmes conventions que lead-scoring-core.test.ts).
 */
import test, { before, after } from "node:test"
import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { eq, sql } from "drizzle-orm"
import { withTenantContext, withSystemContext, type TenantContext } from "@/lib/db/tenant-context"
import { agencies, leadRelanceSettings } from "@/lib/db/schema"
import type { LeadRow } from "../leads-core"
import {
  isLeadStale,
  defaultLeadRelanceSettings,
  getLeadRelanceSettingsCore,
  upsertLeadRelanceSettingsCore,
  DEFAULT_RELANCE_THRESHOLD_DAYS,
} from "../lead-relance-core"

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

const NOW = new Date("2026-01-10T12:00:00Z")

test("isLeadStale : lead 'new' de plus de N jours sans contact → true", () => {
  const lead = makeLead({ updatedAt: new Date("2026-01-05T12:00:00Z") }) // 5 jours
  assert.equal(isLeadStale(lead, defaultLeadRelanceSettings(), NOW), true)
})

test("isLeadStale : lead 'new' récent (< seuil) → false", () => {
  const lead = makeLead({ updatedAt: new Date("2026-01-09T12:00:00Z") }) // 1 jour
  assert.equal(isLeadStale(lead, defaultLeadRelanceSettings(), NOW), false)
})

test("isLeadStale : lead déjà contacté/converti/clôturé → jamais stale, même très ancien", () => {
  const old = new Date("2025-01-01T00:00:00Z")
  for (const status of ["contacted", "converted", "closed"] as const) {
    const lead = makeLead({ status, updatedAt: old })
    assert.equal(isLeadStale(lead, defaultLeadRelanceSettings(), NOW), false, `status=${status}`)
  }
})

test("isLeadStale : relance désactivée → jamais stale, même très ancien et 'new'", () => {
  const lead = makeLead({ updatedAt: new Date("2020-01-01T00:00:00Z") })
  const settings = { thresholdDays: DEFAULT_RELANCE_THRESHOLD_DAYS, isEnabled: false }
  assert.equal(isLeadStale(lead, settings, NOW), false)
})

test("isLeadStale : seuil configurable — 10 jours désactive le déclenchement à 5 jours", () => {
  const lead = makeLead({ updatedAt: new Date("2026-01-05T12:00:00Z") }) // 5 jours
  const settings = { thresholdDays: 10, isEnabled: true }
  assert.equal(isLeadStale(lead, settings, NOW), false)
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
      name: "RELANCE Agency A",
      agencyType: "ota",
      slug: `relance-a-${agencyA.slice(0, 8)}`,
    })
  })
})

after(async () => {
  if (!dbAvailable) return
  await withSystemContext(async (tx) => {
    await tx.delete(leadRelanceSettings).where(eq(leadRelanceSettings.agencyId, agencyA))
    await tx.delete(agencies).where(eq(agencies.id, agencyA))
  })
})

test("getLeadRelanceSettingsCore : sans rien configuré, retourne le défaut (3 jours, actif)", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  const ctx: TenantContext = { agencyId: agencyA, userId: "", isSuperAdmin: true }
  const settings = await withTenantContext(ctx, (tx) => getLeadRelanceSettingsCore(tx, { agencyId: agencyA }))
  assert.equal(settings.thresholdDays, DEFAULT_RELANCE_THRESHOLD_DAYS)
  assert.equal(settings.isEnabled, true)
})

test("upsertLeadRelanceSettingsCore : crée puis met à jour (une ligne par agence)", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  const ctx: TenantContext = { agencyId: agencyA, userId: "", isSuperAdmin: true }

  await withTenantContext(ctx, (tx) =>
    upsertLeadRelanceSettingsCore(tx, { agencyId: agencyA, thresholdDays: 7, isEnabled: true }),
  )
  let settings = await withTenantContext(ctx, (tx) => getLeadRelanceSettingsCore(tx, { agencyId: agencyA }))
  assert.equal(settings.thresholdDays, 7)

  await withTenantContext(ctx, (tx) =>
    upsertLeadRelanceSettingsCore(tx, { agencyId: agencyA, thresholdDays: 7, isEnabled: false }),
  )
  settings = await withTenantContext(ctx, (tx) => getLeadRelanceSettingsCore(tx, { agencyId: agencyA }))
  assert.equal(settings.isEnabled, false)
})
