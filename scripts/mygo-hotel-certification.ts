#!/usr/bin/env tsx
/**
 * mygo-hotel-certification.ts
 *
 * Certification E2E du cycle de vie d'une réservation hôtel MyGo :
 * Search → Confirm → DB writes → Financials → Wallet debit → Cancellation.
 *
 * Couvre 4 scénarios :
 *   S1. NORMAL  — flux doré complet (confirm + cancel)
 *   S2. TIMEOUT_AFTER_ACCEPT — réconciliation post-timeout via BookingList
 *   S3. DB_FAILURE — compensation myGo après échec d'écriture locale
 *   S4. NO_AVAILABILITY — refus fournisseur avant toute écriture locale
 *
 * Architecture :
 *   - Serveur HTTP embarqué (http.createServer) wrappant les handlers purs de
 *     lib/mygo/virtual-supplier/engine.ts — aucun Next.js requis.
 *   - MyGoClient avec configOverride pointant vers ce serveur (port éphémère).
 *   - Corps transactionnel de createReservationFromDraft reproduit directement
 *     via les fonctions exportées, bypass de la session Supabase (pattern
 *     identique à wallet-financial-certification.ts).
 *   - Agence de certification créée et détruite dans le même run.
 *
 * Exit code 1 si au moins un test FAIL.
 *
 * Usage :
 *   DATABASE_URL=... npx tsx scripts/mygo-hotel-certification.ts
 */

import { config } from "dotenv"
import { resolve } from "path"
config({ path: resolve(process.cwd(), ".env.local") })
config({ path: resolve(process.cwd(), ".env") })

import * as http from "node:http"
import { randomUUID, createHash } from "node:crypto"
import { eq, and, sql, isNull, gte, lte } from "drizzle-orm"

import { withTenantContext, withSystemContext } from "@/lib/db/tenant-context"
import {
  agencies,
  customers,
  reservations,
  reservationHotel,
  reservationFinancials,
  partnerCreditMovements,
  auditEvents,
  payments,
  walletLedger,
  commissionSettlements,
} from "@/lib/db/schema"
import { computePriceBreakdown } from "@/lib/booking/pricing"
import { applyMargin } from "@/lib/pro/pricing"
import { recordReservationFinancials } from "@/lib/finance/reservation-financials"
import { creditPlatformCommission, PLATFORM_COMMISSION_WALLET_ID } from "@/lib/finance/platform-commission"
import { recordCancellationFinancials } from "@/lib/finance/cancellation-financials"
import { renderVoucherPdf } from "@/lib/pdf/voucher-hotel"
import { debitPartnerCredit, parseTnd as parseAgencyTnd, formatTnd } from "@/lib/pro/booking-actions"
import { pgErrorCode } from "@/lib/db/pg-error"
import type { BookingDraft, TravelerInput } from "@/lib/booking/schemas"
import {
  buildMyGoBookingRequest,
  authoritativeUnitPrice,
  extractHotelProviderMetadata,
  classifyMyGoBookingError,
  isAmbiguousBookingError,
  reconcileAmbiguousBooking,
} from "@/lib/booking/hotel-provider-booking"
import { MyGoClient } from "@/lib/mygo/client"
import { mapBookingListItemToConfirmation } from "@/lib/mygo"
import { mapHotelOffer } from "@/lib/mygo/mappers"
import type { CircuitBreaker } from "@/lib/mygo/circuit-breaker"
import type { ResolvedMyGoAccess } from "@/lib/hotel-suppliers/tenant/live-resolution"
import { MyGoDriver } from "@/lib/hotel-suppliers/mygo/driver"

import {
  handleHotelSearch,
  handleBookingCreation,
  handleBookingCancellation,
  handleBookingList,
  handleListCity,
  handleListBoarding,
} from "@/lib/mygo/virtual-supplier/engine"
import { setScenario, resetScenario } from "@/lib/mygo/virtual-supplier/scenarios"

/* -------------------------------------------------------------------------- */
/* nextPublicRef — répliqué depuis lib/booking/actions.ts pour éviter la       */
/* dépendance transitive vers server-only (via lib/pro/server-context.ts).     */
/* -------------------------------------------------------------------------- */

function _pad(n: number, w = 6) {
  return String(n).padStart(w, "0")
}

async function nextPublicRef(
  db: ReturnType<typeof import("@/lib/db/client").getDb> | Parameters<Parameters<ReturnType<typeof import("@/lib/db/client").getDb>["transaction"]>[0]>[0],
  agencyId: string,
): Promise<string> {
  const year = new Date().getFullYear()
  const prefix = `TG-${year}-`
  const [row] = await (db as ReturnType<typeof import("@/lib/db/client").getDb>)
    .select({ maxRef: sql<string | null>`MAX(${reservations.publicRef})` })
    .from(reservations)
    .where(and(eq(reservations.agencyId, agencyId), sql`${reservations.publicRef} LIKE ${prefix + "%"}`))
  const maxRef = row?.maxRef
  const max = maxRef ? Number(maxRef.slice(prefix.length)) : 0
  return `${prefix}${_pad(Number.isFinite(max) ? max + 1 : 1)}`
}

/* -------------------------------------------------------------------------- */
/* Harness                                                                      */
/* -------------------------------------------------------------------------- */

type Row = { id: string; label: string; status: "PASS" | "FAIL"; details: string }
const results: Row[] = []

