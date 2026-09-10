/**
 * TICKET E2B-004 (section UX, "Réservation : ... destination/produit, dates,
 * voyageurs") — preuve live que `getProductDetails()` (app/actions/
 * list-my-reservations.ts) lit bien le détail produit lisible depuis la
 * table d'extension propre à chaque module (`reservation_hotel`/
 * `reservation_package`/`reservation_activity`/`reservation_omra`), jamais
 * deviné depuis `providerPayload` — et renvoie `null` proprement (jamais une
 * exception) pour un module sans extension connue.
 *
 * Se dégrade en `skip` sans Postgres local (DATABASE_URL).
 */
import test, { before, after } from "node:test"
import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { eq, sql } from "drizzle-orm"
import { withTenantContext, withSystemContext } from "@/lib/db/tenant-context"
import {
  agencies,
  customers,
  reservations,
  reservationHotel,
  reservationPackage,
  reservationActivity,
  reservationOmra,
  catalogPackages,
  catalogActivities,
  omraPackages,
} from "@/lib/db/schema"
import { getProductDetails } from "../../../app/actions/list-my-reservations"

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

let agencyId = ""
let customerId = ""

async function makeReservation(module: "hotel" | "package" | "activity" | "omra" | "flight") {
  return withTenantContext({ agencyId, userId: "", isSuperAdmin: false }, async (tx) => {
    const [row] = await tx
      .insert(reservations)
      .values({
        agencyId,
        publicRef: `PD-${module}-${randomUUID().slice(0, 8)}`,
        customerId,
        module,
        source: "internal",
        status: "confirmed",
        originalCurrency: "TND",
        originalAmount: "100.00",
        tndAmount: "100.00",
      })
      .returning({ id: reservations.id })
    return row!.id
  })
}

before(async () => {
  dbAvailable = await isDbAvailable()
  if (!dbAvailable) return
  agencyId = randomUUID()
  await withSystemContext(async (tx) => {
    await tx.insert(agencies).values({
      id: agencyId,
      slug: `pd-test-${agencyId.slice(0, 8)}`,
      name: "Product Details Test Agency",
      agencyType: "ota",
    })
    const [customer] = await tx
      .insert(customers)
      .values({ agencyId, firstName: "PD", lastName: "Test", email: `pd-${agencyId.slice(0, 8)}@example.com` })
      .returning({ id: customers.id })
    customerId = customer!.id
  })
})

after(async () => {
  if (!dbAvailable) return
  await withSystemContext(async (tx) => {
    await tx.delete(reservations).where(eq(reservations.agencyId, agencyId))
    await tx.delete(customers).where(eq(customers.agencyId, agencyId))
    await tx.delete(catalogPackages).where(eq(catalogPackages.agencyId, agencyId))
    await tx.delete(catalogActivities).where(eq(catalogActivities.agencyId, agencyId))
    await tx.delete(omraPackages).where(eq(omraPackages.agencyId, agencyId))
    await tx.delete(agencies).where(eq(agencies.id, agencyId))
  })
})

test("getProductDetails : hôtel -> label = nom hôtel + ville, dates = check-in/check-out, voyageurs = adultes + enfants", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  const reservationId = await makeReservation("hotel")
  await withSystemContext((tx) =>
    tx.insert(reservationHotel).values({
      reservationId,
      agencyId,
      hotelId: 1,
      hotelName: "Hôtel Les Palmiers",
      cityName: "Djerba",
      checkIn: "2027-03-01",
      checkOut: "2027-03-08",
      nights: 7,
      adults: 2,
      childrenAges: [6],
    }),
  )
  const product = await withTenantContext({ agencyId, userId: "", isSuperAdmin: false }, (tx) =>
    getProductDetails(tx, reservationId, "hotel"),
  )
  assert.ok(product)
  assert.equal(product!.label, "Hôtel Les Palmiers — Djerba")
  assert.equal(product!.startDate, "2027-03-01")
  assert.equal(product!.endDate, "2027-03-08")
  assert.equal(product!.travelers, 3)
})

