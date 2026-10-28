/**
 * TICKET E2B-004 (section 6, "DOCUMENTS") — preuve live que les routes de
 * téléchargement facture/voucher refont bien leurs propres contrôles
 * serveur, indépendamment de toute session :
 *
 *   - propriétaire (bon `publicRef` + bon `guestAccessToken`) → accès autorisé
 *   - `publicRef` correct mais token d'UNE AUTRE réservation → 404 (jamais 200)
 *   - `publicRef` correct sans token → 404 (jamais 200)
 *   - document pas encore disponible (facture non émise / réservation non
 *     confirmée) → refus propre (404 avec message), jamais une exception
 *
 * Ces deux routes n'ont volontairement AUCUNE vérification de session
 * Supabase (voir la doc de tête de chaque route) : le token opaque
 * (`reservations.guestAccessToken`, 256 bits, jamais dérivable de
 * `publicRef`) EST la frontière d'accès, exactement le même mécanisme que
 * `/booking/confirmation/[ref]` (guest) et `/compte` (authentifié) — les
 * deux parcours passent le même `?token=` lu depuis `BookingSummary.
 * guestAccessToken`, lui-même filtré par `ownedByCurrentCustomer()` en
 * amont (jamais renvoyé à qui que ce soit d'autre que le vrai propriétaire).
 * Ce test prouve donc la moitié "serveur" de la garantie : même si un
 * `publicRef` est deviné/énuméré, sans le token exact, la route ne renvoie
 * jamais le document.
 *
 * Se dégrade en `skip` sans Postgres local (DATABASE_URL).
 */
import test, { before, after } from "node:test"
import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { eq, sql } from "drizzle-orm"
import { NextRequest } from "next/server"
import { withSystemContext } from "@/lib/db/tenant-context"
import {
  agencies,
  customers,
  reservations,
  reservationHotel,
  reservationCar,
  carCategories,
  carLocations,
  partnerInvoices,
} from "@/lib/db/schema"
import { generateInvoiceForReservation } from "@/lib/finance/invoice-actions"
import { GET as invoiceGet } from "@/app/api/booking/invoice/[ref]/route"
import { GET as voucherGet } from "@/app/api/booking/voucher/[ref]/route"
import { GET as carVoucherGet } from "@/app/api/cars/voucher/[ref]/route"

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
// Réservation "propriétaire" — confirmée, avec extension hôtel et facture émise.
let ownedRef = ""
let ownedToken = ""
let ownedReservationId = ""
// Réservation d'UN AUTRE client (même agence) — sert uniquement à obtenir un
// token "étranger" valide en base mais qui n'appartient pas à `ownedRef`.
let foreignToken = ""
// Réservation confirmée mais SANS facture générée (paiement non complet) —
// prouve le refus propre "document pas encore disponible".
let unpaidRef = ""
let unpaidToken = ""
// Réservation hôtel PAS confirmée (pending) — prouve le refus propre côté
// voucher ("pas encore disponible").
let pendingRef = ""
let pendingToken = ""

// VOUCHER-CAR-TRANSFER-DATA-01 (lot "car") — même garantie d'accès pour
// /api/cars/voucher/[ref], réutilise exactement ces mêmes fixtures/scénarios
// (propriétaire / token étranger / sans token / pas encore disponible)
// plutôt qu'un fichier de test séparé.
let ownedCarRef = ""
let ownedCarToken = ""
let pendingCarRef = ""
let pendingCarToken = ""

