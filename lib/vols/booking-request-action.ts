"use server"

/**
 * Flight Booking Request — Phase 7
 *
 * Creates a FlightBooking record (status=PENDING) referencing a price
 * snapshot. Does NOT call any GDS adapter immediately — the Ticketing Desk
 * picks up PENDING requests, rechecks, books, and issues.
 *
 * The supplier price is never returned to the client. Only the bookingId
 * and confirmation details are returned.
 */

import { withSystemContext } from "@/lib/db/tenant-context"
import { flightBookings, flightBookingPassengers, flightBookingSegments } from "@/lib/db/schema/flights"
import { getPriceSnapshot, markSnapshotUsed } from "./price-snapshot"
import { getDefaultAgencyId } from "@/lib/agencies/default-agency"
import type { CanonicalItinerary } from "./canonical"
import { z } from "zod"

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

export const flightBookingRequestSchema = z.object({
  snapshotId: z.string().uuid(),
  passengers: z.array(passengerSchema).min(1).max(9),
  contact: contactSchema,
})

export type FlightBookingRequestInput = z.infer<typeof flightBookingRequestSchema>

export type FlightBookingRequestResult =
  | {
      ok: true
      bookingId: string
      status: "PENDING"
      /** Estimated processing time (SLA ~15 min). */
      slaMinutes: number
    }
  | { ok: false; error: string; code?: string }

const SLA_MINUTES = 15

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

  const { snapshotId, passengers, contact } = parsed.data

  // Load and validate snapshot
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
    // Create booking + passengers + segments in one system transaction
    const bookingRows = await withSystemContext(async (tx) => {
      const bookingResult = await tx
        .insert(flightBookings)
        .values({
          agencyId,
          priceSnapshotId: snapshotId,
          tripType: itinerary.tripType,
          itinerary: itinerary as unknown as Record<string, unknown>,
          contact: contact as unknown as Record<string, unknown>,
          status: "PENDING",
          provider: snapshot.provider,
          slaDeadline,
        })
        .returning({ id: flightBookings.id })

      const bookingId = (bookingResult as Array<{ id: string }>)[0]!.id

      // Insert passengers
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

      // Insert segments from canonical itinerary
      if (itinerary.segments && itinerary.segments.length > 0) {
        await tx.insert(flightBookingSegments).values(
          itinerary.segments.map((seg, i) => ({
            bookingId,
            sequence: i + 1,
            origin: seg.origin,
            destination: seg.destination,
            departure: new Date(seg.departure),
            arrival: new Date(seg.arrival),
            airline: seg.airline,
            flightNumber: seg.flightNumber,
            durationMin: seg.durationMinutes,
            stops: seg.stops,
            equipment: seg.equipment,
            cabin: seg.cabin,
          })),
        )
      }

      return bookingId
    })

    // Mark snapshot as used (idempotent for ACTIVE → USED)
    await markSnapshotUsed(snapshotId)

    return {
      ok: true,
      bookingId: bookingRows as unknown as string,
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
