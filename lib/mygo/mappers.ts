/**
 * Mappers: Zod-validated raw response → DTO propre exposé à l'UI.
 *
 * Ces fonctions sont *pures* (pas d'I/O), faciles à tester avec les fixtures dans
 * `__fixtures__/`.
 */

import {
  type ListCityItemT,
  type ListBoardingItemT,
  type ListCurrencyItemT,
  type ListTagItemT,
  type ListHotelItemT,
  type HotelDetailItemT,
  type HotelSearchResultItemT,
  type RoomOfferT,
  type BoardingOfferT,
  type CancellationPolicyT,
} from "./schemas"
import { sanitizeHtmlToText } from "./sanitize-html"
import type {
  CityDTO,
  BoardingDTO,
  CurrencyDTO,
  TagDTO,
  HotelSummaryDTO,
  HotelDetailsDTO,
  CancellationPolicyDTO,
  RoomOfferDTO,
  BoardingOfferDTO,
  HotelOfferDTO,
} from "./types"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const toStars = (raw: unknown): number | undefined => {
  if (raw === null || raw === undefined) return undefined
  const n = typeof raw === "number" ? raw : parseInt(String(raw), 10)
  return Number.isFinite(n) && n > 0 ? n : undefined
}

const ensureCountry = (country: unknown): { id?: number; name?: string } => {
  if (!country) return {}
  if (typeof country === "string") return { name: country }
  if (typeof country === "object") {
    const c = country as { Id?: number | string; Name?: string }
    return {
      id: c.Id !== undefined ? Number(c.Id) : undefined,
      name: c.Name,
    }
  }
  return {}
}

// ---------------------------------------------------------------------------
// Static data mappers
// ---------------------------------------------------------------------------

export function mapCity(raw: ListCityItemT): CityDTO {
  const country = ensureCountry(raw.Country)
  return {
    id: raw.Id,
    name: raw.Name,
    region: raw.Region ?? undefined,
    countryId: country.id,
    countryName: country.name,
  }
}

export function mapBoarding(raw: ListBoardingItemT): BoardingDTO {
  return {
    id: raw.Id,
    code: raw.Code,
    name: raw.Name,
    description: raw.Description ?? undefined,
  }
}

export function mapCurrency(raw: ListCurrencyItemT): CurrencyDTO {
  return { code: raw.Code, symbol: raw.Symbol }
}

export function mapTag(raw: ListTagItemT): TagDTO {
  return { id: raw.Id, title: raw.Title }
}

// ---------------------------------------------------------------------------
// Hotel mappers
// ---------------------------------------------------------------------------

export function mapHotelSummary(raw: ListHotelItemT): HotelSummaryDTO {
  const cat = raw.Category ?? {}
  const city = raw.City ?? {}
  return {
    id: raw.Id,
    name: raw.Name,
    stars: toStars(cat.Star),
    categoryTitle: cat.Title ?? undefined,
    cityId: city.Id !== undefined ? Number(city.Id) : undefined,
    cityName: city.Name ?? undefined,
    region: city.Region ?? undefined,
    address: raw.Adress ?? undefined,
    image: raw.Image ?? undefined,
    longitude: raw.Localization?.Longitude ?? undefined,
    latitude: raw.Localization?.Latitude ?? undefined,
    facilities: (raw.Facilities ?? [])
      .filter((f) => f.Title)
      .map((f) => ({ title: f.Title!, category: f.Category ?? undefined })),
    themes: (raw.Theme ?? []) as string[],
    note: raw.Note ?? undefined,
  }
}

export function mapHotelDetails(raw: HotelDetailItemT): HotelDetailsDTO {
  const summary = mapHotelSummary(raw as ListHotelItemT)
  const shortDesc = sanitizeHtmlToText(raw.ShortDescription)
  const longDesc = sanitizeHtmlToText(raw.LongDescription)
  return {
    ...summary,
    email: raw.Email ?? undefined,
    phone: raw.Phone ?? undefined,
    shortDescription: shortDesc || undefined,
    longDescription: longDesc || undefined,
    checkInTime: raw.CheckIn ?? undefined,
    checkOutTime: raw.CheckOut ?? undefined,
    type: raw.Type ?? undefined,
    album: (raw.Album ?? []).map((a) => ({
      url: a.Url,
      alt: a.Alt ?? a.Description ?? undefined,
    })),
    options: (raw.Option ?? []).map((o) => ({ id: o.Id, title: o.Title })),
  }
}

// ---------------------------------------------------------------------------
// Search mappers
// ---------------------------------------------------------------------------

export function mapCancellationPolicy(
  raw: CancellationPolicyT,
): CancellationPolicyDTO {
  return {
    fees: raw.Fees ?? 0,
    type: (raw.Type ?? "PERCENT") as string,
    nature: (raw.Nature ?? "BEFORE_ARRIVAL") as string,
    fromDate: raw.FromDate ?? undefined,
    minStay: raw.MinStay ?? undefined,
    maxStay: raw.MaxStay ?? undefined,
  }
}

