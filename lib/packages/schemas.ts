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
  // Coché par le client s'il a vu et accepté la politique d'annulation
  // affichée avant validation (voir lib/booking/policy-engine.ts). `false`
  // par défaut : n'a de sens que si une politique existe réellement pour ce
  // package — absence de politique = rien à accepter, jamais bloquant.
  policyAccepted: z.boolean().optional().default(false),
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

/**
 * B2B (Phase 13.1, gap #2) : contact client simple, même niveau de détail
 * que le contact déjà utilisé par `createOmraBooking`/`createActivityBooking`
 * B2B — l'agence partenaire gère elle-même son KYC, pas de pièce d'identité
 * exigée par la plateforme pour ce chemin.
 */
export const packagePartnerBookingSchema = z.object({
  packageId: z.string().uuid("Package invalide"),
  departureId: z.string().uuid("Départ invalide"),
  adults: z.coerce.number().int().min(1, "Au moins un adulte requis").max(20, "Maximum 20 adultes"),
  children: z.coerce.number().int().min(0).max(20).default(0),
  childrenAges: z.array(z.coerce.number().int().min(0).max(17)).max(20).default([]),
  customerFirstName: z.string().trim().min(1, "Prénom requis").max(100),
  customerLastName: z.string().trim().min(1, "Nom requis").max(100),
  customerPhone: z.string().trim().min(6, "Téléphone requis").max(32),
  customerEmail: z.string().trim().email("Email invalide").optional().or(z.literal("")),
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

export type PackagePartnerBookingInput = z.infer<typeof packagePartnerBookingSchema>
