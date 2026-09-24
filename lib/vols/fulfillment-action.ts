"use server"

/**
 * Flight Fulfillment — Ticketing Desk
 *
 * Drives a PENDING flight_bookings record through the full GDS lifecycle:
 *   PENDING → BOOKING_IN_PROGRESS → BOOKED → TICKETING_IN_PROGRESS → CONFIRMED
 *
 * On provider errors:
 *   PRICE_CHANGED  → flight_bookings.status = PRICE_CHANGED (ops must recheck with client)
 *   UNAVAILABLE / BOOKING_REJECTED / TIMEOUT → FAILED
 *
 * Called by the admin "Émettre le billet" button on /admin/reservations/[id].
 * The supplier price NEVER reaches the client — all amounts are read from the
 * immutable flight_price_snapshots row on the server.
 *
 * Logs every GDS call (recheck / book / issue) to flight_supplier_transactions.
 */

import { eq } from "drizzle-orm"
import { withSystemContext } from "@/lib/db/tenant-context"
import { reservations, customers } from "@/lib/db/schema"
import {
  flightBookings,
  flightBookingPassengers,
  flightPriceSnapshots,
  flightSupplierTransactions,
  flightTickets,
} from "@/lib/db/schema/flights"
import { updateFlightStatus } from "./flight-status-sync"
import { getDefaultAdapters } from "./orchestrator"
import { sendEvent } from "@/lib/inngest/client"
import type { CanonicalItinerary } from "./canonical"
import { createServerSupabase } from "@/lib/supabase/server"
import { getCurrentAdminProfile } from "@/lib/auth/profile"
import { isAllowedIntoAdmin } from "@/lib/auth/admin-gate"

// ─── roles allowed to trigger fulfillment ────────────────────────────────────
const FULFILL_ROLES = ["super_admin", "manager", "agent_resa"] as const

export type FulfillResult =
  | { ok: true; pnr: string; publicRef: string; bookingId: string }
  | { ok: false; error: string; code: string }

// ─── helpers ──────────────────────────────────────────────────────────────────

async function logTransaction(
  bookingId: string | null,
  snapshotId: string | null,
  provider: string,
  transactionType: string,
  status: "SUCCESS" | "FAILURE",
  request: unknown,
  response: unknown,
  durationMs: number,
): Promise<void> {
  try {
    await withSystemContext((tx) =>
      tx.insert(flightSupplierTransactions).values({
        bookingId: bookingId ?? undefined,
        snapshotId: snapshotId ?? undefined,
        provider,
        transactionType,
        status,
        request: request as Record<string, unknown>,
        response: response as Record<string, unknown>,
        durationMs,
      }),
    )
  } catch {
    // Non-fatal — audit log failure must never abort the booking.
  }
}

// ─── main action ──────────────────────────────────────────────────────────────

