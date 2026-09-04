/**
 * CRM / Leads — preuve live contre un Postgres réel (RLS incluse via
 * withTenantContext), même convention que
 * lib/favorites/__tests__/favorites-core.test.ts : se dégrade en `skip`
 * sans DATABASE_URL/Postgres local disponible.
 */
import test, { before, after } from "node:test"
import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { eq, sql } from "drizzle-orm"
import { withTenantContext, withSystemContext, type TenantContext } from "@/lib/db/tenant-context"
import type { DrizzleTransaction } from "@/lib/db/client"
import { agencies, customers, leads, reservations } from "@/lib/db/schema"
import {
  createLeadCore,
  listLeadsCore,
  updateLeadStatusCore,
  convertLeadCore,
  searchReservationsForLeadLinkCore,
} from "../leads-core"

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
let agencyB = ""
let reservationA1 = ""
let reservationA2 = ""
let reservationB1 = ""

async function makeReservation(tx: DrizzleTransaction, agencyId: string, publicRef: string) {
  const customerId = randomUUID()
  await tx.insert(customers).values({
    id: customerId,
    agencyId,
    firstName: "Client",
    lastName: "Test",
    email: `${publicRef.toLowerCase()}@example.com`,
    phone: "+21620000001",
  })
  const reservationId = randomUUID()
  await tx.insert(reservations).values({
    id: reservationId,
    agencyId,
    customerId,
    publicRef,
    module: "package",
    source: "internal",
    status: "confirmed",
    originalCurrency: "TND",
    originalAmount: "500.00",
    tndAmount: "500.00",
  })
  return reservationId
}

before(async () => {
  dbAvailable = await isDbAvailable()
  if (!dbAvailable) return

  agencyA = randomUUID()
  agencyB = randomUUID()

  await withSystemContext(async (tx) => {
    await tx.insert(agencies).values([
      { id: agencyA, name: "LEADS Agency A", agencyType: "ota", slug: `leads-a-${agencyA.slice(0, 8)}` },
      { id: agencyB, name: "LEADS Agency B", agencyType: "ota", slug: `leads-b-${agencyB.slice(0, 8)}` },
    ])
    reservationA1 = await makeReservation(tx, agencyA, "TG-TEST-A1")
    reservationA2 = await makeReservation(tx, agencyA, "TG-TEST-A2")
    reservationB1 = await makeReservation(tx, agencyB, "TG-TEST-B1")
  })
})

after(async () => {
  if (!dbAvailable) return
  await withSystemContext(async (tx) => {
    await tx.delete(leads).where(eq(leads.agencyId, agencyA))
    await tx.delete(leads).where(eq(leads.agencyId, agencyB))
    await tx.delete(reservations).where(eq(reservations.agencyId, agencyA))
    await tx.delete(reservations).where(eq(reservations.agencyId, agencyB))
    await tx.delete(customers).where(eq(customers.agencyId, agencyA))
    await tx.delete(customers).where(eq(customers.agencyId, agencyB))
    await tx.delete(agencies).where(eq(agencies.id, agencyA))
    await tx.delete(agencies).where(eq(agencies.id, agencyB))
  })
})

test("createLeadCore + listLeadsCore : le lead créé apparaît, isolé par agence", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  const ctxA: TenantContext = { agencyId: agencyA, userId: "", isSuperAdmin: true }
  const ctxB: TenantContext = { agencyId: agencyB, userId: "", isSuperAdmin: true }

  await withTenantContext(ctxA, (tx) =>
    createLeadCore(tx, {
      agencyId: agencyA,
      firstName: "Amine",
      email: "amine@example.com",
      productType: "package",
      productRef: "pkg-1",
      productLabel: "Voyage Istanbul",
      sourcePage: "/packages/istanbul",
    }),
  )

  const listedA = await withTenantContext(ctxA, (tx) => listLeadsCore(tx, { agencyId: agencyA }))
  const listedB = await withTenantContext(ctxB, (tx) => listLeadsCore(tx, { agencyId: agencyB }))

  assert.equal(listedA.length, 1)
  assert.equal(listedA[0]!.firstName, "Amine")
  assert.equal(listedA[0]!.status, "new")
  assert.equal(listedB.length, 0)
})

