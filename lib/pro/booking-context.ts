/**
 * Décode le paramètre `offers` de la query string en liste d'offres
 * concrètes du tunnel B2B. Format attendu :
 *
 *   ?offers=<offerId>:<qty>,<offerId>:<qty>,...
 *
 * Toute entrée invalide est silencieusement ignorée — la page de
 * réservation ré-aiguille l'utilisateur vers la SERP si aucune offre
 * n'est trouvée.
 */

import { getProHotelById, type ProHotel } from "./hotels-fixture"
import {
  applyMarginsToHotel,
  applyMarginsToOffers,
  DEFAULT_MARGINS,
  type MarginMap,
} from "./pricing"
import { listRoomOffers, type RoomOffer } from "./rooms"

export type SelectedOffer = {
  offer: RoomOffer
  qty: number
}

export type BookingContext = {
  hotel: ProHotel
  offers: SelectedOffer[]
  /** Somme TND TTC de toutes les offres × qty avant marge / coupon. */
  subtotal: number
  /** Total chambres sélectionnées. */
  roomsCount: number
  /** Total occupants théoriques. */
  occupants: number
}

export function parseOffersParam(
  raw: string | undefined,
  hotel: ProHotel,
): SelectedOffer[] {
  if (!raw) return []
  const allOffers = listRoomOffers(hotel)
  const result: SelectedOffer[] = []
  for (const chunk of raw.split(",")) {
    const [id, qtyStr] = chunk.split(":")
    if (!id || !qtyStr) continue
    const qty = Number.parseInt(qtyStr, 10)
    if (!Number.isFinite(qty) || qty <= 0) continue
    const off = allOffers.find((o) => o.id === id)
    if (!off) continue
    result.push({ offer: off, qty: off.available === false ? 0 : qty })
  }
  return result
}

export function buildBookingContext(
  hotelId: string,
  offersParam: string | undefined,
  margins: MarginMap = DEFAULT_MARGINS,
): BookingContext | null {
  const baseHotel = getProHotelById(hotelId)
  if (!baseHotel) return null

  // Phase 9 : on applique la marge `hotel` à l'objet hôtel (pension
  // affichée dans le récap) ET à la liste d'offres avant matching.
  const hotel = applyMarginsToHotel(baseHotel, margins)
  const allOffers = applyMarginsToOffers(listRoomOffers(baseHotel), margins)

  const offers: SelectedOffer[] = []
  if (offersParam) {
    for (const chunk of offersParam.split(",")) {
      const [id, qtyStr] = chunk.split(":")
      if (!id || !qtyStr) continue
      const qty = Number.parseInt(qtyStr, 10)
      if (!Number.isFinite(qty) || qty <= 0) continue
      const off = allOffers.find((o) => o.id === id)
      if (!off) continue
      offers.push({ offer: off, qty: off.available === false ? 0 : qty })
    }
  }
  if (offers.length === 0) return null

  const subtotal = offers.reduce(
    (sum, sel) => sum + sel.offer.price * sel.qty,
    0,
  )
  const roomsCount = offers.reduce((sum, sel) => sum + sel.qty, 0)
  const occupants = offers.reduce(
    (sum, sel) =>
      sum +
      sel.qty *
        ((sel.offer.arrangement.maxAdults ?? 0) +
          (sel.offer.arrangement.maxChildren ?? 0)),
    0,
  )

  return { hotel, offers, subtotal, roomsCount, occupants }
}

/**
 * Génère une référence de réservation de la forme `B2B-YYYYMMDD-XXXX`
 * pour la page confirmation. Mocké, sera remplacé par un n° séquentiel BDD
 * en phase 7.
 */
export function generateBookingRef(): string {
  const d = new Date()
  const ymd = `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}`
  const rnd = Math.floor(Math.random() * 9000 + 1000)
  return `B2B-${ymd}-${rnd}`
}
