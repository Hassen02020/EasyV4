/**
 * Schémas Zod pour la réservation Vols — B2C guest checkout.
 *
 * Plus léger que `omraPilgrimSchema` (pas de visa/santé/contact d'urgence,
 * un vol n'en a pas besoin) mais suit le même principe : partagé entre le
 * formulaire client (`zodResolver`) et la Server Action
 * (`lib/vols/guest-booking-actions.ts`).
 *
 * `offerToken`/`expectedPriceTnd` ne sont PAS revalidés ici — ce schéma ne
 * garantit qu'un format correct côté formulaire ; la revalidation réelle
 * (prix, disponibilité, expiration) a lieu côté serveur dans
 * `lib/vols/virtual-supplier/engine.ts::book()`, jamais dans ce fichier.
 */

import { z } from "zod"

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
