"use server"

/**
 * Flight Booking Request — Phase 7 (Bridge revision)
 *
 * Creates two records atomically:
 *   1. reservations (module="flight", status="pending")  ← Booking Core bridge
 *   2. flight_bookings (status=PENDING, reservation_id FK) ← Flight state machine
 *
 * The Booking Core row makes flights visible to CRM, Finance, Customer 360,
 * and the admin history without any changes to those modules.
 *
 * Does NOT call any GDS adapter — the Ticketing Desk picks up PENDING requests,
 * rechecks, books, and issues.
 *
 * The supplier price is never returned to the client. Only bookingId,
 * publicRef, and guestAccessToken are returned.
 */

import { eq, and, gt } from "drizzle-orm"
import { withSystemContext } from "@/lib/db/tenant-context"
import { reservations, customers, payments } from "@/lib/db/schema"
import { flightBookings, flightBookingPassengers, flightBookingSegments, flightAncillaries, flightPriceSnapshots } from "@/lib/db/schema/flights"
import { getDefaultAgencyId } from "@/lib/agencies/default-agency"
import { nextPublicRef } from "@/lib/booking/actions"
import type { CanonicalItinerary } from "./canonical"
import { flattenSegments } from "./canonical"
import { z } from "zod"

// ---------------------------------------------------------------------------
// Input schemas
// ---------------------------------------------------------------------------

const passengerSchema = z.object({
  passengerType: z.enum(["ADT", "CHD", "INF"]).default("ADT"),
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  birthDate: z.string().optional(),
  nationality: z.string().length(2).optional(),
  passportNumber: z.string().max(32).optional(),
  passportExpiry: z.string().optional(),
})

const contactSchema = z.object({
  email: z.string().email(),
  phone: z.string().optional(),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
})

/**
 * G7: client sends only the ancillaryId (opaque provider reference).
 * Amount and currency are resolved server-side from the snapshot itinerary.
 * The browser never controls price.
 */
const ancillarySelectionSchema = z.object({
  ancillaryId: z.string().min(1).max(128),
  passengerRef: z.number().int().positive().optional(),
})

const flightBookingRequestSchema = z.object({
  snapshotId: z.string().uuid(),
  passengers: z.array(passengerSchema).min(1).max(9),
  contact: contactSchema,
  /** G5: link to an existing FlightOrder (multi-PNR). */
  orderId: z.string().uuid().optional(),
  /** G7: ancillary selections — identifiers only, price resolved server-side. */
  ancillaries: z.array(ancillarySelectionSchema).max(20).optional(),
  /** B2C: how the customer intends to pay (card not available yet — GDS ticketing desk flow). */
  paymentMethod: z.enum(["transfer", "cash"]).optional(),
})

export type FlightBookingRequestInput = z.infer<typeof flightBookingRequestSchema>

export type FlightBookingRequestResult =
  | {
      ok: true
      bookingId: string
      reservationId: string
      /** Public human-readable reference (e.g. TG-2026-000042). */
      publicRef: string
      /** Private token for guest confirmation/voucher URL without session. */
      guestAccessToken: string
      status: "PENDING"
      slaMinutes: number
    }
  | { ok: false; error: string; code?: string }

// ---------------------------------------------------------------------------
// Maps provider name → reservation_source enum value
// ---------------------------------------------------------------------------

function providerToSource(
  provider: string,
): "internal" | "amadeus" | "sabre" | "travelport" | "manual" {
  switch (provider) {
    case "amadeus":   return "amadeus"
    case "sabre":     return "sabre"
    case "travelport": return "travelport"
    default:          return "internal" // virtual, demo, unknown
  }
}

const SLA_MINUTES = 15

class SnapshotExpiredError extends Error {
  readonly code = "SNAPSHOT_EXPIRED" as const
  constructor() {
    super("Snapshot expired, already used, or not found")
    this.name = "SnapshotExpiredError"
  }
}

// ---------------------------------------------------------------------------
// Action
// ---------------------------------------------------------------------------

