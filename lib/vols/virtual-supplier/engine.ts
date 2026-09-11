/**
 * Moteur du Virtual Flight Supplier — SEARCH (offres + token signé) →
 * BOOK (revalidation prix + réservation d'inventaire réelle + PNR) →
 * CANCEL (restitution d'inventaire). Même esprit que
 * lib/mygo/virtual-supplier/engine.ts : un harnais de test qui se comporte
 * comme un vrai fournisseur GDS (Amadeus/Sabre/NDC), jamais un simple
 * `return fake data`.
 */

import { generateOffers, type Cabin, type VirtualFlightOffer } from "./catalog"
import { issueOfferToken, newSearchId, validateOfferToken } from "./tokens"
import { currentAvailability, reserve, release } from "./inventory-store"
import { getScenario, SIMULATED_TIMEOUT_DELAY_MS } from "./scenarios"

export interface SearchInput {
  origin: string
  destination: string
  departureDate: string
  returnDate?: string
  adults: number
  children: number
  cabin: Cabin
}

export interface SearchOfferResult {
  offerId: string
  token: string
  segments: VirtualFlightOffer["segments"]
  stops: number
  totalDurationMinutes: number
  priceTnd: number // prix TOTAL pour adults+children à cette offre
  currency: "TND"
  availableSeats: number
  refundable: boolean
  baggageKg: number
}

function offerKey(offer: VirtualFlightOffer, departureDate: string): string {
  return `${offer.offerId}:${departureDate}`
}

export function search(input: SearchInput): { searchId: string; offers: SearchOfferResult[] } {
  const searchId = newSearchId()
  const rawOffers = generateOffers({
    origin: input.origin,
    destination: input.destination,
    departureDate: input.departureDate,
    cabin: input.cabin,
    adults: input.adults,
    children: input.children,
  })
  const paxCount = input.adults + input.children

  const offers: SearchOfferResult[] = rawOffers
    .map((offer) => {
      const key = offerKey(offer, input.departureDate)
      const available = currentAvailability(key)
      const priceTnd = offer.unitPriceTnd * paxCount
      const token = issueOfferToken({
        searchId,
        offerId: offer.offerId,
        origin: input.origin,
        destination: input.destination,
        departureDate: input.departureDate,
        returnDate: input.returnDate,
        adults: input.adults,
        children: input.children,
        cabin: input.cabin,
        priceTnd,
      })
      return {
        offerId: offer.offerId,
        token,
        segments: offer.segments,
        stops: offer.stops,
        totalDurationMinutes: offer.totalDurationMinutes,
        priceTnd,
        currency: "TND" as const,
        availableSeats: available,
        refundable: offer.refundable,
        baggageKg: offer.baggageKg,
      }
    })
    // Sold-out non filtré : une offre à 0 place doit rester visible (comme
    // un vrai GDS) — la sélection/réservation d'une offre à 0 échouera
    // proprement au BOOK, jamais un filtrage silencieux qui ferait
    // disparaître l'offre du résultat.
    .sort((a, b) => a.priceTnd - b.priceTnd)

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
      pnr: string
      offerId: string
      segments: VirtualFlightOffer["segments"]
      totalPriceTnd: number
      adults: number
      children: number
      origin: string
      destination: string
      departureDate: string
      returnDate?: string
    }
  | { ok: false; kind: BookErrorKind; message: string; currentPriceTnd?: number }

function generatePnr(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789" // sans 0/O/1/I ambigus
  let out = ""
  for (let i = 0; i < 6; i++) out += alphabet[Math.floor(Math.random() * alphabet.length)]
  return out
}

/**
 * Réserve réellement l'offre désignée par `token` (revalidation prix +
 * décrément d'inventaire atomique) et émet un PNR — jamais un simple
 * enregistrement en base sans que le fournisseur "confirme" quoi que ce
 * soit, exactement le même principe que confirmHotelWithProvider() pour
 * myGo.
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

  // Revalidation prix — régénère l'offre déterministe pour cette route/date/
  // cabine (même algorithme qu'à la recherche) et compare au prix du token.
  // En mode NORMAL les deux coïncident toujours (déterministe) ; le
  // scénario PRICE_CHANGED simule un vrai changement tarifaire fournisseur
  // entre la recherche et la réservation.
  const rawOffers = generateOffers({
    origin: p.origin,
    destination: p.destination,
    departureDate: p.departureDate,
    cabin: p.cabin as Cabin,
    adults: p.adults,
    children: p.children,
  })
  const matched = rawOffers.find((o) => o.offerId === p.offerId)
  if (!matched) {
    return { ok: false, kind: "TOKEN_INVALID", message: "Offre introuvable pour cette route/date." }
  }
  const paxCount = p.adults + p.children
  const livePriceTnd =
    scenario === "PRICE_CHANGED"
      ? Math.round(matched.unitPriceTnd * paxCount * 1.12) // +12%, simule une hausse tarifaire réelle
      : matched.unitPriceTnd * paxCount

  if (livePriceTnd !== expectedPriceTnd) {
    return {
      ok: false,
      kind: "PRICE_CHANGED",
      message: `Le prix a changé depuis la recherche : ${livePriceTnd} TND (était ${expectedPriceTnd} TND).`,
      currentPriceTnd: livePriceTnd,
    }
  }

  const key = `${p.offerId}:${p.departureDate}`
  const forcedSoldOut = scenario === "SOLD_OUT"
  const reserved = forcedSoldOut ? false : await reserve(key, paxCount)
  if (!reserved) {
    return { ok: false, kind: "SOLD_OUT", message: "Cette offre n'est plus disponible." }
  }

  return {
    ok: true,
    pnr: generatePnr(),
    offerId: p.offerId,
    segments: matched.segments,
    totalPriceTnd: livePriceTnd,
    adults: p.adults,
    children: p.children,
    origin: p.origin,
    destination: p.destination,
    departureDate: p.departureDate,
    returnDate: p.returnDate,
  }
}

/** Annule un PNR — restitue l'inventaire réservé. Best-effort, ne lève jamais. */
export async function cancel(input: {
  offerId: string
  departureDate: string
  adults: number
  children: number
}): Promise<void> {
  const key = `${input.offerId}:${input.departureDate}`
  await release(key, input.adults + input.children)
}