export async function fulfillFlightBooking(
  reservationId: string,
): Promise<FulfillResult> {
  // ── 0. Auth ─────────────────────────────────────────────────────────────────
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: "Non authentifié.", code: "UNAUTHORIZED" }

  const profile = await getCurrentAdminProfile(user.id)
  if (
    !profile ||
    !isAllowedIntoAdmin(profile.role, profile.agencyType) ||
    !(FULFILL_ROLES as readonly string[]).includes(profile.role)
  ) {
    return { ok: false, error: "Permission insuffisante.", code: "FORBIDDEN" }
  }

  // ── 1. Load flight_bookings row ──────────────────────────────────────────────
  const bookingRows = await withSystemContext((tx) =>
    tx
      .select()
      .from(flightBookings)
      .where(eq(flightBookings.reservationId, reservationId))
      .limit(1),
  )
  const booking = (bookingRows as typeof flightBookings.$inferSelect[])[0]
  if (!booking) {
    return { ok: false, error: "Réservation de vol introuvable.", code: "NOT_FOUND" }
  }
  if (booking.status !== "PENDING") {
    return {
      ok: false,
      error: `Ce dossier est déjà en statut ${booking.status}.`,
      code: "WRONG_STATUS",
    }
  }

  const bookingId = booking.id
  const snapshotId = booking.priceSnapshotId

  // ── 2. Load snapshot (authoritative price) ───────────────────────────────────
  const snapRows = await withSystemContext((tx) =>
    tx
      .select()
      .from(flightPriceSnapshots)
      .where(eq(flightPriceSnapshots.id, snapshotId!))
      .limit(1),
  )
  const snapshot = (snapRows as typeof flightPriceSnapshots.$inferSelect[])[0]
  if (!snapshot) {
    return { ok: false, error: "Snapshot de prix introuvable.", code: "SNAPSHOT_MISSING" }
  }

  const itinerary = snapshot.itinerary as unknown as CanonicalItinerary

  // ── 3. Load passengers ───────────────────────────────────────────────────────
  const passengersRows = await withSystemContext((tx) =>
    tx
      .select()
      .from(flightBookingPassengers)
      .where(eq(flightBookingPassengers.bookingId, bookingId))
      .orderBy(flightBookingPassengers.sequence),
  )
  const passengers = passengersRows as typeof flightBookingPassengers.$inferSelect[]

  // ── 4. Load contact (stored in flight_bookings.contact JSONB) ───────────────
  const contact = booking.contact as { email?: string; firstName?: string; lastName?: string }

  // ── 5. Get the right GDS adapter ────────────────────────────────────────────
  const adapters = getDefaultAdapters()
  const adapter = adapters.find((a) => a.name === snapshot.provider)
  if (!adapter) {
    return {
      ok: false,
      error: `Adaptateur "${snapshot.provider}" introuvable.`,
      code: "NO_ADAPTER",
    }
  }

  // ── 6. Transition to BOOKING_IN_PROGRESS ─────────────────────────────────────
  await updateFlightStatus(bookingId, "BOOKING_IN_PROGRESS")

  // ── 7. Recheck price + availability ──────────────────────────────────────────
  let recheckMs = Date.now()
  let recheckResult: Awaited<ReturnType<typeof adapter.recheck>>
  try {
    recheckResult = await adapter.recheck(itinerary)
    recheckMs = Date.now() - recheckMs
  } catch (err) {
    recheckMs = Date.now() - recheckMs
    await logTransaction(bookingId, snapshotId ?? null, snapshot.provider, "RECHECK", "FAILURE", {}, { error: String(err) }, recheckMs)
    await updateFlightStatus(bookingId, "FAILED")
    return { ok: false, error: "Erreur lors de la revalidation fournisseur.", code: "RECHECK_ERROR" }
  }

  await logTransaction(
    bookingId,
    snapshotId ?? null,
    snapshot.provider,
    "RECHECK",
    recheckResult.status === "AVAILABLE" ? "SUCCESS" : "FAILURE",
    { provider: snapshot.provider, providerOfferId: snapshot.providerOfferId },
    recheckResult,
    recheckMs,
  )

  // Store recheck status
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
    return {
      ok: false,
      error: `Le prix a changé depuis la réservation (nouveau prix fournisseur : ${recheckResult.currentSupplierAmount} ${recheckResult.currentSupplierCurrency ?? "TND"}).`,
      code: "PRICE_CHANGED",
    }
  }
  if (recheckResult.status !== "AVAILABLE") {
    await updateFlightStatus(bookingId, "FAILED")
    return {
      ok: false,
      error: "Cette offre n'est plus disponible.",
      code: recheckResult.status,
    }
  }

  // ── 8. Book (create PNR) ──────────────────────────────────────────────────────
  let bookMs = Date.now()
  let bookResult: Awaited<ReturnType<typeof adapter.book>>
  try {
    bookResult = await adapter.book(itinerary, passengers, contact)
    bookMs = Date.now() - bookMs
  } catch (err) {
    bookMs = Date.now() - bookMs
    await logTransaction(bookingId, snapshotId ?? null, snapshot.provider, "BOOK", "FAILURE", {}, { error: String(err) }, bookMs)
    await updateFlightStatus(bookingId, "FAILED")
    return { ok: false, error: "La réservation fournisseur a échoué.", code: "BOOK_FAILED" }
  }

  await logTransaction(
    bookingId,
    snapshotId ?? null,
    snapshot.provider,
    "BOOK",
    "SUCCESS",
    { provider: snapshot.provider, providerOfferId: snapshot.providerOfferId },
    { pnr: bookResult.pnr, supplierBookingReference: bookResult.supplierBookingReference },
    bookMs,
  )

  // Store PNR + supplier ref
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

  // ── 9. Issue tickets ──────────────────────────────────────────────────────────
  let issueMs = Date.now()
  let issueResult: Awaited<ReturnType<typeof adapter.issue>>
  try {
    issueResult = await adapter.issue(bookResult.pnr, itinerary)
    issueMs = Date.now() - issueMs
  } catch (err) {
    issueMs = Date.now() - issueMs
    await logTransaction(bookingId, snapshotId ?? null, snapshot.provider, "ISSUE", "FAILURE", {}, { error: String(err) }, issueMs)
    // Booking is created at the GDS level; ticketing failure goes to FAILED
    // so ops can retry manually or void the PNR.
    await updateFlightStatus(bookingId, "FAILED")
    return { ok: false, error: "L'émission du billet a échoué.", code: "ISSUE_FAILED" }
  }

  await logTransaction(
    bookingId,
    snapshotId ?? null,
    snapshot.provider,
    "ISSUE",
    "SUCCESS",
    { pnr: bookResult.pnr },
    { tickets: issueResult.tickets },
    issueMs,
  )

  // Create flight_tickets rows
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

  // ── 10. Confirm ───────────────────────────────────────────────────────────────
  await updateFlightStatus(bookingId, "CONFIRMED")

  // ── 11. Load reservation data for Inngest event ──────────────────────────────
  const resRows = await withSystemContext((tx) =>
    tx
      .select({
        publicRef: reservations.publicRef,
        originalAmount: reservations.originalAmount,
        customerId: reservations.customerId,
      })
      .from(reservations)
      .where(eq(reservations.id, reservationId))
      .limit(1),
  )
  const res = (resRows as Array<{ publicRef: string; originalAmount: string; customerId: string | null }>)[0]
  if (!res) {
    // Non-fatal — reservation already updated; Inngest event is best-effort.
    return { ok: true, pnr: bookResult.pnr, publicRef: "", bookingId }
  }

  // Load customer email
  let customerEmail = contact.email ?? ""
  let customerName = `${contact.firstName ?? ""} ${contact.lastName ?? ""}`.trim()

  if (res.customerId && !customerEmail) {
    const custRows = await withSystemContext((tx) =>
      tx
        .select({ email: customers.email, firstName: customers.firstName, lastName: customers.lastName })
        .from(customers)
        .where(eq(customers.id, res.customerId!))
        .limit(1),
    )
    const cust = (custRows as Array<{ email: string; firstName: string; lastName: string }>)[0]
    if (cust) {
      customerEmail = cust.email
      customerName = `${cust.firstName} ${cust.lastName}`
    }
  }

  // Derive first segment for the event payload
  const firstJourney = itinerary.journeys?.[0]
  const firstSeg = firstJourney?.segments[0]
  const adults = itinerary.fares?.find((f) => f.passengerType === "ADT")?.count ?? 1
  const children = itinerary.fares?.find((f) => f.passengerType === "CHD")?.count ?? 0

  if (customerEmail) {
    await sendEvent("booking/flight.confirmed", {
      reservationId,
      publicRef: res.publicRef,
      agencyId: booking.agencyId,
      customerEmail,
      customerName,
      origin: firstSeg?.origin ?? firstJourney?.origin ?? "",
      destination: firstSeg?.destination ?? firstJourney?.destination ?? "",
      departureAt: firstSeg?.departure ?? "",
      carrier: firstSeg?.marketingCarrier ?? "",
      flightNumber: firstSeg?.marketingFlightNumber ?? "",
      adults,
      children,
      totalTnd: Number(snapshot.sellingAmount),
    }).catch((err) =>
      console.error("[fulfillFlightBooking] Inngest sendEvent failed:", err),
    )
  }

  return { ok: true, pnr: bookResult.pnr, publicRef: res.publicRef, bookingId }
}
