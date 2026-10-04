/**
 * CRM / Leads — Analytics funnel (CRM-J7-01). Deux familles :
 *  1. `aggregateFunnelRows` (pure, sans DB)
 *  2. `getLeadFunnelValueCore` (DB-backed, skip si Postgres indisponible)
 */
import test, { before, after } from "node:test"
import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { eq, sql } from "drizzle-orm"
import {
  withTenantContext,
  withSystemContext,
  type TenantContext,
} from "@/lib/db/tenant-context"
import {
  agencies,
  customers,
  leads,
  reservations,
  reservationFinancials,
} from "@/lib/db/schema"
import { getLeadFunnelValueCore, aggregateFunnelRows } from "../lead-analytics-core"
import type { LeadFunnelRow } from "../lead-analytics-core"

/* -------------------------------------------------------------------------- */
/* Pure (sans DB)                                                              */
/* -------------------------------------------------------------------------- */

function makeRow(
  channel: LeadFunnelRow["acquisitionChannel"],
  totalLeads: number,
  convertedLeads: number,
  totalSaleTnd: number,
  totalMarginTnd = 0,
  totalCommissionTnd = 0,
): LeadFunnelRow {
  return {
    acquisitionChannel: channel,
    totalLeads,
    convertedLeads,
    totalSaleTnd,
    totalMarginTnd,
    totalCommissionTnd,
  }
}

test("aggregateFunnelRows : liste vide → tout à 0, conversionRate 0", () => {
  const agg = aggregateFunnelRows([])
  assert.equal(agg.totalLeads, 0)
  assert.equal(agg.convertedLeads, 0)
  assert.equal(agg.totalSaleTnd, 0)
  assert.equal(agg.conversionRate, 0)
})

test("aggregateFunnelRows : somme correcte sur plusieurs canaux", () => {
  const rows = [
    makeRow("b2c", 10, 3, 1500, 150, 15),
    makeRow("network", 5, 2, 800, 80, 8),
    makeRow(null, 2, 0, 0),
  ]
  const agg = aggregateFunnelRows(rows)
  assert.equal(agg.totalLeads, 17)
  assert.equal(agg.convertedLeads, 5)
  assert.equal(agg.totalSaleTnd, 2300)
  assert.equal(agg.totalMarginTnd, 230)
  assert.equal(agg.totalCommissionTnd, 23)
})

test("aggregateFunnelRows : conversionRate arrondi au % entier", () => {
  const agg = aggregateFunnelRows([makeRow("b2c", 3, 1, 0)])
  assert.equal(agg.conversionRate, 33)
})

test("aggregateFunnelRows : 100% si tous convertis", () => {
  const agg = aggregateFunnelRows([makeRow("b2c", 4, 4, 0)])
  assert.equal(agg.conversionRate, 100)
})

/* -------------------------------------------------------------------------- */
/* DB-backed                                                                   */
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

const skipReason = () =>
  "Postgres local indisponible (DATABASE_URL) — voir live-resolution.test.ts."

let dbAvailable = false
let agencyId = ""

before(async () => {
  dbAvailable = await isDbAvailable()
  if (!dbAvailable) return
  agencyId = randomUUID()
  await withSystemContext(async (tx) => {
    await tx.insert(agencies).values({
      id: agencyId,
      name: "FUNNEL Agency",
      agencyType: "ota",
      slug: `funnel-${agencyId.slice(0, 8)}`,
    })
  })
})

after(async () => {
  if (!dbAvailable) return
  await withSystemContext(async (tx) => {
    await tx
      .delete(reservationFinancials)
      .where(
        eq(
          reservationFinancials.reservationId,
          sql`any(select id from reservations where agency_id = ${agencyId})`,
        ),
      )
      .catch(() => null)
    await tx
      .delete(reservations)
      .where(eq(reservations.agencyId, agencyId))
      .catch(() => null)
    await tx
      .delete(leads)
      .where(eq(leads.agencyId, agencyId))
      .catch(() => null)
    await tx.delete(agencies).where(eq(agencies.id, agencyId))
  })
})

const ctx = (): TenantContext => ({
  agencyId,
  userId: "",
  isSuperAdmin: true,
})

test("getLeadFunnelValueCore : liste vide → aucune ligne", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  const rows = await withTenantContext(ctx(), (tx) =>
    getLeadFunnelValueCore(tx, { agencyId }),
  )
  assert.equal(rows.length, 0)
})

