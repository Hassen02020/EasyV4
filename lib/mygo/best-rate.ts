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
  /**
   * PHASE 30 — `RoomOfferDTO.basePrice`, quand myGo la renvoie (prix avant
   * remise réel, jamais fabriqué) — sert à afficher un vrai prix barré côté
   * card/détail. `undefined` si myGo ne l'a pas fournie pour cette chambre.
   */
  basePrice?: number
}

function flattenRooms(
  offer: HotelOfferDTO,
): { boardingName: string; price: number; basePrice?: number; stopReservation: boolean }[] {
  return offer.boardings.flatMap((b) =>
    b.pax.flatMap((p) =>
      p.rooms.map((r) => ({
        boardingName: b.name,
        price: r.price,
        basePrice: r.basePrice,
        stopReservation: r.stopReservation,
      })),
    ),
  )
}

export function selectBestRate(
  offer: HotelOfferDTO,
  activeBoardings: string[] = [],
): BestRateSelection | null {
  const all = flattenRooms(offer)
  if (all.length === 0) return null

  // Une chambre `stopReservation` n'est pas réellement réservable (myGo :
  // sur demande / complet) — même règle que `lowestPrice` (lib/mygo/
  // mappers.ts, source de `fromPrice`) et `hasAvailableRoom` (lib/mygo/
  // facets.ts, filtre "Disponible seulement") : ne jamais afficher comme
  // "meilleur tarif" un prix que le client ne peut pas réellement réserver.
  // Repli sur l'ensemble complet si AUCUNE chambre n'est réservable (hôtel
  // entièrement en stop) — afficher un prix indicatif reste préférable à
  // n'afficher aucun prix pour une offre par ailleurs listée.
  const bookable = all.filter((r) => !r.stopReservation)
  const pool = bookable.length > 0 ? bookable : all

  const eligible =
    activeBoardings.length === 0
      ? pool
      : pool.filter((r) => activeBoardings.includes(r.boardingName))
  // Repli sur l'ensemble du pool si aucune chambre ne correspond au filtre
  // de pension — ne devrait pas arriver en pratique : `applyFilters`
  // (lib/mygo/facets.ts) exclut déjà l'offre entière dans ce cas.
  const candidates = eligible.length > 0 ? eligible : pool

  const winner = candidates.reduce<(typeof candidates)[number] | null>(
    (best, cur) => (best === null || cur.price < best.price ? cur : best),
    null,
  )
  if (!winner) return null
  return {
    price: winner.price,
    boardingName: winner.boardingName,
    // N'ajoute la clé que si myGo a réellement fourni un basePrice — sinon
    // `assert.deepStrictEqual` (utilisé par les tests existants) distingue
    // `{ basePrice: undefined }` d'un objet sans cette clé.
    ...(winner.basePrice != null ? { basePrice: winner.basePrice } : {}),
  }
}
