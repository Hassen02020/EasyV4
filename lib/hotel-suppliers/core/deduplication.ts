/**
 * Regroupe les hôtels normalisés venant de plusieurs fournisseurs en une
 * seule fiche visible côté client ("El Mouradi Gammarth — à partir de
 * 405 TND"), sans jamais perdre la traçabilité des offres individuelles —
 * chaque tarif normalisé (NormalizedRate) reste consultable et rattaché à
 * son fournisseur d'origine.
 */

import type {
  NormalizedHotel,
  NormalizedRate,
  MatchConfidence,
  DeduplicatedHotelGroup,
} from "./types"
import { matchHotels, isAutoMergeable } from "./mapping"

/** CANONICAL-HOTEL-01 — déplacé vers types.ts, ré-exporté ici pour ne pas casser les imports existants. */
export type { DeduplicatedHotelGroup }

export function deduplicateHotels(
  hotels: NormalizedHotel[],
  rates: NormalizedRate[],
): DeduplicatedHotelGroup[] {
  const groups: DeduplicatedHotelGroup[] = []

  for (const hotel of hotels) {
    let target: DeduplicatedHotelGroup | null = null
    let bestConfidence: MatchConfidence = "UNMATCHED"
    let bestReasons: string[] = []

    for (const group of groups) {
      const { confidence, reasons } = matchHotels(group.hotel, hotel)
      if (isAutoMergeable(confidence) && confidence !== "UNMATCHED") {
        target = group
        bestConfidence = confidence
        bestReasons = reasons
        break
      }
    }

    if (target) {
      target.members.push({
        hotel,
        confidence: bestConfidence,
        reasons: bestReasons,
      })
    } else {
      groups.push({
        hotel,
        members: [
          {
            hotel,
            confidence: "EXACT",
            reasons: ["first sighting — ancre de l'identité canonical"],
          },
        ],
        rates: [],
        fromPrice: null,
      })
    }
  }

  for (const group of groups) {
    const memberHotelIds = new Set(
      group.members.map((m) => m.hotel.id).filter(Boolean),
    )
    const memberCodes = new Set(
      group.members.flatMap((m) =>
        m.hotel.supplierMappings.map(
          (sm) => `${sm.supplier}:${sm.supplierHotelCode}`,
        ),
      ),
    )
    group.rates = rates.filter(
      (r) =>
        memberHotelIds.has(r.hotelId) ||
        memberCodes.has(`${r.supplier}:${r.supplierHotelCode}`),
    )
    group.fromPrice = group.rates.length
      ? Math.min(...group.rates.map((r) => r.sellingPrice))
      : null
  }

  return groups
}
