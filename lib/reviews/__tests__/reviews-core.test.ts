/**
 * Avis clients — preuve live contre un Postgres réel (RLS incluse via
 * withTenantContext), même convention que
 * lib/favorites/__tests__/favorites-core.test.ts : se dégrade en `skip`
 * sans DATABASE_URL/Postgres local disponible.
 *
 * Couvre les garanties de sécurité critiques du module : éligibilité
 * (module + statut réservation), propriété (authUserId OU email vérifié),
 * unicité (un seul avis par réservation), et surtout la garde de
 * visibilité publique — listApprovedReviewsForProductCore ne doit JAMAIS
 * renvoyer un avis dont le statut n'est pas 'approved'.
 */
import test, { before, after } from "node:test"
import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { eq, sql } from "drizzle-orm"
import { withTenantContext, withSystemContext, type TenantContext } from "@/lib/db/tenant-context"
import { agencies, customers, reservations, reservationHotel, reviews } from "@/lib/db/schema"
import {
  submitReviewCore,
  listApprovedReviewsForProductCore,
  listReviewsForModerationCore,
  moderateReviewCore,
} from "../reviews-core"

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
const skipReason = () => "Postgres local indisponible (DATABASE_URL) — voir favorites-core.test.ts pour la procédure."

let agencyA = ""
let agencyB = ""

let userA1 = "" // customerA1 : authUserId posé
let customerA1 = ""
let emailA1 = ""

let customerA2 = "" // authUserId posé, réservation distincte, jamais reviewée dans le fixture
let userA2 = ""
let emailA2 = ""

let customerA3 = "" // pas d'authUserId — match uniquement par email vérifié
let emailA3 = ""

let userB1 = ""
let customerB1 = ""
let emailB1 = ""

const HOTEL_ID = 555

let reservationConfirmed1 = "" // customerA1, hotel, confirmed, hotelId 555
let reservationConfirmed2 = "" // customerA2, hotel, confirmed, hotelId 555
let reservationConfirmed3 = "" // customerA3, hotel, confirmed, hotelId 555
let reservationPending = "" // customerA1, hotel, pending
let reservationTransfer = "" // customerA1, transfer, confirmed (module non éligible)
let reservationB1 = "" // customerB1 (agence B), hotel, confirmed, hotelId 555

async function insertReservation(params: {
  agencyId: string
  customerId: string
  module: "hotel" | "transfer"
  status: "pending" | "confirmed"
}): Promise<string> {
  const [row] = await withSystemContext((tx) =>
    tx
      .insert(reservations)
      .values({
        agencyId: params.agencyId,
        publicRef: `REV-${randomUUID().slice(0, 8)}`,
        customerId: params.customerId,
        module: params.module,
        source: "internal",
        status: params.status,
        originalCurrency: "TND",
        originalAmount: "500.00",
        tndAmount: "500.00",
      })
      .returning({ id: reservations.id }),
  )
  return row!.id
}

