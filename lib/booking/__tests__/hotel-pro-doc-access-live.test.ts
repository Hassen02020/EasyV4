/**
 * HOTEL-PRO-DOC-ACCESS-TEST-01 — preuve live que les routes `/pro` de
 * téléchargement voucher/facture refusent un accès inter-agences.
 *
 * `/api/pro/reservations/[id]/voucher` délègue à
 * `renderReservationVoucher(tx, reservationId)`, dont la doc de tête dit
 * explicitement qu'elle NE REFAIT AUCUN CONTRÔLE D'ACCÈS — elle repose
 * uniquement sur la RLS posée par le `withTenantContext` de l'appelant.
 * `/api/pro/reservations/[id]/invoice` fait le même `withTenantContext`
 * PLUS un filtre explicite `agencyId` (défense en profondeur).
 *
 * Ce fichier appelle directement ces chemins réels sous `withTenantContext`,
 * sans passer par HTTP/Supabase Auth (GoTrue indisponible dans ce labo) —
 * même frontière DB/RLS que les deux routes, aucun code de production
 * modifié ni réimplémenté.
 *
 * Se dégrade en `skip` sans Postgres local (DATABASE_URL).
 */
import test, { before, after } from "node:test"
import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { eq, and, sql } from "drizzle-orm"
import { withSystemContext, withTenantContext } from "@/lib/db/tenant-context"
import {
  agencies,
  customers,
  reservations,
  reservationHotel,
  reservationCar,
  carCategories,
  carLocations,
} from "@/lib/db/schema"
import { renderReservationVoucher } from "@/lib/booking/reservation-voucher-render"

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

let agencyAId = ""
let agencyBId = ""
let reservationAId = "" // confirmée, hôtel, agence A
let reservationBId = "" // confirmée, hôtel, agence B
// VOUCHER-CAR-TRANSFER-DATA-01 (lot "car") — prouve que le dispatch
// `renderReservationVoucher` rend bien un PDF réel pour le nouveau case "car".
let reservationCarAId = ""

before(async () => {
  dbAvailable = await isDbAvailable()
  if (!dbAvailable) return

  agencyAId = randomUUID()
  agencyBId = randomUUID()
  const suffix = agencyAId.slice(0, 8)

  await withSystemContext(async (tx) => {
    await tx.insert(agencies).values([
      {
        id: agencyAId,
        slug: `doc-cross-a-${suffix}`,
        name: "Cross Access Test Agency A",
        agencyType: "partner",
      },
      {
        id: agencyBId,
        slug: `doc-cross-b-${suffix}`,
        name: "Cross Access Test Agency B",
        agencyType: "partner",
      },
    ])

    const [customerA] = await tx
      .insert(customers)
      .values({
        agencyId: agencyAId,
        firstName: "Client",
        lastName: "A",
        email: `client-a-${suffix}@example.com`,
      })
      .returning({ id: customers.id })
    const [customerB] = await tx
      .insert(customers)
      .values({
        agencyId: agencyBId,
        firstName: "Client",
        lastName: "B",
        email: `client-b-${suffix}@example.com`,
      })
      .returning({ id: customers.id })

    const [resA] = await tx
      .insert(reservations)
      .values({
        agencyId: agencyAId,
        publicRef: `DOC-XA-${suffix}`,
        customerId: customerA!.id,
        module: "hotel",
        source: "internal",
        status: "confirmed",
        originalCurrency: "TND",
        originalAmount: "400.00",
        tndAmount: "400.00",
      })
      .returning({ id: reservations.id })
    reservationAId = resA!.id
    await tx.insert(reservationHotel).values({
      reservationId: reservationAId,
      agencyId: agencyAId,
      hotelId: 1,
      hotelName: "Hôtel Test A",
      checkIn: "2027-01-10",
      checkOut: "2027-01-15",
      nights: 5,
      adults: 2,
    })

    const [resB] = await tx
      .insert(reservations)
      .values({
        agencyId: agencyBId,
        publicRef: `DOC-XB-${suffix}`,
        customerId: customerB!.id,
        module: "hotel",
        source: "internal",
        status: "confirmed",
        originalCurrency: "TND",
        originalAmount: "500.00",
        tndAmount: "500.00",
      })
      .returning({ id: reservations.id })
    reservationBId = resB!.id
    await tx.insert(reservationHotel).values({
      reservationId: reservationBId,
      agencyId: agencyBId,
      hotelId: 2,
      hotelName: "Hôtel Test B",
      checkIn: "2027-02-10",
      checkOut: "2027-02-15",
      nights: 5,
      adults: 2,
    })

    // --- Fixture "car" (agence A) — VOUCHER-CAR-TRANSFER-DATA-01 ---
    const [category] = await tx
      .insert(carCategories)
      .values({ agencyId: agencyAId, code: `CAT-${suffix}`, name: "SUV Test" })
      .returning({ id: carCategories.id })
    const [pickupLoc] = await tx
      .insert(carLocations)
      .values({ agencyId: agencyAId, name: "Aéroport Test A", city: "Tunis" })
      .returning({ id: carLocations.id })
    const [dropoffLoc] = await tx
      .insert(carLocations)
      .values({ agencyId: agencyAId, name: "Gare Test A", city: "Tunis" })
      .returning({ id: carLocations.id })

    const [resCarA] = await tx
      .insert(reservations)
      .values({
        agencyId: agencyAId,
        publicRef: `DOC-CARA-${suffix}`,
        customerId: customerA!.id,
        module: "car",
        source: "internal",
        status: "confirmed",
        originalCurrency: "TND",
        originalAmount: "220.00",
        tndAmount: "220.00",
      })
      .returning({ id: reservations.id })
    reservationCarAId = resCarA!.id
    await tx.insert(reservationCar).values({
      reservationId: reservationCarAId,
      agencyId: agencyAId,
      categoryId: category!.id,
      pickupLocationId: pickupLoc!.id,
      dropoffLocationId: dropoffLoc!.id,
      pickupAt: new Date("2027-04-01T09:00:00Z"),
      dropoffAt: new Date("2027-04-04T09:00:00Z"),
      rentalDays: 3,
      driverFullName: "Pro Test A",
      driverLicenseNumber: "LIC-PRO-A-001",
    })
  })
})