before(async () => {
  dbAvailable = await isDbAvailable()
  if (!dbAvailable) return

  agencyId = randomUUID()
  const suffix = agencyId.slice(0, 8)

  await withSystemContext(async (tx) => {
    await tx.insert(agencies).values({
      id: agencyId,
      slug: `doc-access-${suffix}`,
      name: "Document Access Test Agency",
      agencyType: "ota",
    })

    const [customerOwner] = await tx
      .insert(customers)
      .values({
        agencyId,
        firstName: "Owner",
        lastName: "Test",
        email: `owner-${suffix}@example.com`,
      })
      .returning({ id: customers.id })
    const [customerOther] = await tx
      .insert(customers)
      .values({
        agencyId,
        firstName: "Other",
        lastName: "Client",
        email: `other-${suffix}@example.com`,
      })
      .returning({ id: customers.id })

    const [owned] = await tx
      .insert(reservations)
      .values({
        agencyId,
        publicRef: `DOC-OWN-${suffix}`,
        customerId: customerOwner!.id,
        module: "hotel",
        source: "internal",
        status: "confirmed",
        originalCurrency: "TND",
        originalAmount: "400.00",
        tndAmount: "400.00",
      })
      .returning({
        id: reservations.id,
        publicRef: reservations.publicRef,
        guestAccessToken: reservations.guestAccessToken,
      })
    ownedReservationId = owned!.id
    ownedRef = owned!.publicRef
    ownedToken = owned!.guestAccessToken
    await tx.insert(reservationHotel).values({
      reservationId: ownedReservationId,
      agencyId,
      hotelId: 1,
      hotelName: "Hôtel Test Access",
      checkIn: "2027-01-10",
      checkOut: "2027-01-15",
      nights: 5,
      adults: 2,
    })

    const [foreign] = await tx
      .insert(reservations)
      .values({
        agencyId,
        publicRef: `DOC-OTH-${suffix}`,
        customerId: customerOther!.id,
        module: "hotel",
        source: "internal",
        status: "confirmed",
        originalCurrency: "TND",
        originalAmount: "300.00",
        tndAmount: "300.00",
      })
      .returning({ guestAccessToken: reservations.guestAccessToken })
    foreignToken = foreign!.guestAccessToken

    const [unpaid] = await tx
      .insert(reservations)
      .values({
        agencyId,
        publicRef: `DOC-UNPAID-${suffix}`,
        customerId: customerOwner!.id,
        module: "hotel",
        source: "internal",
        status: "confirmed",
        originalCurrency: "TND",
        originalAmount: "200.00",
        tndAmount: "200.00",
      })
      .returning({
        publicRef: reservations.publicRef,
        guestAccessToken: reservations.guestAccessToken,
      })
    unpaidRef = unpaid!.publicRef
    unpaidToken = unpaid!.guestAccessToken

    const [pending] = await tx
      .insert(reservations)
      .values({
        agencyId,
        publicRef: `DOC-PEND-${suffix}`,
        customerId: customerOwner!.id,
        module: "hotel",
        source: "internal",
        status: "pending",
        originalCurrency: "TND",
        originalAmount: "150.00",
        tndAmount: "150.00",
      })
      .returning({
        id: reservations.id,
        publicRef: reservations.publicRef,
        guestAccessToken: reservations.guestAccessToken,
      })
    pendingRef = pending!.publicRef
    pendingToken = pending!.guestAccessToken
    await tx.insert(reservationHotel).values({
      reservationId: pending!.id,
      agencyId,
      hotelId: 2,
      hotelName: "Hôtel Test Pending",
      checkIn: "2027-02-01",
      checkOut: "2027-02-03",
      nights: 2,
      adults: 1,
    })

    // --- Fixtures "car" (VOUCHER-CAR-TRANSFER-DATA-01, lot "car") ---
    const [category] = await tx
      .insert(carCategories)
      .values({
        agencyId,
        code: `CAT-${suffix}`,
        name: "Catégorie Test Access",
      })
      .returning({ id: carCategories.id })
    const [pickupLoc] = await tx
      .insert(carLocations)
      .values({ agencyId, name: "Aéroport Test Access", city: "Tunis" })
      .returning({ id: carLocations.id })
    const [dropoffLoc] = await tx
      .insert(carLocations)
      .values({ agencyId, name: "Centre-ville Test Access", city: "Tunis" })
      .returning({ id: carLocations.id })

    const [ownedCar] = await tx
      .insert(reservations)
      .values({
        agencyId,
        publicRef: `DOC-CAR-OWN-${suffix}`,
        customerId: customerOwner!.id,
        module: "car",
        source: "internal",
        status: "confirmed",
        originalCurrency: "TND",
        originalAmount: "250.00",
        tndAmount: "250.00",
      })
      .returning({
        id: reservations.id,
        publicRef: reservations.publicRef,
        guestAccessToken: reservations.guestAccessToken,
      })
    ownedCarRef = ownedCar!.publicRef
    ownedCarToken = ownedCar!.guestAccessToken
    await tx.insert(reservationCar).values({
      reservationId: ownedCar!.id,
      agencyId,
      categoryId: category!.id,
      pickupLocationId: pickupLoc!.id,
      dropoffLocationId: dropoffLoc!.id,
      pickupAt: new Date("2027-03-01T10:00:00Z"),
      dropoffAt: new Date("2027-03-05T10:00:00Z"),
      rentalDays: 4,
      driverFullName: "Owner Test",
      driverLicenseNumber: "LIC-TEST-001",
    })

    const [pendingCar] = await tx
      .insert(reservations)
      .values({
        agencyId,
        publicRef: `DOC-CAR-PEND-${suffix}`,
        customerId: customerOwner!.id,
        module: "car",
        source: "internal",
        status: "pending",
        originalCurrency: "TND",
        originalAmount: "180.00",
        tndAmount: "180.00",
      })
      .returning({
        id: reservations.id,
        publicRef: reservations.publicRef,
        guestAccessToken: reservations.guestAccessToken,
      })
    pendingCarRef = pendingCar!.publicRef
    pendingCarToken = pendingCar!.guestAccessToken
    await tx.insert(reservationCar).values({
      reservationId: pendingCar!.id,
      agencyId,
      categoryId: category!.id,
      pickupLocationId: pickupLoc!.id,
      dropoffLocationId: dropoffLoc!.id,
      pickupAt: new Date("2027-03-10T10:00:00Z"),
      dropoffAt: new Date("2027-03-12T10:00:00Z"),
      rentalDays: 2,
      driverFullName: "Pending Test",
      driverLicenseNumber: "LIC-TEST-002",
    })
  })

  // Facture émise UNIQUEMENT pour `ownedRef` (jamais pour `unpaidRef`) — la
  // même fonction que le vrai flux de confirmation, jamais un insert manuel.
  const invoiceResult = await generateInvoiceForReservation({
    agencyId,
    reservationId: ownedReservationId,
    actorUserId: randomUUID(),
  })
  assert.equal(
    invoiceResult.ok,
    true,
    "précondition test : la facture doit avoir été générée",
  )
})

