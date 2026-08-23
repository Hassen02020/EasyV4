/**
 * Regroupe les hôtels normalisés venant de plusieurs fournisseurs en une
 * seule fiche visible côté client ("El Mouradi Gammarth — à partir de
 * 405 TND"), sans jamais perdre la traçabilité des offres individuelles —
 * chaque tarif normalisé (NormalizedRate) reste consultable et rattaché à
 * son fournisseur d'origine.
 */

import type { NormalizedHotel, NormalizedRate } from "./types"
import { matchHotels, isAutoMergeable, type MatchConfidence } from "./mapping"

export interface DeduplicatedHotelGroup {
  /** Fiche représentative (premier hôtel du groupe) — jamais un objet inventé/fusionné champ par champ. */
  hotel: NormalizedHotel
  /** Tous les hôtels normalisés (un par fournisseur) regroupés ici, avec la confiance du rattachement au premier. */
  members: { hotel: NormalizedHotel; confidence: MatchConfidence }[]
  /** Toutes les offres tarifaires des fournisseurs regroupés — jamais réduites à une seule avant le ranking. */
  rates: NormalizedRate[]
  fromPrice: number | null
}

export function deduplicateHotels(
  hotels: NormalizedHotel[],
  rates: NormalizedRate[],
): DeduplicatedHotelGroup[] {
  const groups: DeduplicatedHotelGroup[] = []

  for (const hotel of hotels) {
    let target: DeduplicatedHotelGroup | null = null
    let bestConfidence: MatchConfidence = "UNMATCHED"

    for (const group of groups) {
      const { confidence } = matchHotels(group.hotel, hotel)
      if (isAutoMergeable(confidence) && confidence !== "UNMATCHED") {
        target = group
        bestConfidence = confidence
        break
      }
    }

    if (target) {
      target.members.push({ hotel, confidence: bestConfidence })
    } else {
      groups.push({ hotel, members: [{ hotel, confidence: "EXACT" }], rates: [], fromPrice: null })
    }
  }

  for (const group of groups) {
    const memberHotelIds = new Set(group.members.map((m) => m.hotel.id).filter(Boolean))
    const memberCodes = new Set(
      group.members.flatMap((m) => m.hotel.supplierMappings.map((sm) => `${sm.supplier}:${sm.supplierHotelCode}`)),
    )
    group.rates = rates.filter(
      (r) => memberHotelIds.has(r.hotelId) || memberCodes.has(`${r.supplier}:${r.supplierHotelCode}`),
    )
    group.fromPrice = group.rates.length
      ? Math.min(...group.rates.map((r) => r.sellingPrice))
      : null
  }

  return groups
}
