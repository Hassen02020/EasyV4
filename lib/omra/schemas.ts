/**
 * Schémas Zod pour la réservation Omra — B2C guest checkout (Phase 12).
 *
 * `pilgrimSchema` reprend exactement les règles déjà en place côté client
 * dans `components/omra/omra-booking-form.tsx` (pas une nouvelle
 * validation inventée) ; centralisé ici pour être partagé entre le
 * formulaire client (`zodResolver`) et la Server Action
 * (`lib/omra/guest-booking-actions.ts`), même modèle que
 * `lib/booking/schemas.ts` pour le tunnel hôtel.
 */

import { z } from "zod"

const isoDate = /^\d{4}-\d{2}-\d{2}$/

export const omraPilgrimSchema = z.object({
  firstName: z.string().trim().min(2, "Prénom requis (min 2 caractères)"),
  lastName: z.string().trim().min(2, "Nom requis (min 2 caractères)"),
  firstNameAr: z.string().trim().optional().or(z.literal("")),
  lastNameAr: z.string().trim().optional().or(z.literal("")),
  birthDate: z.string().regex(isoDate, "Format date invalide (AAAA-MM-JJ)"),
  birthPlace: z.string().trim().optional().or(z.literal("")),
  nationality: z.string().trim().length(2, "Code pays requis (ex: TN)"),
  gender: z.enum(["male", "female"]),
  maritalStatus: z.enum(["single", "married", "widowed", "divorced"]),
  phone: z.string().trim().min(8, "Numéro de téléphone invalide"),
  email: z.string().trim().email("Email invalide").optional().or(z.literal("")),
  address: z.string().trim().optional().or(z.literal("")),
  city: z.string().trim().optional().or(z.literal("")),
  postalCode: z.string().trim().optional().or(z.literal("")),
  country: z.string().trim().length(2, "Code pays de résidence requis (ex: TN)"),
  passportNumber: z.string().trim().min(6, "Numéro passeport requis"),
  passportIssueDate: z.string().regex(isoDate, "Format date invalide"),
  passportExpiryDate: z.string().regex(isoDate, "Format date invalide"),
  passportIssuingCountry: z.string().trim().length(2, "Code pays émetteur requis"),
  bloodType: z.string().trim().optional().or(z.literal("")),
  hasMedicalConditions: z.boolean().default(false),
  medicalConditions: z.string().trim().optional().or(z.literal("")),
  requiresSpecialAssistance: z.boolean().default(false),
  specialAssistanceDetails: z.string().trim().optional().or(z.literal("")),
  emergencyContactName: z.string().trim().optional().or(z.literal("")),
  emergencyContactPhone: z.string().trim().optional().or(z.literal("")),
  emergencyContactRelation: z.string().trim().optional().or(z.literal("")),
  roomType: z.enum(["single", "double", "triple", "quad", "suite"]).optional(),
})

export type OmraPilgrimFormInput = z.infer<typeof omraPilgrimSchema>

/** Le premier pèlerin sert de contact principal — un email est requis pour lui. */
export const omraGuestBookingSchema = z.object({
  packageId: z.string().uuid("Package invalide"),
  departureDate: z.string().regex(isoDate, "Date de départ invalide"),
  pilgrims: z
    .array(omraPilgrimSchema)
    .min(1, "Au moins un pèlerin requis")
    .max(100, "Maximum 100 pèlerins"),
  // Coché par le client s'il a vu et accepté la politique d'annulation
  // affichée avant validation (voir lib/booking/policy-engine.ts). `false`
  // par défaut : n'a de sens que si une politique existe réellement pour ce
  // package — absence de politique = rien à accepter, jamais bloquant.
  policyAccepted: z.boolean().optional().default(false),
})
.superRefine((data, ctx) => {
  if (!data.pilgrims[0]?.email) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["pilgrims", 0, "email"],
      message: "Un email est requis pour le contact principal du groupe",
    })
  }
})

export type OmraGuestBookingInput = z.infer<typeof omraGuestBookingSchema>
