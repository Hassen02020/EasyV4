/**
 * Schémas Zod pour le module Vols — types FlightOffer (résultats de
 * recherche) et schémas de réservation B2C guest checkout.
 *
 * Migré depuis lib/vols/client.ts (VOLS-CLEANUP-01, 2026-10-03) :
 * FlightOffer et les schémas associés vivent ici ; client.ts + supplier-
 * drivers.ts (ancienne architecture) ont été supprimés après migration.
 */

import { z } from "zod"

// ---------------------------------------------------------------------------
// Schémas FlightOffer — résultats de recherche
// (anciennement lib/vols/client.ts)
// ---------------------------------------------------------------------------

export const FlightSegmentSchema = z.object({
  origin: z.string(),
  destination: z.string(),
  departure: z.string(),
  arrival: z.string(),
  marketingCarrier: z.string(),
  operatingCarrier: z.string(),
  marketingFlightNumber: z.string(),
  operatingFlightNumber: z.string().optional(),
  durationMinutes: z.number(),
  stops: z.number(),
  equipment: z.string().optional(),
  cabin: z.enum(["ECONOMY", "PREMIUM_ECONOMY", "BUSINESS", "FIRST"]),
  bookingClass: z.string().optional(),
  fareBrandId: z.string().optional(),
})

const LayoverSchema = z.object({
  airport: z.string(),
  durationMinutes: z.number(),
  isOvernightLayover: z.boolean(),
  terminalChange: z.boolean().optional(),
})

export const FlightJourneySchema = z.object({
  origin: z.string(),
  destination: z.string(),
  departureDate: z.string(),
  segments: z.array(FlightSegmentSchema),
  layovers: z.array(LayoverSchema),
})

export const FlightOfferSchema = z.object({
  id: z.string(),
  /** Structured journeys (legs) — preferred over flat segments. */
  journeys: z.array(FlightJourneySchema),
  stops: z.number(),
  totalDurationMinutes: z.number(),
  /** @deprecated use sellingAmount — kept for backward compat */
  priceTnd: z.number().optional(),
  /** Selling price shown to client (includes fees + markup). */
  sellingAmount: z.number().optional(),
  sellingCurrency: z.string().optional(),
  currency: z.string().default("TND"),
  availableSeats: z.number().nullable(),
  refundable: z.boolean(),
  baggageKg: z.number().nullable(),
  source: z.string().default("virtual"),
  /** Immutable price snapshot ID — use this to request a ticket, not the price. */
  snapshotId: z.string().optional(),
  expiresAt: z.string().optional(),
})

export type FlightOffer = z.infer<typeof FlightOfferSchema>

export interface FlightSearchInput {
  originCode: string
  destinationCode: string
  departureDate: string
  returnDate?: string
  adults: number
  children?: number
  cabin?: "ECONOMY" | "PREMIUM_ECONOMY" | "BUSINESS" | "FIRST"
}

export type FlightSearchResult =
  | { ok: true; offers: FlightOffer[]; searchId: string }
  | { ok: false; error: string; code: string }

const isoDate = /^\d{4}-\d{2}-\d{2}$/

export const flightTravelerSchema = z.object({
  firstName: z.string().trim().min(2, "Prénom requis (min 2 caractères)"),
  lastName: z.string().trim().min(2, "Nom requis (min 2 caractères)"),
  birthDate: z.string().regex(isoDate, "Format date invalide (AAAA-MM-JJ)"),
  gender: z.enum(["male", "female"]),
  nationality: z.string().trim().length(2, "Code pays requis (ex: TN)"),
  passportNumber: z.string().trim().min(6, "Numéro de passeport ou CIN requis"),
  email: z.string().trim().email("Email invalide").optional().or(z.literal("")),
  phone: z.string().trim().optional().or(z.literal("")),
})

export type FlightTravelerFormInput = z.infer<typeof flightTravelerSchema>

/** Le premier voyageur sert de contact principal — un email est requis pour lui. */
export const flightGuestBookingSchema = z
  .object({
    offerToken: z.string().min(1, "Offre invalide"),
    expectedPriceTnd: z.number().positive("Prix invalide"),
    travelers: z
      .array(flightTravelerSchema)
      .min(1, "Au moins un voyageur requis")
      .max(9, "Maximum 9 voyageurs par réservation"),
  })
  .superRefine((data, ctx) => {
    if (!data.travelers[0]?.email) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["travelers", 0, "email"],
        message: "Un email est requis pour le contact principal du groupe",
      })
    }
  })

export type FlightGuestBookingInput = z.infer<typeof flightGuestBookingSchema>

// ---------------------------------------------------------------------------
// G10 — New B2C booking schema (snapshotId replaces offerToken/expectedPrice)
// Used by /vols/passengers → booking-request-action.ts
// ---------------------------------------------------------------------------

export const flightPassengerBookingSchema = z.object({
  snapshotId: z.string().uuid(),
  travelers: z
    .array(flightTravelerSchema)
    .min(1, "Au moins un voyageur requis")
    .max(9, "Maximum 9 voyageurs par réservation"),
})

export type FlightPassengerBookingInput = z.infer<
  typeof flightPassengerBookingSchema
>