after(async () => {
  if (!dbAvailable) return
  await withSystemContext(async (tx) => {
    await tx
      .delete(partnerInvoices)
      .where(eq(partnerInvoices.agencyId, agencyId))
    // reservation_car.reservationId -> reservations.id est ON DELETE CASCADE
    // (lib/db/schema/cars.ts) : supprimer `reservations` nettoie déjà les
    // lignes reservation_car, aucune suppression explicite nécessaire.
    await tx.delete(reservations).where(eq(reservations.agencyId, agencyId))
    await tx.delete(carCategories).where(eq(carCategories.agencyId, agencyId))
    await tx.delete(carLocations).where(eq(carLocations.agencyId, agencyId))
    await tx.delete(customers).where(eq(customers.agencyId, agencyId))
    await tx.delete(agencies).where(eq(agencies.id, agencyId))
  })
})

function invoiceReq(ref: string, token?: string) {
  const url = token
    ? `http://localhost:3000/api/booking/invoice/${ref}?token=${token}`
    : `http://localhost:3000/api/booking/invoice/${ref}`
  return invoiceGet(new NextRequest(url), { params: Promise.resolve({ ref }) })
}

function voucherReq(ref: string, token?: string) {
  const url = token
    ? `http://localhost:3000/api/booking/voucher/${ref}?token=${token}`
    : `http://localhost:3000/api/booking/voucher/${ref}`
  return voucherGet(new NextRequest(url), { params: Promise.resolve({ ref }) })
}