before(async () => {
  dbAvailable = await isDbAvailable()
  if (!dbAvailable) return

  agencyA = randomUUID()
  agencyB = randomUUID()
  userA1 = randomUUID()
  userA2 = randomUUID()
  userB1 = randomUUID()
  emailA1 = `a1-${randomUUID()}@example.com`
  emailA2 = `a2-${randomUUID()}@example.com`
  emailA3 = `a3-${randomUUID()}@example.com`
  emailB1 = `b1-${randomUUID()}@example.com`

  await withSystemContext(async (tx) => {
    await tx.insert(agencies).values([
      { id: agencyA, slug: `rev-a-${agencyA}`, name: "Reviews Test Agency A", agencyType: "ota" },
      { id: agencyB, slug: `rev-b-${agencyB}`, name: "Reviews Test Agency B", agencyType: "ota" },
    ])

    const [ca1] = await tx
      .insert(customers)
      .values({ agencyId: agencyA, authUserId: userA1, firstName: "Amine", lastName: "Ben Ali", email: emailA1 })
      .returning({ id: customers.id })
    customerA1 = ca1!.id

    const [ca2] = await tx
      .insert(customers)
      .values({ agencyId: agencyA, authUserId: userA2, firstName: "Sami", lastName: "Trabelsi", email: emailA2 })
      .returning({ id: customers.id })
    customerA2 = ca2!.id

    const [ca3] = await tx
      .insert(customers)
      .values({ agencyId: agencyA, firstName: "Nour", lastName: "Gharbi", email: emailA3 })
      .returning({ id: customers.id })
    customerA3 = ca3!.id

    const [cb1] = await tx
      .insert(customers)
      .values({ agencyId: agencyB, authUserId: userB1, firstName: "Karim", lastName: "Jlassi", email: emailB1 })
      .returning({ id: customers.id })
    customerB1 = cb1!.id
  })

  reservationConfirmed1 = await insertReservation({ agencyId: agencyA, customerId: customerA1, module: "hotel", status: "confirmed" })
  reservationConfirmed2 = await insertReservation({ agencyId: agencyA, customerId: customerA2, module: "hotel", status: "confirmed" })
  reservationConfirmed3 = await insertReservation({ agencyId: agencyA, customerId: customerA3, module: "hotel", status: "confirmed" })
  reservationPending = await insertReservation({ agencyId: agencyA, customerId: customerA1, module: "hotel", status: "pending" })
  reservationTransfer = await insertReservation({ agencyId: agencyA, customerId: customerA1, module: "transfer", status: "confirmed" })
  reservationB1 = await insertReservation({ agencyId: agencyB, customerId: customerB1, module: "hotel", status: "confirmed" })

  await withSystemContext(async (tx) => {
    await tx.insert(reservationHotel).values(
      [reservationConfirmed1, reservationConfirmed2, reservationConfirmed3, reservationB1].map((reservationId, i) => ({
        reservationId,
        agencyId: i === 3 ? agencyB : agencyA,
        hotelId: HOTEL_ID,
        hotelName: "Hôtel Test Reviews",
        checkIn: "2026-01-10",
        checkOut: "2026-01-15",
        nights: 5,
        adults: 2,
      })),
    )
  })
})

after(async () => {
  if (!dbAvailable) return
  await withSystemContext(async (tx) => {
    await tx.delete(reviews).where(eq(reviews.agencyId, agencyA))
    await tx.delete(reviews).where(eq(reviews.agencyId, agencyB))
    await tx.delete(reservationHotel).where(eq(reservationHotel.agencyId, agencyA))
    await tx.delete(reservationHotel).where(eq(reservationHotel.agencyId, agencyB))
    await tx.delete(reservations).where(eq(reservations.agencyId, agencyA))
    await tx.delete(reservations).where(eq(reservations.agencyId, agencyB))
    await tx.delete(customers).where(eq(customers.agencyId, agencyA))
    await tx.delete(customers).where(eq(customers.agencyId, agencyB))
    await tx.delete(agencies).where(eq(agencies.id, agencyA))
    await tx.delete(agencies).where(eq(agencies.id, agencyB))
  })
})

function ctxA(): TenantContext {
  return { agencyId: agencyA, userId: userA1, isSuperAdmin: true }
}

test("submitReviewCore : succès pour réservation hôtel confirmée possédée (authUserId)", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  const result = await withTenantContext(ctxA(), (tx) =>
    submitReviewCore(tx, {
      agencyId: agencyA,
      reservationId: reservationConfirmed1,
      authUserId: userA1,
      verifiedEmail: "unused@example.com",
      rating: 5,
      comment: "Excellent séjour",
    }),
  )
  assert.equal(result.ok, true)
})

test("submitReviewCore : ALREADY_REVIEWED en cas de double soumission sur la même réservation", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  const result = await withTenantContext(ctxA(), (tx) =>
    submitReviewCore(tx, {
      agencyId: agencyA,
      reservationId: reservationConfirmed1,
      authUserId: userA1,
      verifiedEmail: "unused@example.com",
      rating: 4,
      comment: "Nouvelle tentative",
    }),
  )
  assert.equal(result.ok, false)
  if (!result.ok) assert.equal(result.code, "ALREADY_REVIEWED")
})