test("listLeadsCore : filtre par statut", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  const ctx: TenantContext = { agencyId: agencyA, userId: "", isSuperAdmin: true }

  await withTenantContext(ctx, (tx) =>
    createLeadCore(tx, {
      agencyId: agencyA,
      firstName: "Sara",
      phone: "+21620000000",
      productType: "general",
      sourcePage: "/",
    }),
  )

  const allLeads = await withTenantContext(ctx, (tx) => listLeadsCore(tx, { agencyId: agencyA }))
  const target = allLeads.find((l) => l.firstName === "Sara")!

  await withTenantContext(ctx, (tx) =>
    updateLeadStatusCore(tx, {
      agencyId: agencyA,
      id: target.id,
      status: "contacted",
      handledByUserId: randomUUID(),
    }),
  )

  const contactedOnly = await withTenantContext(ctx, (tx) =>
    listLeadsCore(tx, { agencyId: agencyA, status: "contacted" }),
  )
  assert.ok(contactedOnly.some((l) => l.id === target.id))

  const newOnly = await withTenantContext(ctx, (tx) => listLeadsCore(tx, { agencyId: agencyA, status: "new" }))
  assert.ok(!newOnly.some((l) => l.id === target.id))
})

test("updateLeadStatusCore : n'affecte jamais un lead d'une autre agence", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  const ctxA: TenantContext = { agencyId: agencyA, userId: "", isSuperAdmin: true }
  const ctxB: TenantContext = { agencyId: agencyB, userId: "", isSuperAdmin: true }

  await withTenantContext(ctxA, (tx) =>
    createLeadCore(tx, {
      agencyId: agencyA,
      firstName: "Yassine",
      email: "yassine@example.com",
      productType: "general",
      sourcePage: "/",
    }),
  )
  const listedA = await withTenantContext(ctxA, (tx) => listLeadsCore(tx, { agencyId: agencyA }))
  const leadId = listedA.find((l) => l.firstName === "Yassine")!.id

  const attempt = await withTenantContext(ctxB, (tx) =>
    updateLeadStatusCore(tx, {
      agencyId: agencyB,
      id: leadId,
      status: "closed",
      handledByUserId: randomUUID(),
    }),
  )
  assert.equal(attempt.updated, false)

  const stillNew = await withTenantContext(ctxA, (tx) => listLeadsCore(tx, { agencyId: agencyA }))
  assert.equal(stillNew.find((l) => l.id === leadId)!.status, "new")
})

test("convertLeadCore : lie le lead à une réservation réelle de la même agence", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  const ctx: TenantContext = { agencyId: agencyA, userId: "", isSuperAdmin: true }

  await withTenantContext(ctx, (tx) =>
    createLeadCore(tx, {
      agencyId: agencyA,
      firstName: "Nadia",
      email: "nadia@example.com",
      productType: "package",
      sourcePage: "/packages/x",
    }),
  )
  const listed = await withTenantContext(ctx, (tx) => listLeadsCore(tx, { agencyId: agencyA }))
  const leadId = listed.find((l) => l.firstName === "Nadia")!.id

  const result = await withTenantContext(ctx, (tx) =>
    convertLeadCore(tx, {
      agencyId: agencyA,
      id: leadId,
      reservationId: reservationA1,
      handledByUserId: randomUUID(),
    }),
  )
  assert.equal(result.ok, true)

  const after1 = await withTenantContext(ctx, (tx) => listLeadsCore(tx, { agencyId: agencyA }))
  const lead = after1.find((l) => l.id === leadId)!
  assert.equal(lead.status, "converted")
  assert.equal(lead.reservationId, reservationA1)
  assert.ok(lead.convertedAt)
})

