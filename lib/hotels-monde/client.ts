/**
 * Client Hôtels Monde — Easy2Book
 *
 * Intégration RateHawk (Emerging Travel Group, pAPI v3 — décision
 * fournisseur validée, voir en-tête de `createRateHawkDriver` dans
 * ./supplier-drivers.ts). Même pattern que lib/vols/client.ts (lui-même
 * aligné sur lib/mygo/client.ts) :
 *  - Zod validation des réponses
 *  - Cache Redis (memoize) pour la résolution région (24h) et le SERP (5min)
 *  - En l'absence de credentials RateHawk (ou en environnement de démo),
 *    `searchWorldHotels` appelle un vrai moteur de fournisseur virtuel
 *    (Virtual World Hotel Supplier, voir
 *    lib/hotels-monde/virtual-supplier/engine.ts) — offres déterministes
 *    par destination/dates, disponibilité réelle suivie en mémoire, jeton
 *    signé à revalider pour réserver (voir
 *    lib/hotels-monde/guest-booking-actions.ts). Toujours marquées
 *    `source: "virtual"`, jamais présentées comme un vrai inventaire.
 *
 * Variables d'environnement :
 *  - RATEHAWK_KEY_ID / RATEHAWK_API_KEY : credentials partenaire RateHawk
 *  - RATEHAWK_API_BASE_URL              : surcharge explicite (sinon sandbox
 *                                         par défaut, prod via RATEHAWK_ENV=production)
 *  - WORLD_HOTELS_DEMO_MODE             : "true" pour forcer le mode virtuel
 */

import { z } from "zod"
import {
  createVirtualWorldHotelDriver,
  createRateHawkDriver,
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
// sont deux `WorldHotelSupplierDriver` orchestrés par
// `searchAcrossWorldHotelDrivers()` (lib/hotels-monde/supplier-drivers.ts)
// au lieu d'un `if/else` figé — RateHawk s'ajoute ici comme second driver,
// sans réécrire cette fonction ; un futur troisième fournisseur ferait de
// même. Comportement inchangé aujourd'hui : les deux drivers restent
// mutuellement exclusifs (voir isDemoMode() dans supplier-drivers.ts), donc
// toujours exactement un seul CONFIGURED tant qu'aucune credential RateHawk
// réelle n'existe dans cet environnement.

export async function searchWorldHotels(
  input: WorldHotelSearchInput,
): Promise<WorldHotelSearchResult> {
  return searchAcrossWorldHotelDrivers(
    [createVirtualWorldHotelDriver(), createRateHawkDriver()],
    input,
  )
}