test("submitReviewCore : RESERVATION_NOT_FOUND quand ni authUserId ni email ne correspondent au propriétaire réel", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  const result = await withTenantContext(ctxA(), (tx) =>
    submitReviewCore(tx, {
      agencyId: agencyA,
      reservationId: reservationConfirmed2, // appartient à customerA2
      authUserId: userA1,
      verifiedEmail: `intrus-${randomUUID()}@example.com`,
      rating: 5,
      comment: "Usurpation",
    }),
  )
  assert.equal(result.ok, false)
  if (!result.ok) assert.equal(result.code, "RESERVATION_NOT_FOUND")
})

test("submitReviewCore : NOT_ELIGIBLE pour une réservation en attente (pending)", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  const result = await withTenantContext(ctxA(), (tx) =>
    submitReviewCore(tx, {
      agencyId: agencyA,
      reservationId: reservationPending,
      authUserId: userA1,
      verifiedEmail: emailA1,
      rating: 3,
      comment: "Trop tôt",
    }),
  )
  assert.equal(result.ok, false)
  if (!result.ok) assert.equal(result.code, "NOT_ELIGIBLE")
})

test("submitReviewCore : NOT_ELIGIBLE pour un module non pris en charge (transfer)", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  const result = await withTenantContext(ctxA(), (tx) =>
    submitReviewCore(tx, {
      agencyId: agencyA,
      reservationId: reservationTransfer,
      authUserId: userA1,
      verifiedEmail: emailA1,
      rating: 5,
      comment: "Transfert",
    }),
  )
  assert.equal(result.ok, false)
  if (!result.ok) assert.equal(result.code, "NOT_ELIGIBLE")
})

test("submitReviewCore : succès via email vérifié seul (pas d'authUserId sur le client)", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  const result = await withTenantContext(ctxA(), (tx) =>
    submitReviewCore(tx, {
      agencyId: agencyA,
      reservationId: reservationConfirmed3,
      authUserId: randomUUID(), // ne correspond à rien
      verifiedEmail: emailA3,
      rating: 4,
      comment: "Bon rapport qualité-prix",
    }),
  )
  assert.equal(result.ok, true)
})

test("submitReviewCore : succès pour customerA2 (réservation confirmée, propre identité)", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  const result = await withTenantContext(ctxA(), (tx) =>
    submitReviewCore(tx, {
      agencyId: agencyA,
      reservationId: reservationConfirmed2,
      authUserId: userA2,
      verifiedEmail: emailA2,
      rating: 2,
      comment: "Décevant",
    }),
  )
  assert.equal(result.ok, true)
})

test("submitReviewCore : agence B peut soumettre indépendamment (isolation tenant)", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  const ctxB: TenantContext = { agencyId: agencyB, userId: userB1, isSuperAdmin: true }
  const result = await withTenantContext(ctxB, (tx) =>
    submitReviewCore(tx, {
      agencyId: agencyB,
      reservationId: reservationB1,
      authUserId: userB1,
      verifiedEmail: emailB1,
      rating: 5,
      comment: "Avis agence B",
    }),
  )
  assert.equal(result.ok, true)
})

test("listReviewsForModerationCore : isolation tenant — l'agence A ne voit jamais les avis de l'agence B", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  const rowsA = await withTenantContext(ctxA(), (tx) => listReviewsForModerationCore(tx, { agencyId: agencyA }))
  const rowsB = await withTenantContext(
    { agencyId: agencyB, userId: userB1, isSuperAdmin: true },
    (tx) => listReviewsForModerationCore(tx, { agencyId: agencyB }),
  )
  assert.ok(rowsA.length >= 3, "au moins les 3 avis hôtel soumis pour l'agence A (customerA1/A2/A3)")
  assert.ok(rowsA.every((r) => r.id !== undefined))
  assert.equal(rowsB.length, 1)
  assert.ok(rowsA.every((r) => r.comment !== "Avis agence B"))
})

test("listReviewsForModerationCore : tous les nouveaux avis démarrent 'pending'", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  const pendingRows = await withTenantContext(ctxA(), (tx) =>
    listReviewsForModerationCore(tx, { agencyId: agencyA, status: "pending" }),
  )
  assert.ok(pendingRows.length >= 3)
  assert.ok(pendingRows.every((r) => r.status === "pending"))
})