export async function createFlightBookingRequest(
  input: FlightBookingRequestInput,
): Promise<FlightBookingRequestResult> {
  const parsed = flightBookingRequestSchema.safeParse(input)
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.errors.map((e) => e.message).join(", "),
      code: "VALIDATION_ERROR",
    }
  }

  const { snapshotId, passengers, contact, orderId, ancillaries, paymentMethod } = parsed.data

  const agencyId = await getDefaultAgencyId()
  if (!agencyId) {
    return { ok: false, error: "Aucune agence de vente directe configurée.", code: "NO_AGENCY" }
  }

  const slaDeadline = new Date(Date.now() + SLA_MINUTES * 60 * 1000)

  try {
    const result = await withSystemContext(async (tx) => {
      // ── 0. Atomically claim snapshot (CAS: ACTIVE → USED) ─────────────────
      // A two-step getPriceSnapshot() + markSnapshotUsed() in separate
      // transactions creates a TOCTOU window: two concurrent requests both
      // see ACTIVE before either marks it USED — two bookings, two payments
      // collected for one price snapshot. A single UPDATE WHERE status='ACTIVE'
      // AND expiresAt > now() RETURNING * inside this transaction claims the
      // snapshot atomically. If 0 rows come back, the snapshot is expired,
      // already used, or does not exist — the whole transaction rolls back.
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

      if (snapRows.length === 0) throw new SnapshotExpiredError()

      const snap = (snapRows as Array<{
        provider: string
        itinerary: Record<string, unknown>
        sellingAmount: string
        sellingCurrency: string | null
      }>)[0]!
      const itinerary = snap.itinerary as unknown as CanonicalItinerary

      // ── 1. Find or create customer ─────────────────────────────────────────
      let customerId: string

      const existing = await tx
        .select({ id: customers.id })
        .from(customers)
        .where(
          and(
            eq(customers.agencyId, agencyId),
            eq(customers.email, contact.email),
          ),
        )
        .limit(1)

      if (existing[0]) {
        customerId = existing[0].id
      } else {
        const inserted = await tx
          .insert(customers)
          .values({
            agencyId,
            firstName: contact.firstName,
            lastName: contact.lastName,
            email: contact.email,
            phone: contact.phone ?? null,
          })
          .returning({ id: customers.id })
        customerId = (inserted as Array<{ id: string }>)[0]!.id
      }

      // ── 2. Generate public reference ───────────────────────────────────────
      const publicRef = await nextPublicRef(tx, agencyId)

      // ── 3. Insert reservations row (Booking Core bridge) ───────────────────
      const reservationRows = await tx
        .insert(reservations)
        .values({
          agencyId,
          customerId,
          publicRef,
          module: "flight",
          source: providerToSource(snap.provider),
          status: "pending",
          originalCurrency: snap.sellingCurrency ?? "TND",
          originalAmount: snap.sellingAmount,
          tndAmount: snap.sellingAmount,
        })
        .returning({ id: reservations.id, guestAccessToken: reservations.guestAccessToken })

      const { id: reservationId, guestAccessToken } = (
        reservationRows as Array<{ id: string; guestAccessToken: string }>
      )[0]!

      // ── 3b. Insert payments row when customer indicated a payment method ───
      // Finance and CRM can track the pending payment; the agency marks it
      // captured once the transfer arrives or cash is collected in-person.
      if (paymentMethod) {
        await tx.insert(payments).values({
          agencyId,
          reservationId,
          psp: "manual",
          method: paymentMethod,
          originalCurrency: snap.sellingCurrency ?? "TND",
          originalAmount: snap.sellingAmount,
          tndAmount: snap.sellingAmount,
          kind: "deposit",
          status: "pending",
        })
      }

      // ── 4. Insert flight_bookings row (state machine) ──────────────────────
      const bookingRows = await tx
        .insert(flightBookings)
        .values({
          agencyId,
          reservationId,
          customerId,
          priceSnapshotId: snapshotId,
          orderId: orderId ?? null,
          tripType: itinerary.tripType,
          itinerary: itinerary as unknown as Record<string, unknown>,
          contact: contact as unknown as Record<string, unknown>,
          status: "PENDING",
          provider: snap.provider,
          slaDeadline,
        })
        .returning({ id: flightBookings.id })

      const bookingId = (bookingRows as Array<{ id: string }>)[0]!.id

      // ── 5. Insert passengers ───────────────────────────────────────────────
      if (passengers.length > 0) {
        await tx.insert(flightBookingPassengers).values(
          passengers.map((p, i) => ({
            bookingId,
            passengerType: p.passengerType,
            firstName: p.firstName,
            lastName: p.lastName,
            birthDate: p.birthDate,
            nationality: p.nationality,
            passportNumber: p.passportNumber,
            passportExpiry: p.passportExpiry,
            sequence: i + 1,
          })),
        )
      }

      // ── 6. Insert segments (flattened across all journeys) ─────────────────
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

      // ── 7. Insert ancillaries (G7) ────────────────────────────────────────
      // Price is resolved from the snapshot itinerary — never from the client.
      if (ancillaries && ancillaries.length > 0) {
        const catalog = itinerary.ancillaries ?? []
        const resolved = ancillaries.flatMap((sel) => {
          const canonical = catalog.find((c) => c.ancillaryId === sel.ancillaryId)
          if (!canonical) return [] // unknown ancillaryId — silently skip
          return [{
            bookingId,
            ancillaryType: canonical.type,
            description: canonical.description,
            amount: String(canonical.amount),
            currency: canonical.currency,
            segmentRefs: canonical.segmentRefs ?? null,
            passengerRef: sel.passengerRef ?? canonical.passengerRef ?? null,
            status: "PENDING",
            providerAncillaryId: canonical.ancillaryId,
          }]
        })
        if (resolved.length > 0) {
          await tx.insert(flightAncillaries).values(resolved)
        }
      }

      return { bookingId, reservationId, publicRef, guestAccessToken }
    })

    return {
      ok: true,
      bookingId: result.bookingId,
      reservationId: result.reservationId,
      publicRef: result.publicRef,
      guestAccessToken: result.guestAccessToken,
      status: "PENDING",
      slaMinutes: SLA_MINUTES,
    }
  } catch (err) {
    if (err instanceof SnapshotExpiredError) {
      return {
        ok: false,
        error: "Cette offre a expiré — veuillez relancer une recherche.",
        code: "SNAPSHOT_EXPIRED",
      }
    }
    console.error("[flight-booking-request] Failed:", err)
    return {
      ok: false,
      error: "Une erreur est survenue lors de la création de votre demande.",
      code: "INTERNAL_ERROR",
    }
  }
}
