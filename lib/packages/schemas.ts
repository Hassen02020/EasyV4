/**
 * Schémas Zod — réservation Voyages Organisés (Packages), B2C guest checkout
 * (Phase 12, Partie 9-10).
 *
 * Le contact voyageur principal réutilise `travelerSchemaWithIdRule`
 * (lib/booking/schemas.ts) — même modèle que le tunnel Hôtel, pas une
 * nouvelle validation inventée : un package se réserve avec un contact
 * principal + des compteurs d'occupants (adultes/enfants), pas une fiche
 * détaillée par voyageur comme Omra (pas de visa/passeport requis ici).
 */

import { z } from "zod"
import { travelerSchemaWithIdRule } from "@/lib/booking/schemas"

export const packageGuestBookingSchema = z.object({
  packageId: z.string().uuid("Package invalide"),
  departureId: z.string().uuid("Départ invalide"),
  adults: z.coerce.number().int().min(1, "Au moins un adulte requis").max(20, "Maximum 20 adultes"),
  children: z.coerce.number().int().min(0).max(20).default(0),
  childrenAges: z.array(z.coerce.number().int().min(0).max(17)).max(20).default([]),
  traveler: travelerSchemaWithIdRule,
})
.superRefine((data, ctx) => {
  if (data.childrenAges.length !== data.children) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["childrenAges"],
      message: "L'âge de chaque enfant est requis",
    })
  }
})

export type PackageGuestBookingInput = z.infer<typeof packageGuestBookingSchema>