after(async () => {
  if (!dbAvailable) return
  await withSystemContext(async (tx) => {
    // reservation_car.reservationId -> reservations.id est ON DELETE CASCADE
    // (lib/db/schema/cars.ts) : supprimer `reservations` nettoie déjà la
    // ligne reservation_car de la fixture "car", aucune suppression
    // explicite nécessaire.
    await tx.delete(reservations).where(eq(reservations.agencyId, agencyAId))
    await tx.delete(reservations).where(eq(reservations.agencyId, agencyBId))
    await tx.delete(carCategories).where(eq(carCategories.agencyId, agencyAId))
    await tx.delete(carLocations).where(eq(carLocations.agencyId, agencyAId))
    await tx.delete(customers).where(eq(customers.agencyId, agencyAId))
    await tx.delete(customers).where(eq(customers.agencyId, agencyBId))
    await tx.delete(agencies).where(eq(agencies.id, agencyAId))
    await tx.delete(agencies).where(eq(agencies.id, agencyBId))
  })
})

/* ---------------------------- Voucher ---------------------------- */

test("voucher /pro : agence A voit SA PROPRE réservation confirmée (contrôle positif)", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  const result = await withTenantContext(
    { agencyId: agencyAId, userId: randomUUID(), isSuperAdmin: false },
    (tx) => renderReservationVoucher(tx, reservationAId),
  )
  assert.equal(
    result.ok,
    true,
    "l'agence A doit voir sa propre réservation confirmée",
  )
})

test("voucher /pro : agence A ne voit JAMAIS une réservation de l'agence B (IDOR cross-agence)", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  const result = await withTenantContext(
    { agencyId: agencyAId, userId: randomUUID(), isSuperAdmin: false },
    (tx) => renderReservationVoucher(tx, reservationBId),
  )
  assert.equal(
    result.ok,
    false,
    "la réservation de l'agence B ne doit jamais être visible depuis le contexte agence A",
  )
  if (!result.ok) assert.equal(result.error, "not_found")
})

test('voucher /pro : rendu voucher Voiture (lot "car", VOUCHER-CAR-TRANSFER-DATA-01) — PDF réel, pas un succès d\'événement seul', async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  const result = await withTenantContext(
    { agencyId: agencyAId, userId: randomUUID(), isSuperAdmin: false },
    (tx) => renderReservationVoucher(tx, reservationCarAId),
  )
  assert.equal(result.ok, true, 'le case "car" du dispatch doit réussir')
  if (result.ok) {
    assert.ok(
      result.pdf.length > 0 &&
        Buffer.from(result.pdf.subarray(0, 5)).toString("latin1") === "%PDF-",
      "le PDF rendu côté back-office doit être un PDF réel",
    )
  }
})

/* ------------- Invoice (réplique exacte du where-clause de la route) ------------- */

test("invoice /pro : agence A voit SA PROPRE réservation (contrôle positif)", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  const rows = await withTenantContext(
    { agencyId: agencyAId, userId: randomUUID(), isSuperAdmin: false },
    (tx) =>
      tx
        .select({ id: reservations.id })
        .from(reservations)
        .where(
          and(
            eq(reservations.id, reservationAId),
            eq(reservations.agencyId, agencyAId),
          ),
        )
        .limit(1),
  )
  assert.equal(rows.length, 1)
})

test("invoice /pro : agence A ne voit JAMAIS une réservation de l'agence B (IDOR cross-agence)", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  const rows = await withTenantContext(
    { agencyId: agencyAId, userId: randomUUID(), isSuperAdmin: false },
    (tx) =>
      tx
        .select({ id: reservations.id })
        .from(reservations)
        .where(
          and(
            eq(reservations.id, reservationBId),
            eq(reservations.agencyId, agencyAId),
          ),
        )
        .limit(1),
  )
  assert.equal(
    rows.length,
    0,
    "la réservation de l'agence B ne doit jamais apparaître pour l'agence A",
  )
})

test("invoice /pro : même SANS le filtre explicite agencyId, la RLS seule bloque déjà l'accès cross-agence", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  // Réplique la requête SANS le filtre explicite agencyId — isole la
  // protection RLS seule (withTenantContext), indépendamment de la défense
  // en profondeur de la route. Si ce test échouait, la route resterait
  // protégée par son filtre explicite, mais la RLS elle-même aurait un vrai
  // trou — même classe de défaut que INVENTORY-LOCK-TOCTOU-01.
  const rows = await withTenantContext(
    { agencyId: agencyAId, userId: randomUUID(), isSuperAdmin: false },
    (tx) =>
      tx
        .select({ id: reservations.id })
        .from(reservations)
        .where(eq(reservations.id, reservationBId))
        .limit(1),
  )
  assert.equal(
    rows.length,
    0,
    "la RLS seule doit déjà empêcher l'agence A de voir une ligne de l'agence B",
  )
})