function record(id: string, label: string, ok: boolean, details: string) {
  results.push({ id, label, status: ok ? "PASS" : "FAIL", details })
  const icon = ok ? "✅ PASS" : "❌ FAIL"
  console.log(`${icon} [${id}] ${label}\n    ${details}`)
}

function assertTrue(cond: unknown, msg: string): void {
  if (!cond) throw new Error("ASSERT: " + msg)
}

function assertClose(a: number, b: number, eps: number, msg: string): void {
  if (Math.abs(a - b) > eps) throw new Error(`ASSERT: ${msg} — got ${a}, expected ~${b} (eps ${eps})`)
}

/* -------------------------------------------------------------------------- */
/* Embedded Virtual MyGo HTTP server                                           */
/* -------------------------------------------------------------------------- */

type MethodHandler = (body: unknown) => unknown | Promise<{ status: number; json: unknown; delayMs?: number }>

const METHOD_MAP: Record<string, MethodHandler> = {
  ListCity:             handleListCity,
  ListBoarding:         handleListBoarding,
  HotelSearch:          handleHotelSearch,
  BookingCreation:      handleBookingCreation,
  BookingCancellation:  handleBookingCancellation,
  BookingList:          handleBookingList,
}

function startVirtualServer(): Promise<{ url: string; close: () => Promise<void> }> {
  return new Promise((resolve, reject) => {
    const server = http.createServer(async (req, res) => {
      const parts = (req.url ?? "").split("/")
      const method = parts[parts.length - 1]!.split("?")[0]!

      let body = ""
      req.on("data", (c: Buffer) => (body += c.toString()))
      req.on("end", async () => {
        let parsed: unknown = {}
        try { parsed = JSON.parse(body || "{}") } catch { /* ignore */ }

        const handler = METHOD_MAP[method]
        if (!handler) {
          res.writeHead(404)
          res.end(JSON.stringify({ error: `Unknown method: ${method}` }))
          return
        }

        try {
          const result = await (handler as (b: unknown) => Promise<{ status: number; json: unknown; delayMs?: number }> | unknown)(parsed)
          let status = 200
          let json: unknown = result
          let delayMs = 0

          if (result && typeof result === "object" && "json" in (result as object)) {
            const r = result as { status: number; json: unknown; delayMs?: number }
            status = r.status
            json = r.json
            delayMs = r.delayMs ?? 0
          }

          if (delayMs > 0) await new Promise<void>(r => setTimeout(r, delayMs))

          res.writeHead(status, { "Content-Type": "application/json" })
          res.end(JSON.stringify(json))
        } catch (err) {
          res.writeHead(500)
          res.end(JSON.stringify({ error: String(err) }))
        }
      })
    })

    server.listen(0, "127.0.0.1", () => {
      const addr = server.address() as { port: number }
      const url = `http://127.0.0.1:${addr.port}`
      resolve({
        url,
        close: () => new Promise<void>((r, j) => server.close((err) => err ? j(err) : r())),
      })
    })
    server.on("error", reject)
  })
}

/* -------------------------------------------------------------------------- */
/* MyGoClient factory (custom config → embedded server)                        */
/* -------------------------------------------------------------------------- */

function makeVirtualClient(baseUrl: string): MyGoClient {
  // Bypass circuit breaker + caches avec configOverride direct
  // MYGO_TIMEOUT_MS réglé court pour observer TIMEOUT_AFTER_ACCEPT rapidement
  const config = {
    mode: "virtual" as const,
    baseUrl,
    login: "cert-test-login",
    password: "cert-test-password",
    timeoutMs: 500,     // < SIMULATED_TIMEOUT_DELAY_MS (3000ms) → vrai timeout pour S2
    maxRetries: 0,      // pas de retry auto (les tests vérifient l'état exact)
    staticDataTtlSeconds: 0,
    searchTtlSeconds: 0,
  }
  // Breaker no-op minimal (jamais bloquant en test)
  const noopBreaker = {
    isOpen: () => false,
    onSuccess: () => {},
    onFailure: () => {},
    getReopensAt: () => null,
  }
  return new MyGoClient(noopBreaker as unknown as CircuitBreaker, config)
}

function makeAccess(client: MyGoClient): ResolvedMyGoAccess {
  // Driver wrappant le même client — présent pour satisfaire le type
  return { client, driver: new MyGoDriver(client), accountId: null }
}

/* -------------------------------------------------------------------------- */
/* Fixtures de draft / traveler                                                 */
/* -------------------------------------------------------------------------- */

function makeDraft(token: string, hotelId: number, cityId: number, roomId: number, boardingId: number): BookingDraft {
  return {
    module: "hotel",
    offerId: String(hotelId),
    offerLabel: `Virtual Hotel ${hotelId}`,
    startDate: "2026-10-15",
    endDate: "2026-10-18",
    adults: 2,
    children: 0,
    currency: "TND",
    unitPriceTnd: 0,   // ignoré — authoritativeUnitPrice() remplace
    unitChildPriceTnd: 0,
    metadata: {
      myGoToken: token,
      cityId,
      hotelId,
      boardingId,
      roomId,
      childrenAges: [],
    },
  }
}

const TEST_TRAVELER: TravelerInput = {
  civility: "M",
  firstName: "Mohamed",
  lastName: "Certif",
  email: `cert-mygo-${Date.now()}@example.com`,
  phone: "+216 20 000 000",
  civicId: "08123456",
  civicIdType: "cin",
  birthDate: "1985-06-15",
  nationality: "TN",
}

