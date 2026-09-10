/**
 * PHASE "POLICY MANAGER" (volet A — annulation B2C hôtel) — preuve live que
 * `ownedByCurrentCustomer()` (lib/booking/customer-identity.ts, la
 * condition WHERE partagée entre `listMyReservations()` et
 * `cancelMyHotelReservation()`) applique bien la règle de sécurité :
 * "mauvais utilisateur → zéro accès", "tenants différents → isolation".
 *
 * Se dégrade en `skip` sans Postgres local.
 */
import test, { before, after } from "node:test"
import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { eq, and, sql } from "drizzle-orm"
import { withTenantContext, withSystemContext } from "@/lib/db/tenant-context"
import { agencies, customers, reservations } from "@/lib/db/schema"
import { ownedByCurrentCustomer } from "../customer-identity"

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

let agencyA = ""
let agencyB = ""
let ownerAuthUserId = ""
let ownerEmail = ""
let ownerCustomerId = ""
let reservationId = ""

before(async () => {
  dbAvailable = await isDbAvailable()
  if (!dbAvailable) return
  agencyA = randomUUID()
  agencyB = randomUUID()
  ownerAuthUserId = randomUUID()
  ownerEmail = `owner-${randomUUID()}@example.com`

  await withSystemContext(async (tx) => {
    await tx.insert(agencies).values([
      { id: agencyA, slug: `own-a-${agencyA}`, name: "Ownership Test Agency A", agencyType: "ota" },
      { id: agencyB, slug: `own-b-${agencyB}`, name: "Ownership Test Agency B", agencyType: "ota" },
    ])
    const [customer] = await tx
      .insert(customers)
      .values({
        agencyId: agencyA,
        authUserId: ownerAuthUserId,
        firstName: "Owner",
        lastName: "Test",
        email: ownerEmail,
      })
      .returning({ id: customers.id })
    ownerCustomerId = customer!.id

    const [reservation] = await tx
      .insert(reservations)
      .values({
        agencyId: agencyA,
        publicRef: `OWN-${randomUUID().slice(0, 8)}`,
        customerId: ownerCustomerId,
        module: "hotel",
        source: "internal",
        status: "confirmed",
        originalCurrency: "TND",
        originalAmount: "500.00",
        tndAmount: "500.00",
      })
      .returning({ id: reservations.id })
    reservationId = reservation!.id
  })
})

after(async () => {
  if (!dbAvailable) return
  await withSystemContext(async (tx) => {
    await tx.delete(reservations).where(eq(reservations.agencyId, agencyA))
    await tx.delete(customers).where(eq(customers.agencyId, agencyA))
    await tx.delete(agencies).where(eq(agencies.id, agencyA))
    await tx.delete(agencies).where(eq(agencies.id, agencyB))
  })
})

async function findOwnedReservation(params: {
  agencyId: string
  authUserId: string
  verifiedEmail: string
}) {
  return withTenantContext({ agencyId: params.agencyId, userId: "", isSuperAdmin: false }, (tx) =>
    tx
      .select({ id: reservations.id })
      .from(reservations)
      .innerJoin(customers, eq(reservations.customerId, customers.id))
      .where(and(eq(reservations.id, reservationId), ownedByCurrentCustomer(params)))
      .limit(1),
  )
}

test("ownedByCurrentCustomer : le propriétaire réel (authUserId exact) trouve sa réservation", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  const rows = await findOwnedReservation({
    agencyId: agencyA,
    authUserId: ownerAuthUserId,
    verifiedEmail: "someone-else@example.com",
  })
  assert.equal(rows.length, 1)
  assert.equal(rows[0]!.id, reservationId)
})

test("ownedByCurrentCustomer : le propriétaire réel (email vérifié exact, sans authUserId) trouve sa réservation", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  const rows = await findOwnedReservation({
    agencyId: agencyA,
    authUserId: randomUUID(),
    verifiedEmail: ownerEmail,
  })
  assert.equal(rows.length, 1)
})

test("ownedByCurrentCustomer : mauvais utilisateur (authUserId ET email différents) → zéro accès", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  const rows = await findOwnedReservation({
    agencyId: agencyA,
    authUserId: randomUUID(),
    verifiedEmail: `intrus-${randomUUID()}@example.com`,
  })
  assert.equal(rows.length, 0)
})

test("ownedByCurrentCustomer : isolation tenant — même authUserId/email mais scope agence différent → zéro accès", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  const rows = await findOwnedReservation({
    agencyId: agencyB,
    authUserId: ownerAuthUserId,
    verifiedEmail: ownerEmail,
  })
  assert.equal(rows.length, 0, "la réservation appartient à l'agence A, jamais visible depuis B")
})