export function mapRoomOffer(raw: RoomOfferT): RoomOfferDTO {
  return {
    id: raw.Id,
    name: raw.Name,
    photo: raw.Photo ?? undefined,
    description: raw.Description ?? undefined,
    quantity: raw.Quantity ?? undefined,
    price: raw.Price,
    basePrice: raw.BasePrice ?? undefined,
    stopReservation: Boolean(raw.StopReservation ?? raw.OnRequest ?? false),
    notRefundable: Boolean(raw.NotRefundable ?? false),
    cancellationPolicies: (raw.CancellationPolicy ?? []).map(mapCancellationPolicy),
  }
}

export function mapBoardingOffer(raw: BoardingOfferT): BoardingOfferDTO {
  return {
    id: raw.Id,
    code: raw.Code ?? "",
    name: raw.Name,
    description: raw.Description ?? undefined,
    pax: raw.Pax.map((p) => ({
      adult: p.Adult,
      child: p.Child ?? [],
      rooms: p.Rooms.map(mapRoomOffer),
    })),
  }
}

/**
 * Filtre les "fausses" offres qui ne sont pas des vrais hôtels.
 * myGo renvoie aussi des parcs (Aqualand, Carthage Land, …) en mélange dans les résultats.
 *
 * Heuristique: un VRAI hôtel a:
 *   - une catégorie d'étoiles >= 1, OU
 *   - une City attribuée (ce qui est le cas pour tous les vrais hôtels), OU
 *   - un boarding qui n'est PAS "Entrée Simple" (qui désigne les parcs).
 */
export function isRealHotelOffer(raw: HotelSearchResultItemT): boolean {
  const stars = toStars(raw.Hotel?.Category?.Star)
  if (stars && stars >= 1) return true

  const boardings = raw.Price?.Boarding ?? []
  const hasNonAttraction = boardings.some(
    (b) => b.Code !== "ETS" && b.Name !== "Entrée Simple",
  )
  return hasNonAttraction
}

/** Calcule le prix le plus bas affichable parmi tous les boards/rooms d'une offre. */
export function lowestPrice(raw: HotelSearchResultItemT): number {
  let min = Number.POSITIVE_INFINITY
  for (const b of raw.Price?.Boarding ?? []) {
    for (const p of b.Pax ?? []) {
      for (const r of p.Rooms ?? []) {
        if (typeof r.Price === "number" && r.Price < min && !r.StopReservation) {
          min = r.Price
        }
      }
    }
  }
  return Number.isFinite(min) ? min : 0
}

export function mapHotelOffer(raw: HotelSearchResultItemT): HotelOfferDTO {
  return {
    hotel: mapHotelSummary(raw.Hotel),
    token: raw.Token,
    currency: raw.Currency ?? raw.Price?.Currency ?? "TND",
    fromPrice: lowestPrice(raw),
    recommended: Boolean(raw.Recommended),
    boardings: (raw.Price?.Boarding ?? []).map(mapBoardingOffer),
  }
}

/**
 * myGo retourne parfois plusieurs entrées pour le même Hotel.Id (sources
 * différentes, promotions, ou doublon avec/sans étoiles). On garde la "meilleure"
 * variante par hotel.id : on privilégie l'entrée avec étoiles connues, puis le
 * prix le plus bas. Tous les boardings sont mergés pour ne pas perdre d'options
 * de pension.
 */
export function dedupeOffersByHotelId(offers: HotelOfferDTO[]): HotelOfferDTO[] {
  const byId = new Map<number, HotelOfferDTO>()
  for (const offer of offers) {
    const id = offer.hotel.id
    const existing = byId.get(id)
    if (!existing) {
      byId.set(id, offer)
      continue
    }
    const better = pickBetterOffer(existing, offer)
    const merged: HotelOfferDTO = {
      ...better,
      boardings: mergeBoardings(existing.boardings, offer.boardings),
      fromPrice:
        existing.fromPrice > 0 && offer.fromPrice > 0
          ? Math.min(existing.fromPrice, offer.fromPrice)
          : Math.max(existing.fromPrice, offer.fromPrice),
      recommended: existing.recommended || offer.recommended,
    }
    byId.set(id, merged)
  }
  return Array.from(byId.values())
}

function pickBetterOffer(a: HotelOfferDTO, b: HotelOfferDTO): HotelOfferDTO {
  const aStars = a.hotel.stars ?? 0
  const bStars = b.hotel.stars ?? 0
  if (aStars > 0 && bStars === 0) return a
  if (bStars > 0 && aStars === 0) return b
  // Both or neither have stars → keep the one with more facilities/themes/album
  const aScore =
    (a.hotel.facilities?.length ?? 0) +
    (a.hotel.themes?.length ?? 0) +
    (a.hotel.image ? 1 : 0)
  const bScore =
    (b.hotel.facilities?.length ?? 0) +
    (b.hotel.themes?.length ?? 0) +
    (b.hotel.image ? 1 : 0)
  return bScore > aScore ? b : a
}

function mergeBoardings(
  a: BoardingOfferDTO[],
  b: BoardingOfferDTO[],
): BoardingOfferDTO[] {
  const seen = new Map<string, BoardingOfferDTO>()
  for (const board of [...a, ...b]) {
    const key = board.code || board.name
    if (!seen.has(key)) seen.set(key, board)
  }
  return Array.from(seen.values())
}
