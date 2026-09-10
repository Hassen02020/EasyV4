/**
 * pricing_margins — preuve live contre un Postgres réel, même convention
 * que les autres suites `-core.test.ts` de ce projet : se dégrade en
 * `skip` sans DATABASE_URL/Postgres local disponible.
 */
import test, { before, after } from "node:test"
import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { eq, sql } from "drizzle-orm"
import { withTenantContext, withSystemContext, type TenantContext } from "@/lib/db/tenant-context"
import { agencies, pricingMargins } from "@/lib/db/schema"
import { upsertPricingMarginCore, listPricingMarginsCore } from "../margins-core"

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
      name: "MARGINS Agency A",
      agencyType: "partner",
      slug: `margins-a-${agencyA.slice(0, 8)}`,
    })
  })
})

after(async () => {
  if (!dbAvailable) return
  await withSystemContext(async (tx) => {
    await tx.delete(pricingMargins).where(eq(pricingMargins.agencyId, agencyA))
    await tx.delete(agencies).where(eq(agencies.id, agencyA))
  })
})

test("upsertPricingMarginCore : crée puis met à jour (une ligne par agence+module, jamais un doublon)", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  const ctx: TenantContext = { agencyId: agencyA, userId: "", isSuperAdmin: true }

  await withTenantContext(ctx, (tx) =>
    upsertPricingMarginCore(tx, {
      agencyId: agencyA,
      module: "hotel",
      marginType: "percent",
      marginValue: 12,
      isActive: true,
    }),
  )

  let rows = await withTenantContext(ctx, (tx) => listPricingMarginsCore(tx, { agencyId: agencyA }))
  assert.equal(rows.length, 1)
  assert.equal(rows[0]!.marginType, "percent")
  assert.equal(Number(rows[0]!.marginValue), 12)

  // Deuxième appel même module → update, pas un second insert.
  await withTenantContext(ctx, (tx) =>
    upsertPricingMarginCore(tx, {
      agencyId: agencyA,
      module: "hotel",
      marginType: "fixed",
      marginValue: 25,
      isActive: false,
    }),
  )

  rows = await withTenantContext(ctx, (tx) => listPricingMarginsCore(tx, { agencyId: agencyA }))
  assert.equal(rows.length, 1)
  assert.equal(rows[0]!.marginType, "fixed")
  assert.equal(Number(rows[0]!.marginValue), 25)
  assert.equal(rows[0]!.isActive, false)
})

test("upsertPricingMarginCore : deux modules distincts coexistent pour la même agence", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  const ctx: TenantContext = { agencyId: agencyA, userId: "", isSuperAdmin: true }

  await withTenantContext(ctx, (tx) =>
    upsertPricingMarginCore(tx, {
      agencyId: agencyA,
      module: "transfer",
      marginType: "percent",
      marginValue: 8,
      isActive: true,
    }),
  )

  const rows = await withTenantContext(ctx, (tx) => listPricingMarginsCore(tx, { agencyId: agencyA }))
  const modules = rows.map((r) => r.module).sort()
  assert.deepEqual(modules, ["hotel", "transfer"])
})
