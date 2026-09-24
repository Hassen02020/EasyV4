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

import { eq, and } from "drizzle-orm"
import { withSystemContext } from "@/lib/db/tenant-context"
import { reservations, customers } from "@/lib/db/schema"
import { flightBookings, flightBookingPassengers, flightBookingSegments, flightAncillaries } from "@/lib/db/schema/flights"
import { getPriceSnapshot, markSnapshotUsed } from "./price-snapshot"
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

const ancillarySchema = z.object({
  ancillaryType: z.enum(["BAGGAGE", "SEAT", "MEAL", "LOUNGE", "INSURANCE"]),
  description: z.string().max(256).optional(),
  amount: z.number().nonnegative(),
  currency: z.string().length(3).default("TND"),
  segmentRefs: z.array(z.number().int().positive()).optional(),
  passengerRef: z.number().int().positive().optional(),
})

const flightBookingRequestSchema = z.object({
  snapshotId: z.string().uuid(),
  passengers: z.array(passengerSchema).min(1).max(9),
  contact: contactSchema,
  /** G5: link to an existing FlightOrder (multi-PNR). */
  orderId: z.string().uuid().optional(),
  /** G7: ancillary services selected during checkout. */
  ancillaries: z.array(ancillarySchema).max(20).optional(),
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

  const { snapshotId, passengers, contact, orderId, ancillaries } = parsed.data

  const snapshot = await getPriceSnapshot(snapshotId)
  if (!snapshot) {
    return {
      ok: false,
      error: "Cette offre a expiré — veuillez relancer une recherche.",
      code: "SNAPSHOT_EXPIRED",
    }
  }

  const agencyId = await getDefaultAgencyId()
  if (!agencyId) {
    return { ok: false, error: "Aucune agence de vente directe configurée.", code: "NO_AGENCY" }
  }

  const itinerary = snapshot.itinerary as unknown as CanonicalItinerary
  const slaDeadline = new Date(Date.now() + SLA_MINUTES * 60 * 1000)

  try {
    const result = await withSystemContext(async (tx) => {
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
          source: providerToSource(snapshot.provider),
          status: "pending",
          originalCurrency: snapshot.sellingCurrency ?? "TND",
          originalAmount: snapshot.sellingAmount,
          tndAmount: snapshot.sellingAmount,
        })
        .returning({ id: reservations.id, guestAccessToken: reservations.guestAccessToken })

      const { id: reservationId, guestAccessToken } = (
        reservationRows as Array<{ id: string; guestAccessToken: string }>
      )[0]!

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
          provider: snapshot.provider,
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
      if (ancillaries && ancillaries.length > 0) {
        await tx.insert(flightAncillaries).values(
          ancillaries.map((a) => ({
            bookingId,
            ancillaryType: a.ancillaryType,
            description: a.description ?? null,
            amount: String(a.amount),
            currency: a.currency,
            segmentRefs: a.segmentRefs ?? null,
            passengerRef: a.passengerRef ?? null,
            status: "PENDING",
          })),
        )
      }

      return { bookingId, reservationId, publicRef, guestAccessToken }
    })

    // Mark snapshot as used outside the main tx (idempotent)
    await markSnapshotUsed(snapshotId)

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
    console.error("[flight-booking-request] Failed:", err)
    return {
      ok: false,
      error: "Une erreur est survenue lors de la création de votre demande.",
      code: "INTERNAL_ERROR",
    }
  }
}
