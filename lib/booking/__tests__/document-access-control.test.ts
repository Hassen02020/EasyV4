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
import { agencies, customers, reservations, reservationHotel, partnerInvoices } from "@/lib/db/schema"
import { generateInvoiceForReservation } from "@/lib/finance/invoice-actions"
import { GET as invoiceGet } from "@/app/api/booking/invoice/[ref]/route"
import { GET as voucherGet } from "@/app/api/booking/voucher/[ref]/route"

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
      .values({ agencyId, firstName: "Owner", lastName: "Test", email: `owner-${suffix}@example.com` })
      .returning({ id: customers.id })
    const [customerOther] = await tx
      .insert(customers)
      .values({ agencyId, firstName: "Other", lastName: "Client", email: `other-${suffix}@example.com` })
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
      .returning({ id: reservations.id, publicRef: reservations.publicRef, guestAccessToken: reservations.guestAccessToken })
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
      .returning({ publicRef: reservations.publicRef, guestAccessToken: reservations.guestAccessToken })
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
      .returning({ id: reservations.id, publicRef: reservations.publicRef, guestAccessToken: reservations.guestAccessToken })
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
  })

  // Facture émise UNIQUEMENT pour `ownedRef` (jamais pour `unpaidRef`) — la
  // même fonction que le vrai flux de confirmation, jamais un insert manuel.
  const invoiceResult = await generateInvoiceForReservation({
    agencyId,
    reservationId: ownedReservationId,
    actorUserId: randomUUID(),
  })
  assert.equal(invoiceResult.ok, true, "précondition test : la facture doit avoir été générée")
})

after(async () => {
  if (!dbAvailable) return
  await withSystemContext(async (tx) => {
    await tx.delete(partnerInvoices).where(eq(partnerInvoices.agencyId, agencyId))
    await tx.delete(reservations).where(eq(reservations.agencyId, agencyId))
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
