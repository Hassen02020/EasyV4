/**
 * REVENUE-CONSOLIDATE-01 — preuve live contre un Postgres réel pour
 * `getMarginKPIsCore` (lib/reporting/margin-analytics-core.ts), le module
 * canonique de KPIs marge/revenu identifié par l'audit CRM du 2026-10-07
 * comme n'ayant AUCUN test. Vérifie que `totalRevenue`/`totalCost`/
 * `totalMargin`/`totalCommission`/`totalReservations` sont des sommes
 * RÉELLES lues depuis `reservationFinancials` (via `recordReservationFinancials`,
 * jamais un second calcul inventé par ce test) pour des réservations
 * "confirmed" dans la période, et que les réservations hors période/hors
 * statut ne polluent jamais le total. Même convention que les autres
 * tests live de ce dépôt : se dégrade en `skip` sans DATABASE_URL/Postgres
 * local disponible.
 */
import test, { before, after } from "node:test"
import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { eq, sql } from "drizzle-orm"
import { withSystemContext } from "@/lib/db/tenant-context"
import { agencies, customers, reservations } from "@/lib/db/schema"
import { reservationFinancials } from "@/lib/db/schema/financials"
import { recordReservationFinancials } from "@/lib/finance/reservation-financials"
import { getMarginKPIsCore } from "../margin-analytics-core"

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
  await withSystemContext((tx) =>
    tx.insert(agencies).values({
      id: agencyA,
      name: "MARGIN-ANALYTICS Agency A",
      agencyType: "ota",
      slug: `margin-analytics-a-${agencyA.slice(0, 8)}`,
    }),
  )
})

after(async () => {
  if (!dbAvailable) return
  await withSystemContext(async (tx) => {
    await tx
      .delete(reservationFinancials)
      .where(
        sql`${reservationFinancials.reservationId} in (select id from ${reservations} where agency_id = ${agencyA})`,
      )
    await tx.delete(reservations).where(eq(reservations.agencyId, agencyA))
    await tx.delete(customers).where(eq(customers.agencyId, agencyA))
    await tx.delete(agencies).where(eq(agencies.id, agencyA))
  })
})

async function makeReservation(params: {
  status: "confirmed" | "pending" | "cancelled"
  createdAt: Date
}) {
  const [customer] = await withSystemContext((tx) =>
    tx
      .insert(customers)
      .values({
        agencyId: agencyA,
        firstName: "Test",
        lastName: "Client",
        email: `margin-${randomUUID().slice(0, 8)}@example.com`,
      })
      .returning({ id: customers.id }),
  )
  const [reservation] = await withSystemContext((tx) =>
    tx
      .insert(reservations)
      .values({
        agencyId: agencyA,
        publicRef: `MARGIN-${randomUUID().slice(0, 8)}`,
        customerId: customer!.id,
        module: "hotel",
        source: "internal",
        status: params.status,
        originalCurrency: "TND",
        originalAmount: "100.00",
        tndAmount: "100.00",
        createdAt: params.createdAt,
      })
      .returning({ id: reservations.id }),
  )
  return reservation!.id
}

test("PREUVE CENTRALE — totalRevenue/totalCost/totalMargin/totalCommission/totalReservations somment UNIQUEMENT les réservations confirmed, dans la période", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())

  const now = new Date()
  const periodStart = new Date(now.getTime() - 7 * 86_400_000)
  const periodEnd = new Date(now.getTime() + 86_400_000)

  // 2 réservations confirmed, DANS la période → doivent compter.
  const r1 = await makeReservation({ status: "confirmed", createdAt: now })
  await withSystemContext((tx) =>
    recordReservationFinancials({
      tx,
      reservationId: r1,
      supplierPriceTnd: 80,
      salePriceTnd: 100,
      commissionPercent: 10,
    }),
  )

  const r2 = await makeReservation({ status: "confirmed", createdAt: now })
  await withSystemContext((tx) =>
    recordReservationFinancials({
      tx,
      reservationId: r2,
      supplierPriceTnd: 40,
      salePriceTnd: 60,
      commissionPercent: 10,
    }),
  )

  // Réservation "pending" DANS la période → ne doit JAMAIS compter (pas confirmed).
  const r3 = await makeReservation({ status: "pending", createdAt: now })
  await withSystemContext((tx) =>
    recordReservationFinancials({
      tx,
      reservationId: r3,
      supplierPriceTnd: 1000,
      salePriceTnd: 2000,
      commissionPercent: 10,
    }),
  )

  // Réservation confirmed HORS période → ne doit JAMAIS compter.
  const r4 = await makeReservation({
    status: "confirmed",
    createdAt: new Date(now.getTime() - 30 * 86_400_000),
  })
  await withSystemContext((tx) =>
    recordReservationFinancials({
      tx,
      reservationId: r4,
      supplierPriceTnd: 500,
      salePriceTnd: 900,
      commissionPercent: 10,
    }),
  )

  const kpis = await getMarginKPIsCore(agencyA, periodStart, periodEnd)

  // Seules r1 (coût 80, vente 100, marge 20, commission 2) et r2 (coût 40,
  // vente 60, marge 20, commission 2) doivent être comptées.
  assert.equal(kpis.totalReservations, 2)
  assert.equal(kpis.totalRevenueTnd, 160)
  assert.equal(kpis.totalCostTnd, 120)
  assert.equal(kpis.totalMarginTnd, 40)
  assert.equal(kpis.totalCommission, 4)
})
