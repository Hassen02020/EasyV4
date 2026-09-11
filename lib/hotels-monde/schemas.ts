/**
 * Schémas Zod pour la réservation Hôtels Monde — B2C guest checkout.
 *
 * Un seul voyageur (le client principal, "lead guest") plutôt qu'un
 * formulaire par passager comme Vols (`lib/vols/schemas.ts`) : une
 * réservation hôtelière porte sur des chambres/nuitées, pas des sièges
 * nominatifs — même modèle que le tunnel hôtel existant
 * (`lib/booking/schemas.ts::travelerSchema`), simplifié aux champs
 * réellement utiles pour un hôtel à l'étranger (pas de civicIdType
 * CIN/Passport : un hôtel international ne vérifie jamais un CIN
 * tunisien).
 *
 * `offerToken`/`expectedPriceTnd` ne sont PAS revalidés ici — ce schéma ne
 * garantit qu'un format correct côté formulaire ; la revalidation réelle
 * (prix, disponibilité, expiration) a lieu côté serveur dans
 * `lib/hotels-monde/virtual-supplier/engine.ts::book()`, jamais dans ce
 * fichier.
 */

import { z } from "zod"

const phoneRegex = /^\+?[0-9 ()\-.]{7,20}$/

export const worldHotelGuestSchema = z.object({
  civility: z.enum(["M", "Mme", "Mlle"], {
    errorMap: () => ({ message: "Civilité requise" }),
  }),
  firstName: z.string().trim().min(2, "Prénom requis (min 2 caractères)").max(100),
  lastName: z.string().trim().min(2, "Nom requis (min 2 caractères)").max(100),
  email: z.string().trim().email("Email invalide").max(320),
  phone: z.string().trim().regex(phoneRegex, "Numéro invalide (ex. +216 98 123 456)"),
  nationality: z.string().trim().max(64).optional().or(z.literal("")),
})

export type WorldHotelGuestFormInput = z.infer<typeof worldHotelGuestSchema>

export const worldHotelGuestBookingSchema = z.object({
  offerToken: z.string().min(1, "Offre invalide"),
  expectedPriceTnd: z.number().positive("Prix invalide"),
  guest: worldHotelGuestSchema,
  specialRequests: z.string().trim().max(500).optional().or(z.literal("")),
})

export type WorldHotelGuestBookingInput = z.infer<typeof worldHotelGuestBookingSchema>
