/**
 * SUPPLIER-STATUS-CHECK-01 — consultation en lecture seule de l'état d'une
 * réservation chez myGo (super_admin). PostgreSQL réel (rôle app_runtime) +
 * faux client myGo qui enregistre chaque appel.
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
  checkSupplierBookingStatusCore,
  SUPPLIER_STATUS_AUDIT_ACTION,
  type SupplierStatusClient,
} from "../supplier-status-core"

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

/** Identifiants factices : ne doivent JAMAIS apparaître dans une réponse ou une trace. */
const FAKE_SECRET = "S3CRET-PASSWORD-MYGO-XYZ"

type Item = Awaited<ReturnType<SupplierStatusClient["listBookings"]>>[number]

function fakeClient(behaviour: Item[] | Error) {
  const calls: { method: string; args: unknown }[] = []
  const client = {
    credentials: { login: "agence", password: FAKE_SECRET },
    async listBookings(filters: { booking: number }) {
      calls.push({ method: "listBookings", args: filters })
      if (behaviour instanceof Error) throw behaviour
      return behaviour
    },
    async createBooking() {
      calls.push({ method: "createBooking", args: null })
      throw new Error("interdit")
    },
    async cancelBooking() {
      calls.push({ method: "cancelBooking", args: null })
      throw new Error("interdit")
    },
  }
  return { client, calls }
}

async function seed(opts: { module?: string; ref?: string | null } = {}) {
  const s = randomUUID().slice(0, 8)
  return withSystemContext(async (tx) => {
    const [agency] = await tx
      .insert(agencies)
      .values({ name: `SSC ${s}`, agencyType: "ota", slug: `ssc-${s}` })
      .returning({ id: agencies.id })
    const [customer] = await tx
      .insert(customers)
      .values({ agencyId: agency!.id, firstName: "SSC", lastName: s })
      .returning({ id: customers.id })
    const [res] = await tx
      .insert(reservations)
      .values({
        agencyId: agency!.id,
        publicRef: `SSC-${s}`,
        customerId: customer!.id,
        module: (opts.module ?? "hotel") as "hotel",
        source: "internal",
        status: "expired",
        originalCurrency: "TND",
        originalAmount: "659.74",
        tndAmount: "659.74",
      })
      .returning({ id: reservations.id, publicRef: reservations.publicRef })
    if ((opts.module ?? "hotel") === "hotel") {
      await tx.insert(reservationHotel).values({
        reservationId: res!.id,
        agencyId: agency!.id,
        providerBookingId: opts.ref === undefined ? "500057" : opts.ref,
        hotelId: 371,
        hotelName: "Djerba Saray",
        checkIn: "2026-10-01",
        checkOut: "2026-10-03",
        nights: 2,
        adults: 2,
      })
    }
    return {
      agencyId: agency!.id,
      reservationId: res!.id,
      publicRef: res!.publicRef,
    }
  })
}

const superAdmin = { userId: randomUUID(), role: "super_admin" }

async function audits(reservationId: string) {
  return withSystemContext((tx) =>
    tx
      .select()
      .from(auditEvents)
      .where(
        and(
          eq(auditEvents.entityId, reservationId),
          eq(auditEvents.action, SUPPLIER_STATUS_AUDIT_ACTION),
        ),
      ),
  )
}

test("code d'audit compatible varchar(32)", () => {
  assert.ok(SUPPLIER_STATUS_AUDIT_ACTION.length <= 32)
})

