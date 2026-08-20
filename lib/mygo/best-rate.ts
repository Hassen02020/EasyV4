/**
 * Best Rate Engine — pure, testable, sans I/O.
 *
 * Le "meilleur tarif" affiché sur une hotel card doit refléter le filtre de
 * pension actif quand il y en a un (ex. si l'utilisateur filtre "All
 * Inclusive", la card doit afficher le prix All Inclusive le moins cher, pas
 * le prix Petit-déjeuner moins cher qui serait affiché sans filtre) — voir
 * `components/hotel-listings.tsx`.
 */

import type { HotelOfferDTO } from "./types"

export interface BestRateSelection {
  price: number
  boardingName: string
}

export function selectBestRate(
  offer: HotelOfferDTO,
  activeBoardings: string[] = [],
): BestRateSelection | null {
  const allRooms = offer.boardings.flatMap((b) =>
    b.pax.flatMap((p) =>
      p.rooms.map((r) => ({ boardingName: b.name, price: r.price })),
    ),
  )
  if (allRooms.length === 0) return null

  const eligible =
    activeBoardings.length === 0
      ? allRooms
      : allRooms.filter((r) => activeBoardings.includes(r.boardingName))
  // Repli sur toutes les chambres si aucune ne correspond au filtre — ne
  // devrait pas arriver en pratique : `applyFilters` (lib/mygo/facets.ts)
  // exclut déjà l'offre entière dans ce cas.
  const candidates = eligible.length > 0 ? eligible : allRooms

  return candidates.reduce<BestRateSelection | null>(
    (best, cur) => (best === null || cur.price < best.price ? cur : best),
    null,
  )
}