test("listApprovedReviewsForProductCore : ne renvoie AUCUN avis avant modération", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  const summary = await withTenantContext(ctxA(), (tx) =>
    listApprovedReviewsForProductCore(tx, { agencyId: agencyA, module: "hotel", productRef: String(HOTEL_ID) }),
  )
  assert.equal(summary.count, 0)
  assert.equal(summary.average, 0)
  assert.deepEqual(summary.reviews, [])
})

test("moderateReviewCore : approuver/rejeter change le statut ; isolation agence sur la modération", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())

  const pendingA = await withTenantContext(ctxA(), (tx) =>
    listReviewsForModerationCore(tx, { agencyId: agencyA, status: "pending" }),
  )
  const reviewOnHotel1 = pendingA.find((r) => r.reservationId === reservationConfirmed1)!
  const reviewOnHotel2 = pendingA.find((r) => r.reservationId === reservationConfirmed2)!
  const reviewOnHotel3 = pendingA.find((r) => r.reservationId === reservationConfirmed3)!
  assert.ok(reviewOnHotel1 && reviewOnHotel2 && reviewOnHotel3)

  // Une agence ne peut jamais modérer l'avis d'une autre — updated: false, statut inchangé.
  const crossAgencyAttempt = await withTenantContext(
    { agencyId: agencyB, userId: userB1, isSuperAdmin: true },
    (tx) =>
      moderateReviewCore(tx, {
        agencyId: agencyB,
        id: reviewOnHotel1.id,
        status: "approved",
        moderatedByUserId: userB1,
      }),
  )
  assert.equal(crossAgencyAttempt.updated, false)

  const approve1 = await withTenantContext(ctxA(), (tx) =>
    moderateReviewCore(tx, { agencyId: agencyA, id: reviewOnHotel1.id, status: "approved", moderatedByUserId: userA1 }),
  )
  assert.equal(approve1.updated, true)

  const reject2 = await withTenantContext(ctxA(), (tx) =>
    moderateReviewCore(tx, { agencyId: agencyA, id: reviewOnHotel2.id, status: "rejected", moderatedByUserId: userA1 }),
  )
  assert.equal(reject2.updated, true)
  // reviewOnHotel3 reste 'pending' volontairement (jamais modéré dans ce test).

  const afterModeration = await withTenantContext(ctxA(), (tx) => listReviewsForModerationCore(tx, { agencyId: agencyA }))
  assert.equal(afterModeration.find((r) => r.id === reviewOnHotel1.id)!.status, "approved")
  assert.equal(afterModeration.find((r) => r.id === reviewOnHotel2.id)!.status, "rejected")
  assert.equal(afterModeration.find((r) => r.id === reviewOnHotel3.id)!.status, "pending")
})

test("listApprovedReviewsForProductCore : renvoie UNIQUEMENT l'avis approuvé, jamais le rejeté ni le pending", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  const summary = await withTenantContext(ctxA(), (tx) =>
    listApprovedReviewsForProductCore(tx, { agencyId: agencyA, module: "hotel", productRef: String(HOTEL_ID) }),
  )
  assert.equal(summary.count, 1)
  assert.equal(summary.average, 5)
  assert.equal(summary.reviews.length, 1)
  assert.equal(summary.reviews[0]!.rating, 5)
  // "Prénom N." — jamais le nom complet, l'email ou le téléphone.
  assert.equal(summary.reviews[0]!.reviewerDisplayName, "Amine B.")
})

test("listApprovedReviewsForProductCore : isolation tenant — l'agence B ne voit jamais les avis approuvés de l'agence A", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  const summaryFromB = await withTenantContext(
    { agencyId: agencyB, userId: userB1, isSuperAdmin: true },
    (tx) => listApprovedReviewsForProductCore(tx, { agencyId: agencyB, module: "hotel", productRef: String(HOTEL_ID) }),
  )
  assert.equal(summaryFromB.count, 0)
})
