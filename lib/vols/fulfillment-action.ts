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

import { eq, and, isNotNull } from "drizzle-orm"
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
import { inngest, type Events } from "@/lib/inngest/client"
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

// G12: retry config — 1 initial attempt + up to 3 retries, doubling each time.
const AUDIT_MAX_ATTEMPTS = 4
const AUDIT_RETRY_BASE_MS = 50

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
  for (let attempt = 1; attempt <= AUDIT_MAX_ATTEMPTS; attempt++) {
    try {
      if (attempt > 1) {
        // Exponential backoff: 50ms, 100ms, 200ms
        await new Promise<void>((resolve) =>
          setTimeout(resolve, AUDIT_RETRY_BASE_MS * 2 ** (attempt - 2)),
        )
      }
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
      return
    } catch (err) {
      if (attempt < AUDIT_MAX_ATTEMPTS) continue
      // All retries exhausted — emit structured log for aggregator pickup.
      // Never throw: audit failure must never abort the booking.
      console.error(
        JSON.stringify({
          tag: "AUDIT_FAILURE",
          bookingId,
          provider,
          transactionType,
          status,
          durationMs,
          error: String(err),
          ts: new Date().toISOString(),
        }),
      )
    }
  }
}

// G13: reliable event dispatch — retry + idempotency key + structured fallback.
// The idempotency key (`flight.confirmed:<bookingId>`) means Inngest deduplicates
// duplicate sends (admin retry, concurrent calls) within its dedup window.
const INNGEST_MAX_ATTEMPTS = 3
const INNGEST_RETRY_BASE_MS = 100

