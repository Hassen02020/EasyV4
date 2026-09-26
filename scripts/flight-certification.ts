#!/usr/bin/env tsx
/**
 * scripts/flight-certification.ts — Chantier 46: Flight E2E Certification
 *
 * Exercises the complete flight booking pipeline using the virtual GDS supplier.
 * No real GDS credentials needed — all four fault scenarios are deterministic.
 *
 *   S1 NORMAL          Search → Snapshot → BookingRequest → Fulfillment → CONFIRMED
 *   S2 PRICE_CHANGED   virtual book() signals PRICE_CHANGED (+12%)   → FAILED(BOOK_FAILED)
 *   S3 SOLD_OUT        virtual book() forces reserve() to return false → FAILED(BOOK_FAILED)
 *   S4 BOOKING_REJECTED virtual book() returns BOOKING_REJECTED        → FAILED(BOOK_FAILED)
 *
 * Architecture:
 *   Booking-request phase replicates booking-request-action.ts (snapshot CAS + DB writes).
 *   Fulfillment phase replicates fulfillment-action.ts without auth/Inngest guards.
 *   nextPublicRef is inlined to avoid the server-only chain through lib/booking/actions.ts.
 *
 * Usage:
 *   DATABASE_URL="postgresql://user:pass@host:5432/db" npm run cert:flight
 *
 *   Windows CMD:
 *     set "DATABASE_URL=postgresql://..." && npm run cert:flight
 *   PowerShell:
 *     $env:DATABASE_URL = "postgresql://..."; npm run cert:flight
 */

import "dotenv/config"
import { eq, and, gt, sql, asc, isNull, gte, lte } from "drizzle-orm"
import { withSystemContext } from "@/lib/db/tenant-context"
import {
  reservations,
  customers,
  agencies,
  payments,
  reservationFinancials,
  walletLedger,
  commissionSettlements,
} from "@/lib/db/schema"
import { debitPartnerCredit } from "@/lib/pro/booking-actions"
import { recordReservationFinancials } from "@/lib/finance/reservation-financials"
import { creditPlatformCommission, PLATFORM_COMMISSION_WALLET_ID } from "@/lib/finance/platform-commission"
import { renderFlightVoucherPdf } from "@/lib/pdf/voucher-flight"
import {
  flightBookings,
  flightBookingPassengers,
  flightBookingSegments,
  flightPriceSnapshots,
  flightSupplierTransactions,
  flightTickets,
} from "@/lib/db/schema/flights"
import { createPriceSnapshot } from "@/lib/vols/price-snapshot"
import { setScenario, resetScenario } from "@/lib/vols/virtual-supplier/scenarios"
import type { FlightSimulationScenario } from "@/lib/vols/virtual-supplier/scenarios"
import { createVirtualGdsAdapter } from "@/lib/vols/adapters/virtual"
import { flattenSegments } from "@/lib/vols/canonical"
import type { CanonicalItinerary } from "@/lib/vols/canonical"
import { mapFlightStatusToReservation } from "@/lib/vols/flight-status-utils"
import type { FlightStatus } from "@/lib/vols/flight-status-utils"

// ---------------------------------------------------------------------------
// Inline nextPublicRef — avoids server-only transitive chain via
// lib/booking/actions.ts → lib/pro/server-context.ts → import "server-only"
// ---------------------------------------------------------------------------

function _pad(n: number, w = 6) {
  return String(n).padStart(w, "0")
}

type DbTx = Parameters<Parameters<typeof withSystemContext>[0]>[0]

async function nextPublicRef(db: DbTx, agencyId: string): Promise<string> {
  const year = new Date().getFullYear()
  const prefix = `TG-${year}-`
  const [row] = await db
    .select({ maxRef: sql<string | null>`MAX(${reservations.publicRef})` })
    .from(reservations)
    .where(
      and(
        eq(reservations.agencyId, agencyId),
        sql`${reservations.publicRef} LIKE ${prefix + "%"}`,
      ),
    )
  const maxRef = row?.maxRef
  const max = maxRef ? Number(maxRef.slice(prefix.length)) : 0
  return `${prefix}${_pad(Number.isFinite(max) ? max + 1 : 1)}`
}

// ---------------------------------------------------------------------------
// Inline updateFlightStatus — avoids "use server" module interop concerns
// ---------------------------------------------------------------------------