test("getProductDetails : package -> label = titre catalogue, dates = départ/retour, voyageurs = adultes + enfants", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  const reservationId = await makeReservation("package")
  const [pkg] = await withSystemContext((tx) =>
    tx
      .insert(catalogPackages)
      .values({
        agencyId,
        code: `PKG-${randomUUID().slice(0, 8)}`,
        title: "Circuit Sud Tunisien",
        slug: `circuit-sud-${randomUUID().slice(0, 8)}`,
      })
      .returning({ id: catalogPackages.id }),
  )
  await withSystemContext((tx) =>
    tx.insert(reservationPackage).values({
      reservationId,
      agencyId,
      packageId: pkg!.id,
      departureId: randomUUID(),
      departureDate: "2027-04-10",
      returnDate: "2027-04-17",
      adults: 2,
      childrenAges: [],
    }),
  )
  const product = await withTenantContext({ agencyId, userId: "", isSuperAdmin: false }, (tx) =>
    getProductDetails(tx, reservationId, "package"),
  )
  assert.ok(product)
  assert.equal(product!.label, "Circuit Sud Tunisien")
  assert.equal(product!.startDate, "2027-04-10")
  assert.equal(product!.endDate, "2027-04-17")
  assert.equal(product!.travelers, 2)
})

test("getProductDetails : activity -> label = titre catalogue, une seule date (session), voyageurs = adultes + enfants + seniors", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  const reservationId = await makeReservation("activity")
  const [act] = await withSystemContext((tx) =>
    tx
      .insert(catalogActivities)
      .values({
        agencyId,
        code: `ACT-${randomUUID().slice(0, 8)}`,
        title: "Excursion Sahara",
        slug: `excursion-sahara-${randomUUID().slice(0, 8)}`,
      })
      .returning({ id: catalogActivities.id }),
  )
  await withSystemContext((tx) =>
    tx.insert(reservationActivity).values({
      reservationId,
      agencyId,
      activityId: act!.id,
      sessionId: randomUUID(),
      sessionDate: "2027-05-05",
      adults: 2,
      children: 1,
      seniors: 1,
    }),
  )
  const product = await withTenantContext({ agencyId, userId: "", isSuperAdmin: false }, (tx) =>
    getProductDetails(tx, reservationId, "activity"),
  )
  assert.ok(product)
  assert.equal(product!.label, "Excursion Sahara")
  assert.equal(product!.startDate, "2027-05-05")
  assert.equal(product!.endDate, "2027-05-05")
  assert.equal(product!.travelers, 4)
})

test("getProductDetails : omra -> label = nom package omra, dates = départ/retour, voyageurs = pèlerins", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  const reservationId = await makeReservation("omra")
  const [omra] = await withSystemContext((tx) =>
    tx
      .insert(omraPackages)
      .values({
        agencyId,
        type: "omra",
        name: "Omra Ramadan 2027",
        durationDays: 10,
        validFrom: "2027-01-01",
        validUntil: "2027-12-31",
        basePrice: "3500.000",
      })
      .returning({ id: omraPackages.id }),
  )
  await withSystemContext((tx) =>
    tx.insert(reservationOmra).values({
      reservationId,
      agencyId,
      omraPackageId: omra!.id,
      departureDate: "2027-06-01",
      returnDate: "2027-06-11",
      pilgrims: 3,
    }),
  )
  const product = await withTenantContext({ agencyId, userId: "", isSuperAdmin: false }, (tx) =>
    getProductDetails(tx, reservationId, "omra"),
  )
  assert.ok(product)
  assert.equal(product!.label, "Omra Ramadan 2027")
  assert.equal(product!.startDate, "2027-06-01")
  assert.equal(product!.endDate, "2027-06-11")
  assert.equal(product!.travelers, 3)
})

test("getProductDetails : module sans extension connue (flight) -> null proprement, jamais une exception", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  const reservationId = await makeReservation("flight")
  const product = await withTenantContext({ agencyId, userId: "", isSuperAdmin: false }, (tx) =>
    getProductDetails(tx, reservationId, "flight"),
  )
  assert.equal(product, null)
})

test("getProductDetails : module hôtel connu mais AUCUNE ligne reservation_hotel (ancien enregistrement) -> null proprement", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  const reservationId = await makeReservation("hotel")
  const product = await withTenantContext({ agencyId, userId: "", isSuperAdmin: false }, (tx) =>
    getProductDetails(tx, reservationId, "hotel"),
  )
  assert.equal(product, null)
})
