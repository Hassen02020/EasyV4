/**
 * Schémas Zod pour le tunnel de réservation.
 *
 * Utilisés à la fois côté client (validation formulaire instantanée) et
 * côté Server Action (validation finale avant insertion BDD).
 */

import { z } from "zod"

const phoneRegex = /^\+?[0-9 ()\-.]{7,20}$/
const cinRegex = /^[0-9]{8}$/

export const travelerSchema = z.object({
  civility: z.enum(["M", "Mme", "Mlle"], {
    errorMap: () => ({ message: "Civilité requise" }),
  }),
  firstName: z
    .string()
    .trim()
    .min(2, "Prénom trop court")
    .max(100, "Prénom trop long"),
  lastName: z
    .string()
    .trim()
    .min(2, "Nom trop court")
    .max(100, "Nom trop long"),
  email: z.string().trim().email("Email invalide").max(320),
  phone: z
    .string()
    .trim()
    .regex(phoneRegex, "Numéro invalide (ex. +216 98 123 456)"),
  civicIdType: z.enum(["cin", "passport"]),
  civicId: z.string().trim().min(6).max(64),
  birthDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Format date invalide (YYYY-MM-DD)")
    .optional()
    .or(z.literal("")),
  nationality: z.string().trim().min(2).max(64).optional().or(z.literal("")),
})

export type TravelerInput = z.infer<typeof travelerSchema>

/**
 * Validation conditionnelle CIN vs Passport :
 *  - CIN tunisien = 8 chiffres
 *  - Passport = au moins 6 caractères, autre format accepté
 */
export const travelerSchemaWithIdRule = travelerSchema.superRefine(
  (data, ctx) => {
    if (data.civicIdType === "cin" && !cinRegex.test(data.civicId)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["civicId"],
        message: "CIN tunisien : 8 chiffres exactement",
      })
    }
  },
)

export const bookingDraftSchema = z.object({
  module: z.enum([
    "hotel",
    "flight",
    "package",
    "omra",
    "transfer",
    "activity",
  ]),
  offerId: z.string().min(1),
  offerLabel: z.string().min(1),
  /** ISO date YYYY-MM-DD */
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  /** ISO date YYYY-MM-DD */
  endDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  adults: z.coerce.number().int().min(1).max(20),
  children: z.coerce.number().int().min(0).max(10).default(0),
  /** Prix unitaire HT par adulte (TND). */
  unitPriceTnd: z.coerce.number().nonnegative(),
  unitChildPriceTnd: z.coerce.number().nonnegative().optional(),
  currency: z.enum(["TND", "EUR", "USD"]).default("TND"),
  /** Métadonnées du fournisseur (myGo, GDS, etc.). */
  metadata: z.record(z.unknown()).optional(),
})

export type BookingDraft = z.infer<typeof bookingDraftSchema>

export const paymentMethodSchema = z.enum([
  "card",
  "transfer",
  "cash",
  "at_hotel",
])

export const checkoutSchema = z.object({
  paymentMethod: paymentMethodSchema,
  acceptCgv: z.literal(true, {
    errorMap: () => ({ message: "Vous devez accepter les CGV" }),
  }),
})

export type CheckoutInput = z.infer<typeof checkoutSchema>