const CERT_USER_ID = randomUUID()
const TND_EPS = 0.01

/* -------------------------------------------------------------------------- */
/* Core booking replication (sans session Supabase)                            */
/* -------------------------------------------------------------------------- */

interface BookReservationInput {
  agencyId: string
  draft: BookingDraft
  traveler: TravelerInput
  client: MyGoClient
  /** Si true : forcer DB_FAILURE après confirm myGo (test de compensation) */
  forceDbFailure?: boolean
}

type BookReservationResult =
  | {
      ok: true
      reservationId: string
      publicRef: string
      myGoBookingId: number
      supplierPriceTnd: number
      agencyPriceTnd: number
    }
  | {
      ok: false
      error: string
      kind?: string
      compensated?: boolean
      myGoBookingId?: number
    }

async function bookReservation(input: BookReservationInput): Promise<BookReservationResult> {
  const { agencyId, draft, traveler, client } = input
  const access = makeAccess(client)

  // ---- 1. Confirm with provider ----
  const providerMeta = extractHotelProviderMetadata(draft.metadata as Record<string, unknown>)
  if (!providerMeta) return { ok: false, error: "NO_PROVIDER_META" }

  let myGoBooking
  try {
    myGoBooking = await client.createBooking(buildMyGoBookingRequest({ draft, traveler, providerMeta }))
  } catch (err) {
    const kind = classifyMyGoBookingError(err)
    if (isAmbiguousBookingError(kind)) {
      // Try reconciliation
      try {
        const bookings = await client.listBookings({ hotel: providerMeta.hotelId, currency: "TND" })
        const mapped = bookings.map(mapBookingListItemToConfirmation)
        const reconciled = reconcileAmbiguousBooking(
          mapped.map(b => ({ bookingId: b.bookingId, hotelId: b.hotelId, checkIn: draft.startDate, checkOut: draft.endDate ?? draft.startDate, state: b.state ?? undefined, createdAt: undefined })),
          { hotelId: providerMeta.hotelId ?? Number(draft.offerId), checkIn: draft.startDate, checkOut: draft.endDate ?? draft.startDate },
          Date.now(),
        )
        if (reconciled) {
          const matched = mapped.find(b => b.bookingId === (reconciled as unknown as { bookingId: number }).bookingId)
          if (matched) { myGoBooking = matched }
        }
      } catch { /* reconciliation failed */ }
    }
    if (!myGoBooking) {
      return { ok: false, error: String(err), kind: classifyMyGoBookingError(err) }
    }
  }

  if (!myGoBooking) return { ok: false, error: "NO_BOOKING_RETURNED" }

  // ---- 2. DB_FAILURE injection ----
  if (input.forceDbFailure) {
    // Compensate: cancel at provider (best-effort)
    let compensated = false
    try {
      await client.cancelBooking({ bookingId: myGoBooking.bookingId })
      compensated = true
    } catch { /* best-effort */ }
    return { ok: false, error: "SIMULATED_DB_FAILURE", compensated, myGoBookingId: myGoBooking.bookingId }
  }

  // ---- 3. Apply margin ----
  // Use DEFAULT_MARGINS (10% percent for hotel) — no DB margin lookup needed in test
  const hotelMarginRule = { marginType: "percent" as const, marginValue: 10, isActive: true, commissionPercent: 5 }
  const agencyHotelPrice = applyMargin(myGoBooking.totalPrice, hotelMarginRule)
  const breakdown = computePriceBreakdown({
    ...authoritativeUnitPrice(agencyHotelPrice, draft.adults),
    adults: draft.adults,
    children: draft.children,
  })

  // ---- 4. Idempotency key ----
  const idempotencyKey = createHash("sha256")
    .update(JSON.stringify({ draft, traveler, agencyId }))
    .digest("hex")
    .slice(0, 32)

  // ---- 5. DB transaction ----
  const result = await withTenantContext(
    { agencyId, userId: CERT_USER_ID, isSuperAdmin: false },
    async (tx) => {
      // Upsert customer
      const [customerRow] = await tx
        .insert(customers)
        .values({
          agencyId,
          civility: traveler.civility,
          firstName: traveler.firstName,
          lastName: traveler.lastName,
          email: traveler.email,
          phone: traveler.phone,
          civicId: traveler.civicId,
          civicIdType: traveler.civicIdType,
        })
        .onConflictDoNothing()
        .returning({ id: customers.id })

      let customerId: string
      if (customerRow) {
        customerId = customerRow.id
      } else {
        const [existing] = await tx.select({ id: customers.id }).from(customers)
          .where(and(eq(customers.agencyId, agencyId), eq(customers.email, traveler.email!)))
          .limit(1)
        customerId = existing!.id
      }

      const publicRef = await nextPublicRef(tx, agencyId)

      let inserted: { id: string; publicRef: string; guestAccessToken: string }[]
      try {
        inserted = await tx.transaction((tx2) =>
          tx2.insert(reservations).values({
            agencyId,
            publicRef,
            customerId,
            module: draft.module,
            source: "internal",
            status: "pending",
            originalCurrency: draft.currency,
            originalAmount: String(breakdown.totalTnd),
            tndAmount: String(breakdown.totalTnd),
            depositAmount: String(breakdown.depositTnd),
            depositPaid: "0",
            guestIdempotencyKey: idempotencyKey,
            providerPayload: {
              offerId: draft.offerId,
              startDate: draft.startDate,
              endDate: draft.endDate,
              adults: draft.adults,
              children: draft.children,
              myGoBookingId: myGoBooking!.bookingId,
              myGoState: myGoBooking!.state ?? null,
            },
          }).returning({ id: reservations.id, publicRef: reservations.publicRef, guestAccessToken: reservations.guestAccessToken }),
        )
      } catch (err) {
        if (pgErrorCode(err) === "23505") return { conflict: true as const }
        throw err
      }

      const reservationId = inserted[0]!.id

      // reservation_hotel
      const confirmedRoom = myGoBooking!.rooms[0]
      await tx.insert(reservationHotel).values({
        reservationId,
        agencyId,
        providerBookingId: String(myGoBooking!.bookingId),
        hotelId: myGoBooking!.hotelId ?? Number(draft.offerId),
        hotelName: myGoBooking!.hotelName ?? draft.offerLabel,
        cityId: providerMeta!.cityId,
        checkIn: draft.startDate,
        checkOut: draft.endDate ?? draft.startDate,
        nights: 3,
        adults: draft.adults,
        childrenAges: providerMeta!.childrenAges ?? [],
        boardCode: confirmedRoom?.boardingCode ?? providerMeta!.boardingCode,
        boardName: confirmedRoom?.boardingName,
        rooms: myGoBooking!.rooms,
      })

      // audit created
      await tx.insert(auditEvents).values({
        agencyId,
        action: "reservation.created",
        entityType: "reservation",
        entityId: reservationId,
        diff: { module: draft.module, publicRef, total: breakdown.totalTnd },
      })

      // financials
      const { commissionAmount } = await recordReservationFinancials({
        tx,
        reservationId,
        supplierPriceTnd: myGoBooking!.totalPrice,
        salePriceTnd: agencyHotelPrice,
        commissionPercent: hotelMarginRule.commissionPercent,
      })

      // platform commission
      await creditPlatformCommission(tx, {
        reservationId,
        commissionAmount,
        description: `Commission hôtel — ${publicRef}`,
      })

      // wallet debit
      const debitResult = await debitPartnerCredit({
        agencyId,
        amountTnd: breakdown.totalTnd,
        reference: publicRef,
        description: `Réservation hôtel — ${draft.offerLabel}`,
        createdByUserId: CERT_USER_ID,
        reservationId,
        idempotencyKey: `cert-debit:${reservationId}`,
        txOverride: tx as Parameters<typeof debitPartnerCredit>[0]["txOverride"],
      })

      if (!debitResult.ok) throw new Error(`DEBIT_FAILED:${debitResult.message}`)

      // confirm reservation
      await tx.update(reservations)
        .set({ status: "confirmed", confirmedAt: new Date(), updatedAt: new Date() })
        .where(eq(reservations.id, reservationId))

      await tx.insert(payments).values({
        agencyId,
        reservationId,
        psp: "manual",
        method: "wallet",
        originalCurrency: "TND",
        originalAmount: breakdown.totalTnd.toFixed(2),
        tndAmount: breakdown.totalTnd.toFixed(2),
        kind: "deposit",
        status: "captured",
        capturedAt: new Date(),
      })

      return { reservationId, publicRef, conflict: false as const }
    },
  )

  if ("conflict" in result && result.conflict) {
    return { ok: false, error: "IDEMPOTENCY_CONFLICT" }
  }

  return {
    ok: true,
    reservationId: (result as { reservationId: string }).reservationId,
    publicRef: (result as { publicRef: string }).publicRef,
    myGoBookingId: myGoBooking.bookingId,
    supplierPriceTnd: myGoBooking.totalPrice,
    agencyPriceTnd: agencyHotelPrice,
  }
}

