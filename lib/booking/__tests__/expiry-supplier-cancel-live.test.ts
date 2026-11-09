/**
 * EXPIRY-SUPPLIER-CANCEL-01 — à l'expiration d'une réservation hôtel faute
 * de paiement, la réservation myGo est annulée ; un échec est tracé
 * durablement et ne revient jamais sur l'expiration.
 * PostgreSQL réel (rôle app_runtime) + faux client myGo.
 */
import test, { before } from "node:test"
import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { readFileSync } from "node:fs"
import { and, eq, sql } from "drizzle-orm"
import { withSystemContext } from "@/lib/db/tenant-context"
import {
  agencies,
  auditEvents,
  customers,
  reservationHotel,
  reservations,
} from "@/lib/db/schema"
import {
  cancelSupplierBookingsForExpired,
  EXPIRY_CANCEL_AUDIT_ACTION,
} from "../expiry-supplier-cancel"

let dbAvailable = false
before(async () => {
  try {
    await withSystemContext((tx) => tx.execute(sql`select 1`))
    dbAvailable = true
  } catch {
    dbAvailable = false
  }
})
const skip = "Postgres local indisponible."

function fakeClient(fail = false) {
  const calls: number[] = []
  return {
    calls,
    client: {
      async cancelBooking({ bookingId }: { bookingId: number }) {
        calls.push(bookingId)
        if (fail) throw new Error("myGo injoignable")
        return { bookingId, fee: 0, currency: "TND" }
      },
    },
  }
}

async function seed(opts: {
  status?: "expired" | "pending" | "confirmed" | "cancelled"
  module?: "hotel" | "omra"
  ref?: string | null
}) {
  const s = randomUUID().slice(0, 8)
  return withSystemContext(async (tx) => {
    const [agency] = await tx
      .insert(agencies)
      .values({ name: `ESC ${s}`, agencyType: "ota", slug: `esc-${s}` })
      .returning({ id: agencies.id })
    const [customer] = await tx
      .insert(customers)
      .values({ agencyId: agency!.id, firstName: "ESC", lastName: s })
      .returning({ id: customers.id })
    const [res] = await tx
      .insert(reservations)
      .values({
        agencyId: agency!.id,
        publicRef: `ESC-${s}`,
        customerId: customer!.id,
        module: opts.module ?? "hotel",
        source: "internal",
        status: opts.status ?? "expired",
        originalCurrency: "TND",
        originalAmount: "659.74",
        tndAmount: "659.74",
      })
      .returning({ id: reservations.id })
    await tx.insert(reservationHotel).values({
      reservationId: res!.id,
      agencyId: agency!.id,
      providerBookingId: opts.ref === undefined ? "500057" : opts.ref,
      hotelId: 371,
      hotelName: "Djerba Saray",
      checkIn: "2026-12-20",
      checkOut: "2026-12-22",
      nights: 2,
      adults: 2,
    })
    return { agencyId: agency!.id, id: res!.id }
  })
}

async function auditsFor(reservationOrRef: string, action: string) {
  return withSystemContext((tx) =>
    tx
      .select()
      .from(auditEvents)
      .where(
        and(
          eq(auditEvents.entityId, reservationOrRef),
          eq(auditEvents.action, action),
        ),
      ),
  )
}

async function statusOf(id: string) {
  const [r] = await withSystemContext((tx) =>
    tx
      .select({ status: reservations.status })
      .from(reservations)
      .where(eq(reservations.id, id)),
  )
  return r!.status
}

test("code d'audit compatible varchar(32)", () => {
  assert.ok(EXPIRY_CANCEL_AUDIT_ACTION.length <= 32)
})

test("live : réservation hôtel expirée avec référence myGo → annulation chez myGo avec le compte de son agence, trace de succès", async (t) => {
  if (!dbAvailable) return void t.skip(skip)
  const f = await seed({})
  const { client, calls } = fakeClient()
  const agencies: string[] = []
  const r = await cancelSupplierBookingsForExpired([f.id], async (agencyId) => {
    agencies.push(agencyId)
    return client
  })
  assert.deepEqual(r, { attempted: 1, cancelled: 1, failed: 0 })
  assert.deepEqual(calls, [500057])
  assert.deepEqual(agencies, [f.agencyId])
  const rows = await auditsFor(f.id, EXPIRY_CANCEL_AUDIT_ACTION)
  assert.equal(rows.length, 1)
  assert.equal(
    (rows[0]!.diff as Record<string, unknown>).supplierBookingRef,
    "500057",
  )
  assert.equal(await statusOf(f.id), "expired")
})

