/**
 * Types & constantes partagés du tunnel de réservation Omra B2C.
 *
 * Séparé de `b2c-booking-actions.ts` car un fichier `"use server"` ne peut
 * exporter que des fonctions asynchrones (contrainte Next.js / Turbopack).
 */

import { z } from "zod"

/**
 * Agence OTA par défaut à laquelle sont rattachées les réservations publiques
 * B2C (canal direct Easy2Book, sans compte agence partenaire).
 */
export const B2C_DEFAULT_AGENCY_ID = "00000000-0000-0000-0000-000000000001"

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

export const b2cPilgrimSchema = z.object({
  firstName: z.string().trim().min(1, "Prénom requis").max(64),
  lastName: z.string().trim().min(1, "Nom requis").max(64),
  birthDate: z.string().regex(ISO_DATE, "Date de naissance invalide"),
  gender: z.enum(["male", "female"]),
  maritalStatus: z
    .enum(["single", "married", "widowed", "divorced"])
    .default("single"),
  nationality: z.string().trim().length(2).toUpperCase().default("TN"),
  country: z.string().trim().length(2).toUpperCase().default("TN"),
  phone: z.string().trim().max(20).optional(),
  email: z.string().trim().email().max(128).optional().or(z.literal("")),
  passportNumber: z.string().trim().min(1, "N° de passeport requis").max(32),
  passportIssueDate: z.string().regex(ISO_DATE, "Date de délivrance invalide"),
  passportExpiryDate: z.string().regex(ISO_DATE, "Date d'expiration invalide"),
  passportIssuingCountry: z
    .string()
    .trim()
    .length(2)
    .toUpperCase()
    .default("TN"),
})

export const b2cBookingSchema = z.object({
  packageId: z.string().uuid("Programme invalide"),
  departureDate: z.string().regex(ISO_DATE, "Date de départ invalide"),
  contactFirstName: z.string().trim().min(1, "Prénom du contact requis").max(64),
  contactLastName: z.string().trim().min(1, "Nom du contact requis").max(64),
  contactEmail: z.string().trim().email("Email invalide").max(128),
  contactPhone: z.string().trim().min(6, "Téléphone requis").max(20),
  pilgrims: z
    .array(b2cPilgrimSchema)
    .min(1, "Au moins un pèlerin est requis")
    .max(20, "Maximum 20 pèlerins par réservation"),
})

export type OmraB2CBookingInput = z.input<typeof b2cBookingSchema>

export type OmraB2CBookingResult =
  | { ok: true; reservationId: string; publicRef: string }
  | { ok: false; error: string; code?: string }