test("live : super_admin, réservation annulée chez myGo → état, date et frais ; un seul appel BookingList filtré, compte de l'agence", async (t) => {
  if (!dbAvailable) return void t.skip(skip)
  const f = await seed()
  const { client, calls } = fakeClient([
    {
      Id: 500057,
      State: "Cancelled",
      Created: "2026-09-20 18:08:00",
      Validated: "2026-09-20 18:08:01",
      Cancelled: "2026-09-21 18:10:00",
      TotalPrice: "590.00",
      Fee: "0.00",
      Currency: "TND",
      CheckIn: "2026-10-01",
      CheckOut: "2026-10-03",
      Hotel: { Id: 371, Name: "Djerba Saray" },
    },
  ])
  const resolved: { agencyId: string; userId: string }[] = []
  const r = await checkSupplierBookingStatusCore({
    reservationId: f.reservationId,
    actor: superAdmin,
    resolveClient: async (agencyId, userId) => {
      resolved.push({ agencyId, userId })
      return client
    },
  })
  assert.deepEqual(resolved, [
    { agencyId: f.agencyId, userId: superAdmin.userId },
  ])
  assert.deepEqual(calls, [
    { method: "listBookings", args: { booking: 500057 } },
  ])
  assert.ok(r.ok && r.found)
  if (r.ok && r.found) {
    assert.equal(r.status.state, "Cancelled")
    assert.equal(r.status.cancelledAt, "2026-09-21 18:10:00")
    assert.equal(r.status.fee, "0.00")
    assert.equal(r.status.supplierBookingRef, "500057")
  }
  const rows = await audits(f.reservationId)
  assert.equal(rows.length, 1)
  assert.equal(rows[0]!.actorUserId, superAdmin.userId)
  const diff = rows[0]!.diff as Record<string, unknown>
  assert.equal(diff.outcome, "found")
  assert.equal(diff.state, "Cancelled")
  // Aucun identifiant fournisseur, ni dans la réponse ni dans la trace.
  assert.doesNotMatch(JSON.stringify(r), new RegExp(FAKE_SECRET))
  assert.doesNotMatch(JSON.stringify(rows), new RegExp(FAKE_SECRET))
  // Réservation inchangée.
  const [after] = await withSystemContext((tx) =>
    tx
      .select({ status: reservations.status })
      .from(reservations)
      .where(eq(reservations.id, f.reservationId)),
  )
  assert.equal(after!.status, "expired")
})

test("live : réservation confirmée chez myGo (Validated, non annulée)", async (t) => {
  if (!dbAvailable) return void t.skip(skip)
  const f = await seed()
  const { client } = fakeClient([
    { Id: 500057, State: "Validated", Cancelled: null, Fee: null },
  ])
  const r = await checkSupplierBookingStatusCore({
    reservationId: f.reservationId,
    actor: superAdmin,
    resolveClient: async () => client,
  })
  assert.ok(r.ok && r.found)
  if (r.ok && r.found) {
    assert.equal(r.status.state, "Validated")
    assert.equal(r.status.cancelledAt, null)
  }
})

test("live : réservation absente chez myGo → found:false, jamais un état inventé", async (t) => {
  if (!dbAvailable) return void t.skip(skip)
  const f = await seed()
  // BookingList renvoie une AUTRE réservation : ne doit pas être prise pour la nôtre.
  const { client } = fakeClient([{ Id: 499999, State: "Validated" }])
  const r = await checkSupplierBookingStatusCore({
    reservationId: f.reservationId,
    actor: superAdmin,
    resolveClient: async () => client,
  })
  assert.deepEqual(r, {
    ok: true,
    found: false,
    publicRef: f.publicRef,
    supplierBookingRef: "500057",
  })
  const rows = await audits(f.reservationId)
  assert.equal(
    (rows[0]!.diff as Record<string, unknown>).outcome,
    "not_found_at_supplier",
  )
})