/* -------------------------------------------------------------------------- */
/* Cancel replication                                                           */
/* -------------------------------------------------------------------------- */

async function cancelReservation(agencyId: string, reservationId: string, client: MyGoClient): Promise<{
  ok: boolean; feeTnd: number; refundTnd: number; error?: string
}> {
  // Fetch providerBookingId
  const row = await withTenantContext({ agencyId, userId: CERT_USER_ID, isSuperAdmin: false }, async (tx) => {
    const [r] = await tx.select({
      providerBookingId: reservationHotel.providerBookingId,
      tndAmount: reservations.tndAmount,
    })
      .from(reservations)
      .leftJoin(reservationHotel, eq(reservationHotel.reservationId, reservations.id))
      .where(eq(reservations.id, reservationId))
      .limit(1)
    return r ?? null
  })

  if (!row?.providerBookingId) return { ok: false, feeTnd: 0, refundTnd: 0, error: "NO_PROVIDER_BOOKING_ID" }

  // Cancel at provider
  let feeTnd = 0
  try {
    const cancellation = await client.cancelBooking({ bookingId: Number(row.providerBookingId), currency: "TND" })
    feeTnd = cancellation.fee
  } catch (err) {
    return { ok: false, feeTnd: 0, refundTnd: 0, error: String(err) }
  }

  const tndAmount = parseAgencyTnd(row.tndAmount)
  const refundTnd = Math.max(0, tndAmount - feeTnd)
  const cancelledAt = new Date()

  await withTenantContext({ agencyId, userId: CERT_USER_ID, isSuperAdmin: false }, async (tx) => {
    if (refundTnd >= 0.001) {
      const [agency] = await tx.select({ id: agencies.id, depositBalance: agencies.depositBalance })
        .from(agencies)
        .where(eq(agencies.id, agencyId))
        .for("update")

      const currentBalance = parseAgencyTnd(agency!.depositBalance)
      const newBalance = currentBalance + refundTnd
      const newBalanceTnd = formatTnd(newBalance)

      await tx.insert(partnerCreditMovements).values({
        agencyId,
        movementType: "refund",
        amount: formatTnd(refundTnd),
        balanceAfter: newBalanceTnd,
        reference: `REFUND-CERT-${reservationId.slice(-8)}`,
        description: `Remboursement annulation cert (frais: ${formatTnd(feeTnd)} DT)`,
        reservationId,
        createdByUserId: CERT_USER_ID,
      })

      await tx.execute(sql`SELECT set_agency_deposit_balance(${agencyId}::uuid, ${newBalanceTnd}::numeric)`)
    }

    await recordCancellationFinancials({
      tx,
      reservationId,
      cancellationFeeTnd: feeTnd,
      refundAmountTnd: refundTnd,
      reason: "Annulation certification E2E",
      cancelledAt,
    })

    await tx.update(reservations)
      .set({ status: "cancelled", cancelledAt })
      .where(eq(reservations.id, reservationId))

    await tx.insert(auditEvents).values({
      agencyId,
      actorUserId: CERT_USER_ID,
      entityType: "reservation",
      entityId: reservationId,
      action: "reservation.cancelled",
      diff: { feeTnd, refundTnd },
    })
  })

  return { ok: true, feeTnd, refundTnd }
}