test("convertLeadCore : refuse une réservation d'une autre agence", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  const ctx: TenantContext = { agencyId: agencyA, userId: "", isSuperAdmin: true }

  await withTenantContext(ctx, (tx) =>
    createLeadCore(tx, {
      agencyId: agencyA,
      firstName: "Karim",
      email: "karim@example.com",
      productType: "general",
      sourcePage: "/",
    }),
  )
  const listed = await withTenantContext(ctx, (tx) => listLeadsCore(tx, { agencyId: agencyA }))
  const leadId = listed.find((l) => l.firstName === "Karim")!.id

  const result = await withTenantContext(ctx, (tx) =>
    convertLeadCore(tx, {
      agencyId: agencyA,
      id: leadId,
      reservationId: reservationB1,
      handledByUserId: randomUUID(),
    }),
  )
  assert.equal(result.ok, false)
  if (!result.ok) assert.equal(result.code, "RESERVATION_NOT_FOUND")

  const stillNew = await withTenantContext(ctx, (tx) => listLeadsCore(tx, { agencyId: agencyA }))
  assert.equal(stillNew.find((l) => l.id === leadId)!.status, "new")
})

test("convertLeadCore : refuse de lier deux leads à la même réservation (jamais un double comptage)", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  const ctx: TenantContext = { agencyId: agencyA, userId: "", isSuperAdmin: true }

  await withTenantContext(ctx, (tx) =>
    createLeadCore(tx, {
      agencyId: agencyA,
      firstName: "Salma",
      email: "salma@example.com",
      productType: "general",
      sourcePage: "/",
    }),
  )
  const listed = await withTenantContext(ctx, (tx) => listLeadsCore(tx, { agencyId: agencyA }))
  const leadId = listed.find((l) => l.firstName === "Salma")!.id

  // reservationA2 déjà libre à ce stade — première liaison OK.
  const first = await withTenantContext(ctx, (tx) =>
    convertLeadCore(tx, {
      agencyId: agencyA,
      id: leadId,
      reservationId: reservationA2,
      handledByUserId: randomUUID(),
    }),
  )
  assert.equal(first.ok, true)

  await withTenantContext(ctx, (tx) =>
    createLeadCore(tx, {
      agencyId: agencyA,
      firstName: "Salma2",
      email: "salma2@example.com",
      productType: "general",
      sourcePage: "/",
    }),
  )
  const listed2 = await withTenantContext(ctx, (tx) => listLeadsCore(tx, { agencyId: agencyA }))
  const leadId2 = listed2.find((l) => l.firstName === "Salma2")!.id

  const second = await withTenantContext(ctx, (tx) =>
    convertLeadCore(tx, {
      agencyId: agencyA,
      id: leadId2,
      reservationId: reservationA2,
      handledByUserId: randomUUID(),
    }),
  )
  assert.equal(second.ok, false)
  if (!second.ok) assert.equal(second.code, "RESERVATION_ALREADY_LINKED")
})

test("searchReservationsForLeadLinkCore : suggère par email, cherche par référence, jamais cross-agence", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  const ctx: TenantContext = { agencyId: agencyA, userId: "", isSuperAdmin: true }

  const byEmail = await withTenantContext(ctx, (tx) =>
    searchReservationsForLeadLinkCore(tx, { agencyId: agencyA, email: "tg-test-a1@example.com" }),
  )
  assert.ok(byEmail.some((r) => r.id === reservationA1))

  const byQuery = await withTenantContext(ctx, (tx) =>
    searchReservationsForLeadLinkCore(tx, { agencyId: agencyA, query: "TG-TEST-A1" }),
  )
  assert.ok(byQuery.some((r) => r.id === reservationA1))

  const noSignal = await withTenantContext(ctx, (tx) =>
    searchReservationsForLeadLinkCore(tx, { agencyId: agencyA }),
  )
  assert.equal(noSignal.length, 0)

  // Une recherche par référence de l'agence A ne remonte jamais une résa de l'agence B.
  const crossAgency = await withTenantContext(ctx, (tx) =>
    searchReservationsForLeadLinkCore(tx, { agencyId: agencyA, query: "TG-TEST-B1" }),
  )
  assert.equal(crossAgency.length, 0)
})