async function dispatchFlightConfirmed(
  bookingId: string,
  customerEmail: string,
  payload: Events["booking/flight.confirmed"]["data"],
): Promise<void> {
  if (!customerEmail) {
    console.warn(
      JSON.stringify({
        tag: "INNGEST_DISPATCH_SKIPPED",
        bookingId,
        event: "booking/flight.confirmed",
        reason: "no customer email",
        ts: new Date().toISOString(),
      }),
    )
    return
  }

  const eventId = `flight.confirmed:${bookingId}`

  for (let attempt = 1; attempt <= INNGEST_MAX_ATTEMPTS; attempt++) {
    try {
      if (attempt > 1) {
        await new Promise<void>((resolve) =>
          setTimeout(resolve, INNGEST_RETRY_BASE_MS * 2 ** (attempt - 2)),
        )
      }
      await inngest.send({ id: eventId, name: "booking/flight.confirmed", data: payload })
      return
    } catch (err) {
      if (attempt < INNGEST_MAX_ATTEMPTS) continue
      // All retries exhausted — emit structured log with full payload for manual replay.
      console.error(
        JSON.stringify({
          tag: "INNGEST_DISPATCH_FAILURE",
          bookingId,
          event: "booking/flight.confirmed",
          payload,
          error: String(err),
          ts: new Date().toISOString(),
        }),
      )
    }
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

  // ── 1. Atomically claim booking — two-arm CAS inside one transaction ──────────
  //
  // Arm A (normal):   PENDING → BOOKING_IN_PROGRESS
  // Arm B (re-issue): FAILED + pnr IS NOT NULL → TICKETING_IN_PROGRESS
  //
  // Arm B handles the PNR_ORPHANED scenario: issue() previously failed after
  // book() succeeded, cancel() also failed, so the PNR is still live at the GDS.
  // Re-issuing is safe because the PNR already exists — book() is NEVER called
  // again in the re-issue path, making the retry idempotent.
  const claimedRows = await withSystemContext(async (tx) => {
    // Try Arm A: normal full path
    const pendingRows = await tx
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
        agencyId: flightBookings.agencyId,
        contact: flightBookings.contact,
        pnr: flightBookings.pnr,
        supplierBookingRef: flightBookings.supplierBookingRef,
      })

    if (pendingRows.length > 0) {
      await tx
        .update(reservations)
        .set({ status: "on_request", updatedAt: new Date() })
        .where(eq(reservations.id, reservationId))
      return pendingRows.map((r) => ({ ...r, reissueOnly: false as const }))
    }

    // Try Arm B: PNR_ORPHANED re-issue — only a booking that already has a PNR
    // is eligible; a FAILED booking without a PNR cannot be re-issued.
    const reissueRows = await tx
      .update(flightBookings)
      .set({ status: "TICKETING_IN_PROGRESS", updatedAt: new Date() })
      .where(
        and(
          eq(flightBookings.reservationId, reservationId),
          eq(flightBookings.status, "FAILED"),
          isNotNull(flightBookings.pnr),
        ),
      )
      .returning({
        id: flightBookings.id,
        priceSnapshotId: flightBookings.priceSnapshotId,
        agencyId: flightBookings.agencyId,
        contact: flightBookings.contact,
        pnr: flightBookings.pnr,
        supplierBookingRef: flightBookings.supplierBookingRef,
      })

    return reissueRows.map((r) => ({ ...r, reissueOnly: true as const }))
  })

  if (claimedRows.length === 0) {
    const existingRows = await withSystemContext((tx) =>
      tx
        .select({ status: flightBookings.status, pnr: flightBookings.pnr })
        .from(flightBookings)
        .where(eq(flightBookings.reservationId, reservationId))
        .limit(1),
    )
    if (!existingRows.length) {
      return { ok: false, error: "Réservation de vol introuvable.", code: "NOT_FOUND" }
    }
    const existing = (existingRows[0] as { status: string; pnr: string | null })
    // FAILED without a PNR: no GDS booking exists, nothing to re-issue.
    const hint = existing.status === "FAILED" && !existing.pnr
      ? " (aucun PNR — le dossier doit être réinitialisé manuellement)"
      : ""
    return {
      ok: false,
      error: `Ce dossier est déjà en statut ${existing.status}.${hint}`,
      code: "WRONG_STATUS",
    }
  }

  const claimed = claimedRows[0]!
  const bookingId = claimed.id
  const snapshotId = claimed.priceSnapshotId
  const { reissueOnly } = claimed

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
  const contact = claimed.contact as { email?: string; firstName?: string; lastName?: string }

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

  // ── activePnr: set from book() on normal path, or claimed.pnr on re-issue ─────
  let activePnr: string

  if (reissueOnly) {
    // Re-issue path: PNR already committed at GDS — skip recheck and book entirely.
    // Calling book() again here would create a duplicate GDS booking.
    // Status is already TICKETING_IN_PROGRESS from the Arm B CAS above.
    activePnr = claimed.pnr! // guaranteed non-null by isNotNull() in the WHERE clause
  } else {
    // ── 6. Recheck price + availability ──────────────────────────────────────────
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

    // ── 8. Book (create PNR) ────────────────────────────────────────────────────
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
    activePnr = bookResult.pnr
  }

  // ── 9. Issue tickets ──────────────────────────────────────────────────────────
  let issueMs = Date.now()
  let issueResult: Awaited<ReturnType<typeof adapter.issue>>
  try {
    issueResult = await adapter.issue(activePnr, itinerary)
    issueMs = Date.now() - issueMs
  } catch (err) {
    issueMs = Date.now() - issueMs
    await logTransaction(bookingId, snapshotId ?? null, snapshot.provider, "ISSUE", "FAILURE", {}, { error: String(err) }, issueMs)

    // PNR is live at GDS — attempt auto-cancel to avoid an orphaned booking.
    let pnrOrphaned = false
    const cancelMs0 = Date.now()
    try {
      await adapter.cancel(activePnr, itinerary)
      await logTransaction(bookingId, snapshotId ?? null, snapshot.provider, "CANCEL", "SUCCESS", { pnr: activePnr }, {}, Date.now() - cancelMs0)
    } catch (cancelErr) {
      await logTransaction(bookingId, snapshotId ?? null, snapshot.provider, "CANCEL", "FAILURE", { pnr: activePnr }, { error: String(cancelErr) }, Date.now() - cancelMs0)
      pnrOrphaned = true
    }

    if (pnrOrphaned) {
      await withSystemContext((tx) =>
        tx
          .update(flightBookings)
          .set({
            opsNotes: `PNR orphan: cancel failed after issue() failure — manual void required. PNR: ${activePnr}`,
            updatedAt: new Date(),
          })
          .where(eq(flightBookings.id, bookingId)),
      )
    }

    await updateFlightStatus(bookingId, "FAILED")
    return {
      ok: false,
      error: "L'émission du billet a échoué.",
      code: pnrOrphaned ? "PNR_ORPHANED" : "ISSUE_FAILED",
    }
  }

  await logTransaction(
    bookingId,
    snapshotId ?? null,
    snapshot.provider,
    "ISSUE",
    "SUCCESS",
    { pnr: activePnr },
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

  // On successful re-issue, clear the orphan flag that was set previously.
  if (reissueOnly) {
    await withSystemContext((tx) =>
      tx
        .update(flightBookings)
        .set({ opsNotes: null, updatedAt: new Date() })
        .where(eq(flightBookings.id, bookingId)),
    )
  }

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
    return { ok: true, pnr: activePnr, publicRef: "", bookingId }
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

  await dispatchFlightConfirmed(bookingId, customerEmail, {
    reservationId,
    publicRef: res.publicRef,
    agencyId: claimed.agencyId,
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
  })

  return { ok: true, pnr: activePnr, publicRef: res.publicRef, bookingId }
}