test("live : échec de l'annulation myGo → trace supplier.compensation_failed, la réservation reste expirée", async (t) => {
  if (!dbAvailable) return void t.skip(skip)
  const ref = String(600000 + Math.floor(Math.random() * 99999))
  const f = await seed({ ref })
  const { client, calls } = fakeClient(true)
  const r = await cancelSupplierBookingsForExpired([f.id], async () => client)
  assert.deepEqual(r, { attempted: 1, cancelled: 0, failed: 1 })
  assert.deepEqual(calls, [Number(ref)])
  const incidents = await auditsFor(ref, "supplier.compensation_failed")
  assert.equal(incidents.length, 1)
  const diff = incidents[0]!.diff as Record<string, unknown>
  assert.equal(diff.flow, "hotel_expiry")
  assert.equal(diff.step, "payment_expired")
  assert.equal(diff.error, "myGo injoignable")
  assert.equal((await auditsFor(f.id, EXPIRY_CANCEL_AUDIT_ACTION)).length, 0)
  assert.equal(await statusOf(f.id), "expired")
})

test("live : réservation payée, en attente ou annulée → aucun appel myGo, même si son identifiant est fourni", async (t) => {
  if (!dbAvailable) return void t.skip(skip)
  const ids = [
    (await seed({ status: "confirmed" })).id,
    (await seed({ status: "pending" })).id,
    (await seed({ status: "cancelled" })).id,
  ]
  const { client, calls } = fakeClient()
  const r = await cancelSupplierBookingsForExpired(ids, async () => client)
  assert.deepEqual(r, { attempted: 0, cancelled: 0, failed: 0 })
  assert.equal(calls.length, 0)
})

test("live : sans référence myGo, référence non numérique ou module non hôtel → aucun appel", async (t) => {
  if (!dbAvailable) return void t.skip(skip)
  const ids = [
    (await seed({ ref: null })).id,
    (await seed({ ref: "ABC-1" })).id,
    (await seed({ module: "omra" })).id,
  ]
  const { client, calls } = fakeClient()
  const r = await cancelSupplierBookingsForExpired(ids, async () => client)
  assert.equal(r.attempted, 0)
  assert.equal(calls.length, 0)
})

test("live : plusieurs réservations — l'échec de l'une n'empêche pas l'annulation des autres", async (t) => {
  if (!dbAvailable) return void t.skip(skip)
  const a = await seed({ ref: "700001" })
  const b = await seed({ ref: "700002" })
  const calls: number[] = []
  const r = await cancelSupplierBookingsForExpired([a.id, b.id], async () => ({
    async cancelBooking({ bookingId }: { bookingId: number }) {
      calls.push(bookingId)
      if (bookingId === 700001) throw new Error("refus")
      return { bookingId, fee: 0, currency: "TND" }
    },
  }))
  assert.deepEqual(r, { attempted: 2, cancelled: 1, failed: 1 })
  assert.deepEqual(calls.sort(), [700001, 700002])
})

test("liste vide → aucun accès base ni fournisseur", async () => {
  let resolved = false
  const r = await cancelSupplierBookingsForExpired([], async () => {
    resolved = true
    throw new Error("ne doit pas être appelé")
  })
  assert.deepEqual(r, { attempted: 0, cancelled: 0, failed: 0 })
  assert.equal(resolved, false)
})

test("câblage du cron : annulation APRÈS l'expiration validée, uniquement sur les lignes qui viennent d'expirer, compte du parcours invité", () => {
  const src = readFileSync(
    "app/api/cron/expire-pending-payments/route.ts",
    "utf8",
  )
  const txEnd = src.indexOf("return { expired: expiredRows, paymentsFailed")
  const call = src.indexOf("await cancelSupplierBookingsForExpired(")
  assert.ok(
    txEnd > 0 && call > txEnd,
    "appel après la transaction d'expiration",
  )
  assert.match(
    src,
    /cancelSupplierBookingsForExpired\(\s*expired\.map\(\(r\) => r\.id\)/,
  )
  assert.match(
    src,
    /resolveMyGoAccessForTenant\(\{\s*agencyId,\s*userId: "",\s*isSuperAdmin: true,\s*\}\)/,
  )
  // Le cron n'expire toujours que les lignes pending dont l'échéance est passée.
  assert.match(src, /eq\(reservations\.status, "pending"\)/)
  assert.match(src, /lt\(reservations\.paymentExpiresAt, new Date\(\)\)/)
})
