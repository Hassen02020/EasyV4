/**
 * Client Hôtels Monde — Easy2Book
 *
 * Stub d'intégration API hôtels monde (Expedia Rapid API / Booking.com
 * Demand API — le choix exact du fournisseur est une décision commerciale
 * non tranchée, voir feature-flags/index.ts:"hotels_monde"). Même pattern
 * que lib/vols/client.ts (lui-même aligné sur lib/mygo/client.ts) :
 *  - Zod validation des réponses
 *  - Cache Redis (memoize) une fois un vrai fournisseur branché
 *  - En attendant les credentials API, `searchWorldHotels` appelle un vrai
 *    moteur de fournisseur virtuel (Virtual World Hotel Supplier, voir
 *    lib/hotels-monde/virtual-supplier/engine.ts) — offres déterministes
 *    par destination/dates, disponibilité réelle suivie en mémoire, jeton
 *    signé à revalider pour réserver (voir
 *    lib/hotels-monde/guest-booking-actions.ts). Toujours marquées
 *    `source: "virtual"`, jamais présentées comme un vrai inventaire.
 *
 * Variables d'environnement :
 *  - WORLD_HOTELS_API_KEY       : clé API du fournisseur choisi
 *  - WORLD_HOTELS_API_BASE_URL  : ex. https://api.ean.com/v3
 *  - WORLD_HOTELS_DEMO_MODE     : "true" pour forcer le mode virtuel
 */

import { z } from "zod"
import {
  createVirtualWorldHotelDriver,
  createWorldHotelApiDriver,
  searchAcrossWorldHotelDrivers,
} from "./supplier-drivers"

// ---------------------------------------------------------------------------
// Schemas Zod
// ---------------------------------------------------------------------------

export const WorldHotelOfferSchema = z.object({
  id: z.string(),
  name: z.string(),
  city: z.string(),
  country: z.string(),
  stars: z.number().min(1).max(5).nullable(),
  /** Note voyageurs sur 10, comme les agrégateurs (Booking/Expedia). */
  rating: z.number().min(0).max(10).nullable(),
  reviewCount: z.number().nullable(),
  thumbnailUrl: z.string().nullable(),
  pricePerNightTnd: z.number(),
  totalPriceTnd: z.number(),
  nights: z.number(),
  currency: z.string().default("TND"),
  refundable: z.boolean(),
  breakfastIncluded: z.boolean(),
  distanceFromCenterKm: z.number().nullable(),
  source: z.string().default("demo"),
  /** Jeton signé serveur (Virtual World Hotel Supplier) à revalider pour réserver — voir lib/hotels-monde/guest-booking-actions.ts. Absent en mode API réelle tant qu'aucun adaptateur de réservation n'y est branché. */
  offerToken: z.string().optional(),
})

export type WorldHotelOffer = z.infer<typeof WorldHotelOfferSchema>

export interface WorldHotelSearchInput {
  destination: string // valeur POPULAR_DESTINATIONS (ex: "istanbul")
  checkIn: string // YYYY-MM-DD
  checkOut: string // YYYY-MM-DD
  nights: number
  adults: number
  rooms: number
  stars?: number
}

export type WorldHotelSearchResult =
  | { ok: true; offers: WorldHotelOffer[]; searchId: string }
  | { ok: false; error: string; code: string }

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------
//
// Chantier 7 (Multi-supplier Hub, fondation minimale) : les deux chemins
// qui existaient ici (fournisseur virtuel déterministe / appel API réel)
// sont désormais deux `WorldHotelSupplierDriver` orchestrés par
// `searchAcrossWorldHotelDrivers()` (lib/hotels-monde/supplier-drivers.ts)
// au lieu d'un `if/else` figé — un futur second fournisseur réel s'ajoute
// à la liste de drivers, sans réécrire cette fonction. Comportement
// inchangé aujourd'hui : les deux drivers restent mutuellement exclusifs
// (voir isDemoMode() dans supplier-drivers.ts), donc toujours exactement
// un seul CONFIGURED.

export async function searchWorldHotels(
  input: WorldHotelSearchInput,
): Promise<WorldHotelSearchResult> {
  return searchAcrossWorldHotelDrivers(
    [createVirtualWorldHotelDriver(), createWorldHotelApiDriver()],
    input,
  )
}