test("getLeadFunnelValueCore : lead non converti → 0 valeur financière", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())

  const leadId = randomUUID()
  await withSystemContext(async (tx) => {
    await tx.insert(leads).values({
      id: leadId,
      agencyId,
      firstName: "Test",
      email: "test@example.com",
      productType: "general",
      sourcePage: "/",
      acquisitionChannel: "b2c",
    })
  })

  const rows = await withTenantContext(ctx(), (tx) =>
    getLeadFunnelValueCore(tx, { agencyId }),
  )
  const b2c = rows.find((r) => r.acquisitionChannel === "b2c")
  assert.ok(b2c, "ligne b2c attendue")
  assert.equal(b2c.totalLeads, 1)
  assert.equal(b2c.convertedLeads, 0)
  assert.equal(b2c.totalSaleTnd, 0)
  assert.equal(b2c.totalMarginTnd, 0)
})

test("getLeadFunnelValueCore : lead converti sans reservation_financials → converti mais valeur 0", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())

  const resId = randomUUID()
  const leadId = randomUUID()

  const customerId1 = randomUUID()
  await withSystemContext(async (tx) => {
    await tx.insert(customers).values({
      id: customerId1,
      agencyId,
      firstName: "Client",
      lastName: "Converti",
      email: `conv-${resId.slice(0, 6)}@example.com`,
    })
    await tx.insert(reservations).values({
      id: resId,
      agencyId,
      customerId: customerId1,
      module: "hotel",
      source: "internal",
      status: "confirmed",
      originalCurrency: "TND",
      originalAmount: "1000.00",
      tndAmount: "1000.00",
      publicRef: `REF-${resId.slice(0, 6)}`,
    })
    await tx.insert(leads).values({
      id: leadId,
      agencyId,
      firstName: "Converti",
      email: "conv@example.com",
      productType: "hotel",
      sourcePage: "/hotels",
      acquisitionChannel: "network",
      reservationId: resId,
      status: "converted",
    })
  })

  const rows = await withTenantContext(ctx(), (tx) =>
    getLeadFunnelValueCore(tx, { agencyId }),
  )
  const net = rows.find((r) => r.acquisitionChannel === "network")
  assert.ok(net, "ligne network attendue")
  assert.equal(net.convertedLeads, 1)
  assert.equal(net.totalSaleTnd, 0) // pas de reservation_financials écrit
})

test("getLeadFunnelValueCore : lead converti + reservation_financials → valeur correcte", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())

  const resId = randomUUID()
  const leadId = randomUUID()

  const customerId2 = randomUUID()
  await withSystemContext(async (tx) => {
    await tx.insert(customers).values({
      id: customerId2,
      agencyId,
      firstName: "Client",
      lastName: "Riche",
      email: `riche-${resId.slice(0, 6)}@example.com`,
    })
    await tx.insert(reservations).values({
      id: resId,
      agencyId,
      customerId: customerId2,
      module: "package",
      source: "internal",
      status: "confirmed",
      originalCurrency: "TND",
      originalAmount: "2000.00",
      tndAmount: "2000.00",
      publicRef: `REF-${resId.slice(0, 6)}`,
    })
    await tx.insert(leads).values({
      id: leadId,
      agencyId,
      firstName: "Riche",
      email: "riche@example.com",
      productType: "package",
      sourcePage: "/packages",
      acquisitionChannel: "b2b",
      reservationId: resId,
      status: "converted",
    })
    await tx.insert(reservationFinancials).values({
      reservationId: resId,
      supplierPrice: "1800.00",
      supplierCurrency: "TND",
      supplierPriceTnd: "1800.00",
      salePrice: "2000.00",
      saleCurrency: "TND",
      salePriceTnd: "2000.00",
      marginAmount: "200.00",
      marginPercent: "11.11",
      commissionAmount: "20.00",
      commissionPercent: "10.00",
    })
  })

  const rows = await withTenantContext(ctx(), (tx) =>
    getLeadFunnelValueCore(tx, { agencyId }),
  )
  const b2b = rows.find((r) => r.acquisitionChannel === "b2b")
  assert.ok(b2b, "ligne b2b attendue")
  assert.equal(b2b.convertedLeads, 1)
  assert.equal(b2b.totalSaleTnd, 2000)
  assert.equal(b2b.totalMarginTnd, 200)
  assert.equal(b2b.totalCommissionTnd, 20)
})

test("getLeadFunnelValueCore : filtre acquisitionChannel isole le bon canal", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())

  const rows = await withTenantContext(ctx(), (tx) =>
    getLeadFunnelValueCore(tx, { agencyId, acquisitionChannel: "b2b" }),
  )
  assert.ok(
    rows.every((r) => r.acquisitionChannel === "b2b"),
    "toutes les lignes doivent être b2b",
  )
})

test("aggregateFunnelRows sur résultat getLeadFunnelValueCore : conversionRate cohérent", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())

  const rows = await withTenantContext(ctx(), (tx) =>
    getLeadFunnelValueCore(tx, { agencyId }),
  )
  const agg = aggregateFunnelRows(rows)
  assert.ok(agg.conversionRate >= 0 && agg.conversionRate <= 100)
  if (agg.totalLeads > 0) {
    assert.ok(agg.convertedLeads <= agg.totalLeads)
  }
})
