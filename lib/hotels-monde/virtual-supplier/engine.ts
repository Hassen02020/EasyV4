/**
 * Moteur du Virtual World Hotel Supplier — SEARCH (offres + token signé) →
 * BOOK (revalidation prix + réservation d'inventaire réelle + numéro de
 * confirmation) → CANCEL (restitution d'inventaire). Même esprit que
 * lib/vols/virtual-supplier/engine.ts : un harnais de test qui se comporte
 * comme un vrai fournisseur hôtelier international (Expedia Rapid/Booking
 * Demand API), jamais un simple `return fake data`.
 */

import { generateOffers, type VirtualWorldHotelOffer } from "./catalog"
import { issueOfferToken, newSearchId, validateOfferToken } from "./tokens"
import { currentAvailability, reserve, release } from "./inventory-store"
import { getScenario, SIMULATED_TIMEOUT_DELAY_MS } from "./scenarios"
import { destinationByValue } from "@/lib/hotels-monde/search-state"

export interface SearchInput {
  destination: string
  city: string
  checkIn: string
  checkOut: string
  nights: number
  adults: number
  rooms: number
  stars?: number
}

export interface SearchOfferResult {
  offerId: string
  token: string
  name: string
  stars: number
  rating: number
  reviewCount: number
  pricePerNightTnd: number
  totalPriceTnd: number // prix TOTAL pour `rooms` chambres x `nights` nuits
  nights: number
  currency: "TND"
  availableRooms: number
  refundable: boolean
  breakfastIncluded: boolean
  distanceFromCenterKm: number
}

function offerKey(offer: VirtualWorldHotelOffer, checkIn: string): string {
  return `${offer.offerId}:${checkIn}`
}

export function search(input: SearchInput): { searchId: string; offers: SearchOfferResult[] } {
  const searchId = newSearchId()
  const rawOffers = generateOffers({
    destination: input.destination,
    city: input.city,
    checkIn: input.checkIn,
    checkOut: input.checkOut,
    stars: input.stars,
  })

  const offers: SearchOfferResult[] = rawOffers
    .map((offer) => {
      const key = offerKey(offer, input.checkIn)
      const available = currentAvailability(key)
      const pricePerNightTnd = offer.nightlyBaseTnd
      const totalPriceTnd = pricePerNightTnd * input.nights * input.rooms
      const token = issueOfferToken({
        searchId,
        offerId: offer.offerId,
        destination: input.destination,
        checkIn: input.checkIn,
        checkOut: input.checkOut,
        nights: input.nights,
        adults: input.adults,
        rooms: input.rooms,
        pricePerNightTnd,
        totalPriceTnd,
      })
      return {
        offerId: offer.offerId,
        token,
        name: offer.name,
        stars: offer.stars,
        rating: offer.rating,
        reviewCount: offer.reviewCount,
        pricePerNightTnd,
        totalPriceTnd,
        nights: input.nights,
        currency: "TND" as const,
        availableRooms: available,
        refundable: offer.refundable,
        breakfastIncluded: offer.breakfastIncluded,
        distanceFromCenterKm: offer.distanceFromCenterKm,
      }
    })
    // Sold-out non filtré : un hôtel à 0 chambre disponible doit rester
    // visible (comme un vrai agrégateur) — la sélection/réservation d'une
    // offre à 0 échouera proprement au BOOK, jamais un filtrage silencieux
    // qui ferait disparaître l'hôtel du résultat.
    .sort((a, b) => a.pricePerNightTnd - b.pricePerNightTnd)

  return { searchId, offers }
}

export type BookErrorKind =
  | "TOKEN_INVALID"
  | "TOKEN_EXPIRED"
  | "SOLD_OUT"
  | "PRICE_CHANGED"
  | "BOOKING_REJECTED"
  | "TIMEOUT"

export type BookResult =
  | {
      ok: true
      confirmationNumber: string
      offerId: string
      name: string
      destination: string
      checkIn: string
      checkOut: string
      nights: number
      adults: number
      rooms: number
      totalPriceTnd: number
      refundable: boolean
      breakfastIncluded: boolean
    }
  | { ok: false; kind: BookErrorKind; message: string; currentPriceTnd?: number }

function generateConfirmationNumber(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789" // sans 0/O/1/I ambigus
  let out = "WH-"
  for (let i = 0; i < 8; i++) out += alphabet[Math.floor(Math.random() * alphabet.length)]
  return out
}