function carVoucherReq(ref: string, token?: string) {
  const url = token
    ? `http://localhost:3000/api/cars/voucher/${ref}?token=${token}`
    : `http://localhost:3000/api/cars/voucher/${ref}`
  return carVoucherGet(new NextRequest(url), {
    params: Promise.resolve({ ref }),
  })
}

/* ---------------------------- Facture (item E) --------------------------- */

test("facture : propriétaire (ref + token corrects) -> 200 PDF", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  const res = await invoiceReq(ownedRef, ownedToken)
  assert.equal(res.status, 200)
  assert.equal(res.headers.get("Content-Type"), "application/pdf")
})

test("facture : autre client (ref correct + token d'UNE AUTRE réservation) -> 404, jamais 200", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  const res = await invoiceReq(ownedRef, foreignToken)
  assert.equal(res.status, 404)
  const body = await res.json()
  assert.equal(body.error, "not_found")
})

test("facture : non authentifié / sans token -> accès refusé (404)", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  const res = await invoiceReq(ownedRef)
  assert.equal(res.status, 404)
})

test("facture : document pas encore disponible (réservation confirmée mais aucune facture émise) -> refus propre, jamais une exception", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  const res = await invoiceReq(unpaidRef, unpaidToken)
  assert.equal(res.status, 404)
  const body = await res.json()
  assert.equal(body.error, "invoice_unavailable")
})

/* ---------------------------- Voucher (item F) ---------------------------- */

test("voucher : propriétaire (ref + token corrects, réservation confirmée) -> 200 PDF", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  const res = await voucherReq(ownedRef, ownedToken)
  assert.equal(res.status, 200)
  assert.equal(res.headers.get("Content-Type"), "application/pdf")
})

test("voucher : autre client (ref correct + token d'UNE AUTRE réservation) -> 404, jamais 200", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  const res = await voucherReq(ownedRef, foreignToken)
  assert.equal(res.status, 404)
  const body = await res.json()
  assert.equal(body.error, "not_found")
})

test("voucher : non authentifié / sans token -> accès refusé (404)", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  const res = await voucherReq(ownedRef)
  assert.equal(res.status, 404)
})

test("voucher : document pas encore disponible (réservation pas encore confirmée) -> refus propre, jamais une exception", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  const res = await voucherReq(pendingRef, pendingToken)
  assert.equal(res.status, 404)
  const body = await res.json()
  assert.equal(body.error, "voucher_unavailable")
})

/* ------------------- Voucher Voiture (VOUCHER-CAR-TRANSFER-DATA-01) ------------------- */

test("voucher voiture : propriétaire (ref + token corrects, réservation confirmée) -> 200 PDF", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  const res = await carVoucherReq(ownedCarRef, ownedCarToken)
  assert.equal(res.status, 200)
  assert.equal(res.headers.get("Content-Type"), "application/pdf")
  const pdf = Buffer.from(await res.arrayBuffer())
  assert.ok(
    pdf.length > 0 && pdf.subarray(0, 5).toString("latin1") === "%PDF-",
    "le corps de la réponse doit être un PDF réel, pas un buffer vide",
  )
})

test("voucher voiture : autre client (ref correct + token d'UNE AUTRE réservation) -> 404, jamais 200", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  // Réutilise `foreignToken` (fixture hôtel ci-dessus) : la garde
  // publicRef+token ne doit jamais dépendre du module pour refuser l'accès.
  const res = await carVoucherReq(ownedCarRef, foreignToken)
  assert.equal(res.status, 404)
  const body = await res.json()
  assert.equal(body.error, "not_found")
})

test("voucher voiture : non authentifié / sans token -> accès refusé (404)", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  const res = await carVoucherReq(ownedCarRef)
  assert.equal(res.status, 404)
})

test("voucher voiture : document pas encore disponible (réservation pas encore confirmée) -> refus propre, jamais une exception", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  const res = await carVoucherReq(pendingCarRef, pendingCarToken)
  assert.equal(res.status, 404)
  const body = await res.json()
  assert.equal(body.error, "voucher_unavailable")
})