async function updateFlightStatus(
  bookingId: string,
  newStatus: FlightStatus,
  db?: DbTx,
): Promise<void> {
  const run = async (tx: DbTx) => {
    await tx
      .update(flightBookings)
      .set({ status: newStatus, updatedAt: new Date() })
      .where(eq(flightBookings.id, bookingId))

    const [row] = await tx
      .select({ reservationId: flightBookings.reservationId })
      .from(flightBookings)
      .where(eq(flightBookings.id, bookingId))
      .limit(1)

    if (row?.reservationId) {
      const reservationStatus = mapFlightStatusToReservation(newStatus)
      await tx
        .update(reservations)
        .set({ status: reservationStatus, updatedAt: new Date() })
        .where(eq(reservations.id, row.reservationId))
    }
  }

  if (db) {
    await run(db)
  } else {
    await withSystemContext(run)
  }
}

// ---------------------------------------------------------------------------
// Log supplier transaction (simplified — no retry, cert-script only)
// ---------------------------------------------------------------------------

async function logTx(
  bookingId: string | null,
  snapshotId: string | null,
  provider: string,
  txType: string,
  status: "SUCCESS" | "FAILURE",
  req: unknown,
  res: unknown,
  durationMs: number,
): Promise<void> {
  try {
    await withSystemContext((tx) =>
      tx.insert(flightSupplierTransactions).values({
        bookingId: bookingId ?? undefined,
        snapshotId: snapshotId ?? undefined,
        provider,
        transactionType: txType,
        status,
        request: req as Record<string, unknown>,
        response: res as Record<string, unknown>,
        durationMs,
      }),
    )
  } catch (err) {
    console.warn(`    [logTx] Audit write failed (non-fatal): ${err}`)
  }
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SLA_MINUTES = 15

const CONTACT = {
  email: "cert-flight@easy2book.test",
  phone: "+21600000000",
  firstName: "Cert",
  lastName: "Vol",
}

// ---------------------------------------------------------------------------
// Step 1: Search + Snapshot
// ---------------------------------------------------------------------------

async function searchAndSnapshot(agencyId: string) {
  const adapter = createVirtualGdsAdapter()
  const searchResult = await adapter.search({
    tripType: "ONE_WAY",
    origin: "TUN",
    destination: "CDG",
    departureDate: "2027-06-15",
    adults: 1,
    children: 0,
    infants: 0,
    cabin: "ECONOMY",
    currency: "TND",
  })
  if (!searchResult.ok || !searchResult.itineraries.length) {
    throw new Error("Virtual search returned no itineraries")
  }
  const itinerary = searchResult.itineraries[0]!
  const snapshot = await createPriceSnapshot({
    searchDbId: null,
    agencyId,
    itinerary,
    channel: "B2C",
  })
  return { itinerary, snapshot }
}

// ---------------------------------------------------------------------------
// Step 2: Booking Request — replicates booking-request-action.ts
// ---------------------------------------------------------------------------

async function createBookingRequest(
  agencyId: string,
  snapshotId: string,
): Promise<{ bookingId: string; reservationId: string; publicRef: string; snapshotId: string }> {
  return withSystemContext(async (tx) => {
    // Atomically claim snapshot (CAS: ACTIVE → USED)
    const snapRows = await tx
      .update(flightPriceSnapshots)
      .set({ status: "USED" })
      .where(
        and(
          eq(flightPriceSnapshots.id, snapshotId),
          eq(flightPriceSnapshots.status, "ACTIVE"),
          gt(flightPriceSnapshots.expiresAt, new Date()),
        ),
      )
      .returning({
        provider: flightPriceSnapshots.provider,
        itinerary: flightPriceSnapshots.itinerary,
        sellingAmount: flightPriceSnapshots.sellingAmount,
        sellingCurrency: flightPriceSnapshots.sellingCurrency,
      })
    if (!snapRows.length) throw new Error("Snapshot expired, already claimed, or not found")

    const snap = snapRows[0]!
    const itinerary = snap.itinerary as unknown as CanonicalItinerary

    // Find or create customer
    let customerId: string
    const existing = await tx
      .select({ id: customers.id })
      .from(customers)
      .where(and(eq(customers.agencyId, agencyId), eq(customers.email, CONTACT.email)))
      .limit(1)
    if (existing[0]) {
      customerId = existing[0].id
    } else {
      const ins = await tx
        .insert(customers)
        .values({
          agencyId,
          firstName: CONTACT.firstName,
          lastName: CONTACT.lastName,
          email: CONTACT.email,
          phone: CONTACT.phone ?? null,
        })
        .returning({ id: customers.id })
      customerId = (ins as Array<{ id: string }>)[0]!.id
    }

    const publicRef = await nextPublicRef(tx, agencyId)
    const slaDeadline = new Date(Date.now() + SLA_MINUTES * 60 * 1000)

    // Derive offer label from itinerary
    const firstSeg = itinerary.journeys?.[0]?.segments?.[0]
    const lastJourney = itinerary.journeys?.[itinerary.journeys.length - 1]
    const lastSeg = lastJourney?.segments?.[lastJourney.segments.length - 1]
    const origin = firstSeg?.origin ?? ""
    const destination = lastSeg?.destination ?? firstSeg?.destination ?? ""

    // Insert reservations row (Booking Core bridge)
    const resRows = await tx
      .insert(reservations)
      .values({
        agencyId,
        customerId,
        publicRef,
        module: "flight",
        source: "internal",
        status: "pending",
        originalCurrency: snap.sellingCurrency ?? "TND",
        originalAmount: snap.sellingAmount,
        tndAmount: snap.sellingAmount,
        providerPayload: {
          offerLabel: origin && destination ? `Vol ${origin} → ${destination}` : "Vol",
          startDate: firstSeg?.departure ?? null,
          channel: "b2c_guest",
          paymentMethod: null,
        },
      })
      .returning({ id: reservations.id })
    const reservationId = (resRows as Array<{ id: string }>)[0]!.id

    // Insert flight_bookings row (state machine)
    const bookRows = await tx
      .insert(flightBookings)
      .values({
        agencyId,
        reservationId,
        customerId,
        priceSnapshotId: snapshotId,
        orderId: null,
        tripType: itinerary.tripType,
        itinerary: itinerary as unknown as Record<string, unknown>,
        contact: CONTACT as unknown as Record<string, unknown>,
        status: "PENDING",
        provider: snap.provider,
        slaDeadline,
      })
      .returning({ id: flightBookings.id })
    const bookingId = (bookRows as Array<{ id: string }>)[0]!.id

    // Insert passenger
    await tx.insert(flightBookingPassengers).values({
      bookingId,
      passengerType: "ADT",
      firstName: CONTACT.firstName,
      lastName: CONTACT.lastName,
      sequence: 1,
    })

    // Insert segments
    const allSegments = flattenSegments(itinerary)
    if (allSegments.length > 0) {
      await tx.insert(flightBookingSegments).values(
        allSegments.map((seg, i) => ({
          bookingId,
          sequence: i + 1,
          origin: seg.origin,
          destination: seg.destination,
          departure: new Date(seg.departure),
          arrival: new Date(seg.arrival),
          airline: seg.marketingCarrier,
          flightNumber: `${seg.marketingCarrier}${seg.marketingFlightNumber}`,
          durationMin: seg.durationMinutes,
          stops: seg.stops,
          equipment: seg.equipment,
          cabin: seg.cabin,
        })),
      )
    }

    // Insert pending payment row (mirrors booking-request-action.ts behaviour)
    await tx.insert(payments).values({
      agencyId,
      reservationId,
      psp: "manual",
      method: "wallet",
      originalCurrency: snap.sellingCurrency ?? "TND",
      originalAmount: String(snap.sellingAmount),
      tndAmount: String(snap.sellingAmount),
      kind: "deposit",
      status: "pending",
      idempotencyKey: `cert-flight-pay:${reservationId}`,
    })

    return { bookingId, reservationId, publicRef, snapshotId }
  })
}

// ---------------------------------------------------------------------------
// Financial capture — records financials + wallet debit (manual post-fulfillment)
// ---------------------------------------------------------------------------

async function recordFlightFinancials(
  agencyId: string,
  reservationId: string,
  snapshotId: string,
): Promise<void> {
  const snapRows = await withSystemContext((tx) =>
    tx
      .select({ supplierAmount: flightPriceSnapshots.supplierAmount, sellingAmount: flightPriceSnapshots.sellingAmount })
      .from(flightPriceSnapshots)
      .where(eq(flightPriceSnapshots.id, snapshotId))
      .limit(1),
  )
  const snap = (snapRows as Array<{ supplierAmount: string; sellingAmount: string }>)[0]
  if (!snap) throw new Error(`Snapshot not found: ${snapshotId}`)

  const supplierPriceTnd = parseFloat(snap.supplierAmount)
  const salePriceTnd = parseFloat(snap.sellingAmount)

  await withSystemContext(async (tx) => {
    const resRows = await tx
      .select({ publicRef: reservations.publicRef })
      .from(reservations)
      .where(eq(reservations.id, reservationId))
      .limit(1)
    const publicRef = (resRows as Array<{ publicRef: string }>)[0]?.publicRef ?? reservationId

    const { commissionAmount } = await recordReservationFinancials({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      tx: tx as any,
      reservationId,
      supplierPriceTnd,
      salePriceTnd,
      commissionPercent: 10,
    })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await creditPlatformCommission(tx as any, {
      reservationId,
      commissionAmount,
      description: `Commission vol — ${publicRef}`,
    })

    const debitResult = await debitPartnerCredit({
      agencyId,
      amountTnd: salePriceTnd,
      reference: publicRef,
      description: `Réservation vol — ${publicRef}`,
      reservationId,
      idempotencyKey: `cert-flight-debit:${reservationId}`,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      txOverride: tx as any,
    })

    if (!debitResult.ok) throw new Error(`DEBIT_FAILED: ${debitResult.message}`)

    await tx
      .update(payments)
      .set({ status: "captured", capturedAt: new Date(), updatedAt: new Date() })
      .where(eq(payments.reservationId, reservationId))
  })
}

// ---------------------------------------------------------------------------
// Step 3: Fulfillment — replicates fulfillment-action.ts (no auth, no Inngest)
// ---------------------------------------------------------------------------

type FulfillOutcome =
  | { ok: true; pnr: string; bookingId: string }
  | { ok: false; error: string; code: string }

async function runFulfillment(reservationId: string): Promise<FulfillOutcome> {
  // CAS: PENDING → BOOKING_IN_PROGRESS (Arm A)
  const claimed = await withSystemContext(async (tx) => {
    const rows = await tx
      .update(flightBookings)
      .set({ status: "BOOKING_IN_PROGRESS", updatedAt: new Date() })
      .where(
        and(
          eq(flightBookings.reservationId, reservationId),
          eq(flightBookings.status, "PENDING"),
        ),
      )
      .returning({
        id: flightBookings.id,
        priceSnapshotId: flightBookings.priceSnapshotId,
        contact: flightBookings.contact,
      })
    if (rows.length > 0) {
      await tx
        .update(reservations)
        .set({ status: "on_request", updatedAt: new Date() })
        .where(eq(reservations.id, reservationId))
    }
    return (rows as Array<{ id: string; priceSnapshotId: string | null; contact: unknown }>)[0] ?? null
  })

  if (!claimed) return { ok: false, error: "No PENDING booking found", code: "WRONG_STATUS" }

  const bookingId = claimed.id
  const snapshotId = claimed.priceSnapshotId

  // Load snapshot (authoritative price)
  const snapRows = await withSystemContext((tx) =>
    tx
      .select()
      .from(flightPriceSnapshots)
      .where(eq(flightPriceSnapshots.id, snapshotId!))
      .limit(1),
  )
  const snapshot = (snapRows as typeof flightPriceSnapshots.$inferSelect[])[0]
  if (!snapshot) return { ok: false, error: "Snapshot missing", code: "SNAPSHOT_MISSING" }

  const itinerary = snapshot.itinerary as unknown as CanonicalItinerary

  // Load passengers
  const passengers = (await withSystemContext((tx) =>
    tx
      .select()
      .from(flightBookingPassengers)
      .where(eq(flightBookingPassengers.bookingId, bookingId))
      .orderBy(flightBookingPassengers.sequence),
  )) as typeof flightBookingPassengers.$inferSelect[]

  const contact = claimed.contact as { email?: string }
  const adapter = createVirtualGdsAdapter()

  // ── Recheck ────────────────────────────────────────────────────────────────
  let recheckMs = Date.now()
  let recheckResult: Awaited<ReturnType<typeof adapter.recheck>>
  try {
    recheckResult = await adapter.recheck(itinerary)
    recheckMs = Date.now() - recheckMs
  } catch (err) {
    recheckMs = Date.now() - recheckMs
    await logTx(bookingId, snapshotId, snapshot.provider, "RECHECK", "FAILURE", {}, { error: String(err) }, recheckMs)
    await updateFlightStatus(bookingId, "FAILED")
    return { ok: false, error: "Recheck error", code: "RECHECK_ERROR" }
  }

  await logTx(
    bookingId,
    snapshotId,
    snapshot.provider,
    "RECHECK",
    recheckResult.status === "AVAILABLE" ? "SUCCESS" : "FAILURE",
    {},
    recheckResult,
    recheckMs,
  )

  await withSystemContext((tx) =>
    tx
      .update(flightBookings)
      .set({
        lastRecheckStatus: recheckResult.status as "AVAILABLE" | "PRICE_CHANGED" | "UNAVAILABLE" | "EXPIRED" | "ERROR",
        lastRecheckAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(flightBookings.id, bookingId)),
  )

  if (recheckResult.status === "PRICE_CHANGED") {
    await updateFlightStatus(bookingId, "PRICE_CHANGED")
    return { ok: false, error: "Price changed at recheck", code: "PRICE_CHANGED" }
  }
  if (recheckResult.status !== "AVAILABLE") {
    await updateFlightStatus(bookingId, "FAILED")
    return { ok: false, error: "Offer unavailable", code: recheckResult.status }
  }

  // ── Book ───────────────────────────────────────────────────────────────────
  let bookMs = Date.now()
  let bookResult: Awaited<ReturnType<typeof adapter.book>>
  try {
    bookResult = await adapter.book(itinerary, passengers, contact)
    bookMs = Date.now() - bookMs
  } catch (err) {
    bookMs = Date.now() - bookMs
    await logTx(bookingId, snapshotId, snapshot.provider, "BOOK", "FAILURE", {}, { error: String(err) }, bookMs)
    await updateFlightStatus(bookingId, "FAILED")
    return { ok: false, error: String(err), code: "BOOK_FAILED" }
  }

  await logTx(
    bookingId,
    snapshotId,
    snapshot.provider,
    "BOOK",
    "SUCCESS",
    {},
    { pnr: bookResult.pnr, supplierBookingReference: bookResult.supplierBookingReference },
    bookMs,
  )

  await withSystemContext((tx) =>
    tx
      .update(flightBookings)
      .set({
        pnr: bookResult.pnr,
        supplierBookingRef: bookResult.supplierBookingReference,
        updatedAt: new Date(),
      })
      .where(eq(flightBookings.id, bookingId)),
  )

  await updateFlightStatus(bookingId, "BOOKED")
  await updateFlightStatus(bookingId, "TICKETING_IN_PROGRESS")

  // ── Issue ──────────────────────────────────────────────────────────────────
  let issueMs = Date.now()
  let issueResult: Awaited<ReturnType<typeof adapter.issue>>
  try {
    issueResult = await adapter.issue(bookResult.pnr, itinerary)
    issueMs = Date.now() - issueMs
  } catch (err) {
    issueMs = Date.now() - issueMs
    await logTx(bookingId, snapshotId, snapshot.provider, "ISSUE", "FAILURE", {}, { error: String(err) }, issueMs)
    // Best-effort cancel to avoid orphaned PNR
    const cancelMs0 = Date.now()
    try {
      await adapter.cancel(bookResult.pnr, itinerary)
      await logTx(bookingId, snapshotId, snapshot.provider, "CANCEL", "SUCCESS", { pnr: bookResult.pnr }, {}, Date.now() - cancelMs0)
    } catch (cancelErr) {
      await logTx(bookingId, snapshotId, snapshot.provider, "CANCEL", "FAILURE", { pnr: bookResult.pnr }, { error: String(cancelErr) }, Date.now() - cancelMs0)
    }
    await updateFlightStatus(bookingId, "FAILED")
    return { ok: false, error: "Issue failed", code: "ISSUE_FAILED" }
  }

  await logTx(
    bookingId,
    snapshotId,
    snapshot.provider,
    "ISSUE",
    "SUCCESS",
    { pnr: bookResult.pnr },
    { tickets: issueResult.tickets },
    issueMs,
  )

  // Insert flight_tickets rows
  if (issueResult.tickets.length > 0) {
    const passengerById = Object.fromEntries(
      passengers.map((p, i) => [String(i + 1), p.id] as [string, string]),
    )
    await withSystemContext((tx) =>
      tx.insert(flightTickets).values(
        issueResult.tickets.map((t) => ({
          bookingId,
          passengerId: passengerById[t.passengerRef] ?? null,
          ticketNumber: t.ticketNumber,
          status: "ISSUED" as const,
          issuedAt: new Date(),
          eticketUrl: t.eticketUrl ?? null,
        })),
      ),
    )
  }

  await updateFlightStatus(bookingId, "CONFIRMED")
  return { ok: true, pnr: bookResult.pnr, bookingId }
}

// ---------------------------------------------------------------------------
// DB verification helpers
// ---------------------------------------------------------------------------

async function getFlightBookingStatus(reservationId: string): Promise<string | null> {
  const rows = await withSystemContext((tx) =>
    tx
      .select({ status: flightBookings.status, pnr: flightBookings.pnr })
      .from(flightBookings)
      .where(eq(flightBookings.reservationId, reservationId))
      .limit(1),
  )
  return (rows as Array<{ status: string; pnr: string | null }>)[0]?.status ?? null
}

async function getReservationStatus(reservationId: string): Promise<string | null> {
  const rows = await withSystemContext((tx) =>
    tx
      .select({ status: reservations.status })
      .from(reservations)
      .where(eq(reservations.id, reservationId))
      .limit(1),
  )
  return (rows as Array<{ status: string }>)[0]?.status ?? null
}

async function getAgencyBalance(agencyId: string): Promise<number> {
  const rows = await withSystemContext((tx) =>
    tx.select({ depositBalance: agencies.depositBalance }).from(agencies).where(eq(agencies.id, agencyId)).limit(1),
  )
  return parseFloat((rows as Array<{ depositBalance: string }>)[0]?.depositBalance ?? "0")
}

async function getPaymentRow(reservationId: string) {
  const rows = await withSystemContext((tx) =>
    tx
      .select({ id: payments.id, status: payments.status, tndAmount: payments.tndAmount })
      .from(payments)
      .where(eq(payments.reservationId, reservationId))
      .limit(1),
  )
  return (rows as Array<{ id: string; status: string; tndAmount: string }>)[0] ?? null
}

async function getFlightFinancials(reservationId: string) {
  const rows = await withSystemContext((tx) =>
    tx
      .select()
      .from(reservationFinancials)
      .where(eq(reservationFinancials.reservationId, reservationId))
      .limit(1),
  )
  return rows[0] ?? null
}

async function getFlightWalletLedgerEntry(reservationId: string) {
  const rows = await withSystemContext((tx) =>
    tx
      .select({ id: walletLedger.id, amount: walletLedger.amount, category: walletLedger.category })
      .from(walletLedger)
      .where(eq(walletLedger.reservationId, reservationId))
      .limit(1),
  )
  return (rows as Array<{ id: string; amount: string; category: string | null }>)[0] ?? null
}

async function getTicketCount(reservationId: string): Promise<number> {
  const rows = await withSystemContext(async (tx) => {
    const bookingRows = await tx
      .select({ id: flightBookings.id })
      .from(flightBookings)
      .where(eq(flightBookings.reservationId, reservationId))
      .limit(1)
    const bookingId = (bookingRows as Array<{ id: string }>)[0]?.id
    if (!bookingId) return []
    return tx
      .select({ id: flightTickets.id })
      .from(flightTickets)
      .where(eq(flightTickets.bookingId, bookingId))
  })
  return (rows as unknown[]).length
}

// ---------------------------------------------------------------------------
// Scenario runner
// ---------------------------------------------------------------------------

let passed = 0
let failed = 0
const results: string[] = []

async function scenario(label: string, fn: () => Promise<void>): Promise<void> {
  const t0 = Date.now()
  try {
    await fn()
    const ms = Date.now() - t0
    console.log(`  \x1b[32mPASS\x1b[0m  ${label}  (${ms}ms)`)
    results.push(`PASS  ${label}`)
    passed++
  } catch (err) {
    const ms = Date.now() - t0
    console.error(`  \x1b[31mFAIL\x1b[0m  ${label}  (${ms}ms)`)
    console.error(`        ${err instanceof Error ? err.message : String(err)}`)
    results.push(`FAIL  ${label}`)
    failed++
  }
}

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(`Assertion failed: ${message}`)
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log("\n╔══════════════════════════════════════════════════════════════╗")
  console.log("║  Flight E2E Certification — Chantier 46                      ║")
  console.log("╚══════════════════════════════════════════════════════════════╝\n")

  console.log(`  DB      : ${(process.env.DATABASE_URL ?? "").replace(/:[^:@]+@/, ":***@") || "(from .env.local)"}`)

  // Create a dedicated cert agency with sufficient deposit balance
  const certSlug = `cert-flight-${Date.now()}`
  const [certAgencyRow] = await withSystemContext((tx) =>
    tx
      .insert(agencies)
      .values({
        slug: certSlug,
        name: "Flight Certification Agency",
        agencyType: "partner",
        depositBalance: "99999.000",
      })
      .returning({ id: agencies.id }),
  )
  const agencyId = (certAgencyRow as { id: string })!.id
  console.log(`  Agency  : ${agencyId} (cert-flight, balance=99999 TND)`)
  console.log("")

  // ── S1: NORMAL ──────────────────────────────────────────────────────────────
  await scenario("S1 NORMAL — full happy path → CONFIRMED + ticket issued", async () => {
    resetScenario()
    const { snapshot, itinerary } = await searchAndSnapshot(agencyId)
    const { reservationId, publicRef, snapshotId } = await createBookingRequest(agencyId, snapshot.snapshotId)

    // Payment row created at booking-request time
    const payRow = await getPaymentRow(reservationId)
    assert(!!payRow, "Expected payments row to exist after createBookingRequest")
    assert(payRow!.status === "pending", `Expected payment status=pending, got ${payRow?.status}`)

    const result = await runFulfillment(reservationId)
    assert(result.ok === true, `Expected ok=true, got ok=${result.ok} code=${(result as { code?: string }).code} ${(result as { error?: string }).error}`)
    assert(!!(result as { pnr?: string }).pnr, "Expected PNR to be set")

    const flightStatus = await getFlightBookingStatus(reservationId)
    assert(flightStatus === "CONFIRMED", `Expected flight_bookings.status=CONFIRMED, got ${flightStatus}`)

    const resStatus = await getReservationStatus(reservationId)
    assert(resStatus === "confirmed", `Expected reservations.status=confirmed, got ${resStatus}`)

    const ticketCount = await getTicketCount(reservationId)
    assert(ticketCount >= 1, `Expected at least 1 ticket, got ${ticketCount}`)

    // Financial capture (manual step — not in production pipeline yet)
    const balanceBefore = await getAgencyBalance(agencyId)
    await recordFlightFinancials(agencyId, reservationId, snapshotId)

    const payRowAfter = await getPaymentRow(reservationId)
    assert(payRowAfter?.status === "captured", `Expected payment captured, got ${payRowAfter?.status}`)

    const fin = await getFlightFinancials(reservationId)
    assert(!!fin, "Expected reservationFinancials row after recordFlightFinancials")
    assert(parseFloat(fin!.supplierPriceTnd!) > 0, "Expected supplierPriceTnd > 0")

    const walletEntry = await getFlightWalletLedgerEntry(reservationId)
    assert(!!walletEntry && walletEntry.category === "commission", `Expected walletLedger commission entry, got category=${walletEntry?.category}`)

    const balanceAfter = await getAgencyBalance(agencyId)
    assert(balanceBefore > balanceAfter, `Expected agency balance debited: before=${balanceBefore} after=${balanceAfter}`)

    // Voucher PDF
    const itin = itinerary as { journeys?: Array<{ segments: Array<{ origin: string; destination: string; departure: string; arrival: string; marketingCarrier: string; marketingFlightNumber: string }> }> }
    const firstSeg = itin.journeys?.[0]?.segments?.[0]
    const lastJourney = itin.journeys?.[itin.journeys.length - 1]
    const lastSeg = lastJourney?.segments?.[lastJourney.segments.length - 1]
    const voucherBuf = await renderFlightVoucherPdf({
      publicRef,
      customerName: `${CONTACT.firstName} ${CONTACT.lastName}`,
      pnr: (result as { pnr: string }).pnr,
      origin: firstSeg?.origin ?? "TUN",
      destination: lastSeg?.destination ?? "CDG",
      departAt: firstSeg?.departure ?? "",
      arriveAt: lastSeg?.arrival ?? null,
      carrier: firstSeg?.marketingCarrier ?? null,
      flightNumber: firstSeg ? `${firstSeg.marketingCarrier}${firstSeg.marketingFlightNumber}` : null,
      cabinClass: "ECONOMY",
      adults: 1,
      children: 0,
      totalTnd: parseFloat(fin!.salePriceTnd!),
      agencyName: "Flight Certification Agency",
    }, "fr")
    assert(voucherBuf.length > 1000, `Expected voucher PDF > 1000 bytes, got ${voucherBuf.length}`)

    const okResult = result as { ok: true; pnr: string }
    console.log(`        publicRef=${publicRef}  pnr=${okResult.pnr}  tickets=${ticketCount}  fin=OK  voucher=${voucherBuf.length}b`)
  })

  // ── S2: PRICE_CHANGED ────────────────────────────────────────────────────────
  await scenario("S2 PRICE_CHANGED — virtual book() rejects +12% → FAILED(BOOK_FAILED)", async () => {
    resetScenario()
    const { snapshot } = await searchAndSnapshot(agencyId)
    const { reservationId } = await createBookingRequest(agencyId, snapshot.snapshotId)

    setScenario("PRICE_CHANGED" as FlightSimulationScenario)
    const result = await runFulfillment(reservationId)
    resetScenario()

    assert(result.ok === false, `Expected ok=false, got ok=${result.ok}`)
    assert(
      (result as { code?: string }).code === "BOOK_FAILED",
      `Expected code=BOOK_FAILED, got ${(result as { code?: string }).code}`,
    )

    const flightStatus = await getFlightBookingStatus(reservationId)
    assert(flightStatus === "FAILED", `Expected flight_bookings.status=FAILED, got ${flightStatus}`)
  })

  // ── S3: SOLD_OUT ─────────────────────────────────────────────────────────────
  await scenario("S3 SOLD_OUT — virtual book() forces sold-out → FAILED(BOOK_FAILED)", async () => {
    resetScenario()
    const { snapshot } = await searchAndSnapshot(agencyId)
    const { reservationId } = await createBookingRequest(agencyId, snapshot.snapshotId)

    setScenario("SOLD_OUT" as FlightSimulationScenario)
    const result = await runFulfillment(reservationId)
    resetScenario()

    assert(result.ok === false, `Expected ok=false, got ok=${result.ok}`)
    assert(
      (result as { code?: string }).code === "BOOK_FAILED",
      `Expected code=BOOK_FAILED, got ${(result as { code?: string }).code}`,
    )

    const flightStatus = await getFlightBookingStatus(reservationId)
    assert(flightStatus === "FAILED", `Expected flight_bookings.status=FAILED, got ${flightStatus}`)
  })

  // ── S4: BOOKING_REJECTED ─────────────────────────────────────────────────────
  await scenario("S4 BOOKING_REJECTED — provider refuses booking → FAILED(BOOK_FAILED)", async () => {
    resetScenario()
    const { snapshot } = await searchAndSnapshot(agencyId)
    const { reservationId } = await createBookingRequest(agencyId, snapshot.snapshotId)

    setScenario("BOOKING_REJECTED" as FlightSimulationScenario)
    const result = await runFulfillment(reservationId)
    resetScenario()

    assert(result.ok === false, `Expected ok=false, got ok=${result.ok}`)
    assert(
      (result as { code?: string }).code === "BOOK_FAILED",
      `Expected code=BOOK_FAILED, got ${(result as { code?: string }).code}`,
    )

    const flightStatus = await getFlightBookingStatus(reservationId)
    assert(flightStatus === "FAILED", `Expected flight_bookings.status=FAILED, got ${flightStatus}`)
  })

  // ── S5: Settlement ─────────────────────────────────────────────────────────
  await scenario("S5 SETTLEMENT — commission walletLedger entries settled into commissionSettlements", async () => {
    const periodStart = new Date(Date.now() - 86_400_000 * 30)
    const periodEnd = new Date()
    const settledBy = "00000000-0000-0000-0000-000000000001" // system

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
          settledBy,
        })
        .onConflictDoUpdate({
          target: [commissionSettlements.periodStart, commissionSettlements.periodEnd],
          set: {
            totalAmount: totalAmount.toFixed(2),
            ledgerEntryCount: entryCount,
            settledBy,
            updatedAt: new Date(),
          },
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

    assert(!!settlementResult.id, "Expected commissionSettlements row created")
    assert(settlementResult.totalAmount > 0, `Expected totalAmount > 0, got ${settlementResult.totalAmount}`)
    assert(settlementResult.entryCount > 0, `Expected entryCount > 0, got ${settlementResult.entryCount}`)
    console.log(`        settlementId=${settlementResult.id}  total=${settlementResult.totalAmount.toFixed(3)}  entries=${settlementResult.entryCount}`)
  })

  // ── S6: Idempotence ──────────────────────────────────────────────────────────
  await scenario("S6 IDEMPOTENCE — duplicate fulfillment on CONFIRMED booking → WRONG_STATUS", async () => {
    resetScenario()
    const { snapshot } = await searchAndSnapshot(agencyId)
    const { reservationId } = await createBookingRequest(agencyId, snapshot.snapshotId)

    // First fulfillment → CONFIRMED
    const first = await runFulfillment(reservationId)
    assert(first.ok === true, `First fulfillment should succeed, got ok=${first.ok}`)

    // Second fulfillment on already-CONFIRMED booking → should fail
    const second = await runFulfillment(reservationId)
    assert(second.ok === false, `Second fulfillment should fail, got ok=${second.ok}`)
    assert(
      (second as { code?: string }).code === "WRONG_STATUS",
      `Expected code=WRONG_STATUS, got ${(second as { code?: string }).code}`,
    )
    console.log(`        idempotence guard: ok=false code=${(second as { code?: string }).code}`)
  })

  // ── Summary ──────────────────────────────────────────────────────────────────
  console.log("\n──────────────────────────────────────────────────────────────")
  results.forEach((r) => console.log(`  ${r}`))
  console.log(`\n  ${passed} passed, ${failed} failed out of 6 scenarios\n`)

  // Cert agency left in DB for inspection (never delete financial transactions)
  console.log(`  [teardown] Cert agency ${agencyId} conservée pour inspection (slug=${certSlug})`)

  if (failed > 0) {
    console.log("  \x1b[31mCERTIFICATION FAILED\x1b[0m\n")
    process.exit(1)
  }
  console.log("  \x1b[32mCERTIFICATION PASSED ✓\x1b[0m\n")
}

main().catch((err) => {
  console.error("FATAL:", err)
  process.exit(1)
})
