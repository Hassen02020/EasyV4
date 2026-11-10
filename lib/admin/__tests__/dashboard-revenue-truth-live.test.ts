/**
 * DASHBOARD-REVENUE-TRUTH-01 — les montants du tableau de bord ne comptent
 * jamais une réservation annulée, expirée ou jamais payée.
 * PostgreSQL réel, contexte agence (RLS) comme la page /admin.
 */
import test, { before } from "node:test"
import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { sql } from "drizzle-orm"
import { withSystemContext } from "@/lib/db/tenant-context"
import { agencies, customers, payments, reservations } from "@/lib/db/schema"
import { loadDashboardData } from "../dashboard-data"

let dbAvailable = false
before(async () => {
  try {
    await withSystemContext((tx) => tx.execute(sql`select 1`))
    dbAvailable = true
  } catch {
    dbAvailable = false
  }
})

type Status = "pending" | "confirmed" | "completed" | "cancelled" | "expired"

async function seedAgency() {
  const s = randomUUID().slice(0, 8)
  return withSystemContext(async (tx) => {
    const [agency] = await tx
      .insert(agencies)
      .values({ name: `DRT ${s}`, agencyType: "ota", slug: `drt-${s}` })
      .returning({ id: agencies.id })
    const [customer] = await tx
      .insert(customers)
      .values({ agencyId: agency!.id, firstName: "DRT", lastName: s })
      .returning({ id: customers.id })
    return { agencyId: agency!.id, customerId: customer!.id }
  })
}

async function reservation(
  f: { agencyId: string; customerId: string },
  status: Status,
  amount: number,
  createdAt = new Date(),
) {
  const [r] = await withSystemContext((tx) =>
    tx
      .insert(reservations)
      .values({
        agencyId: f.agencyId,
        publicRef: `DRT-${randomUUID().slice(0, 8)}`,
        customerId: f.customerId,
        module: "hotel",
        source: "internal",
        status,
        originalCurrency: "TND",
        originalAmount: amount.toFixed(2),
        tndAmount: amount.toFixed(2),
        createdAt,
      })
      .returning({ id: reservations.id }),
  )
  return r!.id
}

async function payment(
  f: { agencyId: string },
  reservationId: string,
  opts: {
    status: "pending" | "captured" | "partial_refund" | "failed" | "refunded"
    amount: number
    refunded?: number
    capturedAt?: Date | null
  },
) {
  await withSystemContext((tx) =>
    tx.insert(payments).values({
      agencyId: f.agencyId,
      reservationId,
      psp: "manual",
      method: "cash",
      originalCurrency: "TND",
      originalAmount: opts.amount.toFixed(2),
      tndAmount: opts.amount.toFixed(2),
      status: opts.status,
      refundedAmount: (opts.refunded ?? 0).toFixed(2),
      capturedAt: opts.capturedAt === undefined ? new Date() : opts.capturedAt,
    }),
  )
}

test("live : réservations annulées, expirées et en attente exclues ; confirmées et terminées comptées", async (t) => {
  if (!dbAvailable) return void t.skip("Postgres local indisponible.")
  const f = await seedAgency()
  await reservation(f, "cancelled", 100)
  await reservation(f, "expired", 200)
  await reservation(f, "pending", 300)
  await reservation(f, "confirmed", 400)
  await reservation(f, "completed", 500)
  // Confirmée mais créée le mois précédent : hors du mois.
  const lastMonth = new Date()
  lastMonth.setUTCDate(1)
  lastMonth.setUTCDate(0)
  await reservation(f, "confirmed", 700, lastMonth)

  const data = await loadDashboardData(f.agencyId)
  assert.equal(data.available, true)
  assert.equal(data.stats.monthlyConfirmedSalesTnd, 900)
  assert.equal(data.stats.monthlyCollectedTnd, 0, "aucun paiement reçu")
})

test("live : encaissé du mois = paiements reçus nets des remboursements, jamais un paiement en attente, échoué ou d'un autre mois", async (t) => {
  if (!dbAvailable) return void t.skip("Postgres local indisponible.")
  const f = await seedAgency()
  const r = await reservation(f, "confirmed", 1000)
  await payment(f, r, { status: "captured", amount: 250, refunded: 50 })
  await payment(f, r, {
    status: "partial_refund",
    amount: 100,
    refunded: 30,
  })
  await payment(f, r, { status: "pending", amount: 999, capturedAt: null })
  await payment(f, r, { status: "failed", amount: 888, capturedAt: null })
  // Défensif : même avec une date d'encaissement, un paiement échoué ou en
  // attente n'est jamais compté.
  await payment(f, r, { status: "failed", amount: 444, capturedAt: new Date() })
  await payment(f, r, {
    status: "pending",
    amount: 333,
    capturedAt: new Date(),
  })
  await payment(f, r, { status: "refunded", amount: 77, refunded: 77 })
  const lastMonth = new Date()
  lastMonth.setUTCDate(1)
  lastMonth.setUTCDate(0)
  await payment(f, r, {
    status: "captured",
    amount: 555,
    capturedAt: lastMonth,
  })

  const data = await loadDashboardData(f.agencyId)
  assert.equal(data.stats.monthlyCollectedTnd, 270) // (250-50) + (100-30)
  assert.equal(data.stats.monthlyConfirmedSalesTnd, 1000)
})

test("live : les montants d'une autre agence ne sont jamais comptés", async (t) => {
  if (!dbAvailable) return void t.skip("Postgres local indisponible.")
  const a = await seedAgency()
  const b = await seedAgency()
  const rb = await reservation(b, "confirmed", 600)
  await payment(b, rb, { status: "captured", amount: 600 })
  const data = await loadDashboardData(a.agencyId)
  assert.equal(data.stats.monthlyConfirmedSalesTnd, 0)
  assert.equal(data.stats.monthlyCollectedTnd, 0)
})
