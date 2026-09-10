/**
 * Schémas Zod — réservation Attractions (Phase 13.1, gap #1).
 *
 * Même contact principal que Packages (`travelerSchemaWithIdRule`) — une
 * attraction se réserve avec un contact principal + des compteurs
 * d'occupants (adultes/enfants), pas une fiche détaillée par participant
 * comme Omra (pas de visa/passeport requis pour une visite).
 *
 * Minimum mandaté : adulte + enfant (avec âges). `seniors` existe déjà en
 * colonne (`catalog_activity_sessions.senior_price_tnd`, Phase <13) mais
 * n'est pas câblé dans ce moteur de réservation — hors périmètre du mandat
 * Phase 13.1 (qui ne demande explicitement qu'adulte/enfant), documenté
 * comme tel dans le rapport plutôt que silencieusement étendu.
 */

import { z } from "zod"
import { travelerSchemaWithIdRule } from "@/lib/booking/schemas"

const baseActivityBookingFields = {
  activityId: z.string().uuid("Attraction invalide"),
  sessionId: z.string().uuid("Session invalide"),
  adults: z.coerce.number().int().min(1, "Au moins un adulte requis").max(50, "Maximum 50 adultes"),
  children: z.coerce.number().int().min(0).max(50).default(0),
  childrenAges: z.array(z.coerce.number().int().min(0).max(17)).max(50).default([]),
}

export const activityGuestBookingSchema = z
  .object({
    ...baseActivityBookingFields,
    traveler: travelerSchemaWithIdRule,
    // Coché par le client s'il a vu et accepté la politique d'annulation
    // affichée avant validation (voir lib/booking/policy-engine.ts). `false`
    // par défaut : n'a de sens que si une politique existe réellement pour
    // cette attraction — absence de politique = rien à accepter, jamais
    // bloquant.
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

export type ActivityGuestBookingInput = z.infer<typeof activityGuestBookingSchema>

/**
 * B2B : contact client simple (nom/téléphone/email) au lieu du contact
 * "guest checkout" complet avec pièce d'identité — l'agence partenaire gère
 * elle-même son KYC, même niveau de détail que le contact déjà utilisé par
 * `createOmraBooking`/le tunnel `/pro` existant (pas une nouvelle norme
 * inventée pour ce seul moteur).
 */
export const activityPartnerBookingSchema = z
  .object({
    ...baseActivityBookingFields,
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

export type ActivityPartnerBookingInput = z.infer<typeof activityPartnerBookingSchema>

/**
 * Règle d'âge enfant "si déjà prévue" (mandat Phase 13.1) : lit
 * `catalog_activities.tariff_rules` (jsonb, Phase <13, jamais câblé côté
 * admin/booking jusqu'ici) SI il contient un champ `childMaxAge` numérique.
 * Ne rejette rien si le champ est absent — ne fabrique aucune règle qui
 * n'a pas été explicitement saisie par l'agence.
 */
export function validateChildAgesAgainstTariffRules(
  tariffRules: unknown,
  childrenAges: number[],
): string | null {
  if (!tariffRules || typeof tariffRules !== "object") return null
  const maxAge = (tariffRules as Record<string, unknown>).childMaxAge
  if (typeof maxAge !== "number" || !Number.isFinite(maxAge)) return null
  const invalid = childrenAges.some((age) => age > maxAge)
  if (invalid) {
    return `L'âge enfant maximum accepté pour cette attraction est ${maxAge} ans.`
  }
  return null
}