/* -------------------------------------------------------------------------- */
/* DB helpers                                                                   */
/* -------------------------------------------------------------------------- */

async function getFinancials(reservationId: string) {
  return withSystemContext(async (tx) => {
    const [row] = await tx.select()
      .from(reservationFinancials)
      .where(eq(reservationFinancials.reservationId, reservationId))
      .limit(1)
    return row ?? null
  })
}

async function getReservationStatus(agencyId: string, reservationId: string) {
  return withTenantContext({ agencyId, userId: CERT_USER_ID, isSuperAdmin: false }, async (tx) => {
    const [row] = await tx.select({ status: reservations.status, tndAmount: reservations.tndAmount })
      .from(reservations)
      .where(eq(reservations.id, reservationId))
      .limit(1)
    return row ?? null
  })
}

async function getAgencyBalance(agencyId: string): Promise<number> {
  const [row] = await withSystemContext(async (tx) =>
    tx.select({ depositBalance: agencies.depositBalance }).from(agencies).where(eq(agencies.id, agencyId)).limit(1)
  )
  return parseAgencyTnd(row!.depositBalance)
}

async function getWalletLedgerEntry(reservationId: string) {
  return withSystemContext(async (tx) => {
    const [row] = await tx.select()
      .from(walletLedger)
      .where(eq(walletLedger.reservationId, reservationId))
      .limit(1)
    return row ?? null
  })
}

/* -------------------------------------------------------------------------- */
/* Scenario helpers                                                             */
/* -------------------------------------------------------------------------- */

async function doSearch(client: MyGoClient): Promise<{ token: string; hotelId: number; cityId: number; roomId: number; boardingId: number; price: number } | null> {
  const raw = await client.searchHotels({
    cityId: 1,
    checkIn: "2026-10-15",
    checkOut: "2026-10-18",
    rooms: [{ adults: 2 }],
    currency: "TND",
    filters: { onlyAvailable: true },
  })
  const firstRaw = raw.hotels[0]
  if (!firstRaw) return null
  const first = mapHotelOffer(firstRaw)
  const boarding = first.boardings[0]
  const pax = boarding?.pax[0]
  const room = pax?.rooms[0]
  if (!boarding || !pax || !room) return null
  return {
    token: first.token,
    hotelId: first.hotel.id,
    cityId: 1,
    roomId: room.id,
    boardingId: boarding.id,
    price: room.price,
  }
}

/* -------------------------------------------------------------------------- */
/* Setup / teardown                                                             */
/* -------------------------------------------------------------------------- */

async function setupCertAgency(): Promise<{ agencyId: string }> {
  const slug = `cert-mygo-${Date.now()}`
  const [agency] = await withSystemContext(async (tx) =>
    tx.insert(agencies).values({
      slug,
      name: "MyGo Certification Agency",
      agencyType: "partner",
      depositBalance: "5000.000",  // 5000 TND — suffisant pour couvrir les réservations de test
    }).returning({ id: agencies.id })
  )
  return { agencyId: agency!.id }
}

async function teardownCertAgency(agencyId: string): Promise<void> {
  // Pas de suppression — NEVER DELETE FINANCIAL TRANSACTIONS.
  // On laisse les données de certification avec le slug cert-mygo-* pour inspection.
  console.log(`\n[teardown] Agence de certification conservée pour inspection : ${agencyId}`)
}

/* -------------------------------------------------------------------------- */
/* Main                                                                         */
/* -------------------------------------------------------------------------- */

