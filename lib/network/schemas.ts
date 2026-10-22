/**
 * Schémas Zod — réservation Network B2C (guest checkout).
 *
 * Un produit Network se réserve avec un contact principal (voyageur) +
 * une quantité. Pas de session/dates/adultes/enfants — le produit Network
 * est un service livré par le fournisseur, pas une session planifiée.
 */

import { z } from "zod"
import { travelerSchemaWithIdRule } from "@/lib/booking/schemas"

export const networkGuestBookingSchema = z.object({
  productId: z.string().uuid("Produit invalide"),
  quantity: z.coerce
    .number()
    .int()
    .min(1, "Au moins 1 requis")
    .max(99, "Maximum 99")
    .default(1),
  traveler: travelerSchemaWithIdRule,
  policyAccepted: z.boolean().optional().default(false),
})

export type NetworkGuestBookingInput = z.infer<typeof networkGuestBookingSchema>