test("live : fournisseur injoignable → message clair avec un code, aucune donnée, aucun secret", async (t) => {
  if (!dbAvailable) return void t.skip(skip)
  const f = await seed()
  const err = Object.assign(new Error(`échec login password=${FAKE_SECRET}`), {
    code: "timeout",
  })
  const { client } = fakeClient(err)
  const r = await checkSupplierBookingStatusCore({
    reservationId: f.reservationId,
    actor: superAdmin,
    resolveClient: async () => client,
  })
  assert.equal(r.ok, false)
  if (!r.ok) {
    assert.equal(r.code, "SUPPLIER_UNREACHABLE")
    assert.match(r.error, /code timeout/)
  }
  assert.doesNotMatch(JSON.stringify(r), new RegExp(FAKE_SECRET))
  const rows = await audits(f.reservationId)
  assert.doesNotMatch(JSON.stringify(rows), new RegExp(FAKE_SECRET))
  assert.equal(
    (rows[0]!.diff as Record<string, unknown>).outcome,
    "supplier_unreachable",
  )
})

test("live : tout autre rôle → refus, aucun appel fournisseur, aucune lecture", async (t) => {
  if (!dbAvailable) return void t.skip(skip)
  const f = await seed()
  for (const role of [
    "manager",
    "agent_resa",
    "agent_compta",
    "agent_excursions",
    "partner_admin",
    "",
  ]) {
    const { client, calls } = fakeClient([{ Id: 500057, State: "Validated" }])
    let resolved = false
    const r = await checkSupplierBookingStatusCore({
      reservationId: f.reservationId,
      actor: { userId: randomUUID(), role },
      resolveClient: async () => {
        resolved = true
        return client
      },
    })
    assert.deepEqual(r, {
      ok: false,
      code: "FORBIDDEN",
      error: "Réservé au super_admin.",
    })
    assert.equal(calls.length, 0, role)
    assert.equal(resolved, false, role)
  }
  assert.equal((await audits(f.reservationId)).length, 0)
})

test("live : réservation non hôtel, sans référence myGo, ou inexistante → refus propre, aucun appel", async (t) => {
  if (!dbAvailable) return void t.skip(skip)
  const cases = [
    {
      id: (await seed({ module: "omra" })).reservationId,
      code: "NOT_APPLICABLE",
    },
    { id: (await seed({ ref: null })).reservationId, code: "NOT_APPLICABLE" },
    {
      id: (await seed({ ref: "ABC-12" })).reservationId,
      code: "NOT_APPLICABLE",
    },
    { id: randomUUID(), code: "NOT_FOUND" },
    { id: "pas-un-uuid", code: "NOT_FOUND" },
  ]
  for (const c of cases) {
    const { client, calls } = fakeClient([])
    const r = await checkSupplierBookingStatusCore({
      reservationId: c.id,
      actor: superAdmin,
      resolveClient: async () => client,
    })
    assert.equal(r.ok, false)
    if (!r.ok) assert.equal(r.code, c.code, c.id)
    assert.equal(calls.length, 0)
  }
})

test("lecture seule : le cœur n'appelle jamais création ni annulation, et l'action serveur contrôle la session", () => {
  const core = readFileSync("lib/admin/supplier-status-core.ts", "utf8")
  const code = core.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "")
  assert.doesNotMatch(
    code,
    /createBooking|cancelBooking|BookingCreation|BookingCancellation/,
  )
  assert.match(code, /input\.actor\.role !== "super_admin"/)
  assert.doesNotMatch(code, /\.update\(|\.delete\(/)
  const action = readFileSync("lib/admin/supplier-status-actions.ts", "utf8")
  assert.match(action, /^"use server"/)
  assert.match(action, /supabase\.auth\.getUser\(\)/)
  assert.match(action, /getCurrentAdminProfile\(user\.id\)/)
  // La référence myGo n'est jamais un paramètre venant du navigateur.
  assert.match(
    action,
    /checkSupplierBookingStatus\(\s*reservationId: string,?\s*\)/,
  )
  const page = readFileSync(
    "app/(internal)/admin/reservations/[id]/page.tsx",
    "utf8",
  )
  assert.match(page, /isSuperAdmin &&\s*detail\.module === "hotel"/)
  assert.match(page, /<SupplierStatusButton reservationId=\{detail\.id\} \/>/)
})