/**
 * Réserve réellement l'offre désignée par `token` (revalidation prix +
 * décrément d'inventaire atomique) et émet un numéro de confirmation —
 * jamais un simple enregistrement en base sans que le fournisseur
 * "confirme" quoi que ce soit, exactement le même principe que
 * confirmHotelWithProvider() pour myGo / book() pour le Virtual Flight
 * Supplier.
 */
export async function book(token: string, expectedPriceTnd: number): Promise<BookResult> {
  const scenario = getScenario()

  if (scenario === "TIMEOUT") {
    await new Promise((r) => setTimeout(r, SIMULATED_TIMEOUT_DELAY_MS))
    return { ok: false, kind: "TIMEOUT", message: "Le fournisseur n'a pas répondu à temps." }
  }

  const validated = validateOfferToken(token)
  if (!validated.ok) {
    return validated.reason === "EXPIRED"
      ? { ok: false, kind: "TOKEN_EXPIRED", message: "Cette offre a expiré — relancez une recherche." }
      : { ok: false, kind: "TOKEN_INVALID", message: "Offre invalide ou altérée." }
  }
  const p = validated.payload

  if (scenario === "BOOKING_REJECTED") {
    return { ok: false, kind: "BOOKING_REJECTED", message: "Le fournisseur a refusé cette réservation." }
  }

  // Revalidation prix — régénère l'offre déterministe pour cette
  // destination/dates (même algorithme qu'à la recherche) et compare au
  // prix du token. En mode NORMAL les deux coïncident toujours
  // (déterministe) ; le scénario PRICE_CHANGED simule une vraie hausse
  // tarifaire fournisseur entre la recherche et la réservation.
  const rawOffers = generateOffers({
    destination: p.destination,
    // Le token ne porte que le slug de destination (ex: "istanbul"), jamais
    // le nom de ville affichable — régénéré ici depuis le même référentiel
    // que search() (lib/hotels-monde/search-state.ts) pour ne jamais
    // produire un nom d'hôtel dégradé ("istanbul Grand Palace" au lieu de
    // "Istanbul Grand Palace") lors de la revalidation au book().
    city: destinationByValue(p.destination)?.city ?? p.destination,
    checkIn: p.checkIn,
    checkOut: p.checkOut,
  })
  const matched = rawOffers.find((o) => o.offerId === p.offerId)
  if (!matched) {
    return { ok: false, kind: "TOKEN_INVALID", message: "Offre introuvable pour cette destination/dates." }
  }
  const livePriceTnd =
    scenario === "PRICE_CHANGED"
      ? Math.round(matched.nightlyBaseTnd * p.nights * p.rooms * 1.12) // +12%, simule une hausse tarifaire réelle
      : p.pricePerNightTnd * p.nights * p.rooms

  if (livePriceTnd !== expectedPriceTnd) {
    return {
      ok: false,
      kind: "PRICE_CHANGED",
      message: `Le prix a changé depuis la recherche : ${livePriceTnd} TND (était ${expectedPriceTnd} TND).`,
      currentPriceTnd: livePriceTnd,
    }
  }

  const key = `${p.offerId}:${p.checkIn}`
  const forcedSoldOut = scenario === "SOLD_OUT"
  const reserved = forcedSoldOut ? false : await reserve(key, p.rooms)
  if (!reserved) {
    return { ok: false, kind: "SOLD_OUT", message: "Cet hôtel n'a plus de chambres disponibles pour ces dates." }
  }

  return {
    ok: true,
    confirmationNumber: generateConfirmationNumber(),
    offerId: p.offerId,
    name: matched.name,
    destination: p.destination,
    checkIn: p.checkIn,
    checkOut: p.checkOut,
    nights: p.nights,
    adults: p.adults,
    rooms: p.rooms,
    totalPriceTnd: livePriceTnd,
    refundable: matched.refundable,
    breakfastIncluded: matched.breakfastIncluded,
  }
}

/** Annule une réservation — restitue l'inventaire réservé. Best-effort, ne lève jamais. */
export async function cancel(input: { offerId: string; checkIn: string; rooms: number }): Promise<void> {
  const key = `${input.offerId}:${input.checkIn}`
  await release(key, input.rooms)
}