async function main() {
  console.log("\n=== MyGo Hotel E2E Certification ===\n")

  // 1. Start embedded virtual server
  const server = await startVirtualServer()
  console.log(`[server] Virtual MyGo embarqué sur ${server.url}\n`)

  const client = makeVirtualClient(server.url)

  // 2. Setup cert agency
  const { agencyId } = await setupCertAgency()
  console.log(`[setup] Agence de certification : ${agencyId}\n`)

  /* ======================================================================== */
  /* S1 — NORMAL flow                                                          */
  /* ======================================================================== */
  console.log("--- S1 : NORMAL flow ---")
  resetScenario()

  try {
    const search = await doSearch(client)
    record("S1.search", "NORMAL: HotelSearch renvoie au moins un hôtel disponible", !!search, search ? `hotelId=${search.hotelId} price=${search.price}` : "aucun résultat")

    if (search) {
      const draft = makeDraft(search.token, search.hotelId, search.cityId, search.roomId, search.boardingId)
      const balanceBefore = await getAgencyBalance(agencyId)

      const bookResult = await bookReservation({ agencyId, draft, traveler: TEST_TRAVELER, client })
      record("S1.confirm", "NORMAL: BookingCreation réussie", bookResult.ok, bookResult.ok ? `id=${bookResult.reservationId} myGoId=${bookResult.myGoBookingId}` : (bookResult as { error: string }).error)

      if (bookResult.ok) {
        // Vérifier statut DB
        const status = await getReservationStatus(agencyId, bookResult.reservationId)
        record("S1.status", "NORMAL: réservation confirmée en DB", status?.status === "confirmed", `status=${status?.status}`)

        // Vérifier financials
        const fin = await getFinancials(bookResult.reservationId)
        record("S1.financials.exists", "NORMAL: reservation_financials créé", !!fin, fin ? `supplierPrice=${fin.supplierPriceTnd} salePrice=${fin.salePriceTnd}` : "absent")

        if (fin) {
          const margin = parseFloat(fin.salePriceTnd!) - parseFloat(fin.supplierPriceTnd!)
          const expectedMargin = parseFloat(fin.salePriceTnd!) - parseFloat(fin.supplierPriceTnd!)
          record("S1.financials.margin", "NORMAL: marginAmount = salePrice - supplierPrice", Math.abs(parseFloat(fin.marginAmount!) - expectedMargin) < TND_EPS,
            `margin=${fin.marginAmount} computed=${margin.toFixed(2)}`)

          const rate = parseFloat(fin.commissionPercent ?? "0")
          const expectedComm = Math.round(parseFloat(fin.marginAmount!) * (rate / 100) * 100) / 100
          record("S1.financials.commission", "NORMAL: commissionAmount = ROUND(margin×rate/100, 2)", Math.abs(parseFloat(fin.commissionAmount!) - expectedComm) < TND_EPS,
            `commission=${fin.commissionAmount} expected=${expectedComm} rate=${rate}`)

          // Vérifier walletLedger commission
          const walletEntry = await getWalletLedgerEntry(bookResult.reservationId)
          record("S1.wallet.commission", "NORMAL: walletLedger entrée commission créée",
            !!walletEntry && walletEntry.category === "commission",
            walletEntry ? `id=${walletEntry.id} amount=${walletEntry.amount} category=${walletEntry.category}` : "absent")
        }

        // Voucher PDF
        try {
          const voucherBuf = await renderVoucherPdf({
            publicRef: bookResult.publicRef,
            customerName: `${TEST_TRAVELER.firstName} ${TEST_TRAVELER.lastName}`,
            hotelName: draft.offerLabel,
            checkIn: draft.startDate,
            checkOut: draft.endDate!,
            nights: 3,
            adults: draft.adults,
            children: draft.children ?? 0,
            totalTnd: parseFloat(status?.tndAmount ?? "0"),
            paymentStatus: "paid",
            agencyName: "MyGo Certification Agency",
          }, "fr")
          record("S1.voucher", "NORMAL: voucher PDF généré", voucherBuf.length > 1000, `size=${voucherBuf.length} bytes`)
        } catch (err) {
          record("S1.voucher", "NORMAL: voucher PDF généré", false, String(err))
        }

        // Vérifier débit wallet
        const balanceAfter = await getAgencyBalance(agencyId)
        const amountDebited = balanceBefore - balanceAfter
        record("S1.wallet.debit", "NORMAL: wallet débité du prix agence", amountDebited > 0 && Math.abs(amountDebited - parseFloat(status?.tndAmount ?? "0")) < TND_EPS,
          `before=${balanceBefore.toFixed(3)} after=${balanceAfter.toFixed(3)} debited=${amountDebited.toFixed(3)}`)

        // Annulation
        const cancelResult = await cancelReservation(agencyId, bookResult.reservationId, client)
        record("S1.cancel", "NORMAL: annulation myGo réussie", cancelResult.ok, cancelResult.ok ? `fee=${cancelResult.feeTnd} refund=${cancelResult.refundTnd}` : cancelResult.error ?? "")

        if (cancelResult.ok) {
          const statusAfterCancel = await getReservationStatus(agencyId, bookResult.reservationId)
          record("S1.cancel.status", "NORMAL: réservation annulée en DB", statusAfterCancel?.status === "cancelled", `status=${statusAfterCancel?.status}`)

          const finAfterCancel = await getFinancials(bookResult.reservationId)
          record("S1.cancel.financials", "NORMAL: cancellationFee enregistré dans reservation_financials",
            finAfterCancel?.cancellationFee !== null && finAfterCancel?.refundAmount !== null,
            `fee=${finAfterCancel?.cancellationFee} refund=${finAfterCancel?.refundAmount}`)

          const balanceAfterRefund = await getAgencyBalance(agencyId)
          const refundApplied = balanceAfterRefund - balanceAfter
          record("S1.cancel.refund", "NORMAL: wallet recrédité du refundAmount",
            cancelResult.refundTnd === 0 || Math.abs(refundApplied - cancelResult.refundTnd) < TND_EPS,
            `refundTnd=${cancelResult.refundTnd} applied=${refundApplied.toFixed(3)}`)
        }
      }
    }
  } catch (err) {
    record("S1.error", "NORMAL: exception inattendue", false, String(err))
  }

  /* ======================================================================== */
  /* S2 — TIMEOUT_AFTER_ACCEPT + réconciliation                               */
  /* ======================================================================== */
  console.log("\n--- S2 : TIMEOUT_AFTER_ACCEPT + réconciliation ---")
  setScenario("TIMEOUT_AFTER_ACCEPT")

  try {
    const search = await (async () => {
      // Search doit se faire en mode NORMAL (le timeout ne concerne que BookingCreation)
      resetScenario()
      const r = await doSearch(client)
      setScenario("TIMEOUT_AFTER_ACCEPT")
      return r
    })()

    if (!search) {
      record("S2.search", "TIMEOUT_AFTER_ACCEPT: search disponible", false, "aucun résultat")
    } else {
      const draft = makeDraft(search.token, search.hotelId, search.cityId, search.roomId, search.boardingId)

      // bookReservation va obtenir un MyGoTimeoutError (timeoutMs=500 < delayMs=3000)
      // puis appeler reconcileAmbiguousBooking via listBookings → doit trouver la réservation
      const bookResult = await bookReservation({ agencyId, draft, traveler: { ...TEST_TRAVELER, email: `cert-timeout-${Date.now()}@example.com` }, client })

      record("S2.reconcile", "TIMEOUT_AFTER_ACCEPT: booking réconcilié via BookingList", bookResult.ok,
        bookResult.ok ? `myGoId=${bookResult.myGoBookingId} supplierPrice=${bookResult.supplierPriceTnd}` : `error=${("error" in bookResult ? bookResult.error : "")} kind=${("kind" in bookResult ? bookResult.kind : "")}`)

      if (bookResult.ok) {
        const fin = await getFinancials(bookResult.reservationId)
        record("S2.reconcile.financials", "TIMEOUT_AFTER_ACCEPT: financials enregistrés après réconciliation",
          !!fin && parseFloat(fin.supplierPriceTnd!) > 0,
          fin ? `supplierPrice=${fin.supplierPriceTnd} commission=${fin.commissionAmount}` : "absent")
      }
    }
  } catch (err) {
    record("S2.error", "TIMEOUT_AFTER_ACCEPT: exception inattendue", false, String(err))
  }

  /* ======================================================================== */
  /* S3 — DB_FAILURE → compensation myGo                                      */
  /* ======================================================================== */
  console.log("\n--- S3 : DB_FAILURE → compensation myGo ---")
  resetScenario()

  try {
    const search = await doSearch(client)

    if (!search) {
      record("S3.search", "DB_FAILURE: search disponible", false, "aucun résultat")
    } else {
      const draft = makeDraft(search.token, search.hotelId, search.cityId, search.roomId, search.boardingId)

      // On demande au harness de forcer le DB_FAILURE après confirmation myGo
      const bookResult = await bookReservation({ agencyId, draft, traveler: { ...TEST_TRAVELER, email: `cert-dbfail-${Date.now()}@example.com` }, client, forceDbFailure: true })

      record("S3.fail", "DB_FAILURE: bookReservation renvoie ok=false après DB failure",
        !bookResult.ok && ("error" in bookResult) && bookResult.error === "SIMULATED_DB_FAILURE",
        !bookResult.ok ? `error=${("error" in bookResult ? bookResult.error : "")}` : "inattendu ok=true")

      record("S3.compensated", "DB_FAILURE: myGo booking annulé en compensation (best-effort)",
        !bookResult.ok && "compensated" in bookResult && bookResult.compensated === true,
        !bookResult.ok && "myGoBookingId" in bookResult ? `myGoBookingId=${bookResult.myGoBookingId} compensated=${("compensated" in bookResult ? bookResult.compensated : false)}` : "")

      // Vérifier qu'aucune réservation locale n'a été créée (zombiecheck)
      if (!bookResult.ok && "myGoBookingId" in bookResult && bookResult.myGoBookingId) {
        const zombieCheck = await withSystemContext(async (tx) => {
          const rows = await tx.select({ id: reservations.id })
            .from(reservations)
            .where(
              and(
                eq(reservations.agencyId, agencyId),
                sql`provider_payload->>'myGoBookingId' = ${String(bookResult.myGoBookingId)}`
              )
            )
          return rows
        })
        record("S3.no_zombie", "DB_FAILURE: aucune réservation zombie en DB pour ce myGoBookingId",
          zombieCheck.length === 0,
          `found=${zombieCheck.length} zombie(s)`)
      }
    }
  } catch (err) {
    record("S3.error", "DB_FAILURE: exception inattendue", false, String(err))
  }

  /* ======================================================================== */
  /* S4 — NO_AVAILABILITY → refus avant toute écriture                        */
  /* ======================================================================== */
  console.log("\n--- S4 : NO_AVAILABILITY ---")
  // Récupérer un token valide en NORMAL puis switcher vers NO_AVAILABILITY
  resetScenario()
  const searchForS4 = await doSearch(client)
  setScenario("NO_AVAILABILITY")

  try {
    if (!searchForS4) {
      record("S4.precondition", "NO_AVAILABILITY: token de recherche disponible", false, "aucun résultat en NORMAL")
    } else {
      const draft = makeDraft(searchForS4.token, searchForS4.hotelId, searchForS4.cityId, searchForS4.roomId, searchForS4.boardingId)
      const balanceBefore = await getAgencyBalance(agencyId)

      const bookResult = await bookReservation({ agencyId, draft, traveler: { ...TEST_TRAVELER, email: `cert-noavail-${Date.now()}@example.com` }, client })

      record("S4.rejected", "NO_AVAILABILITY: bookReservation renvoie ok=false",
        !bookResult.ok,
        !bookResult.ok ? `error=${("error" in bookResult ? bookResult.error.slice(0, 100) : "")} kind=${("kind" in bookResult ? bookResult.kind : "")}` : "inattendu ok=true")

      const balanceAfter = await getAgencyBalance(agencyId)
      record("S4.no_debit", "NO_AVAILABILITY: aucun débit wallet effectué",
        Math.abs(balanceBefore - balanceAfter) < TND_EPS,
        `before=${balanceBefore.toFixed(3)} after=${balanceAfter.toFixed(3)}`)
    }
  } catch (err) {
    record("S4.error", "NO_AVAILABILITY: exception inattendue", false, String(err))
  }

  /* ======================================================================== */
  /* S5 — Settlement pipeline                                                  */
  /* ======================================================================== */
  console.log("\n--- S5 : Settlement pipeline ---")
  resetScenario()

  try {
    const periodStart = new Date(Date.now() - 86_400_000 * 30)
    const periodEnd = new Date()

    const settlementResult = await withSystemContext(async (tx) => {
      const [summary] = await tx
        .select({
          totalAmount: sql<number>`COALESCE(SUM(${walletLedger.amount}), 0)`,
          entryCount: sql<number>`COUNT(*)`,
        })
        .from(walletLedger)
        .where(
          and(
            eq(walletLedger.walletAccountId, PLATFORM_COMMISSION_WALLET_ID),
            eq(walletLedger.category, "commission"),
            isNull(walletLedger.settledAt),
            gte(walletLedger.createdAt, periodStart),
            lte(walletLedger.createdAt, periodEnd),
          ),
        )

      const totalAmount = Number(summary?.totalAmount) || 0
      const entryCount = Number(summary?.entryCount) || 0

      const [settlement] = await tx
        .insert(commissionSettlements)
        .values({
          periodStart: periodStart.toISOString().split("T")[0]!,
          periodEnd: periodEnd.toISOString().split("T")[0]!,
          totalAmount: totalAmount.toFixed(2),
          ledgerEntryCount: entryCount,
          status: "pending",
          settledBy: CERT_USER_ID,
        })
        .returning({ id: commissionSettlements.id })

      if (entryCount > 0) {
        await tx
          .update(walletLedger)
          .set({ settledAt: new Date(), settlementId: settlement!.id })
          .where(
            and(
              eq(walletLedger.walletAccountId, PLATFORM_COMMISSION_WALLET_ID),
              eq(walletLedger.category, "commission"),
              isNull(walletLedger.settledAt),
              gte(walletLedger.createdAt, periodStart),
              lte(walletLedger.createdAt, periodEnd),
            ),
          )
      }

      return { id: settlement!.id, totalAmount, entryCount }
    })

    record("S5.settlement.created", "SETTLEMENT: commissionSettlements row créé",
      !!settlementResult.id, `id=${settlementResult.id}`)
    record("S5.settlement.amount", "SETTLEMENT: totalAmount > 0",
      settlementResult.totalAmount > 0,
      `totalAmount=${settlementResult.totalAmount.toFixed(3)} entryCount=${settlementResult.entryCount}`)
    record("S5.settlement.entries", "SETTLEMENT: au moins une entrée commission settlée",
      settlementResult.entryCount > 0,
      `entryCount=${settlementResult.entryCount}`)
  } catch (err) {
    record("S5.error", "SETTLEMENT: exception inattendue", false, String(err))
  }

  /* ======================================================================== */
  /* Cleanup & Report                                                           */
  /* ======================================================================== */
  resetScenario()
  await teardownCertAgency(agencyId)
  await server.close()

  console.log("\n=== RAPPORT FINAL ===\n")
  const fails = results.filter(r => r.status === "FAIL")
  const passes = results.filter(r => r.status === "PASS")
  console.log(`${passes.length} PASS  |  ${fails.length} FAIL  |  ${results.length} total`)

  if (fails.length > 0) {
    console.log("\nÉCHECS :")
    for (const f of fails) console.log(`  ❌ [${f.id}] ${f.label}\n     ${f.details}`)
  }

  const exitCode = fails.length > 0 ? 1 : 0
  console.log(`\nExit ${exitCode === 0 ? "0 — CERTIFICATION OK ✅" : "1 — CERTIFICATION KO ❌"}`)
  process.exit(exitCode)
}

main().catch((err) => {
  console.error("\n[FATAL]", err)
  process.exit(1)
})
